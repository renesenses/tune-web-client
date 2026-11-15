// @vitest-environment jsdom
//
// jsdom : sans `window`, `$effect` ne se déclenche pas et l'écran ne lirait
// jamais `/ext/circle` — un test vert qui n'aurait rien exécuté.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import { preparerLocale } from '../i18n';
import { preferences } from '../stores/preferences';
import { dialogs } from '../stores/dialogs';
import { notifications } from '../stores/notifications';
import { zones, currentZoneId } from '../stores/zones';
import { licenseState } from '../stores/license';
import { circlePlugin, ecoutePermise, ecouteOuverte, motifEcoute, estEcouteRevoquee } from '../circle';
import fr from '../locales/fr';
import { meilleureCorrespondance, ECART_DUREE_MS } from '../chercherDansMesSources';

/**
 * #7224 — bibliothèque d'un contact, écoute FERMÉE : un message en tête, un
 * retour visible au clic, et « Chercher dans mes sources » (recherche globale
 * `GET /search`, aucune nouvelle route) avec lecture de la correspondance.
 */

let partagesRecus: { user_id: number; name: string; library: boolean }[] = [];
let synchro: Record<string, unknown> | null = null;
let elisePartage = true;
/** Ce que rend le prochain `POST /listen`. */
let refusEcoute: { status: number; corps: unknown } | null = null;
let resultatsRecherche: unknown = null;

type Appel = { url: string; method: string; body: any };
let appels: Appel[] = [];

const ALBUMS = [
  { id: 11, title: 'Kind of Blue', artist_name: 'Miles Davis', year: 1959, genre: 'Jazz', track_count: 2 },
];
const RECHERCHE = {
  local: {
    tracks: [{ id: 7, title: 'So What', artist_name: 'Miles Davis', album_title: 'Kind of Blue', duration_ms: 562500 }],
    albums: [{ id: 5, title: 'Kind of Blue', artist_name: 'Miles Davis' }],
    artists: [],
  },
  services: {
    qobuz: {
      tracks: [{ title: 'So What', artist_name: 'Miles Davis', source: 'qobuz', source_id: 'q-1' }],
      albums: [{ title: 'Kind of Blue (Qobuz)', artist_name: 'Miles Davis', source: 'qobuz', id: 'qa-9', source_id: 'qa-9' }],
      artists: [],
    },
  },
};
const PISTES = [
  { id: 101, title: 'So What', artist_name: 'Miles Davis', album_title: 'Kind of Blue', album_id: 11, format: 'flac',
    sample_rate: 96000, bit_depth: 24, duration_ms: 562000, track_number: 1, disc_number: 1, isrc: 'USSM15900113' },
  { id: 102, title: 'Freddie Freeloader', artist_name: 'Miles Davis', album_title: 'Kind of Blue', album_id: 11, format: 'flac',
    sample_rate: 96000, bit_depth: 24, duration_ms: 586000, track_number: 2, disc_number: 1 },
];

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}
const introuvable = () => reponse(404, { error: 'not_found' });
const page = <T,>(l: T[]) => ({ data: l, current_page: 1, last_page: 1, per_page: 50, total: l.length });

function greffon(u: string, method: string): Response {
  const chemin = u.split('?')[0].replace(/^.*\/api\/v1\/ext\/circle/, '');
  let m: RegExpMatchArray | null;
  if (method === 'GET' && (chemin === '' || chemin === '/')) {
    return reponse(200, { members: [{ user_id: 40, name: 'Élise', since: '2026-09-01T10:00:00Z' }], sent: [], received: [], circles: [] });
  }
  if (method === 'GET' && chemin === '/library-sync') return synchro ? reponse(200, synchro) : introuvable();
  if (method === 'GET' && chemin === '/shared-with-me') return reponse(200, partagesRecus);
  if ((m = chemin.match(/^\/contacts\/(\d+)\/listen$/)) && method === 'POST') {
    if (Number(m[1]) !== 40 || !elisePartage) return introuvable();
    if (refusEcoute) return reponse(refusEcoute.status, refusEcoute.corps);
    return reponse(200, { ok: true });
  }
  if ((m = chemin.match(/^\/contacts\/(\d+)\/library(\/.*)$/)) && method === 'GET') {
    if (Number(m[1]) !== 40 || !elisePartage) return introuvable();
    const reste = m[2];
    if (reste === '/stats') return reponse(200, { tracks: 2, albums: 1, artists: 1, last_sync: '2026-09-27T08:00:00Z' });
    if (reste === '/albums') return reponse(200, page(ALBUMS));
    if (reste === '/artists') return reponse(200, page([{ id: 1, name: 'Miles Davis' }]));
    if (reste === '/tracks') return reponse(200, page(PISTES));
    if (/^\/albums\/11\/tracks$/.test(reste)) return reponse(200, PISTES);
  }
  return introuvable();
}

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  partagesRecus = [{ user_id: 40, name: 'Élise', library: true }];
  synchro = { premium: true, active: true, last_sync: '2026-09-27T08:00:00Z', pending: 0, listen_enabled: false };
  resultatsRecherche = RECHERCHE;
  elisePartage = true;
  refusEcoute = null;
  circlePlugin.set(null);
  licenseState.update((s) => ({ ...s, loaded: false, tier: 'free' }));
  zones.set([{ id: 3, name: 'Salon', state: 'stopped', volume: 50 } as never]);
  currentZoneId.set(3);
  for (const n of get(notifications)) notifications.dismiss(n.id);
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = init?.body !== undefined && init?.body !== null ? JSON.parse(String(init.body)) : undefined;
      appels.push({ url: u, method, body });
      if (u.includes('/ext/circle')) return greffon(u, method);
      if (/\/api\/v1\/search\?/.test(u)) return reponse(200, resultatsRecherche);
      if (/\/zones\/\d+\/play(\?|$)/.test(u)) return reponse(200, { id: 3, name: 'Salon', state: 'playing', volume: 50 });
      if (u.endsWith('/plugins')) return reponse(200, [{ name: 'circle', type: 'sdk', installed: true, enabled: true }]);
      return reponse(200, {});
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function laisserFaire() {
  for (let i = 0; i < 10; i++) {
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
  }
}

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CircleV2, { target: hote, props: {} });
  flushSync();
  await laisserFaire();
  return hote;
}

const texte = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
const lectures = () => appels.filter((a) => /\/zones\/\d+\/play(\?|$)/.test(a.url));
const recherches = () => appels.filter((a) => /\/api\/v1\/search\?/.test(a.url));
const ecoutes = () => appels.filter((a) => /\/ext\/circle\/contacts\/\d+\/listen$/.test(a.url));

async function cliquer(el: Element, sel: string) {
  const b = el.querySelector(sel) as HTMLButtonElement | null;
  if (!b) throw new Error(`bouton introuvable : ${sel}`);
  b.click();
  await laisserFaire();
}

async function ouvrirTitresElise(el: Element) {
  await cliquer(el, 'li.partage-recu button.ouvrir-catalogue');
  await cliquer(el, 'button.onglet-tracks');
}


describe('#2984 — bibliothèque du contact sans paragraphe de fermeture', () => {
  it('conserve le statut de consultation sans le paragraphe sur l’écoute à distance', async () => {
    const el = await poser();
    await cliquer(el, 'li.partage-recu button.ouvrir-catalogue');
    expect(texte(el.querySelector('.lecture-seule')!)).toBe(fr['v2.circle.lib.readOnly']);
    expect(el.querySelector('.ecoute-fermee'), 'le paragraphe de fermeture doit disparaître').toBeNull();
  });

  it('écoute ouverte : pas de message de fermeture, pas de bouton de recherche sur les pistes', async () => {
    synchro = { ...synchro, listen_enabled: true };
    const el = await poser();
    await ouvrirTitresElise(el);
    expect(el.querySelector('.ecoute-fermee')).toBeNull();
    expect(el.querySelector('.chercher-piste')).toBeNull();
    expect(el.querySelector('.lire-equivalent-carte')).toBeNull();
    expect(el.querySelector('.pistes-contact button.lire-piste')).not.toBeNull();
  });
});

describe('#7224 (décision du 12/11) — un clic LANCE l’équivalent trouvé dans MES sources', () => {
  it('clic sur une piste : la recherche part, la piste LOCALE se lance sur ma zone, sans liste à choisir', async () => {
    const el = await poser();
    await ouvrirTitresElise(el);
    const titre = el.querySelector('.pistes-contact button.titre') as HTMLButtonElement;
    expect(titre.disabled).toBe(false);
    // Un bouton actif : plus d'`aria-disabled` qui dirait le contraire.
    expect(titre.getAttribute('aria-disabled')).toBeNull();
    titre.click();
    await laisserFaire();
    expect(recherches()).toHaveLength(1);
    expect(decodeURIComponent(recherches()[0].url)).toContain('/search?q=So What Miles Davis');
    expect(lectures().map((a) => a.url.match(/\/zones\/(\d+)\/play/)![1])).toEqual(['3']);
    expect(lectures().map((a) => a.body)).toEqual([{ track_id: 7 }]);
    // Pas d'étape intermédiaire : aucune liste de résultats ne s'ouvre.
    expect(el.querySelector('.sources-trouvees')).toBeNull();
    expect(texte(el.querySelector('.equivalent-lance')!)).toBe(
      fr['v2.circle.sources.playing'].replace('{title}', 'So What').replace('{source}', fr['v2.circle.sources.local']));
    // Rien n'est demandé au greffon : on joue chez moi.
    expect(ecoutes()).toEqual([]);
  });

  it('clic sur une piste d’un album ouvert : même lecture directe', async () => {
    const el = await poser();
    await cliquer(el, 'li.partage-recu button.ouvrir-catalogue');
    await cliquer(el, 'button.album-contact');
    await cliquer(el, '.pistes-album button.titre');
    expect(lectures().map((a) => a.body)).toEqual([{ track_id: 7 }]);
  });

  it('album de la grille : « Lire » lance l’album LOCAL équivalent', async () => {
    const el = await poser();
    await cliquer(el, 'li.partage-recu button.ouvrir-catalogue');
    const b = el.querySelector('button.lire-equivalent-carte') as HTMLButtonElement;
    expect(b.getAttribute('aria-label')).toBe(fr['v2.circle.sources.playEquivalentAria'].replace('{query}', 'Kind of Blue Miles Davis'));
    b.click();
    await laisserFaire();
    expect(decodeURIComponent(recherches()[0].url)).toContain('/search?q=Kind of Blue Miles Davis');
    expect(lectures().map((a) => a.body)).toEqual([{ album_id: 5 }]);
  });

  it('album ouvert : « Lire l’album » lance l’équivalent ; sans fichier local, celui du service', async () => {
    resultatsRecherche = { ...RECHERCHE, local: { tracks: [], albums: [], artists: [] },
      services: { qobuz: { ...RECHERCHE.services.qobuz, albums: [{ title: 'Kind of Blue', artist_name: 'Miles Davis', source: 'qobuz', id: 'qa-9', source_id: 'qa-9' }] } } };
    const el = await poser();
    await cliquer(el, 'li.partage-recu button.ouvrir-catalogue');
    await cliquer(el, 'button.album-contact');
    await cliquer(el, 'button.lire-equivalent-album');
    expect(lectures().map((a) => a.body)).toEqual([{ streaming_album_id: 'qa-9', source: 'qobuz' }]);
    expect(texte(el.querySelector('.equivalent-lance')!)).toContain('Qobuz');
  });

  it('rien de reconnu : aucune lecture, un message clair, et « Chercher dans mes sources » reste en repli', async () => {
    resultatsRecherche = {
      local: { tracks: [{ id: 8, title: 'So What (Live)', artist_name: 'Miles Davis', duration_ms: 700000 }], albums: [], artists: [] },
      services: { qobuz: { tracks: [{ title: 'Blue in Green', artist_name: 'Miles Davis', source: 'qobuz', source_id: 'q-2' }], albums: [], artists: [] } },
    };
    const el = await poser();
    await ouvrirTitresElise(el);
    await cliquer(el, '.pistes-contact button.titre');
    expect(lectures()).toEqual([]);
    const alerte = el.querySelector('.equivalent-aucun')!;
    expect(alerte.getAttribute('role')).toBe('alert');
    expect(texte(alerte.querySelector('span')!)).toBe(fr['v2.circle.sources.notFound'].replace('{query}', 'So What Miles Davis'));
    expect(el.querySelector('.pistes-contact button.chercher-piste')).not.toBeNull();
    // Le repli : la liste des résultats proches, à choisir.
    await cliquer(el, '.equivalent-aucun button.chercher-repli');
    expect(el.querySelector('.equivalent-aucun')).toBeNull();
    expect(el.querySelectorAll('.source-resultat')).toHaveLength(2);
    expect(lectures()).toEqual([]);
  });

  it('recherche en échec : un message, pas de silence, aucune lecture', async () => {
    const el = await poser();
    await ouvrirTitresElise(el);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (/\/api\/v1\/search\?/.test(String(url))) return reponse(500, { error: 'boom' });
      return reponse(200, {});
    }));
    await cliquer(el, '.pistes-contact button.titre');
    expect(texte(el.querySelector('.equivalent-erreur span')!)).toBe(fr['v2.circle.sources.error']);
  });

  it('sans zone active : le dit, et ne cherche ni ne lance rien', async () => {
    const el = await poser();
    await ouvrirTitresElise(el);
    currentZoneId.set(null as never);
    await laisserFaire();
    await cliquer(el, '.pistes-contact button.titre');
    expect(recherches()).toEqual([]);
    expect(lectures()).toEqual([]);
    expect(get(notifications).length).toBeGreaterThan(0);
  });
});

describe('#7224 — « Chercher dans mes sources »', () => {
  it('piste : la recherche globale part avec titre + artiste ; les correspondances s’affichent', async () => {
    const el = await poser();
    await ouvrirTitresElise(el);
    const b = el.querySelector('.pistes-contact button.chercher-piste') as HTMLButtonElement;
    expect(b.getAttribute('aria-label')).toBe(fr['v2.circle.sources.searchAria'].replace('{query}', 'So What Miles Davis'));
    expect(texte(b)).toContain(fr['v2.circle.sources.search']);
    b.click();
    await laisserFaire();
    expect(recherches()).toHaveLength(1);
    expect(decodeURIComponent(recherches()[0].url)).toContain('/search?q=So What Miles Davis');
    expect(texte(el.querySelector('.sources-titre')!)).toBe(fr['v2.circle.sources.title'].replace('{query}', 'So What Miles Davis'));
    const lignes = el.querySelectorAll('.source-resultat');
    expect(lignes).toHaveLength(2);
    expect(lignes[0].classList.contains('source-local')).toBe(true);
    expect(lignes[1].classList.contains('source-qobuz')).toBe(true);
    expect(texte(lignes[1])).toContain('Qobuz');
  });

  it('lire la correspondance choisie : locale = track_id ; service = source + source_id sur MA zone', async () => {
    const el = await poser();
    await ouvrirTitresElise(el);
    await cliquer(el, '.pistes-contact button.chercher-piste');
    const lire = el.querySelectorAll('.source-resultat button.lire-source');
    (lire[0] as HTMLButtonElement).click();
    await laisserFaire();
    (lire[1] as HTMLButtonElement).click();
    await laisserFaire();
    expect(lectures().map((a) => a.body)).toEqual([
      { track_id: 7 },
      expect.objectContaining({ source: 'qobuz', source_id: 'q-1', title: 'So What', artist_name: 'Miles Davis' }),
    ]);
    // Rien n'est demandé au greffon : on joue chez moi.
    expect(ecoutes()).toEqual([]);
  });

  it('album ouvert : titre + artiste de l’album ; lecture locale (album_id) et service (streaming_album_id + source)', async () => {
    const el = await poser();
    await cliquer(el, 'li.partage-recu button.ouvrir-catalogue');
    await cliquer(el, 'button.album-contact');
    await cliquer(el, 'button.chercher-album');
    expect(decodeURIComponent(recherches()[0].url)).toContain('/search?q=Kind of Blue Miles Davis');
    const lire = el.querySelectorAll('.source-resultat button.lire-source');
    expect(lire).toHaveLength(2);
    (lire[0] as HTMLButtonElement).click();
    await laisserFaire();
    (lire[1] as HTMLButtonElement).click();
    await laisserFaire();
    expect(lectures().map((a) => a.body)).toEqual([
      { album_id: 5 },
      { streaming_album_id: 'qa-9', source: 'qobuz' },
    ]);
  });

  it('album de la grille : le bouton existe aussi et lance la recherche', async () => {
    const el = await poser();
    await cliquer(el, 'li.partage-recu button.ouvrir-catalogue');
    await cliquer(el, 'button.chercher-album-carte');
    expect(recherches()).toHaveLength(1);
    expect(el.querySelectorAll('.source-resultat')).toHaveLength(2);
  });

  it('aucun résultat : le dit clairement', async () => {
    resultatsRecherche = { local: { tracks: [], albums: [], artists: [] }, services: { qobuz: { tracks: [], albums: [], artists: [] } } };
    const el = await poser();
    await ouvrirTitresElise(el);
    await cliquer(el, '.pistes-contact button.chercher-piste');
    expect(texte(el.querySelector('.sources-aucun')!)).toBe(fr['v2.circle.sources.none'].replace('{query}', 'So What Miles Davis'));
    expect(el.querySelector('.source-resultat')).toBeNull();
  });

  it('recherche en échec : un message, pas de silence', async () => {
    resultatsRecherche = null;
    const el = await poser();
    await ouvrirTitresElise(el);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (/\/api\/v1\/search\?/.test(String(url))) return reponse(500, { error: 'boom' });
      return reponse(200, {});
    }));
    await cliquer(el, '.pistes-contact button.chercher-piste');
    expect(texte(el.querySelector('.sources-erreur')!)).toBe(fr['v2.circle.sources.error']);
  });

  it('clavier : le bouton est un vrai <button> focalisable, avec une étiquette', async () => {
    const el = await poser();
    await ouvrirTitresElise(el);
    const b = el.querySelector('button.chercher-piste') as HTMLButtonElement;
    expect(b.tagName).toBe('BUTTON');
    expect(b.disabled).toBe(false);
    expect(b.getAttribute('aria-label')).toBeTruthy();
    b.focus();
    expect(document.activeElement).toBe(b);
  });
});

describe('#7224 — meilleureCorrespondance : l’ordre et les critères', () => {
  const vide = { tracks: [], albums: [], artists: [] };
  const piste = (o: Record<string, unknown>) => ({ genre: 'track' as const, titre: 'So What', artiste: 'Miles Davis', ...o });

  it('« 19 » d’Adele (fil 2716) : l’album Qobuz est reconnu, édition Deluxe comprise', () => {
    const res = { local: vide, services: { qobuz: { ...vide, albums: [
      { title: '21', artist_name: 'Adele', id: 'q21', source_id: 'q21' },
      { title: '19 (Deluxe Edition)', artist_name: 'Adele', id: 'q19', source_id: 'q19' },
    ] } } } as any;
    expect(meilleureCorrespondance(res, { genre: 'album', titre: '19', artiste: 'Adele' })?.lecture)
      .toEqual({ streaming_album_id: 'q19', source: 'qobuz' });
  });

  it('la bibliothèque passe avant les services, même reconnue par le texte seul', () => {
    const res = {
      local: { ...vide, tracks: [{ id: 7, title: 'So What', artist_name: 'Miles Davis', duration_ms: 561000 }] },
      services: { qobuz: { ...vide, tracks: [{ title: 'So What', artist_name: 'Miles Davis', source_id: 'q-1', isrc: 'USSM15900113' }] } },
    } as any;
    expect(meilleureCorrespondance(res, piste({ isrc: 'USSM15900113', duree_ms: 562000 }))?.lecture).toEqual({ track_id: 7 });
  });

  it('dans une source, l’ISRC passe avant le texte ; l’ISRC suffit même si le titre diffère', () => {
    const res = { local: vide, services: { tidal: { ...vide, tracks: [
      { title: 'So What', artist_name: 'Miles Davis', source_id: 't-texte' },
      { title: 'So What (2009 Mix)', artist_name: 'Miles Davis', source_id: 't-isrc', isrc: 'US-SM1-59-00113' },
    ] } } } as any;
    expect(meilleureCorrespondance(res, piste({ isrc: 'USSM15900113' }))?.lecture).toMatchObject({ source: 'tidal', source_id: 't-isrc' });
  });

  it('album : le MBID du groupe de parutions reconnaît l’album local, même sous un autre titre', () => {
    const mbid = '8e4c3a6e-0d47-3a0a-9d3c-4f06b2f0f5a1';
    const res = { local: { ...vide, albums: [
      { id: 4, title: 'Kind of Blue', artist_name: 'Someone Else' },
      { id: 5, title: 'Kind Of Blue [Legacy]', artist_name: 'Miles Davis', musicbrainz_release_group_id: mbid.toUpperCase() },
    ] }, services: {} } as any;
    expect(meilleureCorrespondance(res, { genre: 'album', titre: 'Kind of Blue', artiste: 'Miles Davis', mbid })?.lecture)
      .toEqual({ album_id: 5 });
  });

  it('refuse un autre enregistrement : live, durée trop éloignée, autre artiste', () => {
    const res = { local: { ...vide, tracks: [
      { id: 1, title: 'So What (Live)', artist_name: 'Miles Davis', duration_ms: 562000 },
      { id: 2, title: 'So What', artist_name: 'Miles Davis', duration_ms: 562000 + ECART_DUREE_MS + 1 },
      { id: 3, title: 'So What', artist_name: 'John Coltrane', duration_ms: 562000 },
    ] }, services: {} } as any;
    expect(meilleureCorrespondance(res, piste({ duree_ms: 562000 }))).toBeNull();
  });

  it('artiste composé : « Simon & Garfunkel » ne lance pas l’album homonyme de « Simon » seul', () => {
    const res = { local: { ...vide, albums: [{ id: 1, title: 'Greatest Hits', artist_name: 'Paul Simon' },
      { id: 2, title: 'Greatest Hits', artist_name: 'Simon' }] }, services: {} } as any;
    expect(meilleureCorrespondance(res, { genre: 'album', titre: 'Greatest Hits', artiste: 'Simon & Garfunkel' })).toBeNull();
    const ok = { local: { ...vide, albums: [{ id: 3, title: 'Greatest Hits', artist_name: 'Simon and Garfunkel' }] }, services: {} } as any;
    expect(meilleureCorrespondance(ok, { genre: 'album', titre: 'Greatest Hits', artiste: 'Simon & Garfunkel' })?.lecture).toEqual({ album_id: 3 });
  });

  it('sans artiste chez le contact : un album ne se reconnaît pas au titre seul ; une piste, seulement avec la durée', () => {
    const res = { local: { albums: [{ id: 1, title: 'Greatest Hits', artist_name: 'Queen' }],
      tracks: [{ id: 9, title: 'Intro', artist_name: 'X', duration_ms: 60000 }], artists: [] }, services: {} } as any;
    expect(meilleureCorrespondance(res, { genre: 'album', titre: 'Greatest Hits', artiste: null })).toBeNull();
    expect(meilleureCorrespondance(res, { genre: 'track', titre: 'Intro', artiste: null })).toBeNull();
    expect(meilleureCorrespondance(res, { genre: 'track', titre: 'Intro', artiste: null, duree_ms: 61000 })?.lecture).toEqual({ track_id: 9 });
  });

  it('accents, casse, ponctuation et « feat. » ne séparent pas deux libellés identiques', () => {
    const res = { local: vide, services: { qobuz: { ...vide, tracks: [
      { title: 'L’Été indien', artist_name: 'JOE DASSIN feat. Quelqu’un', source_id: 'q-e' },
    ] } } } as any;
    expect(meilleureCorrespondance(res, { genre: 'track', titre: "l'ete Indien", artiste: 'Joe Dassin' })?.lecture)
      .toMatchObject({ source: 'qobuz', source_id: 'q-e' });
  });
});

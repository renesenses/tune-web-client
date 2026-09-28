// @vitest-environment jsdom
//
// jsdom : sans `window`, `$effect` ne se déclenche pas et l'écran ne lirait
// jamais `/ext/circle` — un test vert qui n'aurait rien exécuté.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { preparerLocale } from '../i18n';
import { preferences } from '../stores/preferences';
import { dialogs } from '../stores/dialogs';
import { activeView } from '../stores/navigation';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import {
  circlePlugin, avisSynchro, pisteContact, albumContact, pisteVersTrack, pochetteAlbumContact, ouPartage,
} from '../circle';
import fr from '../locales/fr';

/**
 * Tune Circle, étape T2 — renesenses/tune-server-rust#5325 et les décisions
 * de Bertrand du 28/09/2026 : le catalogue d'un contact, EN LECTURE.
 *
 * Le faux greffon suit le contrat de l'issue, sous `/api/v1/ext/circle` :
 *   GET / (cercles + `sharing`), PUT/DELETE /circles/{id}/sharing/library,
 *   GET /library-sync, GET /shared-with-me, GET /contacts/{uid}/library/…
 *
 * Il porte un ÉTAT : l'interrupteur doit se lire dans `GET /` relu, pas dans
 * une supposition de l'écran. Et le cloud y « fuit » exprès des champs hors
 * liste blanche (chemins, `server_id`, `cover_path`, `source_id`) : aucun ne
 * doit atteindre le DOM.
 */

type Cercle = { id: number; name: string; member_ids: number[]; sharing?: { library: boolean; server_id: string | null } };
let cercles: Cercle[] = [];
let partagesRecus: { user_id: number; name: string; library: boolean }[] = [];
let synchro: Record<string, unknown> | null = null;
/** Le partage d'Élise (uid 40) avec moi : faux = 404 partout, comme une révocation. */
let elisePartage = true;
let greffonT2 = true;
/** Refus imposé au prochain PUT de partage (refus de liaison du serveur). */
let refusPut: { status: number; corps: unknown } | null = null;
const MBID_KOB = 'f5093c06-23e3-404f-aeaa-40f72885ee3a';

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];

const FUITES = {
  cover_path: '/Users/elise/Music/Kind of Blue/cover.jpg',
  image_path: '/mnt/nas/elise/miles.jpg',
  source_id: '/volume1/music/kind-of-blue/01.flac',
  file_path: 'C:\\Musique\\Miles\\01.flac',
  server_id: 'srv-elise-secret',
  source: 'local',
  bio: 'bio privée',
  musicbrainz_id: 'mbid-prive',
};

const ARTISTES = [
  { id: 1, name: 'Miles Davis', ...FUITES },
  { id: 2, name: 'Bill Evans', ...FUITES },
];
const ALBUMS = [
  { id: 11, title: 'Kind of Blue', artist_name: 'Miles Davis', year: 1959, genre: 'Jazz', track_count: 2,
    musicbrainz_release_group_id: MBID_KOB, ...FUITES },
  // Un MBID mal formé ne doit jamais entrer dans une adresse.
  { id: 12, title: 'Sunday at the Village Vanguard', artist_name: 'Bill Evans', year: 1961, genre: 'Jazz', track_count: 1,
    musicbrainz_release_group_id: '../../x?y=Bill Evans', ...FUITES },
];
const PISTES = [
  { id: 101, title: 'So What', artist_name: 'Miles Davis', album_title: 'Kind of Blue', album_id: 11, format: 'flac',
    sample_rate: 96000, bit_depth: 24, duration_ms: 562000, genre: 'Jazz', track_number: 1, disc_number: 1, isrc: 'USSM15900113', ...FUITES },
  { id: 102, title: 'Freddie Freeloader', artist_name: 'Miles Davis', album_title: 'Kind of Blue', album_id: 11, format: 'flac',
    sample_rate: 96000, bit_depth: 24, duration_ms: 586000, genre: 'Jazz', track_number: 2, disc_number: 1, isrc: null, ...FUITES },
];

function reponse(status: number, corps: unknown, entetes: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json', ...entetes }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}
const introuvable = () => reponse(404, { error: 'not_found' });

/** Une page « à la Laravel », construite à la main comme le demande le contrat. */
function paginer<T>(liste: T[], q: URLSearchParams) {
  const page = Number(q.get('page') ?? 1);
  const par = Number(q.get('per_page') ?? 50);
  const data = liste.slice((page - 1) * par, page * par);
  return { data, current_page: page, last_page: Math.max(1, Math.ceil(liste.length / par)), per_page: par, total: liste.length };
}

function greffon(u: string, method: string): Response {
  const [avantQ, apresQ = ''] = u.split('?');
  const chemin = avantQ.replace(/^.*\/api\/v1\/ext\/circle/, '');
  const q = new URLSearchParams(apresQ);
  let m: RegExpMatchArray | null;
  if (method === 'GET' && (chemin === '' || chemin === '/')) {
    return reponse(200, JSON.parse(JSON.stringify({
      members: [{ user_id: 40, name: 'Élise', since: '2026-09-01T10:00:00Z' }], sent: [], received: [], circles: cercles,
    })));
  }
  if (!greffonT2) return introuvable();
  if (method === 'GET' && chemin === '/library-sync') return reponse(200, synchro);
  if (method === 'GET' && chemin === '/shared-with-me') return reponse(200, partagesRecus);
  if ((m = chemin.match(/^\/circles\/(\d+)\/sharing\/library$/))) {
    const c = cercles.find((x) => x.id === Number(m![1]));
    if (!c) return introuvable();
    if (method === 'PUT') {
      if (refusPut) { const r = refusPut; refusPut = null; return reponse(r.status, r.corps); }
      // Un seul serveur partagé par propriétaire : tous les cercles qui
      // partagent pointent désormais sur CE serveur.
      const ici = (synchro?.server_id as string | undefined) ?? 'srv-moi';
      for (const x of cercles) if (x.sharing?.library) x.sharing.server_id = ici;
      c.sharing = { library: true, server_id: ici };
      return reponse(200, c);
    }
    if (method === 'DELETE') { c.sharing = { library: false, server_id: null }; return reponse(200, { ok: true }); }
  }
  if ((m = chemin.match(/^\/contacts\/(\d+)\/library(\/.*)$/)) && method === 'GET') {
    if (Number(m[1]) !== 40 || !elisePartage) return introuvable();
    const reste = m[2];
    const cherche = (q.get('search') ?? '').toLowerCase();
    const filtre = <T extends Record<string, unknown>>(l: T[], ...champs: string[]) =>
      cherche ? l.filter((x) => champs.some((c) => String(x[c] ?? '').toLowerCase().includes(cherche))) : l;
    if (reste === '/stats') return reponse(200, { tracks: 2, albums: 2, artists: 2, last_sync: '2026-09-27T08:00:00Z', ...FUITES });
    if (reste === '/artists') return reponse(200, paginer(filtre(ARTISTES, 'name'), q));
    if (reste === '/albums') {
      // `artist` = IDENTIFIANT d'artiste ; un nom ne correspond à rien.
      const aid = q.get('artist');
      const nom = aid == null ? null : ARTISTES.find((x) => String(x.id) === aid)?.name ?? '\u0000';
      const l = filtre(ALBUMS, 'title', 'artist_name').filter((a) => nom == null || a.artist_name === nom);
      return reponse(200, paginer(l, q));
    }
    if (reste === '/tracks') return reponse(200, paginer(filtre(PISTES, 'title', 'artist_name', 'album_title'), q));
    if ((m = reste.match(/^\/albums\/(\d+)\/tracks$/))) {
      return reponse(200, PISTES.filter((p) => p.album_id === Number(m![1])));
    }
  }
  return introuvable();
}

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  cercles = [
    { id: 7, name: 'Famille', member_ids: [40] },
    { id: 8, name: 'Jazz', member_ids: [40], sharing: { library: false, server_id: null } },
  ];
  partagesRecus = [{ user_id: 40, name: 'Élise', library: true }];
  synchro = { premium: false, active: true, last_sync: '2026-09-27T08:00:00Z', pending: 0 };
  elisePartage = true;
  greffonT2 = true;
  refusPut = null;
  circlePlugin.set(null);
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = init?.body !== undefined && init?.body !== null ? JSON.parse(String(init.body)) : undefined;
      appels.push({ url: u, method, body });
      if (u.includes('/ext/circle')) return greffon(u, method);
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

async function poser(Vue: any, props: Record<string, unknown> = {}): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(Vue, { target: hote, props });
  flushSync();
  await laisserFaire();
  return hote;
}

const texte = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
const noms = (el: Element, sel: string) => [...el.querySelectorAll(sel)].map((n) => texte(n));
const chemin = (a: Appel) => a.url.replace(/^.*ext\/circle/, '');
const gestes = () => appels.filter((a) => a.url.includes('/ext/circle') && a.method !== 'GET');
const lecturesCatalogue = () => appels.filter((a) => /\/ext\/circle\/contacts\//.test(a.url)).map(chemin);

function cercleDe(el: Element, nom: string): Element {
  const a = [...el.querySelectorAll('article.cercle')].find((n) => n.querySelector('.cercle-nom')?.textContent === nom);
  if (!a) throw new Error(`cercle introuvable : ${nom}`);
  return a;
}

async function cliquer(el: Element, sel: string) {
  const b = el.querySelector(sel) as HTMLButtonElement | null;
  if (!b) throw new Error(`bouton introuvable : ${sel}`);
  b.click();
  await laisserFaire();
}

async function ouvrirElise(el: Element) {
  await cliquer(el, 'li.partage-recu button.ouvrir-catalogue');
}

/** Tout ce que l'écran rend, attributs compris : titres, alt, aria, style. */
function toutLeDom(el: Element): string {
  return el.innerHTML;
}

function sansFuite(el: Element) {
  const dom = toutLeDom(el);
  for (const v of Object.values(FUITES)) {
    if (v === 'local') continue;
    expect(dom, `fuite de ${v}`).not.toContain(v);
  }
  for (const motif of ['/Users', '/mnt', '/volume', 'C:\\', 'srv-']) {
    expect(dom, `motif de chemin ${motif}`).not.toContain(motif);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('T2 — partager ma bibliothèque, par cercle', () => {
  it('éteint par défaut : `sharing` absent comme `library:false`, et la phrase dit ce qui part', async () => {
    const el = await poser(CircleV2);
    const famille = cercleDe(el, 'Famille');
    const jazz = cercleDe(el, 'Jazz');
    const i1 = famille.querySelector('button.interrupteur-partage')!;
    const i2 = jazz.querySelector('button.interrupteur-partage')!;
    expect(i1.getAttribute('role')).toBe('switch');
    expect(i1.getAttribute('aria-checked')).toBe('false');
    expect(i2.getAttribute('aria-checked')).toBe('false');
    expect(texte(i1)).toBe(fr['v2.circle.share.toggle']);
    // Ce qui part, ce qui ne part jamais, et UN serveur : celui-ci.
    const quoi = texte(famille.querySelector('.partage-quoi')!);
    expect(quoi).toBe(fr['v2.circle.share.what']);
    expect(quoi).toMatch(/ce serveur, et de lui seul/);
    expect(quoi).toMatch(/Jamais vos fichiers ni leurs chemins/);
    // Aucun geste n'est parti tout seul.
    expect(gestes()).toHaveLength(0);
  });

  it('allumer = PUT sans corps, éteindre = DELETE ; l’état vient de `GET /` relu', async () => {
    const el = await poser(CircleV2);
    await cliquer(cercleDe(el, 'Famille'), 'button.interrupteur-partage');
    expect(gestes().map((a) => `${a.method} ${chemin(a)}`)).toEqual(['PUT /circles/7/sharing/library']);
    // Le greffon ajoute SON server_id : le client n'en envoie aucun.
    expect(gestes()[0].body).toBeUndefined();
    expect(cercleDe(el, 'Famille').querySelector('button.interrupteur-partage')!.getAttribute('aria-checked')).toBe('true');
    expect(texte(el.querySelector('.retour')!)).toBe(fr['v2.circle.share.started']);
    // L'autre cercle n'a pas bougé : un interrupteur PAR cercle.
    expect(cercleDe(el, 'Jazz').querySelector('button.interrupteur-partage')!.getAttribute('aria-checked')).toBe('false');

    await cliquer(cercleDe(el, 'Famille'), 'button.interrupteur-partage');
    expect(gestes().map((a) => `${a.method} ${chemin(a)}`)).toEqual([
      'PUT /circles/7/sharing/library', 'DELETE /circles/7/sharing/library',
    ]);
    expect(cercleDe(el, 'Famille').querySelector('button.interrupteur-partage')!.getAttribute('aria-checked')).toBe('false');
    expect(texte(el.querySelector('.retour')!)).toBe(fr['v2.circle.share.stopped']);
  });

  it('allumé : l’état de la copie en ligne s’affiche à côté (absente, en retard, à jour)', async () => {
    cercles[1].sharing = { library: true, server_id: 'srv-moi' };
    synchro = { premium: false, active: true, last_sync: null, pending: 12 };
    let el = await poser(CircleV2);
    expect(cercleDe(el, 'Famille').querySelector('.avis-synchro')).toBeNull();
    expect(texte(cercleDe(el, 'Jazz').querySelector('.avis-synchro')!)).toBe(fr['v2.circle.share.syncNone']);
    // Le server_id reçu dans `sharing` ne s'affiche nulle part.
    expect(el.innerHTML).not.toContain('srv-moi');
    unmount(monte!); monte = null; hote?.remove();

    synchro = { premium: true, active: true, last_sync: '2026-09-27T08:00:00Z', pending: 12 };
    el = await poser(CircleV2);
    expect(texte(cercleDe(el, 'Jazz').querySelector('.avis-synchro')!))
      .toBe(fr['v2.circle.share.syncPending'].replace('{n}', '12'));
  });

  it('avisSynchro : les quatre cas', () => {
    expect(avisSynchro(null)).toBeNull();
    expect(avisSynchro({ last_sync: null })?.cle).toBe('v2.circle.share.syncNone');
    expect(avisSynchro({ last_sync: 'x', active: false })?.cle).toBe('v2.circle.share.syncInactive');
    expect(avisSynchro({ last_sync: 'x', active: true, pending: 3 })).toEqual({ cle: 'v2.circle.share.syncPending', n: 3 });
    expect(avisSynchro({ last_sync: 'x', active: true, pending: 0 })?.cle).toBe('v2.circle.share.syncOk');
  });

  it('greffon T1 (404 sur /library-sync) : ni interrupteur, ni bloc « Partagé avec moi »', async () => {
    greffonT2 = false;
    const el = await poser(CircleV2);
    expect(el.querySelectorAll('article.cercle')).toHaveLength(2);
    expect(el.querySelector('button.interrupteur-partage')).toBeNull();
    expect(el.querySelector('section.partages-recus')).toBeNull();
    expect(el.querySelector('.err')).toBeNull();
  });
});

describe('T2 — partagé avec moi', () => {
  it('la liste des contacts qui partagent, jamais un nom de cercle', async () => {
    partagesRecus = [
      { user_id: 40, name: 'Élise', library: true },
      { user_id: 41, name: 'Farid', library: true, circles: ['Cercle secret'] } as any,
    ];
    const el = await poser(CircleV2);
    const bloc = el.querySelector('section.partages-recus')!;
    expect(texte(bloc.querySelector('h2')!)).toBe(fr['v2.circle.shared.title']);
    expect(noms(bloc, 'li.partage-recu .nom')).toEqual(['Élise', 'Farid']);
    expect(el.innerHTML).not.toContain('Cercle secret');
  });

  it('personne : la phrase', async () => {
    partagesRecus = [];
    const el = await poser(CircleV2);
    expect(texte(el.querySelector('section.partages-recus .vide')!)).toBe(fr['v2.circle.shared.none']);
  });
});

describe('T2 — parcourir le catalogue d’un contact', () => {
  it('albums, pochette générique, pistes d’un album — sans rien à écouter', async () => {
    const el = await poser(CircleV2);
    await ouvrirElise(el);
    // L'écran du cercle a laissé la place au catalogue.
    expect(el.querySelector('section.contacts')).toBeNull();
    expect(texte(el.querySelector('.titre-catalogue')!)).toBe('Bibliothèque de Élise');
    expect(texte(el.querySelector('.stats')!)).toMatch(/^2 albums · 2 artistes · 2 titres/);
    expect(noms(el, 'button.album-contact .album-nom')).toEqual(['Kind of Blue', 'Sunday at the Village Vanguard']);
    expect(texte(el.querySelector('button.album-contact .note')!)).toBe('Miles Davis · 1959 · 2 titres');
    // Pochettes : Cover Art Archive par le MBID, via le relais de NOTRE serveur ;
    // l'album au MBID mal formé garde l'icône générique.
    const tuiles = [...el.querySelectorAll('button.album-contact')];
    const img = tuiles[0].querySelector('img')!;
    expect(img.getAttribute('src')).toBe(
      `/api/v1/library/artwork/proxy?url=${encodeURIComponent(`https://coverartarchive.org/release-group/${MBID_KOB}/front-250`)}`,
    );
    expect(tuiles[1].querySelector('img')).toBeNull();
    expect(tuiles[1].querySelector('.placeholder svg')).not.toBeNull();
    // Aucun titre ni artiste dans une adresse d'image.
    for (const i of el.querySelectorAll('img')) {
      expect(i.getAttribute('src')).not.toMatch(/Kind|Blue|Miles|Davis|Bill|Evans|Vanguard/);
    }
    // Pochette introuvable : l'icône générique revient.
    img.dispatchEvent(new Event('error'));
    await laisserFaire();
    expect(tuiles[0].querySelector('img')).toBeNull();
    expect(tuiles[0].querySelector('.placeholder svg')).not.toBeNull();
    // …sans repli sur l'album LOCAL qui porterait le même numéro que celui de l'ami.
    expect(appels.filter((x) => !x.url.includes('/ext/circle') && /\/library\/albums\/\d+/.test(x.url))).toEqual([]);
    expect(lecturesCatalogue()).toEqual(['/contacts/40/library/stats', '/contacts/40/library/albums?page=1&per_page=50']);

    await cliquer(el, 'button.album-contact');
    expect(lecturesCatalogue().at(-1)).toBe('/contacts/40/library/albums/11/tracks');
    expect(noms(el, '.pistes-album .tt')).toEqual(['So What', 'Freddie Freeloader']);
    // Lecture seule : aucune barre d'actions, le titre ne lance rien.
    expect(el.querySelector('.pistes-album .pactions')).toBeNull();
    const titre = el.querySelector('.pistes-album button.tclick') as HTMLButtonElement;
    expect(titre.disabled).toBe(true);
    expect(texte(el.querySelector('.lecture-seule')!)).toBe(fr['v2.circle.lib.readOnly']);
    sansFuite(el);
    // Aucune demande de lecture n'est partie vers le serveur local.
    // (`/(play|queue)` suivi d'une fin de segment : `/ext/circle/playlists`, T5,
    // est une LISTE de playlists de cercle, pas une demande de lecture.)
    expect(appels.some((a) => /\/(play|queue)(\/|\?|$)/.test(a.url))).toBe(false);
  });

  it('artistes → albums de l’artiste ; titres ; recherche', async () => {
    const el = await poser(CircleV2);
    await ouvrirElise(el);
    await cliquer(el, 'button.onglet-artists');
    expect(noms(el, 'button.artiste-contact')).toEqual(['Miles Davis', 'Bill Evans']);
    await cliquer(el, 'button.artiste-contact:nth-of-type(1)');
    // Le filtre part par l'IDENTIFIANT d'artiste, jamais par son nom.
    expect(lecturesCatalogue().at(-1)).toBe('/contacts/40/library/albums?page=1&per_page=50&artist=1');
    expect(noms(el, 'button.album-contact .album-nom')).toEqual(['Kind of Blue']);
    expect(texte(el.querySelector('.filtre-artiste')!)).toBe('Artiste : Miles Davis');

    await cliquer(el, 'button.onglet-tracks');
    expect(lecturesCatalogue().at(-1)).toBe('/contacts/40/library/tracks?page=1&per_page=50');
    expect(noms(el, '.pistes-contact .tt')).toEqual(['So What', 'Freddie Freeloader']);
    expect(el.querySelector('.pistes-contact .pactions')).toBeNull();

    const champ = el.querySelector('input.recherche') as HTMLInputElement;
    champ.value = 'fred';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);
    await laisserFaire();
    expect(lecturesCatalogue().at(-1)).toBe('/contacts/40/library/tracks?page=1&per_page=50&search=fred');
    expect(noms(el, '.pistes-contact .tt')).toEqual(['Freddie Freeloader']);
    sansFuite(el);
  });

  it('retour : l’écran du cercle revient, sans message', async () => {
    const el = await poser(CircleV2);
    await ouvrirElise(el);
    await cliquer(el, 'button.retour-liste');
    expect(el.querySelector('.catalogue-contact')).toBeNull();
    expect(noms(el, 'li.partage-recu .nom')).toEqual(['Élise']);
    expect(el.querySelector('.retour')).toBeNull();
  });
});

describe('T2 — contact révoqué, partage coupé : 404', () => {
  it('404 au milieu de la navigation : retour à la liste, la phrase, rien de gardé', async () => {
    const el = await poser(CircleV2);
    await ouvrirElise(el);
    expect(noms(el, 'button.album-contact .album-nom')).toHaveLength(2);
    // Élise me retire de son cercle (ou me révoque) entre deux gestes.
    elisePartage = false;
    partagesRecus = [];
    await cliquer(el, 'button.album-contact');
    expect(el.querySelector('.catalogue-contact')).toBeNull();
    expect(texte(el.querySelector('.retour')!)).toBe(fr['v2.circle.shared.gone']);
    // La liste a été relue : Élise n'y est plus, et aucun titre de son catalogue ne reste.
    expect(el.querySelector('li.partage-recu')).toBeNull();
    expect(el.innerHTML).not.toContain('Kind of Blue');
    expect(el.innerHTML).not.toContain('So What');
  });

  it('404 dès l’ouverture (stats) : même retour', async () => {
    const el = await poser(CircleV2);
    elisePartage = false;
    await ouvrirElise(el);
    expect(el.querySelector('.catalogue-contact')).toBeNull();
    expect(texte(el.querySelector('.retour')!)).toBe(fr['v2.circle.shared.gone']);
  });

  it('rouvrir après un 404 relit tout : aucune donnée n’a été gardée', async () => {
    const el = await poser(CircleV2);
    await ouvrirElise(el);
    await cliquer(el, 'button.onglet-tracks');
    expect(noms(el, '.pistes-contact .tt')).toHaveLength(2);
    elisePartage = false;
    await cliquer(el, 'button.onglet-artists');
    expect(el.querySelector('.catalogue-contact')).toBeNull();
    // Élise repartage (la liste relue la montre encore) : la réouverture
    // repart de zéro, par le réseau, sur l'onglet Albums.
    elisePartage = true;
    const avant = lecturesCatalogue().length;
    await ouvrirElise(el);
    expect(lecturesCatalogue().slice(avant)).toEqual([
      '/contacts/40/library/stats', '/contacts/40/library/albums?page=1&per_page=50',
    ]);
    expect(el.querySelector('.pistes-contact')).toBeNull();
    expect(noms(el, 'button.album-contact .album-nom')).toHaveLength(2);
  });
});

describe('T2 — un seul serveur partagé par propriétaire', () => {
  it('ouPartage : non / ici / ailleurs ; sans server_id local, jamais « ailleurs »', () => {
    const c = (sid: string | null, on = true) => ({ id: 1, name: 'x', member_ids: [], sharing: { library: on, server_id: sid } });
    expect(ouPartage({ id: 1, name: 'x', member_ids: [] }, 'srv-ici')).toBe('non');
    expect(ouPartage(c('srv-ici', false), 'srv-ici')).toBe('non');
    expect(ouPartage(c('srv-ici'), 'srv-ici')).toBe('ici');
    expect(ouPartage(c('srv-autre'), 'srv-ici')).toBe('ailleurs');
    expect(ouPartage(c('srv-autre'), null)).toBe('ici');
    expect(ouPartage(c(null), 'srv-ici')).toBe('ici');
  });

  it('cercle partagé depuis un autre serveur : la phrase, puis confirmer AVANT de déplacer', async () => {
    synchro = { active: true, last_sync: '2026-09-27T08:00:00Z', pending: 0, server_id: 'srv-ici' };
    cercles[1].sharing = { library: true, server_id: 'srv-autre' };
    const el = await poser(CircleV2);
    const jazz = cercleDe(el, 'Jazz');
    expect(jazz.querySelector('button.interrupteur-partage')!.getAttribute('aria-checked')).toBe('false');
    expect(texte(jazz.querySelector('.partage-ailleurs')!)).toBe(fr['v2.circle.share.elsewhere']);
    // Pas d'avis de synchro : il décrirait CE serveur, pas celui qui est partagé.
    expect(jazz.querySelector('.avis-synchro')).toBeNull();
    expect(cercleDe(el, 'Famille').querySelector('.partage-ailleurs')).toBeNull();

    // Refuser : rien ne part.
    await cliquer(jazz, 'button.interrupteur-partage');
    expect(get(dialogs)[0]?.message).toBe(fr['v2.circle.share.confirmMove']);
    dialogs.settle(get(dialogs)[0].id, false);
    await laisserFaire();
    expect(gestes()).toHaveLength(0);

    // Accepter : PUT sans corps, et le partage est ICI.
    await cliquer(cercleDe(el, 'Jazz'), 'button.interrupteur-partage');
    dialogs.settle(get(dialogs)[0].id, true);
    await laisserFaire();
    expect(gestes().map((a) => `${a.method} ${chemin(a)}`)).toEqual(['PUT /circles/8/sharing/library']);
    expect(gestes()[0].body).toBeUndefined();
    expect(cercleDe(el, 'Jazz').querySelector('button.interrupteur-partage')!.getAttribute('aria-checked')).toBe('true');
    expect(cercleDe(el, 'Jazz').querySelector('.partage-ailleurs')).toBeNull();
  });

  it('activer un AUTRE cercle pendant qu’un cercle partage ailleurs : même confirmation', async () => {
    synchro = { active: true, last_sync: '2026-09-27T08:00:00Z', pending: 0, server_id: 'srv-ici' };
    cercles[1].sharing = { library: true, server_id: 'srv-autre' };
    const el = await poser(CircleV2);
    await cliquer(cercleDe(el, 'Famille'), 'button.interrupteur-partage');
    expect(get(dialogs)[0]?.message).toBe(fr['v2.circle.share.confirmMove']);
    dialogs.settle(get(dialogs)[0].id, true);
    await laisserFaire();
    expect(gestes().map((a) => `${a.method} ${chemin(a)}`)).toEqual(['PUT /circles/7/sharing/library']);
    // Le cloud a déplacé tout le partage : les deux cercles partagent ICI.
    for (const n of ['Famille', 'Jazz']) {
      expect(cercleDe(el, n).querySelector('button.interrupteur-partage')!.getAttribute('aria-checked')).toBe('true');
    }
  });

  it('même serveur : aucune confirmation', async () => {
    synchro = { active: true, last_sync: '2026-09-27T08:00:00Z', pending: 0, server_id: 'srv-ici' };
    cercles[1].sharing = { library: true, server_id: 'srv-ici' };
    const el = await poser(CircleV2);
    await cliquer(cercleDe(el, 'Famille'), 'button.interrupteur-partage');
    expect(get(dialogs)).toHaveLength(0);
    expect(gestes().map((a) => `${a.method} ${chemin(a)}`)).toEqual(['PUT /circles/7/sharing/library']);
  });
});

describe('T2 — serveur non relié au compte', () => {
  it('refus de liaison : la phrase, et le bouton mène à Réglages ▸ Système ▸ Cloud', async () => {
    refusPut = { status: 409, corps: { code: 'circle.server_not_linked', error: 'server not linked' } };
    const el = await poser(CircleV2);
    await cliquer(cercleDe(el, 'Famille'), 'button.interrupteur-partage');
    expect(texte(el.querySelector('.retour span')!)).toBe(fr['v2.circle.share.notLinked']);
    expect(fr['v2.circle.share.notLinked']).toMatch(/Réglages ▸ Système ▸ Cloud/);
    expect(cercleDe(el, 'Famille').querySelector('button.interrupteur-partage')!.getAttribute('aria-checked')).toBe('false');
    v2SettingsTarget.set(null);
    await cliquer(el, '.retour button.relier-compte');
    expect(get(activeView)).toBe('settings');
    expect(get(v2SettingsTarget)).toEqual({ tab: 'system', section: 'cloud' });
  });

  it('un autre refus (503) ne propose pas de relier', async () => {
    refusPut = { status: 503, corps: { code: 'circle.cloud_unavailable' } };
    const el = await poser(CircleV2);
    await cliquer(cercleDe(el, 'Famille'), 'button.interrupteur-partage');
    expect(texte(el.querySelector('.retour span')!)).toBe(fr['v2.circle.err.unavailable']);
    expect(el.querySelector('.retour button.relier-compte')).toBeNull();
  });
});

describe('T2 — liste blanche côté client', () => {
  it('pisteContact / albumContact ne recopient que les champs du contrat', () => {
    expect(Object.keys(pisteContact(PISTES[0])).sort()).toEqual([
      'album_id', 'album_title', 'artist_name', 'bit_depth', 'disc_number', 'duration_ms', 'format', 'genre',
      'id', 'isrc', 'sample_rate', 'title', 'track_number',
    ]);
    expect(Object.keys(albumContact(ALBUMS[0])).sort()).toEqual([
      'artist_name', 'genre', 'id', 'musicbrainz_release_group_id', 'title', 'track_count', 'year',
    ]);
    expect(albumContact(ALBUMS[1]).musicbrainz_release_group_id).toBeNull();
    expect(pochetteAlbumContact(albumContact(ALBUMS[1]))).toBeNull();
    expect(pochetteAlbumContact(albumContact({ ...ALBUMS[0], musicbrainz_release_group_id: undefined }))).toBeNull();
    expect(pochetteAlbumContact(albumContact(ALBUMS[0]))).toBe(`https://coverartarchive.org/release-group/${MBID_KOB}/front-250`);
    const t = pisteVersTrack(pisteContact(PISTES[0]));
    // Les identifiants de l'AMI ne deviennent pas des identifiants locaux.
    expect(t.id).toBeNull();
    expect(t.album_id).toBeNull();
    expect(t.cover_path).toBeNull();
    expect(JSON.stringify(t)).not.toMatch(/Users|volume|srv-|file_path|source_id/);
  });
});

describe('ListePistesV2 — lectureSeule', () => {
  const pistes = PISTES.map((p) => pisteVersTrack(pisteContact(p)));

  it('mode tableau (Expert, colonne Fichier cochée) : ni actions, ni colonne Fichier, ni lecture', async () => {
    preferences.update((p) => ({ ...p, settingsLevel: 'expert', v2Colonnes: { ...(p as any).v2Colonnes, expert: ['artist', 'path'] } }) as any);
    const onLire = vi.fn();
    const el = await poser(ListePistesV2, { pistes, onLire, lectureSeule: true });
    expect(el.querySelector('.tbl')).not.toBeNull();
    const entetes = noms(el, '.thead .th');
    expect(entetes).not.toContain(fr['v2.tcol.path']);
    expect(el.querySelector('.thead [aria-label]')).toBeNull();
    expect(el.querySelector('.pactions')).toBeNull();
    (el.querySelector('button.titre') as HTMLButtonElement).click();
    await laisserFaire();
    expect(onLire).not.toHaveBeenCalled();
    // L'artiste n'est pas un lien vers NOTRE bibliothèque.
    expect(el.querySelector('button.lien-artiste')).toBeNull();
  });

  it('témoin : la même liste SANS la prop garde actions et colonne Fichier', async () => {
    preferences.update((p) => ({ ...p, settingsLevel: 'expert', v2Colonnes: { ...(p as any).v2Colonnes, expert: ['artist', 'path'] } }) as any);
    const el = await poser(ListePistesV2, { pistes, onLire: vi.fn() });
    expect(noms(el, '.thead .th')).toContain(fr['v2.tcol.path']);
    expect(el.querySelector('.pactions')).not.toBeNull();
  });

  it('mode lignes (Intermédiaire) : ni actions, titre désactivé', async () => {
    preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
    const onLire = vi.fn();
    const el = await poser(ListePistesV2, { pistes, onLire, lectureSeule: true });
    expect(el.querySelector('.trk')).not.toBeNull();
    expect(el.querySelector('.pactions')).toBeNull();
    const b = el.querySelector('button.tclick') as HTMLButtonElement;
    expect(b.disabled).toBe(true);
  });
});

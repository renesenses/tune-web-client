// @vitest-environment jsdom
//
// jsdom : sans `window`, `$effect` ne se déclenche pas et l'écran ne lirait
// jamais `/ext/circle` — un test vert qui n'aurait rien exécuté.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import AjoutPlaylistCercleV2 from '../../components/v2/AjoutPlaylistCercleV2.svelte';
import { preparerLocale } from '../i18n';
import { preferences } from '../stores/preferences';
import { dialogs } from '../stores/dialogs';
import { currentZoneId } from '../stores/zones';
import { notifications } from '../stores/notifications';
import { circlePlugin } from '../circle';
import {
  ajoutDePiste, referenceDeService, playlistCercle, etatResolution, ordreDeplace, isrcNormalise,
} from '../circlePlaylists';
import { entreesMenuPiste } from '../menuPiste';
import type { Track } from '../types';

/**
 * Tune Circle, étape T5 — renesenses/tune-server-rust#5328 et les décisions
 * de Bertrand du 28/09/2026 : les playlists COLLABORATIVES d'un cercle, par
 * références.
 *
 * Le faux greffon suit le contrat de l'issue, sous `/api/v1/ext/circle` :
 *   GET/POST /playlists, GET/PATCH/DELETE /playlists/{id},
 *   POST /playlists/{id}/items, DELETE …/items/{item_id}?version=,
 *   PUT …/order, POST …/resolve, POST …/play, POST …/copy.
 *
 * Il porte un ÉTAT et une VERSION : toute écriture dont la version est
 * dépassée reçoit 409 `version_conflict` avec l'état courant. Et le cloud y
 * « fuit » exprès des champs hors liste blanche (chemins, `source_id`) :
 * aucun ne doit atteindre le DOM.
 */

type Item = Record<string, unknown> & { item_id: string };
type Pl = { id: string; name: string; version: number; mine: boolean; circle_id: number | null; owner: { user_id: number; name: string }; items: Item[] };

const FUITES = {
  path: '/Users/elise/Music/so-what.flac',
  file_path: 'C:\\Musique\\Miles\\01.flac',
  source_id: '/volume1/music/kind-of-blue/01.flac',
  url: 'https://nas.elise.local/stream/01',
  circle_name: 'Cercle secret de Paul',
};

let pls: Pl[] = [];
/** Les playlists que je ne vois plus (révocation, retrait, suppression) : 404 partout. */
let coupees = new Set<string>();
let greffonT5 = true;
let copieEchoue = false;
let resolution: Record<string, { status: string; source?: string; source_id?: string }> = {};
/** Un autre membre écrit ENTRE ma lecture et mon geste. */
let avantMonGeste: ((p: Pl) => void) | null = null;

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];

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
const vue = (p: Pl) => JSON.parse(JSON.stringify({ id: p.id, name: p.name, version: p.version, mine: p.mine, items: p.items }));
const conflit = (p: Pl) => reponse(409, { error: 'version_conflict', playlist: vue(p) });

let prochainItem = 900;

function greffon(u: string, method: string, body: any): Response {
  const [avantQ, apresQ = ''] = u.split('?');
  const chemin = avantQ.replace(/^.*\/api\/v1\/ext\/circle/, '');
  const q = new URLSearchParams(apresQ);
  let m: RegExpMatchArray | null;
  if (method === 'GET' && (chemin === '' || chemin === '/')) {
    return reponse(200, {
      members: [{ user_id: 40, name: 'Élise', since: '2026-09-01T10:00:00Z' }], sent: [], received: [],
      circles: [{ id: 7, name: 'Famille', member_ids: [40] }, { id: 8, name: 'Jazz', member_ids: [] }],
    });
  }
  if (chemin === '/library-sync' || chemin === '/shared-with-me') return reponse(200, chemin === '/shared-with-me' ? [] : { active: true, last_sync: null });
  if (!greffonT5) return introuvable();
  if (chemin === '/playlists' && method === 'GET') {
    return reponse(200, pls.filter((p) => !coupees.has(p.id)).map((p) => ({
      id: p.id, name: p.name, owner: p.owner, count: p.items.length, version: p.version,
      updated_at: '2026-09-28T10:00:00Z', mine: p.mine, ...(p.mine ? { circle_id: p.circle_id } : {}),
    })));
  }
  if (chemin === '/playlists' && method === 'POST') {
    const p: Pl = { id: `pl-${pls.length + 1}`, name: body.name, version: 1, mine: true, circle_id: body.circle_id, owner: { user_id: 1, name: 'Moi' }, items: [] };
    pls.push(p);
    return reponse(201, vue(p));
  }
  if ((m = chemin.match(/^\/playlists\/([^/]+)(\/.*)?$/))) {
    const p = pls.find((x) => x.id === decodeURIComponent(m![1]));
    if (!p || coupees.has(p.id)) return introuvable();
    const reste = m[2] ?? '';
    if (reste === '' && method === 'GET') return reponse(200, vue(p));
    if (reste === '/resolve' && method === 'POST') {
      return reponse(200, p.items.map((x) => ({ item_id: x.item_id, ...(resolution[x.item_id] ?? { status: 'not_found' }) })));
    }
    if (reste === '/play' && method === 'POST') {
      const manquants = p.items.filter((x) => (resolution[x.item_id]?.status ?? 'not_found') === 'not_found').map((x) => x.item_id);
      return reponse(200, { queued: p.items.length - manquants.length, missing: manquants });
    }
    if (reste === '/copy' && method === 'POST') {
      return copieEchoue ? reponse(503, { error: 'circle.cloud_unavailable' }) : reponse(201, { id: 55, name: p.name });
    }
    // Les écritures : un autre membre peut passer juste avant.
    if (avantMonGeste) { const f = avantMonGeste; avantMonGeste = null; f(p); }
    if (reste === '' && method === 'DELETE') { if (!p.mine) return introuvable(); pls = pls.filter((x) => x !== p); return reponse(200, { ok: true }); }
    if (reste === '' && method === 'PATCH') {
      if (!p.mine) return introuvable();
      if (body.version !== p.version) return conflit(p);
      p.name = body.name; p.version++; return reponse(200, vue(p));
    }
    if (reste === '/items' && method === 'POST') {
      if (body.version !== p.version) return conflit(p);
      for (const ref of body.items ?? []) p.items.push({ item_id: `it-${prochainItem++}`, ...ref, added_by: { user_id: 1, name: 'Moi' }, added_at: '2026-09-28T11:00:00Z' });
      for (const tid of body.track_ids ?? []) p.items.push({ item_id: `it-${prochainItem++}`, title: `Piste ${tid}`, added_by: null, added_at: '2026-09-28T11:00:00Z' });
      p.version++;
      return reponse(200, vue(p));
    }
    if ((m = reste.match(/^\/items\/([^/]+)$/)) && method === 'DELETE') {
      if (Number(q.get('version')) !== p.version) return conflit(p);
      const avant = p.items.length;
      p.items = p.items.filter((x) => x.item_id !== decodeURIComponent(m![1]));
      if (p.items.length === avant) return introuvable();
      p.version++;
      return reponse(200, vue(p));
    }
    if (reste === '/order' && method === 'PUT') {
      if (body.version !== p.version) return conflit(p);
      const ids = p.items.map((x) => x.item_id).sort();
      if (JSON.stringify([...body.item_ids].sort()) !== JSON.stringify(ids)) return reponse(422, { errors: { item_ids: ['not a permutation'] } });
      p.items = body.item_ids.map((i: string) => p.items.find((x) => x.item_id === i)!);
      p.version++;
      return reponse(200, vue(p));
    }
  }
  return introuvable();
}

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  coupees = new Set();
  greffonT5 = true;
  copieEchoue = false;
  avantMonGeste = null;
  prochainItem = 900;
  pls = [
    {
      id: 'pl-a', name: 'Dimanche', version: 3, mine: false, circle_id: null, owner: { user_id: 40, name: 'Élise' },
      items: [
        { item_id: 'it-1', title: 'So What', artist_name: 'Miles Davis', album_title: 'Kind of Blue', duration_ms: 562000,
          isrc: 'USSM15900113', qobuz_id: '123', added_by: { user_id: 40, name: 'Élise' }, added_at: '2026-09-28T09:00:00Z', ...FUITES },
        // Un membre qui n'est pas mon contact : le cloud tait son nom.
        { item_id: 'it-2', title: 'Blue in Green', artist_name: 'Miles Davis', album_title: 'Kind of Blue', duration_ms: 337000,
          added_by: { user_id: 77, name: null }, added_at: '2026-09-28T09:05:00Z', ...FUITES },
        { item_id: 'it-3', title: 'Naima', artist_name: 'John Coltrane', album_title: 'Giant Steps', duration_ms: 261000,
          added_by: null, added_at: '2026-09-28T09:10:00Z', ...FUITES },
      ],
    },
    { id: 'pl-b', name: 'Famille en voiture', version: 1, mine: true, circle_id: 7, owner: { user_id: 1, name: 'Moi' }, items: [] },
  ];
  resolution = {
    'it-1': { status: 'matched', source: 'qobuz', source_id: '123' },
    'it-2': { status: 'matched', source: 'local', source_id: '/Users/moi/Music/blue-in-green.flac' },
    'it-3': { status: 'not_found' },
  };
  circlePlugin.set(null);
  currentZoneId.set(2);
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = init?.body !== undefined && init?.body !== null ? JSON.parse(String(init.body)) : undefined;
      appels.push({ url: u, method, body });
      if (u.includes('/ext/circle')) return greffon(u, method, body);
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
  for (let i = 0; i < 12; i++) {
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
const chemin = (a: Appel) => a.url.replace(/^.*ext\/circle/, '');
const ecritures = () => appels.filter((a) => a.url.includes('/ext/circle/playlists') && a.method !== 'GET' && !/\/(resolve)$/.test(a.url));

async function cliquer(el: Element, sel: string) {
  const b = el.querySelector(sel) as HTMLButtonElement | null;
  if (!b) throw new Error(`bouton introuvable : ${sel}`);
  b.click();
  await laisserFaire();
}

async function repondre(valeur: boolean | string | null) {
  const d = get(dialogs)[0];
  if (!d) throw new Error('aucune boîte de dialogue');
  dialogs.settle(d.id, valeur);
  await laisserFaire();
}

async function ouvrir(el: Element, nom: string) {
  const li = [...el.querySelectorAll('li.playlist-cercle')].find((n) => n.querySelector('.nom')?.textContent === nom);
  if (!li) throw new Error(`playlist introuvable : ${nom}`);
  (li.querySelector('button.ouvrir-playlist') as HTMLButtonElement).click();
  await laisserFaire();
}

const morceaux = (el: Element) => [...el.querySelectorAll('li.morceau')];
const titres = (el: Element) => morceaux(el).map((n) => texte(n.querySelector('.titre-morceau')!));
const ligne = (el: Element, titre: string) => morceaux(el).find((n) => texte(n.querySelector('.titre-morceau')!) === titre)!;

function sansFuite(el: Element) {
  const dom = el.innerHTML;
  for (const v of Object.values(FUITES)) expect(dom, `fuite de ${v}`).not.toContain(v);
  for (const motif of ['/Users', '/volume', 'C:\\', 'nas.elise']) expect(dom, `motif ${motif}`).not.toContain(motif);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('T5 — la liste des playlists de cercle', () => {
  it('liste les miennes et celles des cercles où je suis rangé, avec le propriétaire des autres', async () => {
    const el = await poser(CircleV2);
    const bloc = el.querySelector('section.playlists-cercle')!;
    expect(bloc).not.toBeNull();
    const lignes = [...bloc.querySelectorAll('li.playlist-cercle')].map(texte);
    expect(lignes[0]).toContain('Dimanche');
    expect(lignes[0]).toContain('3 morceaux');
    expect(lignes[0]).toContain('de Élise');
    // La mienne : pas de « de Moi ».
    expect(lignes[1]).toContain('Famille en voiture');
    expect(lignes[1]).not.toContain('de Moi');
  });

  it('greffon d\'avant T5 (404 sur /playlists) : le bloc et « Nouvelle playlist » restent cachés', async () => {
    greffonT5 = false;
    const el = await poser(CircleV2);
    expect(el.querySelector('section.playlists-cercle')).toBeNull();
    expect(el.querySelector('button.nouvelle-playlist')).toBeNull();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('le propriétaire crée une playlist dans SON cercle : POST {circle_id, name}, puis la liste relue', async () => {
    const el = await poser(CircleV2);
    const famille = [...el.querySelectorAll('article.cercle')].find((a) => a.querySelector('.cercle-nom')?.textContent === 'Famille')!;
    await cliquer(famille, 'button.nouvelle-playlist');
    await repondre('  Pour Noël  ');
    const post = ecritures().find((a) => a.method === 'POST' && chemin(a) === '/playlists')!;
    expect(post.body).toEqual({ circle_id: 7, name: 'Pour Noël' });
    expect([...el.querySelectorAll('li.playlist-cercle .nom')].map(texte)).toContain('Pour Noël');
  });

  it('un nom vide ou trop long n\'envoie rien', async () => {
    const el = await poser(CircleV2);
    await cliquer(el, 'article.cercle button.nouvelle-playlist');
    await repondre('x'.repeat(101));
    expect(ecritures()).toHaveLength(0);
    expect(texte(el.querySelector('.retour')!)).toContain('1 à 100');
  });
});

describe('T5 — la vue d\'une playlist', () => {
  it('« ajouté par {nom} » seulement quand le cloud rend un nom ; sinon « un membre du cercle »', async () => {
    const el = await poser(CircleV2);
    await ouvrir(el, 'Dimanche');
    expect(titres(el)).toEqual(['So What', 'Blue in Green', 'Naima']);
    expect(texte(ligne(el, 'So What').querySelector('.auteur')!)).toBe('ajouté par Élise');
    expect(texte(ligne(el, 'Blue in Green').querySelector('.auteur')!)).toBe('ajouté par un membre du cercle');
    expect(texte(ligne(el, 'Naima').querySelector('.auteur')!)).toBe('ajouté par un membre du cercle');
  });

  it('les trois états de résolution, chez MOI, et l\'introuvable dit clairement', async () => {
    const el = await poser(CircleV2);
    await ouvrir(el, 'Dimanche');
    expect(appels.some((a) => a.method === 'POST' && chemin(a) === '/playlists/pl-a/resolve')).toBe(true);
    expect(texte(ligne(el, 'So What').querySelector('.resolution')!)).toBe('Jouable via Qobuz');
    expect(texte(ligne(el, 'Blue in Green').querySelector('.resolution')!)).toBe('Dans votre bibliothèque');
    expect(texte(ligne(el, 'Naima').querySelector('.resolution')!)).toBe('Introuvable chez vous');
    expect(ligne(el, 'Naima').classList.contains('introuvable')).toBe(true);
    expect(texte(el.querySelector('.resume-introuvables')!)).toContain('1 morceaux sont introuvables chez vous');
  });

  it('aucun champ hors liste blanche n\'atteint le DOM (chemins, source_id, adresse, nom de cercle)', async () => {
    const el = await poser(CircleV2);
    await ouvrir(el, 'Dimanche');
    sansFuite(el);
  });

  it('un membre ne voit ni Renommer ni Supprimer ; le propriétaire, si', async () => {
    const el = await poser(CircleV2);
    await ouvrir(el, 'Dimanche');
    expect(el.querySelector('button.renommer-playlist')).toBeNull();
    expect(el.querySelector('button.supprimer-playlist')).toBeNull();
    await cliquer(el, 'button.retour-cercle');
    await ouvrir(el, 'Famille en voiture');
    expect(el.querySelector('button.renommer-playlist')).not.toBeNull();
    expect(el.querySelector('button.supprimer-playlist')).not.toBeNull();
  });

  it('pas de bouton « copier » dans la vue (décision 5)', async () => {
    const el = await poser(CircleV2);
    await ouvrir(el, 'Dimanche');
    expect(el.textContent).not.toMatch(/copi/i);
    expect(appels.some((a) => a.url.endsWith('/copy'))).toBe(false);
  });

  it('retirer : DELETE …/items/{item_id}?version=, et l\'état rendu par le cloud s\'affiche', async () => {
    const el = await poser(CircleV2);
    await ouvrir(el, 'Dimanche');
    await cliquer(ligne(el, 'Blue in Green'), 'button.retirer-morceau');
    const d = ecritures().find((a) => a.method === 'DELETE')!;
    expect(chemin(d)).toBe('/playlists/pl-a/items/it-2?version=3');
    expect(titres(el)).toEqual(['So What', 'Naima']);
  });

  it('réordonner : PUT /order avec la permutation EXACTE et la version', async () => {
    const el = await poser(CircleV2);
    await ouvrir(el, 'Dimanche');
    await cliquer(ligne(el, 'So What'), 'button.descendre');
    const put = ecritures().find((a) => a.method === 'PUT')!;
    expect(chemin(put)).toBe('/playlists/pl-a/order');
    expect(put.body).toEqual({ item_ids: ['it-2', 'it-1', 'it-3'], version: 3 });
    expect(titres(el)).toEqual(['Blue in Green', 'So What', 'Naima']);
  });

  it('le glisser-déposer mène au même PUT /order', async () => {
    const el = await poser(CircleV2);
    await ouvrir(el, 'Dimanche');
    const de = ligne(el, 'Naima');
    de.dispatchEvent(new Event('dragstart', { bubbles: true }));
    ligne(el, 'So What').dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    await laisserFaire();
    const put = ecritures().find((a) => a.method === 'PUT')!;
    expect(put.body).toEqual({ item_ids: ['it-3', 'it-1', 'it-2'], version: 3 });
  });

  it('409 : l\'état reçu remplace l\'état connu et le geste est REFAIT sur la nouvelle version', async () => {
    const el = await poser(CircleV2);
    await ouvrir(el, 'Dimanche');
    // Un autre membre ajoute un morceau pendant que je retire le mien.
    avantMonGeste = (p) => { p.items.push({ item_id: 'it-8', title: 'Impressions', added_by: null, added_at: null }); p.version = 5; };
    await cliquer(ligne(el, 'Blue in Green'), 'button.retirer-morceau');
    const d = ecritures().filter((a) => a.method === 'DELETE').map(chemin);
    expect(d).toEqual(['/playlists/pl-a/items/it-2?version=3', '/playlists/pl-a/items/it-2?version=5']);
    expect(titres(el)).toEqual(['So What', 'Naima', 'Impressions']);
    expect(texte(el.querySelector('.retour-playlist')!)).toContain('appliquée à la version à jour');
  });

  it('409 où le geste n\'a plus de sens : rien n\'est réécrit, la version à jour s\'affiche et le message le dit', async () => {
    const el = await poser(CircleV2);
    await ouvrir(el, 'Dimanche');
    // Quelqu'un a déjà retiré ce morceau.
    avantMonGeste = (p) => { p.items = p.items.filter((x) => x.item_id !== 'it-2'); p.version = 4; };
    await cliquer(ligne(el, 'Blue in Green'), 'button.retirer-morceau');
    expect(ecritures().filter((a) => a.method === 'DELETE')).toHaveLength(1);
    expect(titres(el)).toEqual(['So What', 'Naima']);
    expect(texte(el.querySelector('.retour-playlist')!)).toContain('La playlist a changé entre-temps');
  });

  it('409 sur un réordonnancement : refait sur l\'état reçu, en PERMUTATION de cet état', async () => {
    const el = await poser(CircleV2);
    await ouvrir(el, 'Dimanche');
    avantMonGeste = (p) => { p.items.push({ item_id: 'it-8', title: 'Impressions', added_by: null, added_at: null }); p.version = 4; };
    await cliquer(ligne(el, 'So What'), 'button.descendre');
    const puts = ecritures().filter((a) => a.method === 'PUT').map((a) => a.body);
    expect(puts).toEqual([
      { item_ids: ['it-2', 'it-1', 'it-3'], version: 3 },
      { item_ids: ['it-2', 'it-1', 'it-3', 'it-8'], version: 4 },
    ]);
  });

  it('RÉVOCATION : un 404 ferme la vue, le dit, et la playlist disparaît de la liste', async () => {
    const el = await poser(CircleV2);
    await ouvrir(el, 'Dimanche');
    coupees.add('pl-a');
    await cliquer(ligne(el, 'So What'), 'button.retirer-morceau');
    expect(el.querySelector('li.morceau')).toBeNull();
    expect(texte(el.querySelector('.retour')!)).toBe('Cette playlist n\'est plus partagée avec vous.');
    expect([...el.querySelectorAll('li.playlist-cercle .nom')].map(texte)).toEqual(['Famille en voiture']);
    // Rien n'est resté en mémoire : ni titres, ni auteurs.
    expect(el.textContent).not.toContain('So What');
  });

  it('RÉVOCATION à l\'ouverture : 404 sur GET /playlists/{id} → retour à Tune Circle avec le message', async () => {
    const el = await poser(CircleV2);
    coupees.add('pl-a');
    const li = el.querySelector('li.playlist-cercle button.ouvrir-playlist') as HTMLButtonElement;
    li.click();
    await laisserFaire();
    expect(el.querySelector('li.morceau')).toBeNull();
    expect(texte(el.querySelector('.retour')!)).toBe('Cette playlist n\'est plus partagée avec vous.');
  });

  it('Lire : POST /play {zone_id} sur la zone active, et l\'écran dit ce qui manque', async () => {
    const el = await poser(CircleV2);
    await ouvrir(el, 'Dimanche');
    await cliquer(el, 'button.lire-playlist');
    const play = ecritures().find((a) => chemin(a) === '/playlists/pl-a/play')!;
    expect(play.body).toEqual({ zone_id: 2 });
    const n = get(notifications);
    expect(JSON.stringify(n)).toContain('1 morceaux introuvables chez vous');
  });

  it('le propriétaire renomme avec la version ; un 409 refait le renommage sur la nouvelle version', async () => {
    const el = await poser(CircleV2);
    await ouvrir(el, 'Famille en voiture');
    avantMonGeste = (p) => { p.version = 9; };
    await cliquer(el, 'button.renommer-playlist');
    await repondre('Route des vacances');
    const patchs = ecritures().filter((a) => a.method === 'PATCH').map((a) => a.body);
    expect(patchs).toEqual([{ name: 'Route des vacances', version: 1 }, { name: 'Route des vacances', version: 9 }]);
    expect(texte(el.querySelector('.nom-playlist')!)).toBe('Route des vacances');
  });
});

describe('T5 — suppression d\'un cercle : récupérer une copie', () => {
  function supprimerFamille(el: Element) {
    const famille = [...el.querySelectorAll('article.cercle')].find((a) => a.querySelector('.cercle-nom')?.textContent === 'Famille')!;
    (famille.querySelector('button.supprimer') as HTMLButtonElement).click();
  }

  it('propose la copie de SES playlists, copie AVANT de supprimer le cercle', async () => {
    const el = await poser(CircleV2);
    supprimerFamille(el);
    await laisserFaire();
    await repondre(true); // supprimer le cercle
    expect(get(dialogs)[0].message).toContain('1 playlists partagées');
    await repondre(true); // récupérer une copie
    const ordre = appels.filter((a) => a.method !== 'GET' && a.url.includes('/ext/circle')).map((a) => `${a.method} ${chemin(a)}`)
      .filter((x) => !x.endsWith('/resolve'));
    expect(ordre).toEqual(['POST /playlists/pl-b/copy', 'DELETE /circles/7']);
  });

  it('sans copie demandée : le cercle est supprimé, rien n\'est copié', async () => {
    const el = await poser(CircleV2);
    supprimerFamille(el);
    await laisserFaire();
    await repondre(true);
    await repondre(false);
    expect(appels.some((a) => a.url.endsWith('/copy'))).toBe(false);
    expect(appels.some((a) => a.method === 'DELETE' && chemin(a) === '/circles/7')).toBe(true);
  });

  it('une copie qui échoue ARRÊTE la suppression : rien n\'est perdu en silence', async () => {
    copieEchoue = true;
    const el = await poser(CircleV2);
    supprimerFamille(el);
    await laisserFaire();
    await repondre(true);
    await repondre(true);
    expect(appels.some((a) => a.method === 'DELETE' && chemin(a) === '/circles/7')).toBe(false);
    expect(el.querySelector('.retour')?.getAttribute('role')).toBe('alert');
  });

  it('un cercle sans playlist ne pose pas la question', async () => {
    const el = await poser(CircleV2);
    const jazz = [...el.querySelectorAll('article.cercle')].find((a) => a.querySelector('.cercle-nom')?.textContent === 'Jazz')!;
    (jazz.querySelector('button.supprimer') as HTMLButtonElement).click();
    await laisserFaire();
    await repondre(true);
    expect(get(dialogs)).toHaveLength(0);
    expect(appels.some((a) => a.method === 'DELETE' && chemin(a) === '/circles/8')).toBe(true);
  });
});

describe('T5 — « Ajouter à une playlist de cercle » depuis le menu d\'un titre', () => {
  const locale = { id: 812, title: 'So What', artist_name: 'Miles Davis', source: 'local', file_path: '/Users/moi/Music/so-what.flac' } as unknown as Track;
  const qobuz = {
    id: null, title: 'So What', artist_name: 'Miles Davis', album_title: 'Kind of Blue', duration_ms: 562000,
    source: 'qobuz', source_id: '5966783', isrc: 'us-sm1-59-00113', cover_path: 'https://static.qobuz.com/x.jpg',
    format: 'flac', sample_rate: 96000,
  } as unknown as Track;

  it('piste locale : son SEUL track_id — aucun chemin ne part', () => {
    const a = ajoutDePiste(locale)!;
    expect(a).toEqual({ track_ids: [812] });
    expect(JSON.stringify(a)).not.toContain('/Users');
  });

  it('piste de service : une référence en liste blanche, l\'identifiant sous le nom de son service', () => {
    expect(ajoutDePiste(qobuz)).toEqual({
      items: [{ title: 'So What', artist_name: 'Miles Davis', album_title: 'Kind of Blue', duration_ms: 562000, isrc: 'USSM15900113', qobuz_id: '5966783' }],
    });
    const r = referenceDeService({ ...qobuz, source: 'tidal', source_id: '77' } as Track)!;
    expect(r.tidal_id).toBe('77');
    expect(Object.keys(r)).not.toContain('source_id');
    expect(JSON.stringify(r)).not.toContain('qobuz.com');
  });

  it('une radio, Bandcamp, un identifiant douteux ou une piste sans titre : pas d\'entrée', () => {
    expect(ajoutDePiste({ ...qobuz, source: 'radio', source_id: 'https://flux' } as Track)).toBeNull();
    expect(ajoutDePiste({ ...qobuz, source: 'bandcamp' } as Track)).toBeNull();
    expect(ajoutDePiste({ ...qobuz, source_id: '../../etc/passwd' } as Track)).toBeNull();
    expect(ajoutDePiste({ ...qobuz, title: '  ' } as Track)).toBeNull();
  });

  it('le menu porte l\'entrée seulement si `playlistDeCercle` et le geste sont là', () => {
    const base = { jouable: true, idBibliotheque: 1, artistId: null, albumId: null };
    const faire = () => {};
    const avec = entreesMenuPiste({ ...base, playlistDeCercle: true }, { ajouterAPlaylistDeCercle: faire }).map((e) => e.cle);
    expect(avec).toContain('v2.circle.pl.addToCircle');
    expect(entreesMenuPiste(base, { ajouterAPlaylistDeCercle: faire }).map((e) => e.cle)).not.toContain('v2.circle.pl.addToCircle');
    expect(entreesMenuPiste({ ...base, playlistDeCercle: true }, {}).map((e) => e.cle)).not.toContain('v2.circle.pl.addToCircle');
  });

  it('la fenêtre ajoute avec la version connue ; un 409 relit la version et refait l\'ajout', async () => {
    const fermer = vi.fn();
    avantMonGeste = (p) => { p.version = 6; };
    const el = await poser(AjoutPlaylistCercleV2, { ajout: ajoutDePiste(qobuz), titre: 'So What', onClose: fermer });
    const choix = [...el.querySelectorAll('button.choix-playlist')];
    expect(choix.map((b) => texte(b.querySelector('.nom')!))).toEqual(['Dimanche', 'Famille en voiture']);
    (choix[0] as HTMLButtonElement).click();
    await laisserFaire();
    const posts = ecritures().filter((a) => a.method === 'POST' && chemin(a) === '/playlists/pl-a/items').map((a) => a.body as any);
    expect(posts.map((b) => b.version)).toEqual([3, 6]);
    expect(Object.keys(posts[0].items[0]).sort()).toEqual(['album_title', 'artist_name', 'duration_ms', 'isrc', 'qobuz_id', 'title']);
    expect(fermer).toHaveBeenCalled();
    expect(pls[0].items.at(-1)!.title).toBe('So What');
  });

  it('la fenêtre : un 404 dit « plus partagée » et relit la liste', async () => {
    const el = await poser(AjoutPlaylistCercleV2, { ajout: { track_ids: [812] }, titre: 'So What', onClose: () => {} });
    coupees.add('pl-a');
    (el.querySelector('button.choix-playlist') as HTMLButtonElement).click();
    await laisserFaire();
    expect(texte(el.querySelector('[role="alert"]')!)).toBe('Cette playlist n\'est plus partagée avec vous.');
    expect([...el.querySelectorAll('button.choix-playlist .nom')].map(texte)).toEqual(['Famille en voiture']);
  });
});

describe('T5 — lecture défensive', () => {
  it('une playlist reçue est reconstruite champ par champ : clés EXACTES d\'un morceau', () => {
    const p = playlistCercle({ id: 'x', name: 'n', version: 2, items: [{ item_id: 'i', title: 't', ...FUITES, added_by: { name: 'A', email: 'a@b.c' } }] })!;
    expect(Object.keys(p.items[0]).sort()).toEqual([
      'added_at', 'added_by', 'album_title', 'artist_name', 'deezer_id', 'duration_ms', 'isrc', 'item_id',
      'qobuz_id', 'spotify_id', 'tidal_id', 'title', 'youtube_id',
    ]);
    expect(p.items[0].added_by).toEqual({ nom: 'A' });
  });

  it('un corps qui n\'est pas une playlist rend `null` (on relira), jamais une playlist vide', () => {
    expect(playlistCercle({ ok: true })).toBeNull();
    expect(playlistCercle([])).toBeNull();
  });

  it('résolution : une source douteuse ne devient pas un nom de service', () => {
    expect(etatResolution({ status: 'matched', source: '<img src=x>' })).toEqual({ etat: 'bibliotheque' });
    expect(etatResolution({ status: 'matched', source: 'tidal' })).toEqual({ etat: 'service', service: 'tidal' });
    expect(etatResolution({ status: 'pending' })).toBeNull();
  });

  it('ordreDeplace rend une permutation, ou `null` si rien ne bouge', () => {
    const it3 = [{ item_id: 'a' }, { item_id: 'b' }, { item_id: 'c' }];
    expect(ordreDeplace(it3, 'a', 2)).toEqual(['b', 'c', 'a']);
    expect(ordreDeplace(it3, 'a', 0)).toBeNull();
    expect(ordreDeplace(it3, 'z', 1)).toBeNull();
  });

  it('isrcNormalise', () => {
    expect(isrcNormalise('us-sm1-59-00113')).toBe('USSM15900113');
    expect(isrcNormalise('pas un isrc')).toBeNull();
  });
});

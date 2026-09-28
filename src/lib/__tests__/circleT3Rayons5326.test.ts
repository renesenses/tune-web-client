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
import {
  circlePlugin, lireRayonsCercle, rayonContact, referenceContact, servicesReference, motifCercle,
} from '../circle';
import fr from '../locales/fr';

/**
 * Tune Circle, étape T3 — renesenses/tune-server-rust#5326 et les décisions
 * de Bertrand du 28/09/2026 : étiquettes et collections intelligentes
 * partagées PAR CERCLE, une par une, rien par défaut.
 *
 * Le faux greffon suit le contrat, sous `/api/v1/ext/circle` :
 *   GET /circles/{id}/sets (listes LOCALES + état coché),
 *   PUT|DELETE /circles/{id}/sets/{kind}/{source_id} (PUT sans corps),
 *   GET /contacts/{uid}/sets, GET /contacts/{uid}/sets/{set_id}/albums|tracks|artists|streaming.
 *
 * Il porte un ÉTAT : les cases se lisent dans la liste relue, pas dans une
 * supposition de l'écran. Et le cloud y « fuit » exprès des champs hors liste
 * blanche : aucun ne doit atteindre le DOM.
 */

type Cercle = { id: number; name: string; member_ids: number[]; sharing?: { library: boolean; server_id: string | null } };
type Local = { kind: 'tag' | 'smart_collection'; source_id: number; name: string; count: number };
let cercles: Cercle[] = [];
/** Mes étiquettes et collections locales. */
let locaux: Local[] = [];
/** Ce qui est coché, par cercle : `${cercle}:${kind}:${source_id}`. */
let coches = new Set<string>();
/** Les rayons qu'Élise (uid 40) partage avec moi ; vide + `elisePartage=false` = révocation. */
let rayonsElise: { id: number; kind: string; name: string; count: number }[] = [];
let elisePartage = true;
/** Le greffon connaît-il T3 ? Sinon ses routes `/sets` n'existent pas (404 nu d'axum). */
let greffonT3 = true;
/** La liste locale d'un cercle ne répond pas (503). */
let panneSets = false;

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];

const FUITES = {
  cover_path: '/Users/elise/Music/Kind of Blue/cover.jpg',
  source_id: '/volume1/music/kind-of-blue/01.flac',
  file_path: 'C:\\Musique\\Miles\\01.flac',
  server_id: 'srv-elise-secret',
  circle_name: 'Cercle secret',
  url: 'https://open.qobuz.com/track/secret',
};

const ALBUMS = [
  { id: 11, title: 'Kind of Blue', artist_name: 'Miles Davis', year: 1959, genre: 'Jazz', track_count: 2, ...FUITES },
];
const PISTES = [
  { id: 101, title: 'So What', artist_name: 'Miles Davis', album_title: 'Kind of Blue', album_id: 11, format: 'flac',
    sample_rate: 96000, bit_depth: 24, duration_ms: 562000, genre: 'Jazz', track_number: 1, disc_number: 1, ...FUITES },
];
const REFERENCES = [
  { type: 'track', title: 'Blue in Green', artist_name: 'Bill Evans Trio', album_title: 'Portrait in Jazz', duration_ms: 327000,
    isrc: 'USRC15900001', qobuz_id: '12345', tidal_id: '67890', spotify_id: null, deezer_id: null, youtube_id: null, ...FUITES },
  { type: 'album', title: 'Waltz for Debby', artist_name: 'Bill Evans Trio', album_title: null, duration_ms: null,
    isrc: null, qobuz_id: null, tidal_id: '555', spotify_id: null, deezer_id: '777', youtube_id: null, ...FUITES },
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

function paginer<T>(liste: T[], q: URLSearchParams) {
  const page = Number(q.get('page') ?? 1);
  const par = Number(q.get('per_page') ?? 50);
  return { data: liste.slice((page - 1) * par, page * par), current_page: page,
    last_page: Math.max(1, Math.ceil(liste.length / par)), per_page: par, total: liste.length };
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
  if (method === 'GET' && chemin === '/library-sync') {
    return reponse(200, { active: true, last_sync: '2026-09-27T08:00:00Z', pending: 0, server_id: 'srv-moi' });
  }
  if (method === 'GET' && chemin === '/shared-with-me') return reponse(200, [{ user_id: 40, name: 'Élise', library: true }]);
  // T2 : l'interrupteur. Décision 4 du contrat cloud (#235) : couper ou
  // déplacer le partage SUPPRIME les sélections des cercles concernés.
  if ((m = chemin.match(/^\/circles\/(\d+)\/sharing\/library$/))) {
    const c = cercles.find((x) => x.id === Number(m![1]));
    if (!c) return introuvable();
    const oublier = (id: number) => { for (const k of [...coches]) if (k.startsWith(`${id}:`)) coches.delete(k); };
    if (method === 'DELETE') { c.sharing = { library: false, server_id: null }; oublier(c.id); return reponse(200, { ok: true }); }
    if (method === 'PUT') {
      for (const x of cercles) {
        if (x.sharing?.library && x.sharing.server_id !== 'srv-moi') { oublier(x.id); x.sharing.server_id = 'srv-moi'; }
      }
      c.sharing = { library: true, server_id: 'srv-moi' };
      return reponse(200, c);
    }
  }
  if (panneSets && chemin.match(/^\/circles\/\d+\/sets$/)) return reponse(503, { code: 'circle.cloud_unavailable' });
  if (!greffonT3 && chemin.includes('/sets')) return reponse(404, null);
  if ((m = chemin.match(/^\/circles\/(\d+)\/sets$/)) && method === 'GET') {
    const c = cercles.find((x) => x.id === Number(m![1]));
    if (!c) return introuvable();
    // La forme du greffon (`rayons.rs`) : deux listes. Une collection non
    // cochée n'a pas de nombre (`null`) : la compter coûterait une résolution.
    const vue = (l: Local) => {
      const shared = coches.has(`${c.id}:${l.kind}:${l.source_id}`);
      return { ...l, count: l.kind === 'tag' || shared ? l.count : null, shared, server_id: 'srv-moi' };
    };
    return reponse(200, {
      tags: locaux.filter((l) => l.kind === 'tag').map(vue),
      smart_collections: locaux.filter((l) => l.kind === 'smart_collection').map(vue),
    });
  }
  if ((m = chemin.match(/^\/circles\/(\d+)\/sets\/(tag|smart_collection)\/(\d+)$/))) {
    const c = cercles.find((x) => x.id === Number(m![1]));
    if (!c) return introuvable();
    const cle = `${c.id}:${m[2]}:${m[3]}`;
    if (method === 'PUT') {
      if (!c.sharing?.library) return reponse(409, { code: 'circle.library_not_shared', error: 'library_not_shared' });
      coches.add(cle);
      return reponse(200, { id: 900, kind: m[2], source_id: Number(m[3]) });
    }
    if (method === 'DELETE') { coches.delete(cle); return reponse(200, { ok: true }); }
  }
  if ((m = chemin.match(/^\/contacts\/(\d+)\/(library|sets)(\/.*)?$/)) && method === 'GET') {
    if (Number(m[1]) !== 40 || !elisePartage) return introuvable();
    const reste = m[3] ?? '';
    if (m[2] === 'library') {
      if (reste === '/stats') return reponse(200, { tracks: 1, albums: 1, artists: 1, last_sync: '2026-09-27T08:00:00Z' });
      if (reste === '/albums') return reponse(200, paginer(ALBUMS, q));
      if (reste === '/tracks') return reponse(200, paginer(PISTES, q));
      if (reste === '/artists') return reponse(200, paginer([{ id: 1, name: 'Miles Davis' }], q));
      return introuvable();
    }
    if (reste === '') return reponse(200, rayonsElise.map((r) => ({ ...r, ...FUITES })));
    const r = reste.match(/^\/(\d+)\/(albums|tracks|artists|streaming)$/);
    if (!r || !rayonsElise.some((x) => x.id === Number(r[1]))) return introuvable();
    if (r[2] === 'albums') return reponse(200, paginer(ALBUMS, q));
    if (r[2] === 'tracks') return reponse(200, paginer(PISTES, q));
    if (r[2] === 'artists') return reponse(200, paginer([{ id: 1, name: 'Miles Davis', ...FUITES }], q));
    return reponse(200, paginer(REFERENCES, q));
  }
  return introuvable();
}

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  cercles = [
    { id: 7, name: 'Famille', member_ids: [40], sharing: { library: true, server_id: 'srv-moi' } },
    { id: 8, name: 'Jazz', member_ids: [40] },
  ];
  locaux = [
    { kind: 'tag', source_id: 3, name: 'Vinyles rippés', count: 42 },
    { kind: 'tag', source_id: 4, name: '24/192', count: 7 },
    { kind: 'smart_collection', source_id: 9, name: 'Jazz ECM', count: 120 },
  ];
  coches = new Set();
  rayonsElise = [{ id: 501, kind: 'tag', name: 'Jazz ECM', count: 3 }, { id: 502, kind: 'smart_collection', name: 'Nuit', count: 5 }];
  elisePartage = true;
  greffonT3 = true;
  panneSets = false;
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

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CircleV2, { target: hote, props: {} });
  flushSync();
  await laisserFaire();
  return hote;
}

const texte = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
const noms = (el: Element, sel: string) => [...el.querySelectorAll(sel)].map((n) => texte(n));
const chemin = (a: Appel) => a.url.replace(/^.*ext\/circle/, '');
const gestes = () => appels.filter((a) => a.url.includes('/ext/circle') && a.method !== 'GET');
const lecturesSets = () => appels.filter((a) => /\/sets/.test(a.url) && a.method === 'GET').map(chemin);

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

function caseDe(el: Element, nom: string): HTMLInputElement {
  const l = [...el.querySelectorAll('label.case-rayon')].find((n) => texte(n.querySelector('.nom-rayon')!) === nom);
  if (!l) throw new Error(`case introuvable : ${nom}`);
  return l.querySelector('input.coche-rayon') as HTMLInputElement;
}

async function cocher(el: Element, nom: string) {
  const c = caseDe(el, nom);
  c.click();
  await laisserFaire();
}

function sansFuite(el: Element) {
  const dom = el.innerHTML;
  for (const v of Object.values(FUITES)) expect(dom, `fuite de ${v}`).not.toContain(v);
  for (const motif of ['/Users', '/volume', 'C:\\', 'srv-', 'qobuz.com']) {
    expect(dom, `motif ${motif}`).not.toContain(motif);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('T3 — mes rayons partagés, par cercle', () => {
  it('grisé tant que ce cercle ne partage pas la bibliothèque : rien n’est lu, rien ne s’ouvre', async () => {
    const el = await poser();
    const jazz = cercleDe(el, 'Jazz');
    const bloc = jazz.querySelector('.rayons')!;
    expect(bloc.classList.contains('grise')).toBe(true);
    expect(bloc.getAttribute('aria-disabled')).toBe('true');
    expect((jazz.querySelector('button.ouvrir-rayons') as HTMLButtonElement).disabled).toBe(true);
    expect(texte(jazz.querySelector('.rayons-quoi')!)).toBe(fr['v2.circle.sel.needLibrary']);
    expect(jazz.querySelector('input.coche-rayon')).toBeNull();
    // Le cercle qui partage, lui, n'est pas grisé.
    expect(cercleDe(el, 'Famille').querySelector('.rayons')!.classList.contains('grise')).toBe(false);
    expect(texte(cercleDe(el, 'Famille').querySelector('.rayons-quoi')!)).toBe(fr['v2.circle.sel.hint']);
    // Les listes se lisent à la demande : aucune lecture tant qu'on n'ouvre pas.
    expect(lecturesSets()).toEqual([]);
    expect(gestes()).toHaveLength(0);
  });

  it('partagé depuis un AUTRE serveur : grisé aussi (le greffon d’ici ne résout pas pour lui)', async () => {
    cercles[0].sharing = { library: true, server_id: 'srv-autre' };
    const el = await poser();
    expect(cercleDe(el, 'Famille').querySelector('.rayons')!.classList.contains('grise')).toBe(true);
  });

  it('ouvrir : deux listes, aucune case cochée par défaut, les nombres d’éléments', async () => {
    const el = await poser();
    const famille = cercleDe(el, 'Famille');
    await cliquer(famille, 'button.ouvrir-rayons');
    expect(lecturesSets()).toEqual(['/circles/7/sets']);
    expect(famille.querySelector('button.ouvrir-rayons')!.getAttribute('aria-expanded')).toBe('true');
    expect(texte(famille.querySelector('.groupe-tags legend')!)).toBe(fr['v2.circle.sel.tags']);
    expect(texte(famille.querySelector('.groupe-smart legend')!)).toBe(fr['v2.circle.sel.smart']);
    expect(noms(famille, '.groupe-tags .nom-rayon')).toEqual(['Vinyles rippés', '24/192']);
    expect(noms(famille, '.groupe-smart .nom-rayon')).toEqual(['Jazz ECM']);
    expect(noms(famille, '.groupe-tags .compte-rayon')).toEqual(['42 éléments', '7 éléments']);
    // Collection non cochée : pas de nombre, et rien d'inventé à la place.
    expect(famille.querySelector('.groupe-smart .compte-rayon')).toBeNull();
    for (const c of famille.querySelectorAll('input.coche-rayon')) expect((c as HTMLInputElement).checked).toBe(false);
    expect(el.innerHTML).not.toContain('srv-moi');
    expect(gestes()).toHaveLength(0);
  });

  it('cocher = PUT SANS corps, décocher = DELETE ; l’état vient de la liste relue', async () => {
    const el = await poser();
    const famille = cercleDe(el, 'Famille');
    await cliquer(famille, 'button.ouvrir-rayons');
    await cocher(famille, 'Jazz ECM');
    expect(gestes().map((a) => `${a.method} ${chemin(a)}`)).toEqual(['PUT /circles/7/sets/smart_collection/9']);
    // 🔴 Le client ne fournit jamais la liste des membres.
    expect(gestes()[0].body).toBeUndefined();
    expect(caseDe(famille, 'Jazz ECM').checked).toBe(true);
    expect(caseDe(famille, 'Vinyles rippés').checked).toBe(false);
    expect(lecturesSets()).toEqual(['/circles/7/sets', '/circles/7/sets']);

    await cocher(famille, 'Jazz ECM');
    expect(gestes().map((a) => `${a.method} ${chemin(a)}`)).toEqual([
      'PUT /circles/7/sets/smart_collection/9', 'DELETE /circles/7/sets/smart_collection/9',
    ]);
    expect(caseDe(famille, 'Jazz ECM').checked).toBe(false);
  });

  it('un rayon par cercle : cocher dans Famille ne coche rien dans un autre cercle', async () => {
    cercles[1].sharing = { library: true, server_id: 'srv-moi' };
    const el = await poser();
    await cliquer(cercleDe(el, 'Famille'), 'button.ouvrir-rayons');
    await cocher(cercleDe(el, 'Famille'), 'Vinyles rippés');
    await cliquer(cercleDe(el, 'Jazz'), 'button.ouvrir-rayons');
    expect(caseDe(cercleDe(el, 'Jazz'), 'Vinyles rippés').checked).toBe(false);
    expect(caseDe(cercleDe(el, 'Famille'), 'Vinyles rippés').checked).toBe(true);
    expect(gestes().map((a) => `${a.method} ${chemin(a)}`)).toEqual(['PUT /circles/7/sets/tag/3']);
  });

  it('partage de bibliothèque coupé ailleurs (409) : la phrase, la case reste décochée, le cercle est relu', async () => {
    const el = await poser();
    await cliquer(cercleDe(el, 'Famille'), 'button.ouvrir-rayons');
    // Coupé depuis un autre appareil entre deux relectures.
    cercles[0].sharing = { library: false, server_id: null };
    const lecturesAvant = appels.filter((a) => /ext\/circle$/.test(a.url)).length;
    await cocher(cercleDe(el, 'Famille'), 'Jazz ECM');
    expect(gestes().map((a) => `${a.method} ${chemin(a)}`)).toEqual(['PUT /circles/7/sets/smart_collection/9']);
    expect(appels.filter((a) => /ext\/circle$/.test(a.url)).length).toBeGreaterThan(lecturesAvant);
    // Relu : la section est grisée, et plus aucune case n'est offerte.
    const famille = cercleDe(el, 'Famille');
    expect(famille.querySelector('.rayons')!.classList.contains('grise')).toBe(true);
    expect(famille.querySelector('input.coche-rayon')).toBeNull();
  });

  it('refus nommés : 409 library_not_shared, 422 too_many_sets / set_too_large', () => {
    const e = (status: number, code: string) => Object.assign(new Error(code), { status, code });
    expect(motifCercle(e(409, 'circle.library_not_shared')).cle).toBe('v2.circle.err.libraryNotShared');
    expect(motifCercle(e(409, 'library_not_shared')).cle).toBe('v2.circle.err.libraryNotShared');
    expect(motifCercle(e(422, 'too_many_sets')).cle).toBe('v2.circle.err.tooManySets');
    expect(motifCercle(e(422, 'circle.set_too_large')).cle).toBe('v2.circle.err.setTooLarge');
    expect(motifCercle(e(500, 'circle.set_unresolved')).cle).toBe('v2.circle.err.setUnresolved');
  });

  it('lireRayonsCercle : liste plate ou { tags, smart_collections } ; `shared` n’est vrai que s’il est `true`', () => {
    const plate = lireRayonsCercle([
      { kind: 'tag', source_id: 1, name: 'A', count: 2, shared: 'yes' },
      { kind: 'smart_collection', source_id: 2, name: 'B', count: null, shared: true },
      { kind: 'playlist', source_id: 3, name: 'X' },
      { kind: 'tag', name: 'sans id' },
    ]);
    expect(plate.tags).toEqual([{ kind: 'tag', source_id: 1, name: 'A', count: 2, shared: false }]);
    expect(plate.smart_collections).toEqual([{ kind: 'smart_collection', source_id: 2, name: 'B', count: null, shared: true }]);
    const groupee = lireRayonsCercle({ tags: [{ id: 5, name: 'C', count: 1, shared: true }], smart_collections: [] });
    expect(groupee.tags).toEqual([{ kind: 'tag', source_id: 5, name: 'C', count: 1, shared: true }]);
    expect(lireRayonsCercle(null)).toEqual({ tags: [], smart_collections: [] });
  });
});

describe('T3 — les rayons d’un contact', () => {
  async function ouvrirElise(el: Element) {
    await cliquer(el, 'li.partage-recu button.ouvrir-catalogue');
  }

  it('la rangée « Sélections » en tête du catalogue, sans nom de cercle ni identifiant local', async () => {
    const el = await poser();
    await ouvrirElise(el);
    const rangee = el.querySelector('section.rayons-contact')!;
    expect(texte(rangee.querySelector('h3')!)).toBe(fr['v2.circle.sel.contactTitle']);
    expect(noms(rangee, 'button.rayon-contact .nom-rayon')).toEqual(['Jazz ECM', 'Nuit']);
    expect(noms(rangee, 'button.rayon-contact .note')).toEqual(['3 éléments', '5 éléments']);
    // Le catalogue est là aussi, comme en T2.
    expect(noms(el, 'button.album-contact .album-nom')).toEqual(['Kind of Blue']);
    sansFuite(el);
  });

  it('un rayon : albums, titres, puis les références de streaming avec leur service — rien à écouter', async () => {
    const el = await poser();
    await ouvrirElise(el);
    await cliquer(el, 'button.rayon-contact');
    expect(chemin(appels.filter((a) => /\/sets\/501\//.test(a.url)).at(-1)!)).toBe('/contacts/40/sets/501/albums?page=1&per_page=50');
    expect(texte(el.querySelector('.titre-rayon')!)).toBe('Jazz ECM');
    expect(el.querySelector('section.rayons-contact')).toBeNull();
    expect(noms(el, 'button.album-contact .album-nom')).toEqual(['Kind of Blue']);
    expect(noms(el, '.onglets .onglet')).toEqual([fr['v2.circle.lib.albums'], fr['v2.circle.lib.tracks'], fr['v2.circle.lib.artists'], fr['v2.circle.sel.streaming']]);

    await cliquer(el, 'button.onglet-tracks');
    expect(chemin(appels.at(-1)!)).toBe('/contacts/40/sets/501/tracks?page=1&per_page=50');
    expect(noms(el, '.pistes-contact .tt')).toEqual(['So What']);
    expect(el.querySelector('.pistes-contact .pactions')).toBeNull();

    await cliquer(el, 'button.onglet-streaming');
    expect(chemin(appels.at(-1)!)).toBe('/contacts/40/sets/501/streaming?page=1&per_page=50');
    const refs = [...el.querySelectorAll('li.reference')];
    expect(refs.map((r) => texte(r.querySelector('.ref-titre')!))).toEqual(['Blue in Green', 'Waltz for Debby']);
    expect(texte(refs[0].querySelector('.note')!)).toBe('Bill Evans Trio · Portrait in Jazz · 5:27');
    expect(texte(refs[1].querySelector('.note')!)).toBe(`${fr['v2.circle.sel.refAlbum']} · Bill Evans Trio`);
    expect(noms(refs[0], '.service')).toEqual(['Qobuz', 'TIDAL']);
    expect(noms(refs[1], '.service')).toEqual(['TIDAL', 'Deezer']);
    // Aucun bouton, aucun lien : une référence ne se joue pas ici.
    for (const r of refs) { expect(r.querySelector('button, a')).toBeNull(); }
    sansFuite(el);
    // Fin de segment exigée : `/ext/circle/playlists` (T5) n'est pas une lecture.
    expect(appels.some((a) => /\/(play|queue)(\/|\?|$)/.test(a.url))).toBe(false);
  });

  it('les onglets d’un rayon suivent `counts` quand le cloud les donne', async () => {
    rayonsElise = [{ id: 501, kind: 'tag', name: 'Jazz ECM', count: 2, counts: { albums: 0, tracks: 0, artists: 0, streaming: 2 } } as any];
    const el = await poser();
    await ouvrirElise(el);
    await cliquer(el, 'button.rayon-contact');
    expect(noms(el, '.onglets .onglet')).toEqual([fr['v2.circle.sel.streaming']]);
    expect(chemin(appels.at(-1)!)).toBe('/contacts/40/sets/501/streaming?page=1&per_page=50');
    expect(el.querySelectorAll('li.reference')).toHaveLength(2);
  });

  it('retour du rayon : le catalogue revient, sans message', async () => {
    const el = await poser();
    await ouvrirElise(el);
    await cliquer(el, 'button.rayon-contact');
    await cliquer(el, 'button.retour-catalogue');
    expect(el.querySelector('.titre-rayon')).toBeNull();
    expect(noms(el, 'button.rayon-contact .nom-rayon')).toEqual(['Jazz ECM', 'Nuit']);
    expect(el.querySelector('.rayon-parti')).toBeNull();
  });

  it('404 dans un rayon (décoché) : retour au catalogue, « Cette sélection n’est plus partagée », liste relue', async () => {
    const el = await poser();
    await ouvrirElise(el);
    await cliquer(el, 'button.rayon-contact');
    expect(noms(el, 'button.album-contact .album-nom')).toEqual(['Kind of Blue']);
    // Élise décoche « Jazz ECM » entre deux gestes.
    rayonsElise = rayonsElise.filter((r) => r.id !== 501);
    await cliquer(el, 'button.onglet-tracks');
    expect(el.querySelector('.titre-rayon')).toBeNull();
    expect(texte(el.querySelector('.rayon-parti')!)).toBe(fr['v2.circle.sel.gone']);
    // Le catalogue du contact est toujours là (le partage de bibliothèque tient)…
    expect(el.querySelector('.catalogue-contact')).not.toBeNull();
    expect(noms(el, 'button.album-contact .album-nom')).toEqual(['Kind of Blue']);
    // …et la rangée relue ne propose plus le rayon parti.
    expect(noms(el, 'button.rayon-contact .nom-rayon')).toEqual(['Nuit']);
    expect(el.innerHTML).not.toContain('So What');
  });

  it('RÉVOCATION dans un rayon : 404 partout — retour, puis l’écran se ferme avec la phrase de T2', async () => {
    const el = await poser();
    await ouvrirElise(el);
    await cliquer(el, 'button.rayon-contact');
    await cliquer(el, 'button.onglet-streaming');
    expect(el.querySelectorAll('li.reference')).toHaveLength(2);
    // Élise me révoque : le cloud répond 404 sur tout ce qui la concerne.
    elisePartage = false;
    await cliquer(el, 'button.onglet-albums');
    expect(el.querySelector('.catalogue-contact')).toBeNull();
    expect(texte(el.querySelector('.retour')!)).toBe(fr['v2.circle.shared.gone']);
    // Rien de ce qu'on a lu n'est resté affiché.
    for (const s of ['Blue in Green', 'Waltz for Debby', 'Jazz ECM', 'Kind of Blue']) expect(el.innerHTML).not.toContain(s);
  });

  it('greffon sans T3 (404 nu sur /sets) : le catalogue de T2 marche, sans rangée, sans fermer', async () => {
    greffonT3 = false;
    const el = await poser();
    await ouvrirElise(el);
    expect(el.querySelector('.catalogue-contact')).not.toBeNull();
    expect(el.querySelector('section.rayons-contact')).toBeNull();
    expect(noms(el, 'button.album-contact .album-nom')).toEqual(['Kind of Blue']);
    expect(el.querySelector('.err')).toBeNull();
    // Côté propriétaire, la liste qui n'existe pas dit la panne dans la section, rien de plus.
    await cliquer(el, 'button.retour-liste');
    await cliquer(cercleDe(el, 'Famille'), 'button.ouvrir-rayons');
    expect(cercleDe(el, 'Famille').querySelector('.erreur-rayons')).not.toBeNull();
    expect(cercleDe(el, 'Famille').querySelector('input.coche-rayon')).toBeNull();
  });
});

describe('T3 — le mot « Sélection » (décision de Bertrand du 28/09) : jamais « Rayon »', () => {
  it('les libellés, et aucun « rayon » à l’écran, propriétaire comme contact', async () => {
    expect(fr['v2.circle.sel.title']).toBe('Sélections partagées');
    expect(fr['v2.circle.sel.contactTitle']).toBe('Sélections');
    expect(fr['v2.circle.sel.gone']).toBe('Cette sélection n\'est plus partagée.');
    const el = await poser();
    await cliquer(cercleDe(el, 'Famille'), 'button.ouvrir-rayons');
    expect(texte(cercleDe(el, 'Famille').querySelector('button.ouvrir-rayons')!)).toBe('Sélections partagées');
    expect(el.textContent).not.toMatch(/rayon/i);
    await cliquer(el, 'li.partage-recu button.ouvrir-catalogue');
    expect(texte(el.querySelector('section.rayons-contact h3')!)).toBe('Sélections');
    rayonsElise = rayonsElise.filter((r) => r.id !== 501);
    await cliquer(el, 'button.rayon-contact');
    expect(texte(el.querySelector('.rayon-parti')!)).toBe('Cette sélection n\'est plus partagée.');
    expect(el.textContent).not.toMatch(/rayon/i);
  });
});

describe('T3 — couper le partage supprime les sélections (décision 4, site-mozaiklabs#235)', () => {
  const dialogue = () => get(dialogs)[0];
  async function repondre(oui: boolean) { dialogs.settle(dialogue().id, oui); await laisserFaire(); }
  async function cocherDansFamille(el: Element, ...nomsCases: string[]) {
    await cliquer(cercleDe(el, 'Famille'), 'button.ouvrir-rayons');
    for (const n of nomsCases) await cocher(cercleDe(el, 'Famille'), n);
  }
  const partageGestes = () => gestes().filter((a) => /sharing\/library$/.test(a.url)).map((a) => `${a.method} ${chemin(a)}`);

  it('éteindre avec 2 sélections cochées : « Les 2 sélections… » ; refuser n’envoie RIEN', async () => {
    const el = await poser();
    await cocherDansFamille(el, 'Jazz ECM', 'Vinyles rippés');
    const avant = gestes().length;
    await cliquer(cercleDe(el, 'Famille'), 'button.interrupteur-partage');
    expect(dialogue()?.message).toBe(fr['v2.circle.sel.confirmStopMany'].replace('{n}', '2'));
    expect(dialogue()?.message).toMatch(/recocher/);
    await repondre(false);
    expect(gestes()).toHaveLength(avant);
    expect(cercleDe(el, 'Famille').querySelector('button.interrupteur-partage')!.getAttribute('aria-checked')).toBe('true');
    // Accepter : DELETE du partage, et rien d'autre.
    await cliquer(cercleDe(el, 'Famille'), 'button.interrupteur-partage');
    await repondre(true);
    expect(gestes().slice(avant).map((a) => `${a.method} ${chemin(a)}`)).toEqual(['DELETE /circles/7/sharing/library']);
  });

  it('une seule sélection : la phrase au singulier', async () => {
    const el = await poser();
    await cocherDansFamille(el, 'Jazz ECM');
    await cliquer(cercleDe(el, 'Famille'), 'button.interrupteur-partage');
    expect(dialogue()?.message).toBe(fr['v2.circle.sel.confirmStopOne']);
  });

  it('aucune sélection cochée : pas de confirmation, DELETE tout de suite', async () => {
    const el = await poser();
    await cliquer(cercleDe(el, 'Famille'), 'button.interrupteur-partage');
    expect(get(dialogs)).toHaveLength(0);
    expect(partageGestes()).toEqual(['DELETE /circles/7/sharing/library']);
  });

  it('liste illisible (503) : on ne sait pas, on prévient quand même', async () => {
    panneSets = true;
    const el = await poser();
    await cliquer(cercleDe(el, 'Famille'), 'button.interrupteur-partage');
    expect(dialogue()?.message).toBe(fr['v2.circle.sel.confirmStopUnknown']);
    await repondre(false);
    expect(partageGestes()).toEqual([]);
  });

  it('rallumer : les cases sont DÉCOCHÉES, rien n’est recoché tout seul', async () => {
    const el = await poser();
    await cocherDansFamille(el, 'Jazz ECM');
    expect(caseDe(cercleDe(el, 'Famille'), 'Jazz ECM').checked).toBe(true);
    await cliquer(cercleDe(el, 'Famille'), 'button.interrupteur-partage');
    await repondre(true);
    await cliquer(cercleDe(el, 'Famille'), 'button.interrupteur-partage');
    expect(partageGestes()).toEqual(['DELETE /circles/7/sharing/library', 'PUT /circles/7/sharing/library']);
    // Aucune ancienne liste n'est remontrée comme vraie…
    const famille = cercleDe(el, 'Famille');
    expect(famille.querySelector('input.coche-rayon')).toBeNull();
    expect(famille.querySelector('button.ouvrir-rayons')!.getAttribute('aria-expanded')).toBe('false');
    // …la liste relue est décochée, et aucun PUT de sélection n'est reparti.
    await cliquer(famille, 'button.ouvrir-rayons');
    for (const c of cercleDe(el, 'Famille').querySelectorAll('input.coche-rayon')) expect((c as HTMLInputElement).checked).toBe(false);
    expect(gestes().filter((a) => /\/sets\//.test(a.url)).map((a) => a.method)).toEqual(['PUT']);
  });

  it('déplacer le partage vers ce serveur : le texte dit que les sélections partent ; refuser n’envoie rien', async () => {
    cercles[1].sharing = { library: true, server_id: 'srv-autre' };
    const el = await poser();
    await cliquer(cercleDe(el, 'Jazz'), 'button.interrupteur-partage');
    expect(dialogue()?.message).toBe(fr['v2.circle.share.confirmMove']);
    expect(fr['v2.circle.share.confirmMove']).toMatch(/sélections partagées par ces cercles seront retirées/);
    await repondre(false);
    expect(gestes()).toHaveLength(0);
  });
});

describe('T3 — liste blanche côté client', () => {
  it('referenceContact ne recopie que les champs de la référence', () => {
    const r = referenceContact(REFERENCES[0]);
    expect(Object.keys(r).sort()).toEqual([
      'album_title', 'artist_name', 'deezer_id', 'duration_ms', 'isrc', 'qobuz_id', 'spotify_id', 'tidal_id', 'title', 'type', 'youtube_id',
    ]);
    expect(JSON.stringify(r)).not.toMatch(/Users|volume|srv-|qobuz\.com|secret/);
    // Un identifiant de service qui n'a pas la forme sûre ne passe pas.
    expect(referenceContact({ title: 'x', qobuz_id: 'https://evil/x?y', isrc: 'pas-un-isrc' })).toMatchObject({
      type: 'track', qobuz_id: null, isrc: null,
    });
    expect(servicesReference(r)).toEqual(['qobuz', 'tidal']);
  });

  it('rayonContact : identifiant opaque seulement, jamais `source_id` ni nom de cercle', () => {
    const r = rayonContact({ id: 501, kind: 'tag', name: 'Jazz ECM', count: 3, ...FUITES })!;
    expect(Object.keys(r).sort()).toEqual(['count', 'counts', 'id', 'kind', 'name']);
    expect(rayonContact({ id: '../../x', name: 'y' })).toBeNull();
    expect(rayonContact({ name: 'sans id' })).toBeNull();
    expect(rayonContact({ id: 'abc_12', kind: 'autre', name: 'z' })).toMatchObject({ id: 'abc_12', kind: null });
  });
});

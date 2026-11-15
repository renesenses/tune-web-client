// @vitest-environment jsdom
//
// rc12 (Bertrand, 15/11/2026) — « Croix de suppression d'une piste dans une
// playlist ! Important !! », puis « tous écrans !! » et « Elle manque cette
// croix ! ».
//
// Sur une playlist MODIFIABLE (Tune, ou de service à soi), chaque ligne porte
// une croix « Retirer » VISIBLE, sans passer par « Éditer » (rangé dans « … »
// depuis web#2739). Le retrait est PAR OCCURRENCE (`entry_id`, #6687). Sur une
// playlist non modifiable : aucune croix.
//
// On MONTE la fiche et on lit les requêtes réellement émises.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { locale } from '../i18n';
import { currentZoneId } from '../stores/zones';
import { entreesMenuPiste } from '../menuPiste';
import { entreeParLibelle } from './aides/menuFiche';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

vi.setConfig({ testTimeout: 30_000 });

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];
let lignesLocales: any[] = [];

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
async function attendreQue(condition: () => boolean, quoi: string) {
  await vi.waitFor(
    () => {
      flushSync();
      if (!condition()) throw new Error(`attente expirée : ${quoi}`);
    },
    { timeout: 25_000, interval: 10 },
  );
}

// Deux fois le même titre : la croix doit retirer CETTE occurrence-là.
const LOCALES = [
  { id: 501, title: 'Nightswimming', artist_name: 'R.E.M.', source: 'local', duration_ms: 258000, entry_id: 344 },
  { id: 502, title: 'Losing My Religion', artist_name: 'R.E.M.', source: 'local', duration_ms: 268000, entry_id: 345 },
  { id: 501, title: 'Nightswimming', artist_name: 'R.E.M.', source: 'local', duration_ms: 258000, entry_id: 346 },
];
const QOBUZ = [
  { id: null, title: 'Lovely Day', artist_name: 'Bill Withers', source: 'qobuz', source_id: '4791523' },
  { id: null, title: 'Grandma\'s Hands', artist_name: 'Bill Withers', source: 'qobuz', source_id: '4791524' },
];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  requetes = [];
  lignesLocales = LOCALES.map((l) => ({ ...l }));
  // La vue « pochettes » choisie par un test est mémorisée : chaque test repart en liste.
  try { localStorage.clear(); } catch { /* sans stockage */ }
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ method, url, body });
    let charge: unknown = {};
    if (method === 'POST' && url.endsWith('/playlists/12/tracks/remove')) {
      lignesLocales = lignesLocales.filter((l) => l.entry_id !== body?.entry_id);
      charge = { removed: 1 };
    } else if (method === 'POST' && url.includes('/tracks/remove')) charge = { removed: 1 };
    else if (method === 'GET' && url.includes('/playlists/12/tracks')) charge = lignesLocales;
    else if (method === 'GET' && url.includes('/streaming/qobuz/playlists/11/tracks')) charge = QOBUZ;
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

const lignes = () => [...hote!.querySelectorAll<HTMLElement>('.trow')].filter((r) => r.querySelector('.td'));
const croix = () => [...hote!.querySelectorAll<HTMLButtonElement>('button[data-retirer-titre]')];
const nb = (titre: string) => lignes().filter((r) => r.textContent?.includes(titre)).length;

async function ouvrirLocale() {
  monte = mount(PlaylistDetailV2, {
    target: hote!, props: { item: { kind: 'local', pl: { id: 12, name: 'Réveil', track_count: 3 } } as any, onClose: () => {} },
  });
  await attendreQue(() => (hote!.textContent ?? '').includes('Losing My Religion'), 'les lignes affichées');
}
async function ouvrirQobuz(editable: boolean | undefined) {
  monte = mount(PlaylistDetailV2, {
    target: hote!,
    props: { item: { kind: 'streaming', service: 'qobuz', pl: { source_id: '11', name: 'Ma playlist', track_count: 2, editable } } as any, onClose: () => {} },
  });
  await attendreQue(() => (hote!.textContent ?? '').includes('Lovely Day'), 'les titres affichés');
}

describe('rc12 — la croix « Retirer » sur chaque ligne de playlist modifiable', () => {
  it('🔴 playlist Tune : une croix par ligne SANS « Éditer » ; le clic retire CETTE occurrence', async () => {
    await ouvrirLocale();
    expect(hote!.querySelector('[data-fin-edition-playlist]'), 'on ne doit pas être en mode édition').toBeNull();
    expect(croix().length).toBe(3);
    expect(nb('Nightswimming')).toBe(2);
    // La TROISIÈME ligne : la seconde occurrence de « Nightswimming ».
    croix()[2].click();
    await attendreQue(() => requetes.some((r) => r.method === 'POST' && r.url.endsWith('/playlists/12/tracks/remove')), 'le retrait');
    expect(requetes.find((r) => r.url.endsWith('/tracks/remove'))!.body).toEqual({ entry_id: 346 });
    await attendreQue(() => nb('Nightswimming') === 1, 'la ligne retirée');
    expect(nb('Losing My Religion')).toBe(1);
    expect(croix().length).toBe(2);
  });

  it('🔴 vue pochettes : la croix est aussi sur chaque vignette', async () => {
    await ouvrirLocale();
    hote!.querySelector<HTMLButtonElement>('button[data-vue="pochettes"]')!.click();
    await attendreQue(() => !!hote!.querySelector('[data-pgrille]'), 'la grille de pochettes');
    expect(hote!.querySelectorAll('[data-pgrille] button[data-retirer-titre]').length).toBe(3);
  });

  it('🔴 playlist Qobuz à soi (editable: true) : croix visibles sans « Éditer », retrait chez le service', async () => {
    await ouvrirQobuz(true);
    expect(croix().length).toBe(2);
    croix()[0].click();
    await attendreQue(() => requetes.some((r) => r.method === 'POST' && r.url.includes('/tracks/remove')), 'le retrait');
    const w = requetes.find((r) => r.method === 'POST')!;
    expect(w.url).toMatch(/\/api\/v1\/streaming\/qobuz\/playlists\/11\/tracks\/remove$/);
    expect(w.body).toEqual({ track_ids: ['4791523'] });
    await attendreQue(() => !(hote!.textContent ?? '').includes('Lovely Day'), 'la ligne retirée');
  });

  it('playlist de service suivie (editable: false) : aucune croix, aucun retrait possible', async () => {
    await ouvrirQobuz(false);
    expect(croix().length).toBe(0);
    expect(hote!.querySelectorAll('button.rm').length).toBe(0);
  });
});

/** Ouvre le « … » de la ligne `rang` et rend l'entrée « Supprimer de cette playlist », s'il y en a une. */
async function entreeSupprimer(rang: number): Promise<HTMLElement | null> {
  const plus = lignes()[rang].querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  expect(plus, 'pas de « … » sur la ligne').toBeTruthy();
  plus!.click();
  await attendreQue(() => !!document.body.querySelector('[role="menu"]'), 'le menu de la piste');
  return [...document.body.querySelectorAll<HTMLElement>('[role="menu"] [role^="menuitem"]')]
    .find((e) => e.textContent?.trim() === fr['v2.pl.removeFromThisPlaylist']) ?? null;
}

describe('rc12 — « Supprimer de cette playlist » dans le menu « … » de la piste', () => {
  it('le module : entrée seulement quand l’écran fournit le geste', () => {
    const c = { jouable: true, idBibliotheque: 1, artistId: null, albumId: null };
    expect(entreesMenuPiste(c, { lire: () => {} }).some((e) => e.cle === 'v2.pl.removeFromThisPlaylist')).toBe(false);
    const faire = vi.fn();
    const e = entreesMenuPiste(c, { lire: () => {}, retirerDeLaPlaylist: faire }).find((x) => x.cle === 'v2.pl.removeFromThisPlaylist');
    expect(e).toBeTruthy();
    e!.faire();
    expect(faire).toHaveBeenCalledTimes(1);
  });

  it('🔴 playlist Tune : l’entrée retire CETTE occurrence (entry_id), comme la croix', async () => {
    await ouvrirLocale();
    const e = await entreeSupprimer(2);
    expect(e, 'entrée « Supprimer de cette playlist » absente').toBeTruthy();
    e!.click();
    await attendreQue(() => requetes.some((r) => r.method === 'POST' && r.url.endsWith('/playlists/12/tracks/remove')), 'le retrait');
    expect(requetes.find((r) => r.url.endsWith('/tracks/remove'))!.body).toEqual({ entry_id: 346 });
    await attendreQue(() => nb('Nightswimming') === 1, 'la ligne retirée');
  });

  it('🔴 playlist Qobuz à soi : l’entrée part chez le service', async () => {
    await ouvrirQobuz(true);
    const e = await entreeSupprimer(0);
    expect(e).toBeTruthy();
    e!.click();
    await attendreQue(() => requetes.some((r) => r.method === 'POST' && r.url.includes('/tracks/remove')), 'le retrait');
    const w = requetes.find((r) => r.method === 'POST')!;
    expect(w.url).toMatch(/\/api\/v1\/streaming\/qobuz\/playlists\/11\/tracks\/remove$/);
    expect(w.body).toEqual({ track_ids: ['4791523'] });
  });

  it('playlist Qobuz suivie (editable: false) : pas d’entrée', async () => {
    await ouvrirQobuz(false);
    expect(await entreeSupprimer(0)).toBeNull();
  });
});

describe('rc12 — « Éditer » réservé aux playlists Tune', () => {
  const editer = () => entreeParLibelle(hote!, fr['v2.pl.edit']);
  it('playlist Tune : « Éditer » est dans « … », et ouvre le réordonnancement', async () => {
    await ouvrirLocale();
    expect(editer(), 'entrée « Éditer » absente').toBeTruthy();
    editer()!.click();
    await attendreQue(() => !!hote!.querySelector('[data-fin-edition-playlist]'), 'le mode édition');
    expect(hote!.querySelectorAll(`button[aria-label="${fr['playlist.moveDown']}"]`).length).toBe(3);
  });

  it('playlist de service à soi : pas d’« Éditer » (rien à y montrer), les croix restent', async () => {
    await ouvrirQobuz(true);
    expect(editer()).toBeNull();
    expect(croix().length).toBe(2);
  });
});

// @vitest-environment jsdom
//
// web#3067 — on ne pouvait pas retirer un titre d'une playlist Qobuz
// PERSONNELLE depuis le web, dans deux cas :
//
//   (1) le Gestionnaire de playlists (`PlaylistManagerView`) : le suffixe de
//       retrait n'existait que pour une playlist locale ;
//   (2) une fiche `PlaylistDetailV2` ouverte depuis la recherche, les
//       étiquettes ou un widget : l'objet vient de `get_playlist`, qui rend
//       `editable: None` chez Qobuz — la fiche restait en lecture seule. Le
//       drapeau est retrouvé dans `GET /streaming/{service}/playlists`, par
//       l'identifiant.
//
// On MONTE les écrans, on CLIQUE, on lit les requêtes réellement émises.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import PlaylistManagerView from '../../components/v2-heritage/PlaylistManagerView.svelte';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import { notifications } from '../stores/notifications';
import {
  pendingPlaylistId,
  playlists,
  playlistsLoaded,
  streamingPlaylistsCache,
  streamingPlaylistsLoaded,
} from '../stores/playlists';
import { currentZoneId, zones } from '../stores/zones';
import { entreeParLibelle } from './aides/menuFiche';
import { confirmerLaBoite } from './aides/confirmerLaBoite';

vi.setConfig({ testTimeout: 60_000 });

const fr = lFr as unknown as Record<string, string>;

// La forme exacte de `GET /streaming/qobuz/playlists` : `editable` porté.
const MIENNE = { source_id: 'q-11', name: 'Ma playlist', track_count: 2, cover_path: null, editable: true };
const SUIVIE = { source_id: 'q-22', name: 'Suivie', track_count: 2, cover_path: null, editable: false };
const EDITO = { source_id: 'q-33', name: 'Éditoriale', track_count: 2, cover_path: null };

const LIGNES = [
  { id: null, title: 'Lovely Day', artist_name: 'Bill Withers', source: 'qobuz', source_id: '4791523' },
  { id: null, title: 'Grandma\'s Hands', artist_name: 'Bill Withers', source: 'qobuz', source_id: '4791524' },
];

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];

function corpsPour(url: string): unknown {
  if (url.includes('/tracks/remove')) return { removed: 1 };
  if (/\/streaming\/qobuz\/playlists\/[^/]+\/tracks/.test(url)) return LIGNES;
  if (url.includes('/playlist-manager/services')) return {};
  if (url.includes('/streaming/services')) return { qobuz: { authenticated: true } };
  if (/\/streaming\/qobuz\/playlists(\?|$)/.test(url)) return [MIENNE, SUIVIE, EDITO];
  if (/\/playlists(\?|$)/.test(url)) return [];
  return [];
}

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
async function souffler(n = 6) {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
async function attendreQue(condition: () => boolean, quoi: string) {
  await vi.waitFor(
    () => {
      flushSync();
      if (!condition()) throw new Error(`attente expirée : ${quoi}`);
    },
    { timeout: 25_000, interval: 10 },
  );
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  requetes = [];
  for (const n of get(notifications)) notifications.dismiss(n.id);
  localStorage.clear();
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ method, url, body });
    const charge = corpsPour(url);
    return {
      ok: true, status: 200, statusText: 'OK',
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
  document.querySelectorAll('.fond, .modal-backdrop').forEach((e) => e.remove());
  pendingPlaylistId.set(null);
  playlists.set([]);
  playlistsLoaded.set(false);
  streamingPlaylistsCache.set({});
  streamingPlaylistsLoaded.set(false);
  zones.set([]);
  currentZoneId.set(null);
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.unstubAllGlobals();
});

const retraits = () => requetes.filter((r) => r.method === 'POST' && r.url.includes('/tracks/remove'));
const croix = () => [...hote!.querySelectorAll<HTMLButtonElement>('button.retrait-service')];

/* ------------------------------ (1) le Gestionnaire ------------------------------ */

async function ouvrirDansLeGestionnaire(nom: string) {
  monte = mount(PlaylistManagerView, { target: hote!, props: { onAddToPlaylist: () => {} } as any });
  await attendreQue(() => !!hote!.querySelector('.pl-grille'), 'la grille de playlists');
  const carte = [...hote!.querySelectorAll<HTMLElement>('.pl-grille > .pl-carte')].find(
    (x) => x.querySelector('.pl-nom')?.textContent?.trim() === nom,
  );
  expect(carte, `aucune carte « ${nom} »`).toBeDefined();
  carte!.querySelector<HTMLButtonElement>('.pl-vignette button.ouvrir')!.click();
  await attendreQue(() => (hote!.textContent ?? '').includes('Lovely Day'), 'les titres de la playlist');
}

describe('(1) #3067 — Gestionnaire de playlists : retirer un titre d’une playlist Qobuz à soi', () => {
  it('🔴 editable: true — une croix par titre ; l’appel part chez Qobuz ; le titre disparaît', async () => {
    await ouvrirDansLeGestionnaire(MIENNE.name);
    expect(croix().length, 'pas de croix de retrait sur une playlist Qobuz personnelle').toBe(2);
    expect(croix()[0].getAttribute('aria-label'))
      .toBe(fr['v2.pl.removeFromService'].replace('{service}', 'qobuz'));
    croix()[0].click();
    await souffler();
    const r = retraits();
    expect(r.length).toBe(1);
    expect(r[0].url).toMatch(/\/api\/v1\/streaming\/qobuz\/playlists\/q-11\/tracks\/remove$/);
    expect(r[0].body).toEqual({ track_ids: ['4791523'] });
    await attendreQue(() => !(hote!.textContent ?? '').includes('Lovely Day'), 'le titre retiré de la liste');
    expect(hote!.textContent).toContain('Grandma');
  });

  it('🔴 rc12 — « Supprimer de cette playlist » dans le « … » de la piste : même retrait ; absent sur une suivie', async () => {
    const entree = async () => {
      const ligne = [...hote!.querySelectorAll<HTMLElement>('.track-list .trow')].find((r) => r.textContent?.includes('Lovely Day'))!;
      ligne.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
      await attendreQue(() => !!document.body.querySelector('[role="menu"]'), 'le menu de la piste');
      return [...document.body.querySelectorAll<HTMLElement>('[role="menu"] [role^="menuitem"]')]
        .find((e) => e.textContent?.trim() === fr['v2.pl.removeFromThisPlaylist']) ?? null;
    };
    await ouvrirDansLeGestionnaire(MIENNE.name);
    const e = await entree();
    expect(e, 'entrée absente').toBeTruthy();
    e!.click();
    await souffler();
    const r = retraits();
    expect(r.length).toBe(1);
    expect(r[0].url).toMatch(/\/api\/v1\/streaming\/qobuz\/playlists\/q-11\/tracks\/remove$/);
    expect(r[0].body).toEqual({ track_ids: ['4791523'] });
    unmount(monte!); monte = null;
    document.body.querySelectorAll('[role="menu"]').forEach((m) => m.remove());
    await ouvrirDansLeGestionnaire(SUIVIE.name);
    expect(await entree()).toBeNull();
  });

  it('playlist SUIVIE (editable: false) : aucune croix', async () => {
    await ouvrirDansLeGestionnaire(SUIVIE.name);
    expect(croix().length).toBe(0);
    expect(hote!.querySelector('.track-list .remove-btn')).toBeNull();
  });

  it('playlist ÉDITORIALE (sans `editable`) : aucune croix', async () => {
    await ouvrirDansLeGestionnaire(EDITO.name);
    expect(croix().length).toBe(0);
  });
});

/* ------------------- (2) la fiche ouverte hors de la liste du compte ------------------- */

async function ouvrirFiche(pl: Record<string, unknown>) {
  monte = mount(PlaylistDetailV2, {
    target: hote!,
    props: { item: { kind: 'streaming', service: 'qobuz', pl } as any, onClose: () => {} },
  });
  await attendreQue(() => (hote!.textContent ?? '').includes('Lovely Day'), 'les titres affichés');
  await souffler();
}
const boutonEditer = () => entreeParLibelle(hote!, fr['v2.pl.edit']) ?? undefined;

describe('(2) #3067 — fiche venue de la recherche / d’un widget : `editable` absent', () => {
  it('🔴 retrouvé dans la liste du compte : croix, retrait (sans « Éditer »)', async () => {
    // Ce que rend `get_playlist` (Qobuz) : pas de drapeau.
    await ouvrirFiche({ source_id: 'q-11', name: 'Ma playlist', track_count: 2, editable: null });
    expect(requetes.some((r) => r.method === 'GET' && /\/streaming\/qobuz\/playlists$/.test(r.url)),
      'la liste du compte n’a pas été consultée').toBe(true);
    // rc12 (15/11) — la croix vient avec `editable` retrouvé ; « Éditer » est
    // réservé aux playlists Tune.
    await attendreQue(() => croix().length === 2, 'les croix');
    expect(boutonEditer()).toBeUndefined();
    croix()[1].click();
    await confirmerLaBoite();
    await souffler();
    expect(retraits()[0]?.url).toMatch(/\/streaming\/qobuz\/playlists\/q-11\/tracks\/remove$/);
    expect(retraits()[0]?.body).toEqual({ track_ids: ['4791524'] });
    await attendreQue(() => !(hote!.textContent ?? '').includes('Grandma'), 'le titre retiré');
  });

  it('suivie dans la liste du compte : lecture seule', async () => {
    await ouvrirFiche({ source_id: 'q-22', name: 'Suivie', track_count: 2 });
    expect(boutonEditer()).toBeUndefined();
  });

  it('absente de la liste du compte (éditoriale) : lecture seule', async () => {
    await ouvrirFiche({ source_id: 'q-99', name: 'Ailleurs', track_count: 2 });
    expect(boutonEditer()).toBeUndefined();
  });

  it('drapeau déjà porté : aucune requête de plus', async () => {
    await ouvrirFiche({ source_id: 'q-22', name: 'Suivie', track_count: 2, editable: false });
    expect(requetes.some((r) => /\/streaming\/qobuz\/playlists$/.test(r.url))).toBe(false);
  });
});

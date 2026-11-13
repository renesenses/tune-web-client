// @vitest-environment jsdom
//
// tune-server-rust#7586 — « Uniquement favoris » sur l'onglet Pistes, compté
// par le vrai écran (relecture du 12/11) : `getFavorites(pid)` SANS type
// relisait un par un TOUS les favoris du profil (albums, artistes, playlists
// compris), et l'effet repartait à chaque cœur posé ou ôté — 500 albums
// favoris = ~500 requêtes à chaque clic.
//
// Témoin : LibraryV2 monté, `fetch` remplacé par un compteur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore } from '../stores/library';
import { currentProfileId, favoriteTrackIds, favoriteAlbumIds } from '../stores/profile';
import { locale } from '../i18n';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 60_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

const ALBUMS: Album[] = Array.from({ length: 4 }, (_, i) => ({
  id: i + 1, title: `Album ${i + 1}`, artist_name: 'Artiste', year: 2000 + i,
})) as unknown as Album[];

const piste = (id: number) => ({ id, title: `Piste ${id}`, artist_name: 'Artiste', album_id: 1, album_title: 'Album 1', duration_ms: 1000 });
/** Les favoris du profil, tous types : 2 pistes et 40 albums. */
const FAVORIS = [
  { item_type: 'track', item_id: 11 },
  { item_type: 'track', item_id: 12 },
  ...Array.from({ length: 40 }, (_, i) => ({ item_type: 'album', item_id: 100 + i })),
];
const appels: string[] = [];

function corpsPour(url: string): unknown {
  const fav = /\/profiles\/1\/favorites(\?item_type=(\w+))?$/.exec(url);
  if (fav) return fav[2] ? FAVORIS.filter((r) => r.item_type === fav[2]) : FAVORIS;
  const p = /\/library\/tracks\/(\d+)$/.exec(url);
  if (p) return piste(Number(p[1]));
  if (/\/library\/albums\/\d+$/.test(url)) return { id: 1, title: 'x' };
  if (url.includes('/stats')) return { track_count: 0, album_count: ALBUMS.length };
  return [];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserFiler(): Promise<void> {
  for (let i = 0; i < 14; i++) await respirer();
  flushSync();
}

async function poserEcranPistesFavorites(): Promise<HTMLElement> {
  activeView.set('library');
  albumsStore.set([...ALBUMS]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as never });
  await laisserFiler();
  const onglet = hote.querySelector<HTMLButtonElement>('nav.tabs button.tab[data-onglet="tracks"]');
  if (!onglet) throw new Error('onglet Pistes absent');
  onglet.click();
  await laisserFiler();
  const puce = hote.querySelector<HTMLButtonElement>('[data-filtre-favoris]');
  if (!puce) throw new Error('puce « Uniquement favoris » absente');
  appels.length = 0;
  puce.click();
  await laisserFiler();
  return hote;
}

const favoris = () => appels.filter((u) => /\/profiles\/1\/favorites/.test(u));
const relecturesAlbums = () => appels.filter((u) => /\/library\/albums\/\d+$/.test(u));
const relecturesPistes = () => appels.filter((u) => /\/library\/tracks\/\d+$/.test(u));

beforeEach(() => {
  locale.set('fr');
  activeView.set('home');
  albumsStore.set([]);
  localStorage.clear();
  currentProfileId.set(1);
  favoriteTrackIds.set(new Set([11, 12]));
  favoriteAlbumIds.set(new Set(FAVORIS.filter((r) => r.item_type === 'album').map((r) => r.item_id)));
  appels.length = 0;
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    appels.push(url);
    const corps = corpsPour(url);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  albumsStore.set([]);
  favoriteTrackIds.set(new Set());
  favoriteAlbumIds.set(new Set());
  activeView.set('home');
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('#7586 — Pistes « Uniquement favoris » : les requêtes comptées', () => {
  it('à l’activation : UNE lecture des favoris, typée piste, et aucun album favori relu', async () => {
    const el = await poserEcranPistesFavorites();
    expect(favoris()).toHaveLength(1);
    expect(favoris()[0]).toMatch(/item_type=track$/);
    expect(relecturesAlbums()).toHaveLength(0);
    expect(relecturesPistes()).toHaveLength(2);
    expect(el.textContent).toContain('Piste 11');
    expect(el.textContent).toContain('Piste 12');
  });

  it('un cœur posé ne relit QUE la piste ajoutée, pas tous les favoris', async () => {
    const el = await poserEcranPistesFavorites();
    appels.length = 0;
    favoriteTrackIds.update((s) => { s.add(13); return s; });
    await laisserFiler();
    expect(favoris()).toHaveLength(0);
    expect(relecturesAlbums()).toHaveLength(0);
    expect(relecturesPistes()).toEqual([expect.stringMatching(/\/library\/tracks\/13$/)]);
    expect(el.textContent).toContain('Piste 13');
  });

  it('un cœur ôté retire la piste sans aucune requête', async () => {
    const el = await poserEcranPistesFavorites();
    appels.length = 0;
    favoriteTrackIds.update((s) => { s.delete(11); return s; });
    await laisserFiler();
    expect(favoris()).toHaveLength(0);
    expect(relecturesPistes()).toHaveLength(0);
    expect(el.textContent).not.toContain('Piste 11');
    expect(el.textContent).toContain('Piste 12');
  });
});

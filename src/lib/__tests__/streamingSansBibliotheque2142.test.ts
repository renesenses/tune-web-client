// @vitest-environment jsdom
//
// web#2142 — fil 2251 (Pierre-Marin, abonné Qobuz SANS bibliothèque locale) :
// « recherches qui n'aboutissent pas », « si la bibliothèque est vide on met
// un grand champ recherche qui ne cherche que sur elle ? mais pas dans les
// services de streaming ? », « albums / track / playlist / artist / label ».
// Alignement sur les télécommandes (tune-remote-flutter#68/#69,
// tune-remote-ios#70/#71).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView, pendingSearchQuery } from '../stores/navigation';
import { streamingServices } from '../stores/streaming';
import { get } from 'svelte/store';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import lFr from '../locales/fr';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { locale } from '../i18n';
import type { Album } from '../types';
import { preferences } from '../stores/preferences';

vi.setConfig({ testTimeout: 60_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

/** 40 albums : 4 genres, 6 années. « Jazz » en compte 10, 1971 en compte 7. */
const GENRES = ['Jazz', 'Rock', 'Pop', 'Classique'];
let albumsSource: Album[] = [];
const ALBUMS: Album[] = Array.from({ length: 40 }, (_, i) => ({
  id: i + 1,
  title: `Album ${String(i + 1).padStart(2, '0')}`,
  artist_name: `Artiste ${(i % 7) + 1}`,
  year: 1970 + (i % 6),
  genre: GENRES[i % 4],
})) as unknown as Album[];

/** Ce que rend `/home/recently-added` : 23 albums, la fenêtre 15 jours du testeur. */
const RECENTS = Array.from({ length: 23 }, (_, i) => ({
  id: 500 + i,
  title: `Récent ${String(i + 1).padStart(2, '0')}`,
  artist_name: `Artiste ${(i % 5) + 1}`,
  cover_path: null,
}));

const RESUME = { days: 15, album_count: 23, track_count: 231, duration_ms: 21_300_000, duration_seconds: 21_300 };

const PISTES = Array.from({ length: 30 }, (_, i) => ({
  id: 900 + i, title: `Piste ${i + 1}`, artist_name: 'Artiste 1',
  album_name: 'Album 01', album_id: 1, duration: 200,
}));

const ARTISTES = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Artiste ${i + 1}` }));

const PLAYLIST_CATALOGUE = { source_id: 'pl-77', name: 'Jazz Classics', track_count: 50, owner: 'Qobuz' };
function corpsPour(url: string): unknown {
  if (/\/library\/search/.test(url)) return { tracks: [], albums: [], artists: [] };
  if (/\/search\?q=/.test(url)) {
    return { local: { tracks: [], albums: [], artists: [] },
      services: { qobuz: { tracks: [], albums: [], artists: [], playlists: [PLAYLIST_CATALOGUE] } } };
  }
  if (/\/streaming\/services/.test(url)) return {};
  if (url.includes('/home/recently-added/summary')) return RESUME;
  if (url.includes('/home/recently-added')) return RECENTS;
  if (/\/library\/artists(\?|$)/.test(url)) return ARTISTES;
  if (/\/library\/tracks(\?|$)/.test(url)) return PISTES;
  if (url.includes('/tracks')) return PISTES;
  if (url.includes('/stats')) return { track_count: PISTES.length, album_count: ALBUMS.length };
  return [];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

async function poserEcran(): Promise<HTMLElement> {
  activeView.set('library');
  albumsStore.set([...albumsSource]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as never });
  for (let i = 0; i < 14; i++) await respirer();
  flushSync();
  return hote;
}

/** Le GESTE : cliquer l'onglet par son libellé, comme le testeur. */
async function cliquerOnglet(el: HTMLElement, libelle: string): Promise<void> {
  const bouton = [...el.querySelectorAll<HTMLButtonElement>('nav.tabs button.tab')]
    .find((b) => (b.textContent ?? '').trim() === libelle);
  if (!bouton) {
    const vus = [...el.querySelectorAll('nav.tabs button.tab')].map((b) => (b.textContent ?? '').trim());
    throw new Error(`onglet « ${libelle} » absent — présents : ${vus.join(' | ')}`);
  }
  bouton.click();
  for (let i = 0; i < 14; i++) await respirer();
  flushSync();
}

async function cliquer(b: HTMLElement): Promise<void> {
  b.click();
  for (let i = 0; i < 8; i++) await respirer();
  flushSync();
}

/** La bascule grille/liste, telle qu'elle est rendue dans la barre d'outils. */
function bascule(el: HTMLElement): HTMLButtonElement | null {
  return [...el.querySelectorAll<HTMLButtonElement>('.filters button.viewtog')]
    .find((b) => /vue|view|liste|grille|list|grid/i.test(b.getAttribute('aria-label') ?? '')) ?? null;
}

beforeEach(() => {
  locale.set('fr');
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  streamingServices.set({} as any);
  albumsSource = [...ALBUMS];
  pendingSearchQuery.set('');
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
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
  activeView.set('home');
  localStorage.clear();
  vi.unstubAllGlobals();
});



const fr = lFr as unknown as Record<string, string>;
async function taper(el: HTMLElement, texte: string) {
  const champ = el.querySelector<HTMLInputElement>('.v2-rech input')!;
  champ.value = texte;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  for (let i = 0; i < 14; i++) await respirer();
  flushSync();
}

describe('web#2142 — Bibliothèque : une recherche locale sans résultat mène aux services', () => {
  it('🔴 avec un service connecté, propose de chercher le même texte chez lui', async () => {
    streamingServices.set({ qobuz: { enabled: true, authenticated: true }, deezer: { enabled: true, authenticated: false } } as any);
    const el = await poserEcran();
    await taper(el, 'Kind of Blue');
    expect(el.textContent).toContain(fr['library.noAlbumMatchesFilters']);
    const b = el.querySelector<HTMLButtonElement>('button[data-chercher-services]');
    expect(b, 'aucune passerelle vers la recherche des services').not.toBeNull();
    expect(b!.textContent).toContain('Qobuz');
    expect(b!.textContent, 'un service non connecté est proposé').not.toContain('Deezer');
    b!.click();
    expect(get(activeView)).toBe('search');
    expect(get(pendingSearchQuery)).toBe('Kind of Blue');
  });

  it('sans service connecté, pas de passerelle', async () => {
    const el = await poserEcran();
    await taper(el, 'Kind of Blue');
    expect(el.querySelector('button[data-chercher-services]')).toBeNull();
  });

  it('le champ dit qu’il ne cherche que dans la bibliothèque LOCALE', async () => {
    const el = await poserEcran();
    expect(el.querySelector<HTMLInputElement>('.v2-rech input')!.placeholder).toBe(fr['v2.lib.searchPlaceholder']);
    expect(fr['v2.lib.searchPlaceholder']).toMatch(/locale/);
  });
});

describe('web#2142 — Recherche : les playlists du catalogue des services', () => {
  it('🔴 une playlist Qobuz du catalogue apparaît dans la section Playlists', async () => {
    activeView.set('search');
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SearchV2, { target: hote });
    for (let i = 0; i < 6; i++) await respirer();
    flushSync();
    const champ = hote.querySelector<HTMLInputElement>('input[type="search"]')!;
    champ.value = 'jazz classics';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    for (let i = 0; i < 20; i++) await respirer();
    flushSync();
    const lignes = [...hote.querySelectorAll('.pl-row')].map((b) => b.textContent ?? '');
    expect(lignes.some((t) => t.includes('Jazz Classics') && t.includes('Qobuz')),
      `section Playlists : ${JSON.stringify(lignes)}`).toBe(true);
  });
});

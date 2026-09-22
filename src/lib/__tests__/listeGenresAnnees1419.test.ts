// @vitest-environment jsdom
//
// #1419 — Jean Valjean, fil 1856, 0.9.159 : « l'affichage par liste ne
// fonctionne pas pour Genres et Années. Faire genres-->choisir un genre-->pas
// d'affichage par liste possible. »
//
// La branche `{:else if tab !== 'albums'}` de `LibraryV2` rendait les albums
// d'une facette ouverte dans une grille ÉCRITE EN DUR ; `{:else if display ===
// 'list'}` venait après et n'était jamais atteinte sur ces onglets. Le bouton
// restait offert, et son clic ne changeait rien à l'écran.
//
// 🔴 Ce témoin MONTE l'écran, clique l'onglet, la valeur, puis la bascule — les
// gestes du testeur — et compte ce qui est rendu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
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

function corpsPour(url: string): unknown {
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
  albumsStore.set([...ALBUMS]);
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


/** Ouvre une valeur de la facette, par son libellé. */
async function ouvrirValeur(el: HTMLElement, valeur: string): Promise<void> {
  const b = [...el.querySelectorAll<HTMLButtonElement>('.fliste button.flnom')]
    .find((x) => x.querySelector('.fk')?.textContent?.trim() === valeur);
  if (!b) throw new Error(`valeur « ${valeur} » absente de la liste`);
  await cliquer(b);
}

describe('#1419 — Genres, Années, Labels : la bascule grille/liste AGIT', () => {
  for (const [onglet, valeur, n] of [['Genres', 'Jazz', 10], ['Années', '1971', 7]] as const) {
    it(`🔴 ${onglet} ▸ ${valeur} : le clic passe la facette en LISTE, et revient`, async () => {
      const el = await poserEcran();
      await cliquerOnglet(el, onglet);
      await ouvrirValeur(el, valeur);
      // Contre-épreuve du montage : la facette est ouverte, en grille.
      expect(el.querySelectorAll('.facet .facetgrid .card').length).toBe(n);
      const b = bascule(el);
      expect(b, 'la bascule n’est plus offerte sur la facette').not.toBeNull();
      await cliquer(b!);
      expect(
        el.querySelectorAll('.facet .rows .lrow').length,
        'la bascule n’a rien changé : la facette est restée en grille',
      ).toBe(n);
      expect(el.querySelectorAll('.facet .facetgrid .card').length).toBe(0);
      await cliquer(bascule(el)!);
      expect(el.querySelectorAll('.facet .facetgrid .card').length).toBe(n);
      expect(el.querySelectorAll('.facet .rows .lrow').length).toBe(0);
    });
  }
});

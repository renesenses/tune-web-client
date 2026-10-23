// @vitest-environment jsdom
//
// web#2191 — fil 2274 (rc4, Windows) : « lors d'un appui sur < Retour la
// liste des genres reprend du début. […] la même chose devrait s'appliquer
// dans Année ». Et les captures : Retour et titre du genre sur UNE ligne, sans
// la bande du titre au-dessus des pochettes.
//
// Même banc que #1419 : le vrai `LibraryV2`, monté, piloté par ses boutons.
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
// jsdom ne met rien en page : `scrollTop` est tenu ici, élément par élément.
const defilements = new WeakMap<Element, number>();
Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
  configurable: true,
  get() { return defilements.get(this) ?? 0; },
  set(v: number) { defilements.set(this, v); },
});

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


const liste = (el: HTMLElement) => el.querySelector<HTMLElement>('.fliste');
async function retour(el: HTMLElement) {
  const b = el.querySelector<HTMLButtonElement>('.facette-ouverte .fretour');
  if (!b) throw new Error('pas de Retour sur la valeur ouverte');
  await cliquer(b);
}

describe('web#2191 — Retour rend la liste des facettes là où on l’avait laissée', () => {
  for (const [onglet, valeur] of [['Genres', 'Rock'], ['Années', '1972']] as const) {
    it(`🔴 ${onglet} : la position de la liste revient après ${valeur} ▸ Retour`, async () => {
      const el = await poserEcran();
      await cliquerOnglet(el, onglet);
      liste(el)!.scrollTop = 340;
      await ouvrirValeur(el, valeur);
      expect(liste(el), 'la liste est restée affichée sous la valeur ouverte').toBeNull();
      await retour(el);
      expect(liste(el), 'la liste n’est pas revenue').not.toBeNull();
      expect(liste(el)!.scrollTop, 'Retour remet la liste en haut').toBe(340);
    });
  }

  it('chaque onglet garde SA position', async () => {
    const el = await poserEcran();
    await cliquerOnglet(el, 'Genres');
    liste(el)!.scrollTop = 120;
    await ouvrirValeur(el, 'Jazz');
    await cliquerOnglet(el, 'Années');
    await ouvrirValeur(el, '1971');
    await retour(el);
    expect(liste(el)!.scrollTop, 'Années a hérité de la position de Genres').toBe(0);
  });

  it('mise en page compacte : Retour, titre et compte sur une ligne, hors de ce qui défile', async () => {
    const el = await poserEcran();
    await cliquerOnglet(el, 'Genres');
    await ouvrirValeur(el, 'Jazz');
    const entete = el.querySelector<HTMLElement>('.facette-ouverte > .fentete');
    expect(entete, 'pas de ligne d’en-tête au-dessus de la grille').not.toBeNull();
    expect(entete!.querySelector('.fretour')).not.toBeNull();
    expect(entete!.querySelector('h2 .fk')?.textContent?.trim()).toBe('Jazz');
    expect(entete!.querySelector('h2 .fc')?.textContent?.trim()).toBe('10');
    expect(el.querySelector('.facets h2'), 'la bande du titre au-dessus des pochettes est toujours là').toBeNull();
    expect(el.querySelectorAll('.facets .facet .facetgrid .card').length).toBe(10);
  });
});

describe('web#2191 — fiche artiste : le Retour reste accessible en défilant', () => {
  it('un Retour collant apparaît quand l’en-tête sort du cadre, et seulement alors', async () => {
    const { default: EnTeteArtiste } = await import('../../components/v2/EnTeteArtiste.svelte');
    let rappel: ((e: { isIntersecting: boolean }[]) => void) | null = null;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: (e: { isIntersecting: boolean }[]) => void) { rappel = cb; }
      observe() {} unobserve() {} disconnect() {}
    });
    const onRetour = vi.fn();
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(EnTeteArtiste, { target: hote, props: { nom: 'Dionne Warwick', onRetour } });
    flushSync();

    const flottant = hote.querySelector<HTMLElement>('.retour-flottant');
    expect(flottant, 'aucun Retour collant sur la fiche').not.toBeNull();
    expect(flottant!.classList.contains('visible'), 'deux Retours à l’écran en haut de fiche').toBe(false);
    expect(rappel, 'l’en-tête n’est pas observé').not.toBeNull();

    rappel!([{ isIntersecting: false }]);
    flushSync();
    expect(flottant!.classList.contains('visible')).toBe(true);
    flottant!.querySelector<HTMLButtonElement>('button')!.click();
    expect(onRetour).toHaveBeenCalledTimes(1);

    rappel!([{ isIntersecting: true }]);
    flushSync();
    expect(flottant!.classList.contains('visible')).toBe(false);
  });
});

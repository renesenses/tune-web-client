// @vitest-environment jsdom
//
// #1722, le reste après a8e0dba6 (relecture au tag v1.0.0-rc3, 10/10) : le
// panneau Genres envoie le libellé de `GET /library/genres`. Le serveur
// DÉCOUPE les valeurs multiples (`albums.genres`, sinon `split_genre_tag` de
// `albums.genre`) et FUSIONNE les graphies par `genre_key` (casse,
// espace/tiret, #1161). L'onglet Genres groupait, lui, sur la chaîne brute
// `a.genre?.trim()` et ouvrait sur l'égalité exacte : « Rock; Pop » ne
// tombait jamais sous « Rock », « Trip Hop » et « Trip-Hop » faisaient deux
// groupes, et une valeur sans égal exact laissait la LISTE à l'écran — le
// symptôme d'origine.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { locale } from '../i18n';
import type { Album } from '../types';
import { cleGenre, genresDeLAlbum, grouperParGenre } from '../genresBibliotheque';
import { preferences } from '../stores/preferences';

vi.setConfig({ testTimeout: 60_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

/** Les graphies que la bibliothèque porte RÉELLEMENT (relecture du 10/10). */
const BRUTS: [string | null, string | null][] = [
  ['Rock; Pop', null],      // 1 — deux genres dans la colonne héritée
  ['Rock', null],           // 2
  ['Trip-Hop', null],       // 3 — deux graphies d'un même genre (#1161)
  ['Trip Hop', null],       // 4
  [null, '["Jazz","Fusion"]'], // 5 — QUE la liste multiple (#1821)
  ['Jazz', '["Jazz"]'],     // 6
  ['rock/Blues', null],     // 7 — casse et barre oblique
  [null, null],             // 8 — sans genre
];
const ALBUMS: Album[] = BRUTS.map(([genre, genres], i) => ({
  id: i + 1,
  title: `Album ${String(i + 1).padStart(2, '0')}`,
  artist_name: `Artiste ${(i % 3) + 1}`,
  year: 1990 + i,
  genre,
  genres,
})) as unknown as Album[];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserVivre(n = 14): Promise<void> {
  for (let i = 0; i < n; i++) await respirer();
  flushSync();
}

async function poserEcran(avecAlbums = true): Promise<HTMLElement> {
  activeView.set('library');
  if (avecAlbums) albumsStore.set([...ALBUMS]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as never });
  await laisserVivre();
  return hote;
}

/** Ce que font `PanneauGenres`, `FavoritesV2`, `SearchV2` et `gestesObjet`. */
async function sauter(onglet: string, valeur: unknown): Promise<void> {
  window.dispatchEvent(new CustomEvent('tune:v2-facette', { detail: { onglet, valeur } }));
  await laisserVivre();
}

function sectionOuverte(el: HTMLElement): HTMLElement | null {
  return el.querySelector<HTMLElement>('.facets section.facet[data-facette]');
}

beforeEach(() => {
  locale.set('fr');
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  // jsdom ne l'implémente pas ; `surFacette` l'appelle sur la section trouvée.
  (Element.prototype as any).scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => [],
    text: async () => '[]',
  }) as unknown as Response));
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
  delete (Element.prototype as any).scrollIntoView;
  vi.unstubAllGlobals();
});

describe('🔴 #1722 — l’onglet Genres groupe comme le serveur (découpe + clé canonique)', () => {
  const CAS: [string, string, number[]][] = [
    // [valeur envoyée par le panneau, clé attendue à l'écran, albums attendus]
    ['Rock', 'Rock', [1, 2, 7]],
    ['Pop', 'Pop', [1]],
    ['Trip Hop', 'Trip Hop', [3, 4]],
    // égalité de graphies : la plus petite, comme `list_genres` (« Trip Hop »)
    ['Trip-Hop', 'Trip Hop', [3, 4]],
    ['Fusion', 'Fusion', [5]],
    ['Jazz', 'Jazz', [5, 6]],
    ['blues', 'Blues', [7]],
  ];
  for (const [valeur, cle, ids] of CAS) {
    it(`le panneau envoie « ${valeur} » : le genre s’ouvre avec ses ${ids.length} albums`, async () => {
      const el = await poserEcran();
      await sauter('genres', valeur);
      const s = sectionOuverte(el);
      expect(s, `« ${valeur} » n’ouvre rien : la LISTE est restée`).not.toBeNull();
      expect(s!.dataset.facette).toBe(cle);
      expect(s!.querySelectorAll('.card, .lrow').length).toBe(ids.length);
    });
  }

  it('la liste des genres : une entrée par clé canonique, un album sous chacun de ses genres', async () => {
    const el = await poserEcran();
    await sauter('genres', '__aucun__');
    // valeur inconnue : la liste s'affiche
    const noms = [...el.querySelectorAll<HTMLElement>('.fliste .flnom .fk')].map((n) => n.textContent?.trim());
    expect(noms.filter((n) => n === 'Trip-Hop' || n === 'Trip Hop')).toEqual(['Trip Hop']);
    expect(noms.filter((n) => n?.toLowerCase() === 'rock')).toHaveLength(1);
    expect(noms).toContain('Fusion');
    expect(noms).not.toContain('Rock; Pop');
    expect(noms).not.toContain('rock/Blues');
  });
});

describe('#1722 — copie des règles serveur (`genres_de_l_album`, `split_genre_tag`, `genre_key`)', () => {
  it('découpe et normalise la colonne héritée', () => {
    expect(genresDeLAlbum('jazz; fusion/hip-hop\\r&b', null).map((g) => g.nom)).toEqual(['Jazz', 'Fusion', 'Hip-Hop', 'R&B']);
  });
  it('la liste JSON prime, sans normalisation ; illisible ou vide : la colonne héritée', () => {
    expect(genresDeLAlbum('Rock', '["  electro ","Ambient"]').map((g) => g.nom)).toEqual(['electro', 'Ambient']);
    expect(genresDeLAlbum('Rock', '[]').map((g) => g.nom)).toEqual(['Rock']);
    expect(genresDeLAlbum('Rock', 'pas du json').map((g) => g.nom)).toEqual(['Rock']);
  });
  it('dédoublonne dans l’album par clé canonique', () => {
    expect(genresDeLAlbum('Trip-Hop; trip hop', null).map((g) => g.nom)).toEqual(['Trip-Hop']);
    expect(cleGenre('  Trip-Hop ')).toBe('trip hop');
  });
  it('un vrai genre homonyme du libellé de remplacement : un seul groupe', () => {
    const g = grouperParGenre([{ genre: 'Sans Genre' }, { genre: null }] as any[], 'Sans Genre');
    expect(g).toHaveLength(1);
    expect(g[0].albums).toHaveLength(2);
  });
});

// @vitest-environment jsdom
//
// #1722 — FabienM, fil 2013 point 8, 28/09/2026 : « quand on clique sur un
// genre, cela renvoie à la page bibliothèque onglet genre mais le genre n'est
// pas sélectionné par défaut ».
//
// `premiereLigneRetours1711.test.ts` garde le correctif par le TEXTE de
// `surFacette`. Ce témoin-ci MONTE la Bibliothèque et rejoue l'évènement
// `tune:v2-facette` tel que chacun de ses émetteurs l'envoie — le panneau
// Genres de l'Accueil, les Favoris (genre, année, label), la Recherche et le
// menu « … » d'un label — puis regarde ce qui est À L'ÉCRAN : la section de la
// valeur ouverte, et plus la liste des valeurs.
//
// Les Favoris et la Recherche n'étaient pas signalés, mais ils passent par le
// même `surFacette` : même défaut, même preuve.
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

/** Un genre à nom COMPOSÉ, que l'issue demande de vérifier (« New Wave »). */
const GENRES = ['Jazz', 'New Wave', 'Rock', 'Chanson'];
const LABELS = ['Blue Note', 'Factory', 'Rough Trade'];
const ALBUMS: Album[] = Array.from({ length: 24 }, (_, i) => ({
  id: i + 1,
  title: `Album ${String(i + 1).padStart(2, '0')}`,
  artist_name: `Artiste ${(i % 5) + 1}`,
  year: 1978 + (i % 6),
  genre: GENRES[i % 4],
  label: LABELS[i % 3],
})) as unknown as Album[];

const compter = (champ: 'genre' | 'label', v: string) =>
  ALBUMS.filter((a) => (a as any)[champ] === v).length;

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

describe('🔴 #1722 — un saut vers une facette OUVRE la valeur, pas seulement son onglet', () => {
  const CAS: [string, string, string | number, string, number][] = [
    // [émetteur, onglet, valeur envoyée, clé attendue, albums attendus]
    ['Accueil ▸ panneau Genres', 'genres', 'Jazz', 'Jazz', compter('genre', 'Jazz')],
    ['Accueil ▸ panneau Genres, nom composé', 'genres', 'New Wave', 'New Wave', compter('genre', 'New Wave')],
    ['Favoris ▸ genre', 'genres', 'Rock', 'Rock', compter('genre', 'Rock')],
    ['Favoris ▸ année', 'years', '1980', '1980', ALBUMS.filter((a) => a.year === 1980).length],
    ['Favoris ▸ label', 'labels', 'Factory', 'Factory', compter('label', 'Factory')],
    ['Recherche ▸ label', 'labels', 'Blue Note', 'Blue Note', compter('label', 'Blue Note')],
  ];

  for (const [emetteur, onglet, valeur, cle, n] of CAS) {
    it(`${emetteur} : « ${cle} » est ouvert, avec ses ${n} albums`, async () => {
      const el = await poserEcran();
      // On part de l'onglet Albums : `surFacette` change d'onglet, ce qui
      // déclenche la remise à zéro de `facetteOuverte` — le piège du correctif.
      await sauter(onglet, valeur);
      const s = sectionOuverte(el);
      expect(s, 'onglet changé, mais la valeur n’est pas ouverte').not.toBeNull();
      expect(s!.dataset.facette).toBe(cle);
      expect(s!.querySelectorAll('.card, .lrow').length).toBe(n);
      expect(el.querySelector('.fliste'), 'la LISTE des valeurs est restée affichée').toBeNull();
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
  }

  it('un second saut, depuis une valeur déjà ouverte, ouvre la NOUVELLE valeur', async () => {
    const el = await poserEcran();
    await sauter('genres', 'Jazz');
    await sauter('labels', 'Rough Trade');
    expect(sectionOuverte(el)?.dataset.facette).toBe('Rough Trade');
  });

  it('bibliothèque encore froide : la valeur s’ouvre quand les albums arrivent', async () => {
    const el = await poserEcran(false);
    await sauter('genres', 'Chanson');
    albumsStore.set([...ALBUMS]);
    await laisserVivre();
    expect(sectionOuverte(el)?.dataset.facette).toBe('Chanson');
  });
});

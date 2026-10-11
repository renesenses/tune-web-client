// @vitest-environment jsdom
//
// LE SUIVANT DU NAVIGATEUR DOIT ROUVRIR LA FICHE D'ALBUM DE LA BIBLIOTHÈQUE.
//
// Parcours : Bibliothèque → clic sur un album (`#library/album:55`) →
// Précédent (`#library`, la fiche se referme) → Suivant. L'adresse revient à
// `#library/album:55`, l'entrée porte bien `detail: 'album:55'`, mais la fiche
// ne se rouvrait pas : `LibraryV2` savait REFERMER son calque quand la clé
// quittait `detailOuvert`, jamais le rouvrir quand elle y revenait. La limite
// était même écrite en pied de `historiqueCoquille.ts` (« "suivant" après un
// retour rend la liste, pas la fiche »).
//
// Même banc que `historiqueAlbumBibliotheque1121.test.ts` : la VRAIE
// Bibliothèque, un vrai clic, la vraie traversée d'historique de jsdom. Le
// test n'écrit jamais `pushState` lui-même.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView, pendingLibraryAlbum, pendingLibraryArtist, pendingLibraryYear } from '../stores/navigation';
import { albums as albumsStore } from '../stores/library';
import { brancherHistoriqueCoquille, detailOuvert } from '../historiqueCoquille';
import type { Album } from '../types';
import { reculer } from './reculer';

vi.setConfig({ testTimeout: 30_000 });

const ALBUM: Album = {
  id: 55,
  title: '101 (CD1)',
  artist_id: 994,
  artist_name: 'Depeche Mode',
  year: 1989,
} as Album;

const CLE = 'album:55';

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function corpsPour(url: string): unknown {
  if (/\/library\/albums\/55\/tracks/.test(url)) return [];
  if (/\/library\/albums\/55(\?|$)/.test(url)) return ALBUM;
  if (/\/library\/artists\/994\/albums/.test(url)) return [ALBUM];
  if (/\/library\/artists/.test(url)) return [];
  if (/\/library\/albums/.test(url)) return [ALBUM];
  if (/\/library\/tracks/.test(url)) return [];
  return {};
}

const respirer = () => new Promise((r) => setTimeout(r, 0));
const attendre = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/** Le Suivant du navigateur, attendu sur son événement — pendant de `reculer`. */
function avancer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const filet = setTimeout(() => reject(new Error('aucun popstate après history.forward()')), 4_000);
    window.addEventListener('popstate', () => { clearTimeout(filet); resolve(); }, { once: true });
    history.forward();
  });
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let debrancher: (() => void) | null = null;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
  }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const corps = corpsPour(String(url));
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  activeView.set('home');
  pendingLibraryAlbum.set(null);
  pendingLibraryArtist.set(null);
  pendingLibraryYear.set(null);
  detailOuvert.set(null);
  history.replaceState(null, '', '/');
});

afterEach(() => {
  if (debrancher) debrancher();
  debrancher = null;
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  albumsStore.set([]);
  activeView.set('home');
  detailOuvert.set(null);
  vi.unstubAllGlobals();
});

async function poserBibliotheque(): Promise<HTMLDivElement> {
  activeView.set('home');
  albumsStore.set([ALBUM]);
  debrancher = brancherHistoriqueCoquille();
  activeView.set('library');
  flushSync();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as any });
  for (let i = 0; i < 8; i++) await respirer();
  flushSync();
  return hote;
}

const vignette = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('.grid .card button.meta');
const fiche = (el: HTMLElement) => el.querySelector('.v2-detail');

async function ouvrirPuisReculer(el: HTMLElement): Promise<void> {
  vignette(el)!.click();
  flushSync();
  await attendre();
  flushSync();
  expect(fiche(el), 'la fiche ne s’est pas ouverte : le banc ne mesure rien').not.toBeNull();
  await reculer();
  flushSync();
  await attendre();
  flushSync();
  expect(fiche(el), 'le Précédent n’a pas refermé la fiche').toBeNull();
  expect(location.hash).toBe('#library');
}

describe('Précédent puis Suivant sur une fiche d’album de la Bibliothèque', () => {
  it('🔴 le Suivant ROUVRE la fiche que l’adresse désigne', async () => {
    const el = await poserBibliotheque();
    await ouvrirPuisReculer(el);
    const hauteur = history.length;

    await avancer();
    flushSync();
    await attendre();
    flushSync();

    expect(location.hash, 'l’adresse ne revient pas sur l’album').toBe(`#library/${CLE}`);
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'library', detail: CLE });
    expect(
      fiche(el),
      'l’adresse dit #library/album:55 mais la fiche ne s’est pas rouverte — c’est le défaut',
    ).not.toBeNull();
    expect(fiche(el)!.textContent ?? '', 'la fiche rouverte n’est pas celle de l’album').toContain('101 (CD1)');
    expect(history.length, 'rouvrir par le Suivant a empilé une entrée de plus').toBe(hauteur);
  });

  it('après ce Suivant, un nouveau Précédent referme la fiche et rend la grille', async () => {
    const el = await poserBibliotheque();
    await ouvrirPuisReculer(el);
    await avancer();
    flushSync();
    await attendre();
    flushSync();

    await reculer();
    flushSync();
    await attendre();
    flushSync();

    expect(fiche(el), 'la fiche rouverte ne se referme plus au Précédent').toBeNull();
    expect(vignette(el), 'la grille n’est pas revenue').not.toBeNull();
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'library', detail: null });
  });

  it('un album absent de la grille chargée est demandé au serveur', async () => {
    const el = await poserBibliotheque();
    await ouvrirPuisReculer(el);
    // La grille a été rechargée entre-temps (filtre, pagination) : l'album
    // n'y est plus. La fiche doit tout de même revenir, par l'API.
    albumsStore.set([]);
    flushSync();

    await avancer();
    flushSync();
    for (let i = 0; i < 8; i++) await respirer();
    await attendre();
    flushSync();

    expect(fiche(el), 'album hors grille : la fiche ne revient pas').not.toBeNull();
  });
});

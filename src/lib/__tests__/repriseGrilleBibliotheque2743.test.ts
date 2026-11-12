// @vitest-environment jsdom
//
// web#2743 (relecture de #2764) — la grille de la Bibliothèque, MONTÉE pour de
// vrai, retrouve l'album après « Lecture en cours » ; et seulement dans ce cas.
//
//   1. Bibliothèque, album choisi loin dans la grille, fiche ouverte →
//      « Lecture en cours » (la Bibliothèque est DÉMONTÉE) → Retour : la grille
//      remontée défile jusqu'à l'album (cpadiou77, rc10).
//   2. Fiche ouverte → barre latérale vers une autre vue → retour à la
//      Bibliothèque par la barre : la grille NE saute PAS sur l'ancien album
//      (#3843 : un clic de barre latérale repart de la racine).
//
// jsdom ne calcule aucune géométrie : chaque case `[data-i]` est posée à
// `i × 100 px` du haut de la grille, ce qui rend le saut mesurable par
// `scrollTop`.
//
// Contre-épreuve : sans la reprise (`LibraryV2` d'`origin/main`), le cas 1
// reste à `scrollTop = 0` ; sans la garde de clé (première version de #2764),
// le cas 2 saute à l'album.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView, pendingLibraryAlbum, pendingLibraryArtist, pendingLibraryYear } from '../stores/navigation';
import { albums as albumsStore } from '../stores/library';
import { brancherHistoriqueCoquille, detailOuvert } from '../historiqueCoquille';
import { retourDepuisLectureEnCours } from '../retourLectureEnCours';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 60_000 });

const ALBUMS: Album[] = Array.from({ length: 40 }, (_, i) => ({
  id: 100 + i,
  title: `Album ${String(i).padStart(2, '0')}`,
  artist_id: 900 + i,
  artist_name: `Artiste ${String(i).padStart(2, '0')}`,
  year: 1980 + (i % 30),
}) as Album);

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

function corpsPour(url: string): unknown {
  if (/\/library\/albums\/\d+\/tracks/.test(url)) return [];
  const m = /\/library\/albums\/(\d+)(\?|$)/.exec(url);
  if (m) return ALBUMS.find((a) => a.id === Number(m[1])) ?? {};
  if (/\/library\/albums/.test(url)) return ALBUMS;
  if (/\/library\/(artists|tracks)/.test(url)) return [];
  return {};
}

const respirer = () => new Promise((r) => setTimeout(r, 0));
const attendre = (ms = 80) => new Promise((r) => setTimeout(r, ms));
async function laisserFaire(n = 12) { for (let i = 0; i < n; i++) await respirer(); flushSync(); await attendre(); flushSync(); }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let debrancher: (() => void) | null = null;
let rectOriginal: typeof Element.prototype.getBoundingClientRect;
let scrollTopOriginal: PropertyDescriptor | undefined;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
  }
  // jsdom ne défile pas : `scrollTop` y vaut toujours 0. On le rend mémorisable.
  scrollTopOriginal = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  const defile = new WeakMap<Element, number>();
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    get(this: Element) { return defile.get(this) ?? 0; },
    set(this: Element, v: number) { defile.set(this, Math.max(0, Number(v) || 0)); },
  });
  rectOriginal = Element.prototype.getBoundingClientRect;
  // La case `i` à `i × 100` px du haut de la grille, décalée de ce qui a défilé.
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const i = this.getAttribute?.('data-i');
    const grille = this.closest?.('.grid') as HTMLElement | null;
    const top = i != null && grille ? Number(i) * 100 - grille.scrollTop : 0;
    return { top, left: 0, right: 0, bottom: top, width: 0, height: 0, x: 0, y: top, toJSON() {} } as DOMRect;
  };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const corps = corpsPour(String(url));
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  try { localStorage.clear(); } catch { /* sans stockage */ }
  activeView.set('home');
  pendingLibraryAlbum.set(null);
  pendingLibraryArtist.set(null);
  pendingLibraryYear.set(null);
  detailOuvert.set(null);
  history.replaceState(null, '', '/');
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = rectOriginal;
  if (scrollTopOriginal) Object.defineProperty(Element.prototype, 'scrollTop', scrollTopOriginal);
  debrancher?.();
  debrancher = null;
  demonter();
  albumsStore.set([]);
  activeView.set('home');
  detailOuvert.set(null);
  vi.unstubAllGlobals();
});

function demonter() {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
}

async function monterBibliotheque(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as never }) as Record<string, unknown>;
  await laisserFaire();
  return hote;
}

/** Bibliothèque montée sous la coquille, fiche de l'album de rang `rang` ouverte. */
async function ouvrirFicheLoin(rang: number): Promise<HTMLDivElement> {
  albumsStore.set(ALBUMS);
  debrancher = brancherHistoriqueCoquille();
  activeView.set('library');
  flushSync();
  const el = await monterBibliotheque();
  const carte = el.querySelector<HTMLElement>(`.grid [data-i="${rang}"]`);
  expect(carte, `case ${rang} absente de la grille — témoin sans objet`).not.toBeNull();
  const bouton = carte!.querySelector<HTMLButtonElement>('button.meta') ?? carte!.querySelector<HTMLButtonElement>('button');
  expect(bouton, 'vignette non cliquable').not.toBeNull();
  bouton!.click();
  await laisserFaire();
  expect(get(detailOuvert)).toBe(`album:${ALBUMS[rang].id}`);
  return el;
}

describe('web#2743 — la grille de la Bibliothèque, montée, après « Lecture en cours »', () => {
  it('🔴 Retour depuis Lecture en cours : la grille remontée défile jusqu’à l’album', async () => {
    await ouvrirFicheLoin(30);
    // « Lecture en cours » : la coquille démonte la Bibliothèque.
    activeView.set('nowplaying');
    await attendre();
    demonter();
    // Le Retour de l'écran : on RECULE, la coquille repose la fiche.
    const retour = new Promise<void>((r) => window.addEventListener('popstate', () => r(), { once: true }));
    retourDepuisLectureEnCours();
    await retour;
    await attendre();
    expect(get(activeView)).toBe('library');
    expect(get(detailOuvert)).toBe(`album:${ALBUMS[30].id}`);
    const el = await monterBibliotheque();
    const grille = el.querySelector<HTMLElement>('.grid');
    expect(grille).not.toBeNull();
    expect(grille!.scrollTop, 'la grille repart du début (#2743)').toBe(3000);
  });

  it('🔴 fiche → barre latérale vers une autre vue → Bibliothèque : la grille NE saute PAS (#3843)', async () => {
    await ouvrirFicheLoin(30);
    activeView.set('playlists');
    await attendre();
    demonter();
    activeView.set('library');
    await attendre();
    expect(get(detailOuvert)).toBeNull();
    const el = await monterBibliotheque();
    expect(el.querySelector<HTMLElement>('.grid')!.scrollTop, 'la grille a sauté sur l’ancien album').toBe(0);
  });
});

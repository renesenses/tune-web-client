// @vitest-environment jsdom
//
// #1314 — Jean Valjean, fil 1671, réponse 6538, 19/09/2026 :
//
//   « Lors de l'ouverture de la bibliothèque, la frise chronologique est mise
//     systématiquement sur l'année ayant le plus d'album. »
//
// 🔴 Ce témoin MONTE `LibraryV2` (niveau Intermédiaire, frise « Années »), lit
// l'année que porte le curseur, clique une année, DÉMONTE, remonte — une
// nouvelle ouverture — et relit le curseur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { preferences } from '../stores/preferences';
import { anneeDOuverture } from '../anneeDOuverture';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

// 1975 est l'année LA PLUS FOURNIE (3 albums) ; 1990 la plus récente.
const ALBUMS: Album[] = [
  { id: 1, title: 'A', artist_name: 'X', year: 1970 },
  { id: 2, title: 'B', artist_name: 'X', year: 1975 },
  { id: 3, title: 'C', artist_name: 'X', year: 1975 },
  { id: 4, title: 'D', artist_name: 'X', year: 1975 },
  { id: 5, title: 'E', artist_name: 'X', year: 1982 },
  { id: 6, title: 'F', artist_name: 'X', year: 1990 },
] as unknown as Album[];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler() { for (let i = 0; i < 12; i++) await respirer(); flushSync(); }

async function ouvrir(): Promise<HTMLDivElement> {
  localStorage.setItem('tune_v2_ecran_lib.nav', 'years');
  activeView.set('library');
  albumsStore.set([...ALBUMS]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as never });
  await souffler();
  return hote;
}
function fermer() {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
}
const curseur = (el: HTMLElement) => (el.querySelector('.frise .curseur')?.textContent ?? '').trim();
const cartes = (el: HTMLElement) => el.querySelectorAll('.grid .card').length;

beforeEach(() => {
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  localStorage.clear();
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}), text: async () => '{}',
  } as unknown as Response)));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
});

afterEach(() => {
  fermer();
  albumsStore.set([]);
  activeView.set('home');
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('#1314 — la frise ne rouvre plus sur l’année la plus fournie', () => {
  it('🔴 première ouverture : le curseur est sur l’année la plus récente, pas sur 1975', async () => {
    const el = await ouvrir();
    expect(el.querySelector('.frise'), 'la frise n’est pas à l’écran').toBeTruthy();
    expect(curseur(el), 'le curseur se pose encore sur l’année la plus fournie').not.toBe('1975');
    expect(curseur(el)).toBe('1990');
    // Un repère, pas un filtre : les six albums restent dans la grille.
    expect(cartes(el)).toBe(6);
  });

  it('🔴 l’année choisie est reprise à l’ouverture suivante, sans filtrer la grille', async () => {
    let el = await ouvrir();
    const t1982 = el.querySelector<HTMLButtonElement>('.frise .tick[aria-label^="1982"]');
    expect(t1982, 'le trait 1982 est absent').toBeTruthy();
    t1982!.click();
    await souffler();
    expect(curseur(el)).toBe('1982');
    fermer();

    el = await ouvrir();
    expect(curseur(el), 'la dernière année choisie est oubliée à la réouverture').toBe('1982');
    expect(el.querySelector('.frise .curseur.fige'), 'le repère ne doit pas figer de filtre').toBeNull();
    expect(cartes(el)).toBe(6);
  });
});

describe('anneeDOuverture — la règle, appelée', () => {
  const bars = [
    { year: 1970, n: 1 }, { year: 1971, n: 5 }, { year: 1972, n: 0 }, { year: 1973, n: 2 }, { year: 1974, n: 0 },
  ];
  it('le repère s’il est sur l’axe, sinon la dernière année qui porte un album', () => {
    expect(anneeDOuverture(bars, 1972)).toBe(1972);
    expect(anneeDOuverture(bars, null)).toBe(1973);
    expect(anneeDOuverture(bars, 2001)).toBe(1973);
    expect(anneeDOuverture([], 1972)).toBeNull();
  });
});

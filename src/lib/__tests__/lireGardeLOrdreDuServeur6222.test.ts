// @vitest-environment jsdom
//
// tune-server-rust#6222 (accompagne tune-server-rust#6609) — « Lire » sur une
// sélection de plusieurs albums garde, DANS chaque album, l'ordre que la fiche
// du serveur rend.
//
// Depuis #6609, un album d'un seul disque dont des pistes de titres différents
// partagent un numéro (compilation personnelle) est rendu par le serveur dans
// l'ordre naturel des chemins de fichier. `pistesDansLOrdre` retriait par
// disque puis numéro, et défaisait cet ordre.
//
// CONTRE-ÉPREUVE : sans le correctif (`pistesDansLOrdre` qui retrie toujours,
// ou `LibraryV2` qui ne lui passe pas `ordreDesFiches`), les blocs 🔴 rougissent :
// la compilation sort 1-A, 1-B, 2 au lieu de l'ordre des fichiers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { currentZoneId } from '../stores/zones';
import { locale } from '../i18n';
import { chargerPistesDesAlbums, pistesDansLOrdre } from '../porteeAleatoire';
import type { Album, Track } from '../types';

vi.setConfig({ testTimeout: 60_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

const ALBUMS: Album[] = [
  { id: 1, title: 'Blue compil', artist_name: 'Divers' },
  { id: 2, title: 'Blue album', artist_name: 'Monk' },
] as unknown as Album[];

const piste = (id: number, album_id: number, n: number, title: string, disc: number | null = 1): Track =>
  ({ id, title, album_id, disc_number: disc, track_number: n, artist_name: 'X' } as Track);

// Compilation personnelle : la fiche du serveur (#6609) la rend dans l'ordre
// des fichiers « 01 - A », « 02 - Z », « 03 - B » — numéros 1, 2, 1.
// Un tri par numéro donnerait A, B, Z (11, 13, 12).
const COMPIL: Track[] = [piste(11, 1, 1, 'A'), piste(12, 1, 2, 'Z'), piste(13, 1, 1, 'B')];
// Album normal : la fiche le rend par numéro.
const NORMAL: Track[] = [piste(21, 2, 1, 'Un'), piste(22, 2, 2, 'Deux'), piste(23, 2, 3, 'Trois')];
const FICHES: Record<number, Track[]> = { 1: COMPIL, 2: NORMAL };

describe('tune-server-rust#6222 — `pistesDansLOrdre` et l’ordre des fiches', () => {
  it('🔴 une compilation rendue 1-A, 2-Z, 1-B par le serveur reste dans cet ordre', () => {
    expect(pistesDansLOrdre([...COMPIL, ...NORMAL], [1, 2], 500, undefined, true))
      .toEqual([11, 12, 13, 21, 22, 23]);
  });
  it('une compilation rendue 1-A, 1-B, 2 reste dans cet ordre', () => {
    const rendue = [piste(31, 3, 1, 'A'), piste(32, 3, 1, 'B'), piste(33, 3, 2, 'C')];
    expect(pistesDansLOrdre(rendue, [3], 500, undefined, true)).toEqual([31, 32, 33]);
  });
  it('un album normal ne change pas, et l’ordre ENTRE albums reste celui de l’écran', () => {
    expect(pistesDansLOrdre([...COMPIL, ...NORMAL], [2, 1], 500, undefined, true))
      .toEqual([21, 22, 23, 11, 12, 13]);
    expect(pistesDansLOrdre([...NORMAL, ...COMPIL], [2, 1], 500)).toEqual([21, 22, 23, 11, 13, 12]);
  });
  it('même filtre à la piste et même plafond', () => {
    expect(pistesDansLOrdre(COMPIL, [1], 500, (t) => t.id !== 12, true)).toEqual([11, 13]);
    expect(pistesDansLOrdre(COMPIL, [1], 2, undefined, true)).toEqual([11, 12]);
  });
  it('sans fiches (bibliothèque entière), le tri par disque puis numéro tient', () => {
    const desordre = [piste(43, 4, 3, 'c'), piste(41, 4, 1, 'a'), piste(42, 4, 2, 'b')];
    expect(pistesDansLOrdre(desordre, [4], 500)).toEqual([41, 42, 43]);
  });
});

describe('tune-server-rust#6222 — `chargerPistesDesAlbums` dit d’où viennent les pistes', () => {
  const toutes = async () => [...NORMAL, ...COMPIL];
  it('fiche par fiche : ordreDesFiches', async () => {
    const parAlbums = async (ids: number[]) => ({ tracks: ids.flatMap((i) => FICHES[i]), failedAlbums: 0 });
    expect(await chargerPistesDesAlbums([1, 2], { parAlbums, toutes }))
      .toEqual({ pistes: [...COMPIL, ...NORMAL], ordreDesFiches: true });
  });
  it('au-delà du seuil, ou une fiche illisible : la bibliothèque, sans ordreDesFiches', async () => {
    const parAlbums = async () => ({ tracks: [], failedAlbums: 1 });
    expect((await chargerPistesDesAlbums([1, 2], { parAlbums, toutes })).ordreDesFiches).toBe(false);
    expect((await chargerPistesDesAlbums([1, 2], { parAlbums, toutes }, 1)).ordreDesFiches).toBe(false);
  });
});

let corpsLecture: unknown[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

function reponse(corps: unknown): Response {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

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

async function chercher(el: HTMLElement, texte: string): Promise<void> {
  const input = el.querySelector<HTMLInputElement>('.search input, input[placeholder]')!;
  input.value = texte;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  for (let i = 0; i < 8; i++) await respirer();
  flushSync();
}

beforeEach(() => {
  locale.set('fr');
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  currentZoneId.set(7);
  localStorage.clear();
  corpsLecture = [];
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, options?: RequestInit) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    const post = String(options?.method ?? 'GET').toUpperCase() === 'POST';
    if (post && /\/zones\/7\/play/.test(url)) {
      corpsLecture.push(JSON.parse(String(options?.body ?? '{}')));
      return reponse({ id: 7, name: 'Salon', state: 'playing' });
    }
    if (/\/library\/tracks(\?|$)/.test(url)) return reponse([...COMPIL, ...NORMAL]);
    const fiche = /\/library\/albums\/(\d+)\/tracks/.exec(url);
    if (fiche) return reponse(FICHES[Number(fiche[1])] ?? []);
    if (url.includes('/system/config')) return reponse({});
    if (/\/queue/.test(url)) return reponse({ tracks: [], position: 0, length: 0 });
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  albumsStore.set([]);
  currentZoneId.set(null);
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('tune-server-rust#6222 — « Lire » dans la Bibliothèque', () => {
  it('🔴 la sélection joue chaque album dans l’ordre de sa fiche', async () => {
    const el = await poserEcran();
    await chercher(el, 'blue');
    el.querySelector<HTMLButtonElement>('button[data-lire-selection]')!.click();
    for (let i = 0; i < 20; i++) await respirer();
    flushSync();
    expect(corpsLecture).toHaveLength(1);
    // Tri par titre : « Blue album » (2), puis « Blue compil » (1).
    expect(corpsLecture[0]).toEqual({ track_ids: [21, 22, 23, 11, 12, 13] });
  });
});

// @vitest-environment jsdom
//
// tune-server-rust#4521 — le tri « Dynamique » de la bibliothèque v2 ne
// s'allumait jamais.
//
// Mesuré sur le .18 le 19/09/2026 : `GET /library/albums` ne portait PAS
// `dynamic_range`. `LibraryV2` lit ce champ sur chaque album (`drNombre`) et
// ne propose le tri que si l'un d'eux en porte (`hasDr`) : sans le champ, le
// menu ne l'offrait jamais. Le correctif est SERVEUR (la liste porte désormais
// le DR de la fiche, chaîne, `null` sans DR) ; le client n'a rien à changer.
//
// Ce témoin fixe le contrat côté client, avec la forme EXACTE que sert la
// route corrigée : des chaînes (`'14'`, `'0'`) et des `null`.
//   - le tri paraît dès qu'un album porte un DR — `'0'` compris ;
//   - il ordonne du plus dynamique au plus écrasé, `'0'` à sa place de
//     mesure, les `null` en queue (jamais comptés comme DR 0) ;
//   - CONTRE-ÉPREUVE : une liste où tout est `null` ne l'offre pas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

const CLE_TRI = 'tune_v2_ecran_lib.sort';

// L'alphabet et le DR donnent deux ordres différents : un écran resté sur
// « Titre » ne pourrait pas passer pour trié par DR.
const SERVIE: Album[] = [
  { id: 1, title: 'Alpha', artist_name: 'X', year: 1975, dynamic_range: '8' },
  { id: 2, title: 'Beta', artist_name: 'X', year: 1975, dynamic_range: null },
  { id: 3, title: 'Charlie', artist_name: 'X', year: 1975, dynamic_range: '0' },
  { id: 4, title: 'Delta', artist_name: 'X', year: 1975, dynamic_range: '14' },
  { id: 5, title: 'Echo', artist_name: 'X', year: 1975, dynamic_range: null },
] as Album[];
const TITRES = SERVIE.map((a) => a.title);

const SANS_DR: Album[] = SERVIE.map((a) => ({ ...a, dynamic_range: null }));

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

async function poser(albums: Album[]): Promise<HTMLDivElement> {
  activeView.set('library');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as never });
  for (let i = 0; i < 12; i++) await respirer();
  albumsStore.set([...albums]);
  for (let i = 0; i < 14; i++) await respirer();
  flushSync();
  return hote;
}

const menuTri = (el: HTMLElement) =>
  [...el.querySelectorAll('.drop.right .menu button')].map((b) => (b.textContent ?? '').trim());
const libelleTri = (el: HTMLElement) =>
  (el.querySelector('.drop.right .chip')?.textContent ?? '').replace(/\s+/g, ' ').trim();
const ordreRendu = (el: HTMLElement) =>
  [...el.querySelectorAll('.grid .card .ct, .rows .lrow .ltt')]
    .map((n) => (n.textContent ?? '').trim())
    .filter((t) => TITRES.includes(t));

beforeEach(() => {
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}),
    text: async () => '{}',
  } as unknown as Response)));
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as never);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  albumsStore.set([]);
  libraryFolderScope.set(null);
  activeView.set('home');
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('tune-server-rust#4521 — le tri DR avec le champ que sert la liste', () => {
  it('le tri « Dynamique » est proposé dès qu’un album porte un DR', async () => {
    const el = await poser(SERVIE);
    expect(menuTri(el), 'le menu n’offre pas le tri par DR').toContain('Dynamique');
  });

  it('il ordonne du plus dynamique au plus écrasé — « 0 » est une mesure, null ferme la marche', async () => {
    const el = await poser(SERVIE);
    const bouton = [...el.querySelectorAll<HTMLButtonElement>('.drop.right .menu button')]
      .find((b) => (b.textContent ?? '').trim() === 'Dynamique');
    expect(bouton, 'entrée « Dynamique » absente').toBeTruthy();
    bouton!.click();
    for (let i = 0; i < 6; i++) await respirer();
    flushSync();
    expect(libelleTri(el)).toBe('Dynamique');
    expect(localStorage.getItem(CLE_TRI)).toBe('dr');
    expect(ordreRendu(el), 'ordre rendu faux').toEqual(['Delta', 'Alpha', 'Charlie', 'Beta', 'Echo']);
  });

  it('un seul album à « 0 » suffit à allumer le tri : 0 n’est pas une absence', async () => {
    const el = await poser(SANS_DR.map((a) => (a.id === 3 ? { ...a, dynamic_range: '0' } : a)));
    expect(menuTri(el)).toContain('Dynamique');
  });

  it('CONTRE-ÉPREUVE : une liste où tout est null n’offre pas le tri, et un choix retenu retombe sur « Titre »', async () => {
    localStorage.setItem(CLE_TRI, 'dr');
    const el = await poser(SANS_DR);
    expect(menuTri(el)).not.toContain('Dynamique');
    expect(libelleTri(el)).toBe('Titre');
  });
});

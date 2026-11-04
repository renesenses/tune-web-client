// @vitest-environment jsdom
// web#2644 — go de Bertrand du 04/11/2026 : avec le tri « Artiste », les
// albums d'un même artiste se rangent par date de sortie, du plus ancien au
// plus récent, et non plus par titre. Même clé que le tri « Date de sortie »
// (`release_date`, sinon `original_date`, sinon l'année). Un album sans date
// passe après les albums datés de son artiste, puis par titre.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { locale } from '../i18n';
import { comparerDatesDeSortie } from '../trierAlbums';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 60_000 });

const lire = (p: string) =>
  readFileSync(resolve(process.cwd(), p), 'utf-8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const album = (id: number, title: string, artist_name: string, d: Partial<Album>): Album =>
  ({ id, title, artist_name, ...d }) as Album;

/**
 * Un même artiste : trois albums datés (dont un à l'année seule, entre deux
 * datés au jour), et un album sans date dont le titre commence par « A » —
 * il passerait en tête si le titre départageait encore. Un deuxième artiste,
 * pour vérifier que l'ordre des artistes ne bouge pas.
 */
const ALBUMS: Album[] = [
  album(1, 'Wish You Were Here', 'Pink Floyd', { year: 1975, release_date: '1975-09-12' }),
  album(2, 'Animals', 'Pink Floyd', { year: 1977, release_date: '1977-01-23' }),
  album(3, 'Atom Heart Mother', 'Pink Floyd', {}),
  album(4, 'The Dark Side of the Moon', 'Pink Floyd', { year: 1973, release_date: '1973-03-01' }),
  album(5, 'Meddle', 'Pink Floyd', { year: 1971 }),
  album(6, 'Zuma', 'Neil Young', { year: 1975 }),
  album(7, 'Harvest', 'Neil Young', { year: 1972, release_date: '1972-02-01' }),
];

const ATTENDU = [
  'Harvest', 'Zuma',
  'Meddle', 'The Dark Side of the Moon', 'Wish You Were Here', 'Animals', 'Atom Heart Mother',
];

describe('web#2644 — le départage par date de sortie', () => {
  it('le plus ancien d’abord, sans date en dernier, deux sans date à égalité', () => {
    const [wish, animals, atom, , meddle] = ALBUMS;
    expect(comparerDatesDeSortie(meddle, wish)).toBeLessThan(0);
    expect(comparerDatesDeSortie(animals, wish)).toBeGreaterThan(0);
    expect(comparerDatesDeSortie(atom, animals)).toBeGreaterThan(0);
    expect(comparerDatesDeSortie(animals, atom)).toBeLessThan(0);
    expect(comparerDatesDeSortie(atom, album(9, 'B', 'Pink Floyd', {}))).toBe(0);
  });

  it('🔴 le tri « Artiste » de la Bibliothèque départage par date, puis par titre', () => {
    const src = lire('src/components/v2/LibraryV2.svelte');
    expect(src).toMatch(
      /case 'artist':\s*return list\.sort\(\(a, b\) =>\s*comparerAlphabetique\(a\.artist_name, b\.artist_name\) \|\| comparerDatesDeSortie\(a, b\) \|\| byTitle\(a, b\),/,
    );
  });
});

// ── Le vrai écran : choisir « Artiste » dans le menu de tri, lire la grille.
class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}
const respirer = () => new Promise((r) => setTimeout(r, 0));

describe('web#2644 — la Bibliothèque montée', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, unknown> | null = null;

  beforeEach(() => {
    locale.set('fr');
    activeView.set('home');
    libraryFolderScope.set(null);
    albumsStore.set([]);
    localStorage.clear();
    vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => [], text: async () => '[]',
    } as unknown as Response)));
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

  it('🔴 « Artiste » range les albums d’un artiste du plus ancien au plus récent, sans date en dernier', async () => {
    activeView.set('library');
    albumsStore.set([...ALBUMS]);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(LibraryV2, { target: hote, props: {} as never });
    for (let i = 0; i < 14; i++) await respirer();
    flushSync();
    const entrees = [...hote.querySelectorAll<HTMLButtonElement>('.drop.right .menu button')];
    const b = entrees.find((x) => (x.textContent ?? '').trim() === 'Artiste');
    expect(b, `menu : ${entrees.map((x) => (x.textContent ?? '').trim()).join(' | ')}`).toBeTruthy();
    b!.click();
    for (let i = 0; i < 6; i++) await respirer();
    flushSync();
    const grille = [...hote.querySelectorAll('.body .grid .card .ct')].map((n) => (n.textContent ?? '').trim());
    expect(grille).toEqual(ATTENDU);
  });
});

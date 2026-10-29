// @vitest-environment jsdom
// web#2206 — Jean Valjean, fil 2300 (15/10/2026) : « Serait-il possible
// d'avoir un tri par date de sortie dans la bibliothèque pour l'onglet
// Albums ? » Go de Bertrand du 19/10/2026.
//
// La date complète si elle est connue (`release_date`, sinon `original_date`),
// sinon l'année : la règle des autres tris d'albums (`trierAlbums` — recherche,
// fiche artiste —, et le serveur pour les dossiers), pour qu'un album se range
// au même endroit partout. Le serveur (même issue) remplit enfin
// `release_date` depuis la balise DATE / TDRC quand elle porte un mois.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { locale } from '../i18n';
import { trierAlbums } from '../trierAlbums';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 60_000 });

const lire = (p: string) =>
  readFileSync(resolve(process.cwd(), p), 'utf-8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const album = (id: number, title: string, d: Partial<Album>): Album =>
  ({ id, title, artist_name: 'X', ...d }) as Album;

/** Trois albums de 1975 : deux datés au jour, un à l'année seule. */
const ALBUMS: Album[] = [
  album(1, 'Wish You Were Here', { year: 1975, release_date: '1975-09-12' }),
  album(2, 'A Night at the Opera', { year: 1975, release_date: '1975-11-21' }),
  album(3, 'Physical Graffiti', { year: 1975 }),
  album(4, 'Animals', { year: 1977, release_date: '1977-01-23' }),
  album(5, 'Sans date', {}),
  // Réédition sans date d'édition : la date ORIGINALE la place.
  album(6, 'Blue', { year: 1997, original_date: '1971-06-22' }),
];

describe('web#2206 — le tri « Date de sortie » de la Bibliothèque', () => {
  it('🔴 est une clé de tri de l’onglet Albums, au libellé déjà traduit dans les douze langues', () => {
    const src = lire('src/components/v2/LibraryV2.svelte');
    expect(src).toMatch(/type SortKey = [^;]*'release_date'/);
    expect(src).toContain("{ k: 'release_date', l: 'library.sortReleaseDate' }");
    // Le MÊME tri que la recherche et la fiche artiste, plus récent d'abord
    // par défaut comme l'année.
    expect(src).toContain("case 'release_date':");
    expect(src).toContain("return trierAlbums(list, 'release_date', ordreAnnee);");
  });

  it('range au jour quand la date est connue, à l’année sinon ; sans date en dernier', () => {
    const titres = (sens: 'asc' | 'desc') => trierAlbums(ALBUMS, 'release_date', sens).map((a) => a.title);
    expect(titres('desc')).toEqual([
      'Animals', 'A Night at the Opera', 'Wish You Were Here', 'Physical Graffiti', 'Blue', 'Sans date',
    ]);
    expect(titres('asc')).toEqual([
      'Blue', 'Physical Graffiti', 'Wish You Were Here', 'A Night at the Opera', 'Animals', 'Sans date',
    ]);
  });

  it('est aussi offert dans une collection intelligente ouverte (« partout où un tri d’albums existe »)', () => {
    const src = lire('src/components/v2/CollectionsV2.svelte');
    expect(src).toContain("const TRIS_SMART = ['regles', 'artist', 'title', 'year', 'release_date', 'random'] as const;");
    expect(src).toContain("release_date: 'library.sortReleaseDate',");
    // Les dossiers (collections simples), la recherche et la fiche artiste
    // l'avaient déjà.
    expect(src).toContain("const TRIS_ALBUMS = ['artist', 'title', 'year', 'release_date', 'added_at', 'random'] as const;");
    expect(lire('src/components/v2/DiscographieCommune.svelte')).toContain("'release_date'");
  });
});

// ── Le vrai écran : ouvrir le menu de tri, choisir « Date de sortie », lire la grille.
class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}
const respirer = () => new Promise((r) => setTimeout(r, 0));

describe('web#2206 — la Bibliothèque montée', () => {
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

  it('🔴 « Date de sortie » est dans le menu, et range la grille au jour près', async () => {
    activeView.set('library');
    albumsStore.set([...ALBUMS]);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(LibraryV2, { target: hote, props: {} as never });
    for (let i = 0; i < 14; i++) await respirer();
    flushSync();
    const entrees = [...hote.querySelectorAll<HTMLButtonElement>('.drop.right .menu button')];
    const b = entrees.find((x) => (x.textContent ?? '').trim() === 'Date de sortie');
    expect(b, `menu : ${entrees.map((x) => (x.textContent ?? '').trim()).join(' | ')}`).toBeTruthy();
    b!.click();
    for (let i = 0; i < 6; i++) await respirer();
    flushSync();
    const grille = [...hote.querySelectorAll('.body .grid .card .ct')].map((n) => (n.textContent ?? '').trim());
    expect(grille).toEqual([
      'Animals', 'A Night at the Opera', 'Wish You Were Here', 'Physical Graffiti', 'Blue', 'Sans date',
    ]);
  });
});

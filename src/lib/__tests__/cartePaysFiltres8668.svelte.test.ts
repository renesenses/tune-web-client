// @vitest-environment jsdom
/**
 * tune-server-rust#8668 — la carte des pays compte sous les MÊMES filtres que
 * la grille. Au .18, avec Source · QOBUZ, elle annonçait « États-Unis 20
 * albums » (toute la bibliothèque) et le clic montrait 0.
 *
 * - `agregerPaysDesAlbums` croise le pays de chaque album avec les albums retenus ;
 * - la carte lit `GET /library/album-countries` quand l'écran lui passe ses
 *   albums retenus, et retombe sur les facettes (en le disant) devant un
 *   serveur sans la route ;
 * - dans la Bibliothèque, une recherche posée resserre les comptes de la carte.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import CartePaysBibliothequeV2 from '../../components/v2/CartePaysBibliothequeV2.svelte';
import EnTeteArtiste from '../../components/v2/EnTeteArtiste.svelte';
import { agregerPaysDesAlbums, drapeauPays } from '../bibliothequePays';
import { albums, libraryLoading, libraryFolderScope } from '../stores/library';
import { activeView, pendingLibraryFiltre } from '../stores/navigation';
import { locale } from '../i18n';

let hote: HTMLDivElement;
let montes: Record<string, any>[] = [];
let appels: string[];
/** `false` : serveur sans `/library/album-countries` (rc12 d'avant #8668). */
let avecRoute: boolean;

const json = (corps: unknown) => new Response(JSON.stringify(corps), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});

function route(url: string): unknown {
  const u = new URL(url, 'http://localhost');
  if (u.pathname.endsWith('/library/album-countries')) {
    if (!avecRoute) return [];
    return u.searchParams.get('source') === 'release'
      ? { source: 'release', albums: [[1, 'fr'], [1, 'FR'], [2, 'XE'], [3, 'JP']] }
      : { source: 'artist', albums: [[1, 'US'], [2, 'US'], [3, 'JP']] };
  }
  if (u.pathname.endsWith('/library/facets')) {
    // Toute la bibliothèque : ce que la carte montrait avant #8668.
    return { artist_country: [{ value: 'US', count: 20 }, { value: 'JP', count: 10 }] };
  }
  if (u.pathname.endsWith('/library/albums-detailed')) return { items: [], total: 0 };
  return [];
}

async function stabiliser() {
  for (let i = 0; i < 10; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
function poser(C: any, props: Record<string, unknown>) {
  const m = mount(C, { target: hote, props: props as any });
  montes.push(m);
  flushSync();
  return m;
}
const codes = () => [...hote.querySelectorAll<HTMLElement>('[data-pays]')].map((b) => b.dataset.pays);
const texte = (code: string) => hote.querySelector(`[data-pays="${code}"]`)?.textContent ?? '';

beforeEach(() => {
  locale.set('fr');
  appels = [];
  avecRoute = true;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { appels.push(String(url)); return json(route(String(url))); }));
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
});
afterEach(() => {
  for (const m of montes) { try { unmount(m); } catch { /* déjà démonté */ } }
  montes = [];
  hote.remove();
  albums.set([] as any);
  vi.unstubAllGlobals();
});

describe('#8668 — agregerPaysDesAlbums', () => {
  it('ne compte que les albums retenus, une fois par pays, casses réunies', () => {
    const paires: [number, string][] = [[1, 'fr'], [1, 'FR'], [2, 'FR'], [3, 'XE'], [4, 'JP'], [5, 'XW'], [5, 'DE']];
    const a = agregerPaysDesAlbums(paires, new Set([1, 3, 4, 5]), 'edition');
    expect(a.unite).toBe('albums');
    expect(a.pays.map((p) => [p.code, p.n])).toEqual([['DE', 1], ['FR', 1], ['JP', 1]]);
    expect(a.pays.find((p) => p.code === 'FR')).toMatchObject({ valeurs: ['fr', 'FR'], filtre: 'country' });
    // 3 n'a que XE : hors carte ; 5 a aussi DE : sur la carte.
    expect(a.horsCarte).toBe(1);
    expect(a.max).toBe(1);
    expect(agregerPaysDesAlbums(paires, new Set(), 'artiste').pays).toEqual([]);
    expect(agregerPaysDesAlbums([[7, 'GB']], new Set([7]), 'artiste').pays[0].filtre).toBe('artist_country');
  });
});

describe('#8668 — la carte compte parmi les albums retenus', () => {
  it('avec la route : comptes croisés, et la note le dit quand un filtre est posé', async () => {
    poser(CartePaysBibliothequeV2, { retenus: new Set([1, 3]), filtresPoses: true, onChoisir: () => {} });
    await stabiliser();
    expect(appels.some((u) => u.includes('/library/album-countries?source=artist'))).toBe(true);
    expect(appels.some((u) => u.includes('/library/facets')), 'facettes lues à tort').toBe(false);
    expect(codes()).toEqual(['JP', 'US']);
    expect(texte('US')).toContain('1 album');
    expect(hote.querySelector('[data-carte-filtres]')!.getAttribute('data-carte-filtres')).toBe('suivis');
    // Le choix artiste / édition reste offert.
    hote.querySelector<HTMLButtonElement>('[data-carte-source-edition]')!.click();
    await stabiliser();
    expect(appels.some((u) => u.includes('/library/album-countries?source=release'))).toBe(true);
    expect(codes()).toEqual(['FR', 'JP']);
    expect(texte('FR')).toContain('1 album');
  });

  it('aucun album retenu : la carte vide, pas les 20 albums de toute la bibliothèque', async () => {
    poser(CartePaysBibliothequeV2, { retenus: new Set<number>(), filtresPoses: true, onChoisir: () => {} });
    await stabiliser();
    expect(codes()).toEqual([]);
    expect(hote.querySelector('[data-carte-vide]')).not.toBeNull();
  });

  it('serveur sans la route : facettes, et la note dit que les filtres ne s’appliquent pas', async () => {
    avecRoute = false;
    poser(CartePaysBibliothequeV2, { retenus: new Set([1]), filtresPoses: true, onChoisir: () => {} });
    await stabiliser();
    expect(codes()).toEqual(['US', 'JP']);
    expect(texte('US')).toContain('20 albums');
    expect(hote.querySelector('[data-carte-filtres]')!.getAttribute('data-carte-filtres')).toBe('ignores');
  });

  it('sans filtre posé : pas de note', async () => {
    poser(CartePaysBibliothequeV2, { retenus: new Set([1, 2, 3]), onChoisir: () => {} });
    await stabiliser();
    expect(texte('US')).toContain('2 albums');
    expect(hote.querySelector('[data-carte-filtres]')).toBeNull();
  });
});

describe('#8668 — dans la Bibliothèque', () => {
  it('une recherche posée resserre les comptes de la carte', { timeout: 30000 }, async () => {
    activeView.set('library');
    libraryFolderScope.set(null as any);
    libraryLoading.set(false);
    albums.set([
      { id: 1, title: 'Paris-Un', artist_name: 'A', year: 2000, cover_path: null, source: 'local' },
      { id: 2, title: 'Berlin-Deux', artist_name: 'B', year: 2001, cover_path: null, source: 'local' },
      { id: 3, title: 'Tokyo-Trois', artist_name: 'C', year: 2002, cover_path: null, source: 'local' },
    ] as any);
    poser(LibraryV2, {});
    await stabiliser();
    hote.querySelector<HTMLButtonElement>('[data-carte-pays-puce]')!.click();
    await stabiliser();
    expect(codes()).toEqual(['US', 'JP']);
    expect(texte('US')).toContain('2 albums');
    const champ = hote.querySelector<HTMLInputElement>('input[aria-keyshortcuts="/"]')!;
    champ.value = 'Tokyo';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    await stabiliser();
    expect(codes()).toEqual(['JP']);
    expect(texte('JP')).toContain('1 album');
    expect(hote.querySelector('[data-carte-filtres]')!.getAttribute('data-carte-filtres')).toBe('suivis');
  });
});

describe('#8668 — le pays sur la fiche artiste', () => {
  it('nom traduit et drapeau, cliquable ; rien si inconnu ou hors carte', async () => {
    expect(drapeauPays('fr')).toBe('\u{1F1EB}\u{1F1F7}');
    expect(drapeauPays('XE')).toBe('');
    const clics: string[] = [];
    poser(EnTeteArtiste, { nom: 'Jean-Louis Murat', pays: 'fr', onPays: (c: string) => clics.push(c), onRetour: () => {} });
    const b = hote.querySelector<HTMLButtonElement>('[data-pays-artiste]')!;
    expect(b.dataset.paysArtiste).toBe('FR');
    expect(b.textContent).toContain('France');
    b.click();
    expect(clics).toEqual(['FR']);
    for (const pays of [null, '', 'XE']) {
      hote.innerHTML = '';
      poser(EnTeteArtiste, { nom: 'X', pays, onPays: () => {}, onRetour: () => {} });
      expect(hote.querySelector('[data-pays-artiste]'), String(pays)).toBeNull();
    }
  });

  it('le pays demandé par la fiche filtre la Bibliothèque sur le pays de l’artiste', { timeout: 30000 }, async () => {
    activeView.set('library');
    libraryFolderScope.set(null as any);
    libraryLoading.set(false);
    albums.set([
      { id: 1, title: 'Paris-Un', artist_name: 'A', year: 2000, cover_path: null, source: 'local' },
    ] as any);
    poser(LibraryV2, {});
    await stabiliser();
    pendingLibraryFiltre.set({ paysArtiste: 'FR' });
    await stabiliser();
    const req = appels.find((u) => u.includes('/library/albums-detailed') && u.includes('artist_country=FR'));
    expect(req, 'aucun appel albums-detailed?artist_country=FR').toBeDefined();
    expect(hote.querySelector('[data-carte-pays]')).not.toBeNull();
  });
});

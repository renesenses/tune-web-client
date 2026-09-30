// @vitest-environment jsdom
//
// #1772 — décision de Bertrand du 29/09/2026 : la grille Bibliothèque ›
// Artistes trie sur `sort_name` quand il existe, sinon sur `name`, comme le
// serveur média (`trier_artistes`, tune-server-rust#4956). Le rail A–Z suit
// la même clé.
//
// `/library/artists` rend bien `sort_name` : la route sérialise le modèle
// `Artist` entier (`tune-core/src/db/models.rs`), et `ArtistRepo` le lit
// (`COLS` de `artist_repo.rs`).
//
// 🔴 Le témoin du composant MONTE la vraie grille et lit l'ordre des cartes
// et leurs ancres `data-lettre` dans le DOM rendu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ArtistesV2 from '../../components/v2/ArtistesV2.svelte';
import { cleDeTriArtiste, comparerArtistes } from '../ordreAlphabetique';

vi.setConfig({ testTimeout: 30_000 });

const ARTISTES = [
  { id: 1, name: 'The Beatles', sort_name: 'Beatles, The' },
  { id: 2, name: 'Coldplay', sort_name: null },
  { id: 3, name: 'Abba' },
  { id: 4, name: 'The Cure', sort_name: '   ' },
  { id: 5, name: 'Zappa', sort_name: 'Zappa, Frank' },
];
const ATTENDU = ['Abba', 'The Beatles', 'Coldplay', 'The Cure', 'Zappa'];

describe('clé de tri des artistes (#1772)', () => {
  it('« The Beatles » avec le nom de tri « Beatles, The » est rangé à B', () => {
    expect(cleDeTriArtiste(ARTISTES[0])).toBe('Beatles, The');
    expect([...ARTISTES].sort(comparerArtistes).map((a) => a.name)).toEqual(ATTENDU);
  });

  it('sans nom de tri (absent, null ou blanc), le nom sert de clé', () => {
    expect(cleDeTriArtiste({ name: 'Coldplay', sort_name: null })).toBe('Coldplay');
    expect(cleDeTriArtiste({ name: 'Abba' })).toBe('Abba');
    expect(cleDeTriArtiste({ name: 'The Cure', sort_name: '   ' })).toBe('The Cure');
  });

  it("à clé égale, l'identifiant départage", () => {
    const v = [{ id: 9, name: 'X' }, { id: 2, name: 'X' }];
    expect(v.sort(comparerArtistes).map((a) => a.id)).toEqual([2, 9]);
  });
});

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/library\/artists(\?|$)/.test(u)) return reponse({ items: ARTISTES, total: ARTISTES.length });
    return reponse(/\/(sources|albums|tracks|favorites)/.test(u) ? [] : {});
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function jusqua(condition: () => boolean, borne = 8000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition() || Date.now() >= fin) return;
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe('grille Bibliothèque › Artistes (#1772)', () => {
  it('range les cartes sur le nom de tri, et le rail suit la même clé', async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ArtistesV2, { target: hote, props: { q: '' } });
    const cartes = () => [...hote!.querySelectorAll<HTMLElement>('.grille.artistes .carte')];
    await jusqua(() => cartes().length >= ARTISTES.length);

    expect(cartes().map((c) => c.querySelector('.ct')?.textContent?.trim())).toEqual(ATTENDU);
    // Une ancre par PREMIÈRE carte de chaque lettre : « The Beatles » ouvre
    // le B, « The Cure » (sans nom de tri) est sous T.
    const ancres = cartes()
      .filter((c) => c.dataset.lettre)
      .map((c) => [c.dataset.lettre, c.querySelector('.ct')?.textContent?.trim()]);
    expect(ancres).toEqual([
      ['A', 'Abba'], ['B', 'The Beatles'], ['C', 'Coldplay'], ['T', 'The Cure'], ['Z', 'Zappa'],
    ]);
  });
});

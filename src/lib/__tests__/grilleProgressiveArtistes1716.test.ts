// @vitest-environment jsdom
//
// web#1716, fil 2256 (Bilou : 1 295 artistes, onglet Artistes à 5-6 s) — la
// grille Bibliothèque › Artistes ne monte plus toutes ses cartes d'un coup.
//
// Mesuré le 13/10/2026 (Chromium sans tête, base de test) : une tâche de
// 1,0-1,25 s pour 1 295 artistes, de 4,3-5,0 s pour 4 000, avant la première
// carte. Le coût est le MONTAGE des composants, que `content-visibility`
// n'évite pas.
//
// 🔴 Le témoin MONTE la vraie grille avec 1 000 artistes et lit le DOM.
// Contre-épreuve : `{#each visibles …}` remis à `{#each affiches …}` →
// « une tranche à l'ouverture » échoue (1 000 cartes montées).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ArtistesV2 from '../../components/v2/ArtistesV2.svelte';
import { TRANCHE_GRILLE, trancheSuivante, montageJusqua, premierIndex } from '../grilleProgressive';

vi.setConfig({ testTimeout: 30_000 });

const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
// 1 000 artistes, ~38 par lettre : « Z… » arrive bien après la première tranche.
const ARTISTES = Array.from({ length: 1000 }, (_, i) => ({
  id: i + 1,
  name: `${LETTRES[i % 26]}rtiste ${String(i).padStart(4, '0')}`,
}));

describe('grilleProgressive — le compte de cartes à monter', () => {
  it('une tranche de plus, sans dépasser la liste', () => {
    expect(trancheSuivante(120, 1000)).toBe(240);
    expect(trancheSuivante(960, 1000)).toBe(1000);
    expect(trancheSuivante(0, 50)).toBe(50);
  });
  it('jusqu’à un index, plus une tranche dessous ; jamais moins que monté', () => {
    expect(montageJusqua(500, 120, 1000)).toBe(500 + 1 + TRANCHE_GRILLE);
    expect(montageJusqua(10, 400, 1000)).toBe(400);
    expect(montageJusqua(990, 120, 1000)).toBe(1000);
    expect(montageJusqua(-1, 120, 1000)).toBe(120);
  });
  it('premier index d’une clé', () => {
    expect(premierIndex(['a', 'b', 'b'], (x) => x, 'b')).toBe(1);
    expect(premierIndex(['a'], (x) => x, 'z')).toBe(-1);
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
let rappelsIO: ((e: { isIntersecting: boolean }[]) => void)[] = [];

beforeEach(() => {
  rappelsIO = [];
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
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb: (e: { isIntersecting: boolean }[]) => void) { rappelsIO.push(cb); }
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof IntersectionObserver);
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

function monter() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ArtistesV2, { target: hote, props: { q: '' } });
}
const cartes = () => [...hote!.querySelectorAll<HTMLElement>('.grille.artistes .carte')];

describe('grille Bibliothèque › Artistes progressive (web#1716)', () => {
  it('une tranche à l’ouverture, pas la liste entière', async () => {
    monter();
    await jusqua(() => cartes().length > 0);
    await new Promise((r) => setTimeout(r, 50));
    flushSync();
    expect(cartes().length).toBe(TRANCHE_GRILLE);
    // Le rail connaît toujours TOUTES les lettres, montées ou non.
    const z = [...hote!.querySelectorAll<HTMLButtonElement>('.rail button')].find((b) => b.textContent === 'Z');
    expect(z?.disabled).toBe(false);
  });

  it('la sentinelle du bas monte la suite', async () => {
    monter();
    await jusqua(() => cartes().length > 0);
    expect(rappelsIO.length).toBeGreaterThan(0);
    rappelsIO.at(-1)!([{ isIntersecting: true }]);
    await jusqua(() => cartes().length > TRANCHE_GRILLE);
    expect(cartes().length).toBeGreaterThan(TRANCHE_GRILLE);
  });

  it('le rail monte jusqu’à la lettre visée avant de sauter', async () => {
    monter();
    await jusqua(() => cartes().length > 0);
    expect(hote!.querySelector('[data-lettre="Z"]')).toBeNull();
    const z = [...hote!.querySelectorAll<HTMLButtonElement>('.rail button')].find((b) => b.textContent === 'Z')!;
    z.click();
    await jusqua(() => hote!.querySelector('[data-lettre="Z"]') != null);
    expect(hote!.querySelector('[data-lettre="Z"] .ct')?.textContent?.trim()).toBe('Zrtiste 0025');
  });
});

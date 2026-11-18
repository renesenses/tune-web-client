// @vitest-environment jsdom
// web#3177 — Didier, fil 2656, 17/11/2026 (rc12) : « le classement
// alphabétique ne me semble pas marcher […] pourquoi il semble y avoir 2
// classements ». `parNom()` triait avec `localeCompare` : les noms à
// pictogramme (🎧, 🎻, 💿…) passaient avant les lettres, et 🆕 (U+1F195,
// décomposition « NEW ») se rangeait à N. Le rail n'allumait que A, M, U.
// La règle commune `comparerAlphabetique` ignore les signes de tête.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import CollectionsV2 from '../../components/v2/CollectionsV2.svelte';
import { dialogs } from '../stores/dialogs';
import { preferences } from '../stores/preferences';

// Les noms de la capture de Didier (fil 2656), dans le désordre.
const NOMS = [
  'Ultravox', '🆕 Très récents', '🎻 Classique', 'Album double', '🎧 Electronic', '🕺 Soul & Funk',
  '🎵 Blues', 'Multichannel', '💿 SACD / DSD', '🎷 Jazz', '🆕 Récents', '🎸 Rock', '🎺 Pop',
];
const COLLECTIONS = NOMS.map((name, i) => ({
  id: i + 1, name, description: null, album_ids: [], covers: [], created_at: '2026-01-01T00:00:00Z',
}));

function corps(chemin: string): unknown {
  if (/\/smart-collections\/\d+\/albums/.test(chemin)) return [];
  if (chemin.includes('/smart-collections')) return [];
  if (/\/collections\/\d+\/albums/.test(chemin)) return [];
  if (chemin.endsWith('/library/collections')) return COLLECTIONS;
  return [];
}

class Inerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  localStorage.clear();
  preferences.update((p) => ({ ...p, ordreManuelCollections: { smart: [], normale: [] } }));
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const brut = String(typeof url === 'string' ? url : url?.url ?? '');
    const c = corps(brut.replace(/^https?:\/\/[^/]+/, '').split('?')[0]);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => c,
      text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});

afterEach(() => {
  for (const r of get(dialogs)) dialogs.settle(r.id, false);
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function tourner(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function attendreQue(condition: () => boolean, tours = 400): Promise<boolean> {
  for (let i = 0; i < tours; i++) {
    if (condition()) return true;
    await new Promise((r) => setTimeout(r, 5));
    flushSync();
  }
  return condition();
}

/** L'écran, sur l'onglet « Collections » (les simples), liste chargée. */
async function poserSurLesSimples(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CollectionsV2, { target: hote, props: {} as any });
  flushSync();
  await tourner();
  const onglets = Array.from(hote.querySelectorAll<HTMLButtonElement>('nav.tabs button.tab'));
  onglets[1].click();
  await tourner();
  await attendreQue(() => hote!.querySelectorAll('.grid .card').length === NOMS.length);
  return hote;
}

const ordreAffiche = (r: HTMLElement) =>
  [...r.querySelectorAll('.grid .card .ct')].map((n) => (n.textContent ?? '').trim());


const lettresAllumees = (r: HTMLElement) =>
  [...r.querySelectorAll<HTMLButtonElement>('.aveclettres .rail button.rl')].filter((b) => !b.disabled).map((b) => b.textContent);

describe('web#3177 — tri A → Z des collections à pictogramme', () => {
  it('A → Z : rangées sur leur nom, sans le pictogramme de tête', async () => {
    const r = await poserSurLesSimples();
    expect(ordreAffiche(r)).toEqual([
      'Album double', '🎵 Blues', '🎻 Classique', '🎧 Electronic', '🎷 Jazz', 'Multichannel', '🎺 Pop',
      '🆕 Récents', '🎸 Rock', '💿 SACD / DSD', '🕺 Soul & Funk', '🆕 Très récents', 'Ultravox',
    ]);
  });

  it('Z → A : l’ordre inverse exact', async () => {
    localStorage.setItem('tune_v2_ecran_v2.collections.tri', 'alphaInverse');
    const r = await poserSurLesSimples();
    expect(ordreAffiche(r)).toEqual([
      'Ultravox', '🆕 Très récents', '🕺 Soul & Funk', '💿 SACD / DSD', '🎸 Rock', '🆕 Récents', '🎺 Pop',
      'Multichannel', '🎷 Jazz', '🎧 Electronic', '🎻 Classique', '🎵 Blues', 'Album double',
    ]);
  });

  it('le rail allume la lettre du nom, pas « # » ; chaque carte porte sa lettre', async () => {
    const r = await poserSurLesSimples();
    expect(lettresAllumees(r)).toEqual(['A', 'B', 'C', 'E', 'J', 'M', 'P', 'R', 'S', 'T', 'U']);
    const carte = [...r.querySelectorAll<HTMLElement>('.grid .card')].find((c) => c.textContent?.includes('Electronic'));
    expect(carte?.getAttribute('data-lettre')).toBe('E');
  });
});

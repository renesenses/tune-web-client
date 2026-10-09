// @vitest-environment jsdom
//
// #5402 — « Ajouts récents » : une bascule trie par date de modification (le
// tri historique, par défaut) ou par date de création.
//
// Le test MONTE l'écran et lit le DOM rendu et les URL appelées :
//   * serveur à jour : la bascule est là, le tri par défaut n'envoie AUCUN
//     paramètre, « Date de création » envoie `tri=creation`, et les pistes
//     sans date de création sont dites ;
//   * serveur antérieur (résumé sans `tri`) : pas de bascule, aucune URL
//     nouvelle.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { locale } from '../i18n';
import AjoutsRecentsV2 from '../../components/v2/AjoutsRecentsV2.svelte';

class Inerte { observe() {} unobserve() {} disconnect() {} }

const PAR_MODIFICATION = [
  { id: 1, title: 'Alpha', artist_name: 'A', cover_path: null },
  { id: 2, title: 'Bravo', artist_name: 'B', cover_path: null },
];
const PAR_CREATION = [
  { id: 2, title: 'Bravo', artist_name: 'B', cover_path: null },
  { id: 1, title: 'Alpha', artist_name: 'A', cover_path: null },
];
const resume = (tri?: string, sans = 0) => ({
  days: 15, album_count: 2, track_count: 2, duration_ms: 120_000, duration_seconds: 120,
  ...(tri ? { tri, tracks_without_creation_date: sans } : {}),
});

let requetes: string[] = [];
let serveurAJour = true;
let sansCreation = 2;
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function corps(url: string): unknown {
  const creation = serveurAJour && url.includes('tri=creation');
  if (url.includes('/home/recently-added/summary')) {
    if (!serveurAJour) return resume();
    return creation ? resume('creation', sansCreation) : resume('modification', 0);
  }
  if (url.includes('/home/recently-added')) return creation ? PAR_CREATION : PAR_MODIFICATION;
  return [];
}

beforeEach(() => {
  requetes = [];
  serveurAJour = true;
  sansCreation = 2;
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('fetch', vi.fn(async (u: any) => {
    const url = String(typeof u === 'string' ? u : u?.url ?? '');
    requetes.push(url);
    const c = corps(url);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => c,
      text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function respirer(tours = 12) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AjoutsRecentsV2, { target: hote, props: { onOuvrir: () => {} } as any });
  await respirer();
  return hote;
}

const titres = (el: HTMLElement) =>
  [...el.querySelectorAll('.carte .titre')].map((n) => (n.textContent ?? '').trim());
const boutonsTri = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('.tris button')];

describe('#5402 — tri des ajouts récents par date de création', () => {
  it('🔴 serveur à jour : la bascule est là, et le tri par défaut garde les URL d’avant', async () => {
    const el = await poser();
    expect(boutonsTri(el).map((b) => b.textContent?.trim()))
      .toEqual(['Date de modification', 'Date de création']);
    expect(boutonsTri(el)[0].getAttribute('aria-pressed')).toBe('true');
    expect(titres(el)).toEqual(['Alpha', 'Bravo']);
    expect(requetes.length).toBeGreaterThan(0);
    expect(requetes.every((u) => !u.includes('tri='))).toBe(true);
    expect(el.querySelector('.repli')).toBeNull();
  });

  it('🔴 « Date de création » envoie `tri=creation`, réordonne, et dit le repli', async () => {
    const el = await poser();
    requetes = [];
    boutonsTri(el)[1].click();
    await respirer();
    expect(requetes.some((u) => u.includes('/home/recently-added?') && u.includes('tri=creation'))).toBe(true);
    expect(requetes.some((u) => u.includes('/summary') && u.includes('tri=creation'))).toBe(true);
    expect(titres(el)).toEqual(['Bravo', 'Alpha']);
    expect(boutonsTri(el)[1].getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.repli')?.textContent?.trim())
      .toBe('2 pistes sans date de création connue : rangées par date de modification.');
  });

  it('aucune piste sans date de création : rien à dire', async () => {
    sansCreation = 0;
    const el = await poser();
    boutonsTri(el)[1].click();
    await respirer();
    expect(titres(el)).toEqual(['Bravo', 'Alpha']);
    expect(el.querySelector('.repli')).toBeNull();
  });

  it('🔴 serveur antérieur (résumé sans `tri`) : pas de bascule, aucun paramètre nouveau', async () => {
    serveurAJour = false;
    const el = await poser();
    expect(titres(el)).toEqual(['Alpha', 'Bravo']);
    expect(boutonsTri(el)).toHaveLength(0);
    expect(requetes.every((u) => !u.includes('tri='))).toBe(true);
  });
});

describe('#5402 — les libellés dans les onze langues', () => {
  const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu'];
  const CLES = ['library.recentSortModified', 'library.recentSortCreated', 'library.recentCreationFallback'];
  it.each(LANGUES)('%s porte les trois clés, sans double encodage', (l) => {
    const src = readFileSync(resolve(__dirname, `../locales/${l}.ts`), 'utf-8');
    for (const cle of CLES) expect(src).toMatch(new RegExp(`["']${cle.replace(/\./g, '\\.')}["']\\s*:`));
    expect(src).not.toContain('Ã');
    const repli = src.split('\n').find((x) => x.includes('library.recentCreationFallback')) ?? '';
    expect(repli).toContain('{n}');
  });
});

// @vitest-environment jsdom
//
// web#2965 — « Collection intelligente : ouverture très lente » (Bertrand,
// recette rc12 sur le .18, 13/11/2026 ; ~9 500 albums, ~96 000 pistes).
//
// Le serveur répond vite : `/library/smart-collections/10/albums` (« 🆕
// Récents », 1 853 albums) en 0,3 s. Le temps passait dans le navigateur :
// la grille d'une collection OUVERTE montait toutes ses cartes d'un coup
// (`PochetteActions`, `AlbumArt`, `QualiteAlbum` chacune). Elle monte
// désormais une TRANCHE, puis la suite quand le bas approche — comme
// l'onglet Artistes (web#1716, `lib/grilleProgressive`).
//
// Ce banc tient : le nombre de cartes montées à l'ouverture ; l'ordre, le
// rail et la lecture qui portent toujours sur la liste ENTIÈRE ; le saut A–Z
// qui monte jusqu'à sa lettre. Le gain de temps lui-même se mesure dans un
// navigateur (jsdom ne met rien en page).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CollectionsV2 from '../../components/v2/CollectionsV2.svelte';
import { TRANCHE_GRILLE } from '../grilleProgressive';

const N = 1853;
/** Rangés par artiste : « Artiste A… » d'abord, « Artiste Z… » tout au bout. */
const lettres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALBUMS = Array.from({ length: N }, (_, i) => {
  const l = lettres[Math.floor((i * 26) / N)];
  return {
    id: i + 1, title: `Disque ${i}`, artist_name: `${l}rtiste ${String(i).padStart(4, '0')}`, cover_path: `c${i}`,
    genre: null, is_compilation: false, original_date: null, release_date: '2020-01-01',
    track_count: 10, year: 2020, added_at: 1_700_000_000 + i,
  };
});
const SMART = [{
  album_count: N, covers: [], created_at: '2026-08-10 19:16:44', description: null, expression: null, icon: null,
  id: 10, match_mode: 'all', max_limit: null, name: 'Récents',
  rules: [{ field: 'added_at', operator: 'greater_than', value: '90d' }],
  sort_by: null, sort_order: 'asc', track_count: 22167,
}];

function corps(chemin: string): unknown {
  if (/\/smart-collections\/\d+\/albums/.test(chemin)) return ALBUMS;
  if (chemin.endsWith('/library/smart-collections')) return SMART;
  return [];
}

class Inerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let sauts: Element[] = [];
const scrollOrigine = Element.prototype.scrollIntoView;

beforeEach(() => {
  sauts = [];
  localStorage.clear();
  // Le rail n'est proposé que sur un tri alphabétique : par artiste ici.
  localStorage.setItem('tune_v2_ecran_v2.collection.smart.tri', 'artist');
  Element.prototype.scrollIntoView = function (this: Element) { sauts.push(this); };
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const chemin = String(typeof url === 'string' ? url : url?.url ?? '').replace(/^https?:\/\/[^/]+/, '');
    const c = corps(chemin.split('?')[0]);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => c, text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  Element.prototype.scrollIntoView = scrollOrigine;
  vi.unstubAllGlobals();
});

async function tourner(tours = 8) {
  for (let i = 0; i < tours; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
async function attendreQue(c: () => boolean, tours = 1000): Promise<boolean> {
  for (let i = 0; i < tours; i++) { if (c()) return true; await new Promise((r) => setTimeout(r, 5)); flushSync(); }
  return c();
}

async function ouvrirRecents(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CollectionsV2, { target: hote, props: {} as any });
  flushSync();
  await tourner();
  const carte = hote.querySelector<HTMLButtonElement>('.grid .card button.meta');
  expect(carte, 'la collection « Récents » n’est pas dans la liste').toBeTruthy();
  carte!.click();
  expect(await attendreQue(() => hote!.querySelectorAll('.aveclettres .grid .card').length > 0)).toBe(true);
  await tourner();
  return hote;
}

const cartes = (r: HTMLElement) => r.querySelectorAll('.aveclettres .grid .card');

describe('web#2965 — une collection ouverte ne monte pas ses 1 853 cartes d’un coup', () => {
  it('monte une tranche, et une sentinelle pour la suite', async () => {
    const r = await ouvrirRecents();
    expect(cartes(r).length).toBe(TRANCHE_GRILLE);
    expect(r.querySelector('.aveclettres .grid .suite')).toBeTruthy();
    // Les premières cartes sont celles de la liste entière, dans son ordre.
    expect(cartes(r)[0].querySelector('.ct')?.textContent).toBe('Disque 0');
  }, 60_000);

  it('le rail propose les lettres de TOUTE la liste, et un saut monte jusqu’à la sienne', async () => {
    const r = await ouvrirRecents();
    const z = Array.from(r.querySelectorAll<HTMLButtonElement>('.rail .rl')).find((b) => b.textContent?.trim() === 'Z');
    expect(z, 'Z absente du rail').toBeTruthy();
    expect(z!.disabled, 'Z inerte : le rail ne lirait que les cartes montées').toBe(false);
    z!.click();
    expect(await attendreQue(() => sauts.length === 1)).toBe(true);
    const cible = sauts[0] as HTMLElement;
    expect(cible.getAttribute('data-lettre')).toBe('Z');
    expect(cartes(r).length).toBeGreaterThan(TRANCHE_GRILLE);
    expect(cartes(r).length).toBeLessThanOrEqual(N);
  }, 60_000);
});

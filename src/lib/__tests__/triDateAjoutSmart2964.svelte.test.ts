// @vitest-environment jsdom
//
// web#2964 — recette rc12 sur le .18 (13/11/2026) : « collection intelligente
// ouverte, menu Trier : Date d'ajout n'est pas proposée ».
//
// web#2916 (tune-server-rust#7903, fil 2656) a ajouté `added_at` à
// `TRIS_SMART`, mais son témoin (`triOrdreAjoutCollectionSmart7903`) ne lit
// que le TEXTE du composant. Celui-ci MONTE l'écran Collections, ouvre une
// collection intelligente, ouvre « Trier ▾ » et cherche l'entrée telle que
// l'utilisateur la voit : sinon, un menu construit ailleurs, une entrée
// filtrée ou masquée ne se verrait pas. Il choisit ensuite « Date d'ajout »
// et vérifie l'ordre de la grille.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { t } from '../i18n';
import CollectionsV2 from '../../components/v2/CollectionsV2.svelte';

const ALBUMS = [
  { id: 1, title: 'Ancien', artist_name: 'A', year: 1990, release_date: '1990-01-01', added_at: 1_600_000_000 },
  { id: 2, title: 'Récent', artist_name: 'B', year: 1980, release_date: '1980-01-01', added_at: 1_750_000_000 },
  { id: 3, title: 'Moyen', artist_name: 'C', year: 2000, release_date: '2000-01-01', added_at: 1_700_000_000 },
];
const SMART = [{
  album_count: 3, covers: [], created_at: '2026-08-10 19:16:44', description: null, expression: null, icon: null,
  id: 10, match_mode: 'all', max_limit: null, name: 'Récents',
  rules: [{ field: 'added_at', operator: 'greater_than', value: '90d' }],
  sort_by: null, sort_order: 'asc', track_count: 30,
}];
function corps(chemin: string): unknown {
  if (/\/smart-collections\/\d+\/albums/.test(chemin)) return ALBUMS;
  if (chemin.endsWith('/library/smart-collections')) return SMART;
  return [];
}
class Inerte { observe() {} unobserve() {} disconnect() {} }
const tr = (k: string) => get(t)(k as any);

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  localStorage.clear();
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
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function tourner(tours = 8) {
  for (let i = 0; i < tours; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
async function attendreQue(c: () => boolean, tours = 400): Promise<boolean> {
  for (let i = 0; i < tours; i++) { if (c()) return true; await new Promise((r) => setTimeout(r, 5)); flushSync(); }
  return c();
}
const menu = () => document.body.querySelector<HTMLElement>('[role="menu"]');
const titres = () => Array.from(hote!.querySelectorAll('.grid .card .ct')).map((e) => e.textContent?.trim());

describe('web#2964 — « Date d’ajout » dans « Trier ▾ » d’une collection intelligente ouverte', () => {
  it('le menu monté propose Date d’ajout (et garde Date de sortie), et ce tri range la grille', async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(CollectionsV2, { target: hote, props: {} as any });
    flushSync();
    await tourner();
    const carte = hote.querySelector<HTMLButtonElement>('.grid .card button.meta');
    expect(carte, 'la collection intelligente n’est pas dans la liste').toBeTruthy();
    carte!.click();
    expect(await attendreQue(() => !!hote!.querySelector('[data-menu-tri]'))).toBe(true);
    expect(await attendreQue(() => titres().length === 3)).toBe(true);

    hote.querySelector<HTMLButtonElement>('[data-menu-tri]')!.click();
    flushSync();
    expect(menu(), 'le menu Trier ne s’ouvre pas').not.toBeNull();
    const criteres = Array.from(menu()!.querySelectorAll<HTMLElement>('[data-tri]'));
    expect(criteres.map((e) => e.getAttribute('data-tri')))
      .toEqual(['regles', 'artist', 'title', 'year', 'release_date', 'added_at', 'random']);
    const ajout = menu()!.querySelector<HTMLElement>('[data-tri="added_at"]')!;
    expect(ajout.textContent?.trim()).toBe(tr('library.sortAddedDate'));
    expect(tr('library.sortAddedDate')).not.toBe('library.sortAddedDate');

    ajout.click();
    flushSync();
    expect(await attendreQue(() => titres()[0] === 'Ancien')).toBe(true);
    expect(titres()).toEqual(['Ancien', 'Moyen', 'Récent']);

    hote.querySelector<HTMLButtonElement>('[data-menu-tri]')!.click();
    flushSync();
    expect(menu()!.querySelector('[data-tri="added_at"]')!.getAttribute('aria-checked')).toBe('true');
    menu()!.querySelector<HTMLElement>('[data-sens="desc"]')!.click();
    flushSync();
    expect(await attendreQue(() => titres()[0] === 'Récent')).toBe(true);
    expect(titres()).toEqual(['Récent', 'Moyen', 'Ancien']);
  }, 60_000);
});

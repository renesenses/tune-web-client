// @vitest-environment jsdom
//
// renesenses/tune-server-rust#4663 — jfpaquet, fil 1878 (0.9.161, 79 614
// pistes) : « Dans "Search" je cherche les morceaux intitulés "autumn leaves".
// Résultat : 40 » — il y en a 119.
//
// Le 40 était la limite que l'écran demande à `/library/search`. La pastille
// affichait la longueur reçue ; « Voir plus » ne fait que révéler ce qui est
// déjà là et ne paraissait pas (40 reçues, 40 montrées). Le serveur rend
// désormais `totals` / `has_more` et accepte `?offset=`.
//
// Le témoin MONTE l'écran et regarde ce qui PART sur le réseau.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import { setSearchCriteria } from '../stores/shortcuts';
import { preferences } from '../stores/preferences';
import { fusionnerSuite, rangSuivant, restantLocal } from '../rechercheSuiteLocale';

vi.setConfig({ testTimeout: 30_000 });

const piste = (id: number) => ({ id, title: `Autumn Leaves ${id}`, artist_name: 'Bill Evans', album_id: 1 });
const page = (debut: number, n: number) => Array.from({ length: n }, (_, i) => piste(debut + i));

const PAGE1 = {
  artists: [], albums: [], labels: [], playlists: [],
  tracks: page(1, 40),
  totals: { artists: 0, albums: 0, tracks: 119, tracks_via_metadata: 0 },
  totals_capped: { artists: false, albums: false, tracks: false },
  has_more: { artists: false, albums: false, tracks: true },
  limit: 40, offset: 0,
};
const PAGE2 = { ...PAGE1, tracks: page(41, 40), offset: 40 };

describe('#4663 — la règle', () => {
  it('compte ce qui reste, et le rang de la suite', () => {
    expect(restantLocal(PAGE1 as any, 'tracks')).toEqual({ n: 79, auMoins: false });
    expect(rangSuivant(PAGE1 as any, 'tracks')).toBe(40);
    const deux = fusionnerSuite(PAGE1 as any, PAGE2 as any, 'tracks');
    expect(deux.tracks).toHaveLength(80);
    expect(restantLocal(deux, 'tracks')).toEqual({ n: 39, auMoins: false });
  });
  it('les pistes par métadonnées ne décalent pas le rang', () => {
    const avec = { ...PAGE1, tracks: [...page(1, 40), piste(900)], totals: { ...PAGE1.totals, tracks_via_metadata: 1 } };
    expect(rangSuivant(avec as any, 'tracks')).toBe(40);
    expect(restantLocal(avec as any, 'tracks')?.n).toBe(79);
  });
  it('un serveur qui ne compte pas : rien d’annoncé', () => {
    expect(restantLocal({ artists: [], albums: [], tracks: page(1, 40) } as any, 'tracks')).toBeNull();
  });
});

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function jusqua(condition: () => boolean, borne = 5000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await respirer();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let urls: string[] = [];

beforeEach(() => {
  urls = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    urls.push(u);
    if (/\/library\/search/.test(u)) return reponse(/offset=40/.test(u) ? PAGE2 : PAGE1);
    if (/\/search\?/.test(u)) return reponse({ local: PAGE1, services: {}, radios: [] });
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  setSearchCriteria(null);
  vi.unstubAllGlobals();
});

async function chercher(): Promise<HTMLDivElement> {
  setSearchCriteria({ q: 'autumn leaves' });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SearchV2, { target: hote, props: {} as any });
  await jusqua(() => hote!.querySelectorAll('.pills[data-rangee="afficher"] button.pill').length > 0
    && /119/.test(hote!.querySelector('.pills[data-rangee="afficher"]')?.textContent ?? ''));
  return hote;
}

describe('#4663 — l’écran Recherche', () => {
  it('la pastille Titres annonce 119, pas 40', async () => {
    const h = await chercher();
    const rangee = h.querySelector('.pills[data-rangee="afficher"]')?.textContent ?? '';
    expect(rangee, `pastilles : ${rangee}`).toMatch(/119/);
  });

  it('« Voir plus » demande la suite au serveur, par offset, et l’affiche', async () => {
    const h = await chercher();
    const bouton = () => h.querySelector<HTMLButtonElement>('button[data-suite="tracks"]');
    await jusqua(() => bouton() !== null);
    expect(bouton(), 'aucun bouton de suite : la liste coupée ne le dit pas').not.toBeNull();
    expect(bouton()!.textContent).toMatch(/79/);
    bouton()!.click();
    await jusqua(() => urls.some((u) => /\/library\/search.*offset=40/.test(u)) && h.textContent!.includes('Autumn Leaves 80'));
    expect(urls.some((u) => /\/library\/search.*offset=40/.test(u)), urls.join(' | ')).toBe(true);
    expect(h.textContent).toContain('Autumn Leaves 80');
  });
});

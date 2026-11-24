// @vitest-environment jsdom
//
// renesenses/tune-server-rust#9071 — la recherche globale « Moonchild » mêlait
// les albums de deux groupes homonymes : Qobuz 790734 et Qobuz 33495939
// (données relevées sur le .18 pour #8478). Décision de Bertrand, 23/11/2026 :
// regrouper par artiste, comme la fiche artiste depuis #8478 (web#2834).
//
// Ces témoins montent la VRAIE Recherche et lisent la grille rendue.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';
import { setSearchCriteria } from '../stores/shortcuts';
import { preferences } from '../stores/preferences';
import { grouperHomonymesRecherche } from '../rechercheHomonymes';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 60_000 });

const vide = { artists: [], albums: [], tracks: [], playlists: [], labels: [] };
const MOONCHILD = [
  { source_id: 'q1', title: 'Little Ghost', artist_name: 'Moonchild', artist_id: '790734' },
  { source_id: 'q2', title: 'Friends Are For', artist_name: 'Moonchild', artist_id: '33495939' },
  { source_id: 'q3', title: 'Voyager', artist_name: 'Moonchild', artist_id: '790734' },
  { source_id: 'q4', title: 'Starfruit', artist_name: 'Moonchild', artist_id: 790734 },
];
const SANS_HOMONYME = [
  { source_id: 'l1', title: 'Aphelion', artist_name: 'Leprous', artist_id: '610403' },
  { source_id: 'l2', title: 'Pitfalls', artist_name: 'Leprous', artist_id: '610403' },
  { source_id: 'l3', title: 'Malina', artist_name: 'Leprous', artist_id: '610403' },
];

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function jusqua(condition: () => boolean, borne = 8000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await respirer();
  }
}

let albumsQobuz: unknown[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/library\/search/.test(u)) return reponse(vide);
    if (/\/search\?/.test(u)) return reponse({ local: vide, services: { qobuz: { ...vide, albums: albumsQobuz } }, radios: [] });
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  activeView.set('search');
  vueDeRetour.set(null);
  ficheArtisteService.set(null);
  setSearchCriteria(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  activeView.set('home');
  setSearchCriteria(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function chercher(q: string, albums: unknown[], dernier: string): Promise<HTMLDivElement> {
  albumsQobuz = albums;
  setSearchCriteria({ q });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SearchV2, { target: hote, props: {} as any });
  await jusqua(() => (hote!.textContent ?? '').includes(dernier));
  return hote;
}

const titres = (el: Element) => [...el.querySelectorAll('.card .ct')].map((c) => c.textContent);
const net = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('#9071 — recherche « Moonchild » : un groupe par artiste homonyme', () => {
  it('🔴 deux artist_id, même nom, même service : deux groupes, chacun ses albums', async () => {
    const el = await chercher('Moonchild', MOONCHILD, 'Starfruit');
    const groupes = [...el.querySelectorAll<HTMLElement>('.homonyme')];
    expect(groupes.map((g) => g.dataset.homonyme)).toEqual(['qobuz:790734', 'qobuz:33495939']);
    expect(titres(groupes[0])).toEqual(['Little Ghost', 'Voyager', 'Starfruit']);
    expect(titres(groupes[1])).toEqual(['Friends Are For']);
    // Le libellé : le nom, le service et l'identifiant — ce que les albums portent.
    expect(net(groupes[0].querySelector('h3'))).toBe('Moonchild · Qobuz · 790734');
    expect(net(groupes[1].querySelector('h3'))).toBe('Moonchild · Qobuz · 33495939');
  });

  it('sans homonyme, rien ne change : une seule grille, pas de groupe', async () => {
    const el = await chercher('Leprous', SANS_HOMONYME, 'Malina');
    expect(el.querySelector('.homonyme')).toBeNull();
    expect(el.querySelector('[data-homonyme]')).toBeNull();
    expect(titres(el)).toEqual(['Aphelion', 'Pitfalls', 'Malina']);
  });
});

describe('#9071 — `grouperHomonymesRecherche`', () => {
  const al = (o: Record<string, unknown>) => o as unknown as Album;

  it('null sans homonyme, ni pour la bibliothèque ni entre deux services', () => {
    expect(grouperHomonymesRecherche([])).toBeNull();
    expect(grouperHomonymesRecherche([
      al({ source: 'qobuz', artist_name: 'Moonchild', artist_id: '1' }),
      al({ source: 'tidal', artist_name: 'Moonchild', artist_id: '2' }),
      al({ id: 4, source: 'local', artist_name: 'Moonchild', artist_id: 7 }),
      al({ id: 5, source: 'local', artist_name: 'Moonchild', artist_id: 8 }),
    ])).toBeNull();
  });

  it('le reste garde sa place et son ordre ; un album sans identifiant n’est rangé sous personne', () => {
    const s = grouperHomonymesRecherche([
      al({ title: 'A', source: 'qobuz', artist_name: 'Moonchild', artist_id: '1' }),
      al({ title: 'B', source: 'qobuz', artist_name: 'Moonchild Sanelly', artist_id: '3' }),
      al({ title: 'C', source: 'qobuz', artist_name: 'MOONCHILD', artist_id: '2' }),
      al({ title: 'D', source: 'qobuz', artist_name: 'Moonchild' }),
    ])!;
    expect(s.map((x) => [x.cle, x.albums.map((a) => a.title)])).toEqual([
      ['qobuz:1', ['A']],
      ['reste', ['B', 'D']],
      ['qobuz:2', ['C']],
    ]);
  });
});

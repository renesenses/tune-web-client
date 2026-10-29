// @vitest-environment jsdom
//
// tune-server-rust#7283 — Bibliothèque › Ajouts récents sous une portée
// « Répertoire » (Yves Corbat, démo du 29/10/2026) : la puce était posée, mais
// l'onglet, qui ne recevait pas la portée, listait les albums de TOUTES les
// racines — chaque copie d'un même album en double ou en triple.
//
// Même témoin que #1824 (Coffrets) : le vrai écran, la portée posée par le
// magasin que partagent la puce et l'écran Répertoires, l'onglet cliqué.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { locale } from '../i18n';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 60_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

const ALBUMS: Album[] = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  title: `Album ${String(i + 1).padStart(2, '0')}`,
  artist_name: `Artiste ${(i % 4) + 1}`,
  year: 1990 + i,
})) as unknown as Album[];

/** Le même album dans la CDThèque (4xxx) et ses copies hors de ce dossier. */
const RECENTS = [
  { id: 4101, title: '3000 Days', artist_name: 'The Pineapple Thief', cover_path: null },
  { id: 8101, title: '3000 Days', artist_name: 'The Pineapple Thief', cover_path: null },
  { id: 9101, title: '3000 Days', artist_name: 'The Pineapple Thief', cover_path: null },
  { id: 4102, title: 'A Day At The Races', artist_name: 'Queen', cover_path: null },
  { id: 8102, title: 'A Day At The Races', artist_name: 'Queen', cover_path: null },
];
const IDS_CDTHEQUE = [4101, 4102];
const DOSSIER = '/Volumes/Music/CDThèque Yves';
let retardPortee: Promise<void> | null = null;
const appels: string[] = [];

function corpsPour(url: string): unknown {
  if (url.includes('/home/recently-added/summary')) return { album_count: RECENTS.length, track_count: 10, duration_ms: 0 };
  if (url.includes('/home/recently-added')) return RECENTS;
  if (/\/library\/albums-detailed/.test(url)) {
    return /[?&]folder=/.test(url)
      ? { items: IDS_CDTHEQUE.map((id) => ({ album_id: id })), total: IDS_CDTHEQUE.length }
      : { items: RECENTS.map((a) => ({ album_id: a.id })), total: RECENTS.length };
  }
  if (url.includes('/stats')) return { track_count: 0, album_count: ALBUMS.length };
  return [];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

async function poserEcran(): Promise<HTMLElement> {
  activeView.set('library');
  albumsStore.set([...ALBUMS]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as never });
  for (let i = 0; i < 14; i++) await respirer();
  flushSync();
  return hote;
}

async function cliquerOnglet(el: HTMLElement, libelle: string): Promise<void> {
  const bouton = [...el.querySelectorAll<HTMLButtonElement>('nav.tabs button.tab')]
    .find((b) => (b.textContent ?? '').trim() === libelle);
  if (!bouton) {
    const vus = [...el.querySelectorAll('nav.tabs button.tab')].map((b) => (b.textContent ?? '').trim());
    throw new Error(`onglet « ${libelle} » absent — présents : ${vus.join(' | ')}`);
  }
  bouton.click();
  for (let i = 0; i < 14; i++) await respirer();
  flushSync();
}

beforeEach(() => {
  locale.set('fr');
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  localStorage.clear();
  retardPortee = null;
  appels.length = 0;
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    appels.push(url);
    if (retardPortee && /albums-detailed/.test(url) && /[?&]folder=/.test(url)) await retardPortee;
    const corps = corpsPour(url);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  albumsStore.set([]);
  libraryFolderScope.set(null);
  activeView.set('home');
  localStorage.clear();
  vi.unstubAllGlobals();
});

const titres = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLElement>('.grille .carte .titre, .liste .ligne .ltitre')].map((t) => t.textContent);

describe('#7283 — l’onglet Ajouts récents respecte la portée « Répertoire »', () => {
  it('🟢 CONTRE-ÉPREUVE : sans portée, toutes les copies sont listées', async () => {
    const el = await poserEcran();
    await cliquerOnglet(el, 'Ajouts récents');
    expect(titres(el)).toHaveLength(5);
  });

  it('🔴 sous « Répertoire : CDThèque Yves », chaque album n’apparaît qu’UNE fois', async () => {
    libraryFolderScope.set(DOSSIER);
    const el = await poserEcran();
    await cliquerOnglet(el, 'Ajouts récents');
    expect(appels.some((u) => /albums-detailed/.test(u) && decodeURIComponent(u.replace(/\+/g, ' ')).includes(DOSSIER))).toBe(true);
    expect(titres(el)).toEqual(['3000 Days', 'A Day At The Races']);
  });

  it('🔴 portée pas encore arrivée : rien plutôt que tout', async () => {
    let denouer: () => void = () => {};
    retardPortee = new Promise<void>((r) => { denouer = r; });
    libraryFolderScope.set(DOSSIER);
    const el = await poserEcran();
    await cliquerOnglet(el, 'Ajouts récents');
    expect(titres(el)).toEqual([]);
    denouer();
    for (let i = 0; i < 14; i++) await respirer();
    flushSync();
    expect(titres(el)).toHaveLength(2);
  });
});

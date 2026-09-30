// @vitest-environment jsdom
//
// #1824 — Bibliothèque › Coffrets : chaque coffret en DOUBLE sous une portée
// « Répertoire » (Sevy Tabroc, réunion du 30/09/2026, v0.9.168).
//
// Sa bibliothèque vit en deux exemplaires : le dossier « CDThèque » du NAS et
// une copie ailleurs. Le serveur rend donc DEUX albums « A Day At The Races »,
// deux « 3000 Days »… chacun rangé disque par disque, donc chacun coffret.
// Sous la puce « Répertoire : CDThèque », l'onglet Albums n'en montre qu'un ;
// l'onglet Coffrets, qui ne recevait pas la portée, montrait les deux.
//
// Ce témoin MONTE le vrai écran, pose la portée par le magasin que la puce et
// l'écran Répertoires partagent, clique l'onglet, et compte les cartes.
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

/** Les coffrets de la CDThèque (4xxx) et leur COPIE hors de ce dossier (8xxx),
 *  tels que `GET /library/coffrets` les rend — trié par titre, comme lui. */
const COFFRETS = {
  count: 6,
  items: [
    { id: 4101, title: '3000 Days', artist_name: 'The Pineapple Thief', cover_path: null, disc_count: 2, coffret: null },
    { id: 8101, title: '3000 Days', artist_name: 'The Pineapple Thief', cover_path: null, disc_count: 2, coffret: null },
    { id: 4102, title: 'A Day At The Races', artist_name: 'Queen', cover_path: null, disc_count: 2, coffret: null },
    { id: 8102, title: 'A Day At The Races', artist_name: 'Queen', cover_path: null, disc_count: 2, coffret: null },
    { id: 4103, title: 'A Kind Of Magic', artist_name: 'Queen', cover_path: null, disc_count: 2, coffret: 'auto' },
    { id: 8103, title: 'A Kind Of Magic', artist_name: 'Queen', cover_path: null, disc_count: 2, coffret: 'auto' },
  ],
};
/** Les albums du dossier « CDThèque » : `albums-detailed?folder=…`. */
const IDS_CDTHEQUE = [4101, 4102, 4103];
const DOSSIER = '/Volumes/Music/CDThèque';
/** Posée, la réponse de la portée attend qu'on la dénoue. */
let retardPortee: Promise<void> | null = null;

/** `null` : la route répond 404 (serveur antérieur au lot des coffrets). */
let reponseCoffrets: unknown = COFFRETS;
const appels: string[] = [];

function corpsPour(url: string): unknown {
  if (/\/library\/coffrets(\?|$)/.test(url)) return reponseCoffrets;
  if (/\/library\/albums-detailed/.test(url)) {
    return /[?&]folder=/.test(url)
      ? { items: IDS_CDTHEQUE.map((id) => ({ album_id: id })), total: IDS_CDTHEQUE.length }
      : { items: COFFRETS.items.map((c) => ({ album_id: c.id })), total: COFFRETS.items.length };
  }
  if (/\/library\/albums\/\d+(\?|$)/.test(url)) return COFFRETS.items[0];
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
  reponseCoffrets = COFFRETS;
  retardPortee = null;
  appels.length = 0;
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    appels.push(url);
    if (retardPortee && /albums-detailed/.test(url) && /[?&]folder=/.test(url)) await retardPortee;
    const corps = corpsPour(url);
    if (corps === null) {
      const erreur = { error: 'not found', path: '/api/v1/library/coffrets' };
      return {
        ok: false, status: 404, statusText: 'Not Found',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => erreur,
        text: async () => JSON.stringify(erreur),
      } as unknown as Response;
    }
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

const cartes = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLElement>('.body .coffrets .carte')].map((c) => Number(c.dataset.coffret));

describe('#1824 — l’onglet Coffrets respecte la portée « Répertoire »', () => {
  it('🟢 CONTRE-ÉPREUVE : sans portée, les deux exemplaires sont listés — la bibliothèque les contient', async () => {
    const el = await poserEcran();
    await cliquerOnglet(el, 'Coffrets');
    expect(cartes(el)).toEqual([4101, 8101, 4102, 8102, 4103, 8103]);
    expect(appels.some((u) => /albums-detailed/.test(u) && /[?&]folder=/.test(u))).toBe(false);
  });

  it('🔴 sous « Répertoire : CDThèque », chaque coffret n’apparaît qu’UNE fois : celui du dossier', async () => {
    libraryFolderScope.set(DOSSIER);
    const el = await poserEcran();
    await cliquerOnglet(el, 'Coffrets');
    expect(appels.some((u) => /albums-detailed/.test(u) && u.includes(encodeURIComponent(DOSSIER)))).toBe(true);
    expect(cartes(el)).toEqual([4101, 4102, 4103]);
    const titres = [...el.querySelectorAll('.body .coffrets .carte .titre')].map((t) => t.textContent);
    expect(new Set(titres).size).toBe(titres.length);
    expect(el.querySelector('.body .coffrets .compte')?.textContent).toBe('3');
  });

  it('🔴 portée pas encore arrivée : l’onglet attend, il ne montre pas TOUT sous la puce', async () => {
    let denouer: () => void = () => {};
    retardPortee = new Promise<void>((r) => { denouer = r; });
    libraryFolderScope.set(DOSSIER);
    const el = await poserEcran();
    await cliquerOnglet(el, 'Coffrets');
    expect(cartes(el)).toEqual([]);
    expect(el.querySelector('.body .coffrets .etat')).not.toBeNull();
    denouer();
    for (let i = 0; i < 14; i++) await respirer();
    flushSync();
    expect(cartes(el)).toEqual([4101, 4102, 4103]);
  });

  it('🟢 la croix de la puce rend toute la bibliothèque', async () => {
    libraryFolderScope.set(DOSSIER);
    const el = await poserEcran();
    await cliquerOnglet(el, 'Coffrets');
    expect(cartes(el)).toHaveLength(3);
    libraryFolderScope.set(null);
    for (let i = 0; i < 14; i++) await respirer();
    flushSync();
    expect(cartes(el)).toHaveLength(6);
  });
});

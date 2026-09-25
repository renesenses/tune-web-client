// @vitest-environment jsdom
//
// Fil 1946 — FabienM, v0.9.165 : un bouton « Lire » à côté de « Aléatoire »
// dans la Bibliothèque.
//
// « Lire » prend la MÊME portée que l'aléatoire (répertoire, recherche,
// filtres d'album, groupe ouvert, provenance, même plafond), mais la joue
// DANS L'ORDRE AFFICHÉ : album après album selon le tri courant, et dans
// chaque album les pistes par disque puis par numéro.
//
// Le témoin MONTE l'écran, tape la recherche, clique « Lire », et lit le
// CORPS réellement envoyé à `POST /zones/{id}/play`.
//
// CONTRE-ÉPREUVE : sur origin/main, le bouton n'existe pas — le premier bloc
// rougit ; `pistesDansLOrdre` n'existe pas — le bloc unitaire rougit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { currentZoneId } from '../stores/zones';
import { locale } from '../i18n';
import { bornee, pistesDansLOrdre } from '../porteeAleatoire';
import type { Album, Track } from '../types';

vi.setConfig({ testTimeout: 60_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

// Ordre des identifiants ≠ ordre des titres : un envoi « par id » se voit.
const ALBUMS: Album[] = [
  { id: 1, title: 'Blue Train', artist_name: 'Coltrane' },
  { id: 2, title: 'Red Clay', artist_name: 'Hubbard' },
  { id: 3, title: 'Blue Monk', artist_name: 'Monk' },
  { id: 4, title: 'Blue Note Gems', artist_name: 'Divers' },
] as unknown as Album[];

// Pistes livrées dans le DÉSORDRE : disque 2 avant disque 1, 3 avant 1.
const piste = (id: number, album_id: number, disc: number, n: number): Track =>
  ({ id, title: `T${id}`, album_id, disc_number: disc, track_number: n, artist_name: 'X' } as Track);
const PISTES: Track[] = [
  piste(13, 1, 1, 3), piste(11, 1, 1, 1), piste(12, 1, 1, 2),
  piste(21, 2, 1, 1),
  piste(32, 3, 2, 1), piste(31, 3, 1, 1),
  piste(42, 4, 1, 2), piste(41, 4, 1, 1),
];

let corpsLecture: unknown[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

function reponse(corps: unknown): Response {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

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

async function chercher(el: HTMLElement, texte: string): Promise<void> {
  const input = el.querySelector<HTMLInputElement>('.search input, input[placeholder]')!;
  input.value = texte;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  for (let i = 0; i < 8; i++) await respirer();
  flushSync();
}

const boutonLire = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('button[data-lire-selection]');

beforeEach(() => {
  locale.set('fr');
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  currentZoneId.set(7);
  localStorage.clear();
  corpsLecture = [];
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, options?: RequestInit) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    const post = String(options?.method ?? 'GET').toUpperCase() === 'POST';
    if (post && /\/zones\/7\/play/.test(url)) {
      corpsLecture.push(JSON.parse(String(options?.body ?? '{}')));
      return reponse({ id: 7, name: 'Salon', state: 'playing' });
    }
    if (/\/library\/tracks(\?|$)/.test(url)) return reponse(PISTES);
    if (url.includes('/system/config')) return reponse({});
    if (/\/queue/.test(url)) return reponse({ tracks: [], position: 0, length: 0 });
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  albumsStore.set([]);
  currentZoneId.set(null);
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('fil 1946 — « Lire » dans la Bibliothèque', () => {
  it('🔴 le bouton « Lire » est là, juste avant « Aléatoire »', async () => {
    const el = await poserEcran();
    const b = boutonLire(el);
    expect(b, 'bouton « Lire » absent').not.toBeNull();
    expect((b!.textContent ?? '').trim()).toBe('Lire');
    const suivant = b!.nextElementSibling as HTMLElement | null;
    expect((suivant?.textContent ?? '').trim()).toBe('Aléatoire');
    expect(b!.disabled).toBe(false);
  });

  it('🔴 lit la sélection FILTRÉE dans l’ordre affiché (titre, puis disque, puis numéro)', async () => {
    const el = await poserEcran();
    await chercher(el, 'blue');
    boutonLire(el)!.click();
    for (let i = 0; i < 20; i++) await respirer();
    flushSync();
    expect(corpsLecture).toHaveLength(1);
    // Tri par titre : Blue Monk (3), Blue Note Gems (4), Blue Train (1).
    // « Red Clay » (2) est hors de la recherche : aucune de ses pistes.
    expect(corpsLecture[0]).toEqual({ track_ids: [31, 32, 41, 42, 11, 12, 13] });
  });

  it('🔴 sélection vide : le bouton est grisé, et rien ne part', async () => {
    const el = await poserEcran();
    await chercher(el, 'introuvable');
    const b = boutonLire(el)!;
    expect(b.disabled).toBe(true);
    b.click();
    for (let i = 0; i < 10; i++) await respirer();
    expect(corpsLecture).toHaveLength(0);
  });
});

describe('fil 1946 — `pistesDansLOrdre`', () => {
  it('suit l’ordre des albums donné, puis disque et numéro', () => {
    expect(pistesDansLOrdre(PISTES, [4, 1], 500)).toEqual([41, 42, 11, 12, 13]);
  });
  it('même filtre à la piste et même plafond que l’aléatoire', () => {
    expect(pistesDansLOrdre(PISTES, [1, 2], 500, (t) => t.id !== 12)).toEqual([11, 13, 21]);
    expect(pistesDansLOrdre(PISTES, [1, 2, 3], 2)).toEqual([11, 12]);
    expect(bornee([1, 2, 3], 0)).toEqual([1]);
  });
  it('aucun album : aucune piste', () => {
    expect(pistesDansLOrdre(PISTES, [], 500)).toEqual([]);
  });
});

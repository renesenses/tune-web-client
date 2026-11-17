// @vitest-environment jsdom
/**
 * Taille des pochettes dans la grille de la Bibliothèque — go de Bertrand du
 * 17/11/2026 pour la rc13 (forum, fil 2897) : pochettes trop petites par
 * défaut, et la taille du texte ne les agrandit pas.
 *
 * Témoins, sur la VRAIE Bibliothèque montée :
 *   1. le curseur est dans la barre d'outils, à la taille d'avant (148 px),
 *      et rien n'est écrit au montage (#1650) ;
 *   2. le bouger change la variable CSS que lisent les grilles, et le choix
 *      est retenu dans le navigateur, relu au montage suivant ;
 *   3. pas de curseur en liste (aucune pochette à régler) ;
 *   4. la largeur de case est plafonnée sur écran étroit (deux colonnes).
 *
 * CONTRE-ÉPREUVE (jouée sur Shrek) : sans le `style="--v2-lib-pochette:…"`
 * de la racine `.v2-lib`, ou sans `{#if grilleAffichee}` autour du curseur
 * dans `LibraryV2.svelte`, les témoins 1–2, resp. 3, rougissent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope, libraryLoading } from '../stores/library';
import { activeView } from '../stores/navigation';
import { _remiseAZeroPourTests } from '../stores/albumsPagines';
import { locale } from '../i18n';
import {
  BORNES_TAILLE_POCHETTES, bornerTaillePochettes, ecrireTaillePochettes, largeurCasePochette, lireTaillePochettes,
} from '../taillePochettesBibliotheque';

const ALBUMS = Array.from({ length: 6 }, (_, i) => ({
  id: i + 1, title: `Album ${i}`, artist_name: 'Artiste', year: 2000,
  cover_path: `c/${i + 1}.jpg`, source: 'local', added_at: 100 - i,
}));
const CLE = 'tune_v2_ecran_lib.taillePochettes';

function reponse(corps: unknown): Response {
  const t = JSON.stringify(corps);
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => t,
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const attendre = (ms = 40) => new Promise((r) => setTimeout(r, ms));
async function poser() { flushSync(); await attendre(); flushSync(); await attendre(); flushSync(); }

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  locale.set('fr');
  _remiseAZeroPourTests();
  vi.stubGlobal('fetch', vi.fn(async (e: any) => {
    const u = new URL(typeof e === 'string' ? e : e?.url ?? String(e), 'http://tune.test');
    if (u.pathname.endsWith('/library/albums')) {
      return reponse({ items: ALBUMS, total: ALBUMS.length, limit: 50, offset: 0 });
    }
    return reponse([]);
  }));
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof IntersectionObserver);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  activeView.set('library');
  libraryFolderScope.set(null as any);
  libraryLoading.set(false);
  albums.set(ALBUMS as any);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  albums.set([]);
  _remiseAZeroPourTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function ecran(): Promise<HTMLDivElement> {
  if (monte) unmount(monte);
  hote?.remove();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} });
  await poser();
  return hote;
}
const curseur = (el: HTMLElement) => el.querySelector<HTMLInputElement>('input[data-taille-pochettes]');
const variable = (el: HTMLElement) =>
  /--v2-lib-pochette:\s*([^;]+)/.exec(el.querySelector('.v2-lib')?.getAttribute('style') ?? '')?.[1].trim() ?? '';

describe('module de la taille des pochettes', () => {
  it('borne, garde le défaut d’avant, et plafonne sur écran étroit', () => {
    expect(BORNES_TAILLE_POCHETTES.defaut).toBe(148);
    expect(lireTaillePochettes()).toBe(148);
    expect(bornerTaillePochettes(10)).toBe(BORNES_TAILLE_POCHETTES.min);
    expect(bornerTaillePochettes(9999)).toBe(BORNES_TAILLE_POCHETTES.max);
    expect(bornerTaillePochettes(Number.NaN)).toBe(148);
    expect(ecrireTaillePochettes(250)).toBe(250);
    expect(lireTaillePochettes()).toBe(250);
    localStorage.setItem(CLE, 'abc');
    expect(lireTaillePochettes()).toBe(148);
    expect(largeurCasePochette(320)).toBe('min(320px, 42vw)');
  });
});

describe('le curseur de la Bibliothèque (fil 2897)', () => {
  it('est dans la barre d’outils de la grille, à 148 px, sans rien écrire au montage', { timeout: 120_000 }, async () => {
    const el = await ecran();
    const c = curseur(el);
    expect(c, 'le curseur de taille manque').not.toBeNull();
    expect(Number(c!.value)).toBe(148);
    expect(c!.getAttribute('aria-label')).toBe('Taille des pochettes');
    expect(variable(el)).toBe('min(148px, 42vw)');
    expect(localStorage.getItem(CLE), 'un défaut écrit au montage se figerait (#1650)').toBeNull();
  });

  it('agrandit les pochettes et retient le choix d’une visite à l’autre', { timeout: 120_000 }, async () => {
    let el = await ecran();
    const c = curseur(el)!;
    c.value = '240';
    c.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(variable(el)).toBe('min(240px, 42vw)');
    expect(localStorage.getItem(CLE)).toBe('240');
    el = await ecran();
    expect(Number(curseur(el)!.value), 'le choix n’est pas relu au montage').toBe(240);
    expect(variable(el)).toBe('min(240px, 42vw)');
  });

  it('n’apparaît pas en liste', { timeout: 120_000 }, async () => {
    localStorage.setItem('tune_v2_ecran_lib.display', 'list');
    const el = await ecran();
    expect(el.querySelector('.rows'), 'la liste n’est pas affichée').not.toBeNull();
    expect(curseur(el), 'un curseur de pochettes en liste ne règle rien').toBeNull();
  });
});

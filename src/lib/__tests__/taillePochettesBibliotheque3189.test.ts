// @vitest-environment jsdom
/**
 * web#3189 — régler la TAILLE DES POCHETTES dans la Bibliothèque (Lio, fil
 * 2897 ; Joaquim Ventura, fil 2900 ; go de Bertrand du 18/11/2026 : « On le
 * fait déjà sur certains écrans (playlists !) »).
 *
 * Témoins :
 *  1. le réglage est CELUI de la fiche d'une playlist (web#2601) : mêmes
 *     bornes, même bornage, même libellé — aucune clé de traduction neuve ;
 *  2. rien n'est écrit ni posé tant que personne n'y touche (#1650) ;
 *  3. toutes les grilles de pochettes de la Bibliothèque lisent la même
 *     variable, avec leur pas d'origine en repli ;
 *  4. la VIRTUALISATION suit (web#3183 ne doit pas régresser) : la grille en
 *     pages et la cale de la grille entière se remesurent quand la taille
 *     change — le cadre, lui, ne change pas de taille, et aucun
 *     `ResizeObserver` ne le verrait ;
 *  5. MONTÉ : le curseur de la vraie Bibliothèque pose la variable, retient le
 *     choix, et la grille en pages recalcule ses rangées.
 *
 * CONTRE-ÉPREUVE (jouée sur Shrek) : sans `taille: taillePochettes` dans les
 * options de `use:fenetreAlbumsPaginee` de `LibraryV2.svelte`, le témoin 5
 * rougit (la cale du bas garde la hauteur calculée pour 7 colonnes) ; sans le
 * re-observe sur `geometrie` dans `fenetreDeRendu.cale`, le témoin 4b rougit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync, mount, unmount } from 'svelte';
import {
  BORNES_POCHETTES_BIBLIOTHEQUE, CLE_TAILLE_POCHETTES_BIBLIOTHEQUE,
  ecrireTaillePochettesBibliotheque, lireTaillePochettesBibliotheque,
} from '../taillePochettesBibliotheque';
import { BORNES_TAILLE } from '../vuePlaylist';
import { cale } from '../fenetreDeRendu';
import { fenetreAlbumsPaginee, trancheAlbums, type TrancheAlbums } from '../fenetreAlbumsPaginee';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope, libraryLoading } from '../stores/library';
import { activeView } from '../stores/navigation';
import { _remiseAZeroPourTests } from '../stores/albumsPagines';
import { curseurTaille } from './aides/barreBibliotheque';

const K = (s: string) => `tune_v2_ecran_${s}`;
const lire = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

beforeEach(() => { try { localStorage.clear(); } catch { /* indisponible */ } });

describe('1-2. la préférence : celle du curseur des playlists', () => {
  it('reprend les bornes de la vue pochettes de la playlist, au repos sur le pas d’origine (148 px)', () => {
    expect(BORNES_POCHETTES_BIBLIOTHEQUE.min).toBe(BORNES_TAILLE.pochettes.min);
    expect(BORNES_POCHETTES_BIBLIOTHEQUE.max).toBe(BORNES_TAILLE.pochettes.max);
    expect(BORNES_POCHETTES_BIBLIOTHEQUE.pas).toBe(BORNES_TAILLE.pochettes.pas);
    expect(BORNES_POCHETTES_BIBLIOTHEQUE.defaut).toBe(148);
  });
  it('rien de retenu : null ; écrit : borné et relu', () => {
    expect(lireTaillePochettesBibliotheque()).toBeNull();
    expect(ecrireTaillePochettesBibliotheque(9999)).toBe(BORNES_TAILLE.pochettes.max);
    expect(localStorage.getItem(K(CLE_TAILLE_POCHETTES_BIBLIOTHEQUE))).toBe(String(BORNES_TAILLE.pochettes.max));
    expect(ecrireTaillePochettesBibliotheque(10)).toBe(BORNES_TAILLE.pochettes.min);
    expect(ecrireTaillePochettesBibliotheque(240)).toBe(240);
    expect(lireTaillePochettesBibliotheque()).toBe(240);
  });
  it('une valeur illisible retombe sur « aucun choix »', () => {
    localStorage.setItem(K(CLE_TAILLE_POCHETTES_BIBLIOTHEQUE), 'grand');
    expect(lireTaillePochettesBibliotheque()).toBeNull();
  });
  it('le libellé est celui de la playlist : aucune clé neuve', () => {
    const lib = lire('../../components/v2/LibraryV2.svelte');
    expect(lib).toContain("$tr('v2.pl.thumbSize' as any)");
    expect(lire('../../components/v2/PlaylistDetailV2.svelte')).toContain("$tr('v2.pl.thumbSize' as any)");
  });
});

describe('3. toutes les grilles de pochettes lisent --lib-pochette', () => {
  it.each([
    ['../../components/v2/LibraryV2.svelte', 'minmax(var(--lib-pochette, 148px),1fr)', 2],
    ['../../components/v2/ArtistesV2.svelte', 'minmax(var(--lib-pochette, 148px), 1fr)', 1],
    ['../../components/v2/AjoutsRecentsV2.svelte', 'minmax(var(--lib-pochette, 150px), 1fr)', 1],
    ['../../components/v2/CoffretsV2.svelte', 'minmax(var(--lib-pochette, 150px), 1fr)', 1],
  ])('%s', (fichier, motif, n) => {
    const src = lire(fichier);
    expect(src.split(motif).length - 1).toBe(n);
  });
  it('les trois grilles en pages passent la taille à leur fenêtre, la cale aussi', () => {
    const lib = lire('../../components/v2/LibraryV2.svelte');
    expect(lib.match(/use:fenetreAlbumsPaginee=\{\{[^}]*taille: taillePochettes/g)?.length).toBe(3);
    expect(lib).toMatch(/use:cale=\{\{[^}]*geometrie: taillePochettes/);
  });
});

describe('4. la virtualisation suit la taille', () => {
  it('a. la grille en pages recalcule colonnes et cales quand la taille change', () => {
    const el = document.createElement('div');
    let cols = 10; let haut = 200;
    el.style.rowGap = '22px';
    const poserCols = () => { el.style.gridTemplateColumns = Array(cols).fill('100px').join(' '); };
    poserCols();
    document.body.append(el);
    let tranche: TrancheAlbums | null = null;
    const options = (taille: number | null) => ({
      total: 2000, mode: 'grid', taille,
      surPret: () => {},
      surFenetre: (t: TrancheAlbums) => {
        tranche = t;
        const cartes = [];
        for (let i = t.debut; i < t.fin; i++) {
          const c = document.createElement('div'); c.dataset.i = String(i);
          Object.defineProperty(c, 'offsetHeight', { get: () => haut });
          cartes.push(c);
        }
        el.replaceChildren(...cartes);
      },
    });
    const action = fenetreAlbumsPaginee(el, options(null));
    try {
      // Premier calcul sans carte (repli de 210 px), puis mesure sur les cartes montées.
      action.update(options(null));
      expect(tranche).toEqual(trancheAlbums(2000, 0, 600, 10, 222, 22));
      // Pochettes plus grandes : moitié moins de colonnes, rangées deux fois plus hautes.
      cols = 5; haut = 400; poserCols();
      action.update(options(320));
      expect(tranche, 'la tranche n’a pas été recalculée pour la nouvelle géométrie')
        .toEqual(trancheAlbums(2000, 0, 600, 5, 422, 22));
      expect(tranche!.debut % 5).toBe(0);
    } finally { action.destroy(); el.remove(); }
  });

  it('b. la cale de la grille entière se redimensionne et se ré-observe', () => {
    const observes: Element[] = [];
    let rappel: ((e: { isIntersecting: boolean; target: Element }[]) => void) | null = null;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(f: typeof rappel) { rappel = f; }
      observe(e: Element) { observes.push(e); }
      unobserve() {}
      disconnect() {}
    });
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { f(0); return 1; });
    const parent = document.createElement('div');
    const premier = document.createElement('div');
    const el = document.createElement('div');
    parent.append(premier, el);
    document.body.append(parent);
    let pasParElement = 20; // hauteur de rangée / colonnes
    premier.getBoundingClientRect = () => ({ top: 0, left: 0 } as DOMRect);
    el.getBoundingClientRect = () => ({ top: 200 * pasParElement, left: 0 } as DOMRect);
    parent.getBoundingClientRect = () => ({ bottom: 600, right: 0 } as DOMRect);
    const besoins: number[] = [];
    const o = (geometrie: number | null) => ({ restant: 500, rendus: 200, repli: 35, geometrie, surVue: (n: number) => besoins.push(n) });
    const action = cale(el, o(null));
    try {
      expect(el.style.height).toBe(`${500 * 20}px`);
      const avant = observes.length;
      pasParElement = 60; // pochettes plus grandes
      action.update(o(320));
      expect(el.style.height, 'la cale garde la hauteur d’avant').toBe(`${500 * 60}px`);
      expect(observes.length, 'la cale n’est pas ré-observée').toBeGreaterThan(avant);
      rappel!([{ isIntersecting: true, target: el }]);
      expect(besoins.length).toBe(1);
    } finally { action.destroy(); parent.remove(); vi.unstubAllGlobals(); }
  });
});

describe('5. MONTÉ : le curseur de la Bibliothèque', () => {
  const TOTAL = 700;
  const ALBUMS = Array.from({ length: TOTAL }, (_, i) => ({
    id: i + 1, title: `A${String(i).padStart(4, '0')}`, artist_name: 'Artiste', year: 2000,
    cover_path: `c/${i + 1}.jpg`, source: 'local', added_at: 10_000 - i,
  }));
  const LARGEUR = 1200; const ESPACE_COL = 18; const ESPACE = 22; const SOUS_POCHETTE = 60;
  const taillePosee = (el: Element): number => {
    const v = (el.closest('.v2-lib') as HTMLElement | null)?.style.getPropertyValue('--lib-pochette') ?? '';
    return v ? parseFloat(v) : 148;
  };
  const colonnes = (t: number) => Math.max(1, Math.floor(LARGEUR / (t + ESPACE_COL)));
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;
  const attendre = (ms = 40) => new Promise((r) => setTimeout(r, ms));
  async function poser() { flushSync(); await attendre(); flushSync(); await attendre(); flushSync(); }

  beforeEach(() => {
    _remiseAZeroPourTests();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
      json: async () => [], text: async () => '[]',
    })));
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { setTimeout(() => f(0), 0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} });
    const origine = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((cible: Element, pseudo?: string | null) => {
      if (!(cible as HTMLElement).classList?.contains('paginee')) return origine(cible, pseudo);
      return {
        gridTemplateColumns: Array(colonnes(taillePosee(cible))).fill('1px').join(' '),
        rowGap: `${ESPACE}px`, columnGap: `${ESPACE_COL}px`,
      } as unknown as CSSStyleDeclaration;
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) { return this.dataset?.i != null && this.closest('.paginee') ? taillePosee(this) + SOUS_POCHETTE : 0; },
    });
    activeView.set('library');
    libraryFolderScope.set(null as any);
    libraryLoading.set(false);
    albums.set(ALBUMS as any);
  });
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null; hote?.remove(); hote = null;
    albums.set([]);
    _remiseAZeroPourTests();
    delete (HTMLElement.prototype as any).offsetHeight;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const caleDuBas = (el: HTMLElement) => {
    const cales = el.querySelectorAll<HTMLElement>('.grid.paginee > .cale-paginee');
    return cales[cales.length - 1] ?? null;
  };
  const attendue = (t: number) => {
    const c = colonnes(t);
    return trancheAlbums(TOTAL, 0, 600, c, t + SOUS_POCHETTE + ESPACE, ESPACE).apres;
  };

  it('pose la variable, retient le choix, et la grille en pages recalcule ses rangées', { timeout: 120_000 }, async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(LibraryV2, { target: hote, props: {} });
    await poser();
    const section = hote.querySelector<HTMLElement>('.v2-lib')!;
    expect(section.style.getPropertyValue('--lib-pochette'), 'une taille posée sans geste').toBe('');
    expect(localStorage.getItem(K(CLE_TAILLE_POCHETTES_BIBLIOTHEQUE)), 'écrit au montage (#1650)').toBeNull();
    expect(hote.querySelector('.grid.paginee'), 'la grille en pages n’est pas montée').not.toBeNull();
    expect(caleDuBas(hote)?.style.height).toBe(`${attendue(148)}px`);

    // Harmonisation rc14 — le curseur vit dans le panneau « Affichage ».
    const curseur = curseurTaille(hote);
    expect(curseur, 'pas de curseur de taille sur la grille des albums').not.toBeNull();
    expect(curseur!.getAttribute('aria-label')).toBeTruthy();
    curseur!.value = '320';
    curseur!.dispatchEvent(new Event('input', { bubbles: true }));
    await poser();

    expect(section.style.getPropertyValue('--lib-pochette')).toBe('320px');
    expect(localStorage.getItem(K(CLE_TAILLE_POCHETTES_BIBLIOTHEQUE))).toBe('320');
    expect(attendue(320)).not.toBe(attendue(148));
    expect(caleDuBas(hote)?.style.height, 'la fenêtre n’a pas recalculé ses rangées pour la nouvelle taille')
      .toBe(`${attendue(320)}px`);
  });

  it('le choix retenu est relu au montage ; en liste, pas de curseur', { timeout: 120_000 }, async () => {
    localStorage.setItem(K(CLE_TAILLE_POCHETTES_BIBLIOTHEQUE), '200');
    localStorage.setItem(K('lib.display'), 'list');
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(LibraryV2, { target: hote, props: {} });
    await poser();
    expect(hote.querySelector<HTMLElement>('.v2-lib')!.style.getPropertyValue('--lib-pochette')).toBe('200px');
    expect(curseurTaille(hote), 'un curseur sans effet en liste').toBeNull();
  });
});

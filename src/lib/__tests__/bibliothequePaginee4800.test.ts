// @vitest-environment jsdom
/**
 * renesenses/tune-server-rust#4800, cause 3 — LE CLIENT NE CHARGE PLUS TOUTE
 * LA BIBLIOTHÈQUE À CHAQUE OUVERTURE.
 *
 * Mesuré sur le .18 (9 427 albums, 95 925 pistes) : la coquille lançait
 * `loadAlbums` au démarrage — quatre requêtes en série (100, puis 2 000 × 4),
 * 3,5 Mo de JSON, ~1 s de désérialisation — et le refaisait à chaque
 * `library.scan.completed`. Pendant ce temps, une requête sur trois attendait
 * derrière sur le pool de lecture du serveur (cause 2) : « Chargement… » puis
 * « délai » sur les widgets.
 *
 * Ce banc tient les deux moitiés :
 *  - la COQUILLE ne charge plus d'albums au démarrage, et la fin de scan
 *    INVALIDE au lieu de recharger (gardes de source, contre-épreuve :
 *    rouges sur `origin/main`) ;
 *  - la BIBLIOTHÈQUE, montée sur un magasin vide, demande UNE page de 100,
 *    dessine une case par album du total, demande les pages suivantes quand
 *    leurs cases entrent dans le cadre, ne redemande jamais une page déjà là,
 *    et ne charge la liste entière que sur un geste qui l'exige (ici : la
 *    recherche).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope, libraryLoading } from '../stores/library';
import { activeView } from '../stores/navigation';
import { _remiseAZeroPourTests, albumsPagines, invaliderBibliotheque, TAILLE_PAGE } from '../stores/albumsPagines';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── Gardes de source ────────────────────────────────────────────────────────

describe('#4800 — la coquille', () => {
  const boot = sansCommentaires(lire('src/lib/v2Bootstrap.ts'));

  it("ne charge AUCUN album au démarrage", () => {
    const i = boot.indexOf('export async function bootstrapV2');
    expect(i, 'bootstrapV2 a disparu').toBeGreaterThan(-1);
    const corps = boot.slice(i);
    expect(corps).not.toContain('loadAlbums');
    expect(corps).not.toContain('getAllAlbums');
    expect(corps).not.toContain('getAlbumsPagines');
    expect(corps).not.toContain('demanderBibliothequeEntiere');
    expect(boot, 'la fonction de chargement complet doit avoir quitté la coquille').not.toContain('async function loadAlbums');
  });

  it('la fin de scan INVALIDE, elle ne recharge pas', () => {
    const i = boot.indexOf('export function suivreLaBibliotheque');
    expect(i).toBeGreaterThan(-1);
    const corps = boot.slice(i, boot.indexOf('export async function bootstrapV2'));
    expect(corps).toContain('invaliderBibliotheque()');
    expect(corps).not.toContain('loadAlbums');
    expect(corps).not.toContain('getAllAlbums');
  });
});

describe('#4800 — les écrans qui tiennent la liste entière la demandent eux-mêmes', () => {
  it.each(['src/components/v2/ConverterV2.svelte', 'src/components/v2/DeclickV2.svelte'])('%s', (f) => {
    const src = sansCommentaires(lire(f));
    expect(src).toContain('demanderBibliothequeEntiere()');
  });

  it('la Bibliothèque a sa grille en pages, et une case vide demande sa page', () => {
    const src = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));
    expect(src).toContain('{:else if nu}');
    expect(src).toContain('use:observerCase={i}');
    expect(src).toContain('demanderBibliothequeEntiere()');
    // La modification d'une fiche passe par le magasin paginé, pas par
    // `albums.update` seul — sinon la grille en pages ne la verrait pas.
    expect(src).not.toContain('albums.update(');
  });
});

// ── La Bibliothèque montée ──────────────────────────────────────────────────

const TOTAL = 250;
/** Dix albums par lettre, de A à Y, rangés par titre. */
const ALBUMS = Array.from({ length: TOTAL }, (_, i) => ({
  id: i + 1,
  title: `${String.fromCharCode(65 + Math.floor(i / 10))}${i % 10}`,
  artist_name: 'Artiste',
  year: 2000,
  cover_path: null,
  source: 'local',
  added_at: 1_000 + i,
}));

/** Les URL demandées, dans l'ordre. */
let urls: string[] = [];
function reponse(corps: unknown): Response {
  const texte = JSON.stringify(corps);
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => texte,
  } as unknown as Response;
}
function servir(url: string): Response {
  const u = new URL(url, 'http://tune.test');
  if (u.pathname.endsWith('/library/albums')) {
    const limit = Number(u.searchParams.get('limit') ?? 50);
    const offset = Number(u.searchParams.get('offset') ?? 0);
    return reponse({ items: ALBUMS.slice(offset, offset + limit), total: TOTAL, limit, offset });
  }
  return reponse([]);
}
const pagesDemandees = () => urls.filter((u) => /\/library\/albums\?/.test(u) && !/limit=1&/.test(u));
const chargementsComplets = () => urls.filter((u) => /\/library\/albums\?/.test(u) && /limit=2000/.test(u));

/** Un `IntersectionObserver` que le témoin pilote : rien n'entre dans le cadre tout seul. */
let observes: { el: Element; cb: IntersectionObserverCallback }[] = [];
function faireEntrer(el: Element) {
  for (const o of observes) {
    if (o.el === el) o.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], {} as IntersectionObserver);
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const attendre = (ms = 40) => new Promise((r) => setTimeout(r, ms));
async function poser() {
  flushSync();
  await attendre();
  flushSync();
  await attendre();
  flushSync();
}
async function ecranMonte(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} });
  await poser();
  return hote;
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  urls = [];
  observes = [];
  _remiseAZeroPourTests();
  vi.stubGlobal('fetch', vi.fn(async (entree: any) => {
    const url = typeof entree === 'string' ? entree : entree?.url ?? String(entree);
    urls.push(url);
    return servir(url);
  }));
  vi.stubGlobal('IntersectionObserver', class {
    private cb: IntersectionObserverCallback;
    constructor(cb: IntersectionObserverCallback) { this.cb = cb; }
    observe(el: Element) { observes.push({ el, cb: this.cb }); }
    unobserve(el: Element) { observes = observes.filter((o) => o.el !== el); }
    disconnect() { observes = observes.filter((o) => o.cb !== this.cb); }
  } as unknown as typeof IntersectionObserver);
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { setTimeout(() => f(0), 0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
  activeView.set('library');
  libraryFolderScope.set(null as any);
  libraryLoading.set(false);
  albums.set([]);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  albums.set([]);
  _remiseAZeroPourTests();
  vi.unstubAllGlobals();
});

describe('#4800 — la Bibliothèque montée sur un magasin vide', () => {
  it("demande UNE page de 100 triée par le serveur, dessine une case par album du total, et n'a chargé aucune liste entière", { timeout: 60_000 }, async () => {
    const el = await ecranMonte();
    expect(pagesDemandees()).toHaveLength(1);
    expect(pagesDemandees()[0]).toContain(`limit=${TAILLE_PAGE}&offset=0&sort=title&order=asc`);
    expect(chargementsComplets(), 'la liste entière a été chargée').toHaveLength(0);
    expect(get(albums), 'le magasin partagé doit rester vide').toEqual([]);

    const grille = el.querySelector('.grid');
    expect(grille, 'la grille des albums n’est pas rendue').not.toBeNull();
    expect(grille!.querySelectorAll('[data-i]').length, 'une case par album du total').toBe(TOTAL);
    expect(grille!.querySelectorAll('.card:not(.sq)').length).toBe(TAILLE_PAGE);
    expect(grille!.querySelectorAll('.card.sq').length).toBe(TOTAL - TAILLE_PAGE);
    expect(grille!.querySelector('.card:not(.sq) .ct')?.textContent).toBe('A0');
    // Le compteur « Tout » annonce le TOTAL du serveur, pas ce qui est arrivé.
    expect(el.querySelector('.chip.count')?.textContent).toContain(String(TOTAL));
    // Et le rail offre toutes les lettres : on ne connaît pas les initiales
    // de ce qui n'est pas arrivé.
    expect(el.querySelectorAll('.rail .rl:disabled').length).toBe(0);
  });

  it("une case vide qui entre dans le cadre demande SA page, une seule fois", { timeout: 60_000 }, async () => {
    const el = await ecranMonte();
    const grille = el.querySelector('.grid')!;
    const vide = grille.querySelector('.card.sq[data-i="150"]');
    expect(vide).not.toBeNull();
    faireEntrer(vide!);
    await poser();
    expect(pagesDemandees()).toHaveLength(2);
    expect(pagesDemandees()[1]).toContain(`offset=${TAILLE_PAGE}&`);
    expect(grille.querySelectorAll('.card:not(.sq)').length).toBe(2 * TAILLE_PAGE);
    expect(grille.querySelector('.card[data-i="150"] .ct')?.textContent).toBe('P0');

    // Une autre case de la MÊME page (déjà là) : rien ne repart.
    const encore = grille.querySelector('.card.sq[data-i="210"]');
    expect(encore).not.toBeNull();
    faireEntrer(grille.querySelector('[data-i="199"]')!);
    await poser();
    expect(pagesDemandees()).toHaveLength(2);
  });

  it('la fin de scan fait tomber les pages, et seule la première repart', { timeout: 60_000 }, async () => {
    const el = await ecranMonte();
    const grille = el.querySelector('.grid')!;
    faireEntrer(grille.querySelector('.card.sq[data-i="150"]')!);
    await poser();
    expect(pagesDemandees()).toHaveLength(2);

    invaliderBibliotheque();
    await poser();
    // La grille est restée LA MÊME : pas de passage par « bibliothèque vide »
    // ni de remontage — le total est tenu, seules les cases se sont vidées…
    expect(el.querySelector('.grid')).toBe(grille);
    expect(grille.querySelectorAll('[data-i]').length).toBe(TOTAL);
    // …la première page est revenue, la seconde attend d'être regardée.
    expect(pagesDemandees()).toHaveLength(3);
    expect(grille.querySelectorAll('.card:not(.sq)').length).toBe(TAILLE_PAGE);
    expect(chargementsComplets()).toHaveLength(0);
  });

  it("le saut A–Z trouve la lettre par dichotomie, charge sa page, et vise la case", { timeout: 60_000 }, async () => {
    const el = await ecranMonte();
    const m = [...el.querySelectorAll<HTMLButtonElement>('.rail .rl')].find((b) => b.textContent === 'M');
    expect(m).not.toBeNull();
    m!.click();
    await poser();
    await poser();
    const sondes = urls.filter((u) => /\/library\/albums\?limit=1&/.test(u));
    expect(sondes.length).toBeGreaterThan(0);
    expect(sondes.length).toBeLessThanOrEqual(Math.ceil(Math.log2(TOTAL)));
    // La page de l'offset 120 (« M0 ») est là, en vraie carte.
    expect(pagesDemandees().some((u) => u.includes(`offset=${TAILLE_PAGE}&`))).toBe(true);
    expect(el.querySelector('.grid .card[data-i="120"] .ct')?.textContent).toBe('M0');
    expect(get(albumsPagines).pages.has(1)).toBe(true);
    expect(chargementsComplets()).toHaveLength(0);
  });

  it("approcher un menu de facettes demande la liste entière (ses comptes en dépendent), sans rien casser", { timeout: 60_000 }, async () => {
    const el = await ecranMonte();
    const menu = el.querySelector('.filters .drop')!;
    expect(menu).not.toBeNull();
    expect(chargementsComplets()).toHaveLength(0);
    menu.dispatchEvent(new Event('pointerenter'));
    await poser();
    await poser();
    expect(chargementsComplets()).toHaveLength(1);
    expect(get(albums).length).toBe(TOTAL);
    // La liste entière est là : la grille est complète et les comptes des
    // menus sont des nombres, plus des « … ».
    expect(el.querySelectorAll('.grid .card.sq').length).toBe(0);
    expect(el.querySelectorAll('.grid .card').length).toBe(TOTAL);
    expect([...el.querySelectorAll('.filters .drop .menu em')].some((e) => e.textContent === '…')).toBe(false);
  });

  it('la recherche exige la liste entière : elle se charge ALORS, et la grille redevient complète', { timeout: 60_000 }, async () => {
    const el = await ecranMonte();
    expect(chargementsComplets()).toHaveLength(0);
    const champ = el.querySelector<HTMLInputElement>('.v2-rech input')!;
    champ.value = 'A';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    await poser();
    await poser();
    expect(chargementsComplets()).toHaveLength(1);
    expect(chargementsComplets()[0], 'sans tri : les écrans trient eux-mêmes').not.toContain('sort=');
    expect(get(albums).length).toBe(TOTAL);
    const grille = el.querySelector('.grid')!;
    expect(grille.querySelectorAll('.card.sq').length, 'plus de case vide sur la liste entière').toBe(0);
    // Dix titres commencent par A, et « Artiste » répond aussi : la recherche
    // filtre sur place, comme avant.
    expect(grille.querySelectorAll('.card').length).toBe(TOTAL);
  });
});

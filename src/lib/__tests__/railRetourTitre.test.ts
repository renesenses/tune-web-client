// @vitest-environment jsdom
/**
 * LE RAIL A–Z RESTE SUR TOUS LES TRIS — décision de Bertrand, 25/09/2026.
 *
 * Essai de la PR #1566 sur le .18 (9 430 albums) : « Click sur derniers
 * ajouts, la barre A-Z disparaît ! » Ce n'était pas une régression : main
 * retirait le rail exprès sur tout tri qui n'est pas alphabétique, et sur
 * l'onglet « Ajouts récents ». Décision (option 2) : le rail reste visible et
 * actif ; sur un tri non alphabétique, une lettre REPASSE au tri Titre, puis
 * saute à la lettre. Le libellé de la lettre l'annonce.
 *
 * Au passage : en pages, cliquer « Derniers ajouts » faisait DISPARAÎTRE ce
 * bouton le temps du rechargement (`hasAddedAt` calculé sur des pages vides),
 * puis le remontait — un clignotement, et un bouton neuf sous le doigt.
 *
 * Le saut se vérifie sur une géométrie posée : chaque case `data-i` est à
 * `i × 10` px du haut de son conteneur défilant, qui défile vraiment. Un saut
 * vers le premier album en « X » amène donc `scrollTop` à `indice × 10`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope, libraryLoading } from '../stores/library';
import { activeView } from '../stores/navigation';
import { _remiseAZeroPourTests } from '../stores/albumsPagines';

const TOTAL = 700;
/** Rangés par titre, de A à Z ; ajoutés dans l'ordre INVERSE du titre. */
const ALBUMS = Array.from({ length: TOTAL }, (_, i) => ({
  id: i + 1,
  title: `${String.fromCharCode(65 + Math.floor((i * 26) / TOTAL))}${String(i).padStart(4, '0')}`,
  artist_name: 'Artiste',
  year: 2000,
  cover_path: `c/${i + 1}.jpg`,
  source: 'local',
  added_at: 10_000 - i,
}));
/** Le premier album dont le titre commence par « X », dans l'ordre du titre. */
const PREMIER_X = ALBUMS.findIndex((a) => a.title.startsWith('X'));

let urls: string[] = [];
/** Les pages triées par date d'ajout, tenues en suspens quand le témoin le veut. */
let retenirAjouts = false;
let relacher: (() => void)[] = [];
function reponse(corps: unknown): Response {
  const t = JSON.stringify(corps);
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => t,
  } as unknown as Response;
}
function servir(url: string): Response {
  const u = new URL(url, 'http://tune.test');
  if (u.pathname.endsWith('/library/albums')) {
    const limit = Number(u.searchParams.get('limit') ?? 50);
    const offset = Number(u.searchParams.get('offset') ?? 0);
    const liste = u.searchParams.get('sort') === 'added'
      ? [...ALBUMS].sort((a, b) => b.added_at - a.added_at) : ALBUMS;
    return reponse({ items: liste.slice(offset, offset + limit), total: TOTAL, limit, offset });
  }
  return reponse([]);
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const attendre = (ms = 40) => new Promise((r) => setTimeout(r, ms));
async function poser() { flushSync(); await attendre(); flushSync(); await attendre(); flushSync(); }

/** Les conteneurs défilants gardent leur `scrollTop` ; les cases `data-i` sont à `i × 10` px. */
const defilements = new WeakMap<Element, number>();
const CONTENEURS = '.grid, .rows, .carrou';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  urls = [];
  retenirAjouts = false;
  relacher = [];
  _remiseAZeroPourTests();
  vi.stubGlobal('fetch', vi.fn(async (e: any) => {
    const u = typeof e === 'string' ? e : e?.url ?? String(e);
    urls.push(u);
    if (retenirAjouts && /sort=added/.test(u)) await new Promise<void>((r) => relacher.push(r));
    return servir(u);
  }));
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof IntersectionObserver);
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { setTimeout(() => f(0), 0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const el = this as HTMLElement;
    const conteneur = el.closest(CONTENEURS);
    const i = el.dataset?.i;
    const top = conteneur && conteneur !== el && i != null ? Number(i) * 10 - (defilements.get(conteneur) ?? 0) : 0;
    return { top, bottom: top + 10, left: 0, right: 0, width: 0, height: 10, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: Element) { return defilements.get(this) ?? 0; },
    set(this: Element, v: number) { defilements.set(this, Math.max(0, v)); },
  });
  activeView.set('library');
  libraryFolderScope.set(null as any);
  libraryLoading.set(false);
  albums.set([]);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  albums.set([]);
  _remiseAZeroPourTests();
  delete (HTMLElement.prototype as any).scrollTop;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function ecran(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} });
  await poser();
  return hote;
}
const boutonAjouts = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLButtonElement>('.chip')].find((b) => b.getAttribute('title') === 'Trier par date d’ajout, du plus récent au plus ancien') ?? null;
const lettre = (el: HTMLElement, L: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('.rail .rl')].find((b) => b.textContent === L) ?? null;
const defilementGrille = (el: HTMLElement) => defilements.get(el.querySelector('.grid')!) ?? 0;

/** Le rail est là, « X » est active et annonce le retour au tri Titre. */
function railRamene(el: HTMLElement) {
  expect(el.querySelector('.rail'), 'le rail A–Z a disparu').not.toBeNull();
  const x = lettre(el, 'X');
  expect(x, 'la lettre X manque au rail').not.toBeNull();
  expect(x!.disabled, 'la lettre X est inerte').toBe(false);
  const libelle = x!.getAttribute('aria-label') ?? '';
  expect(libelle, 'la lettre n’annonce pas qu’elle repasse au tri Titre').toContain('X');
  expect(libelle).toContain('titre');
  return x!;
}

describe('le rail A–Z sur « Derniers ajouts », liste entière', () => {
  it('reste, et une lettre repasse au tri Titre puis saute', { timeout: 120_000 }, async () => {
    albums.set(ALBUMS as any);
    const el = await ecran();
    expect(lettre(el, 'X')?.getAttribute('aria-label'), 'sur le tri Titre, la lettre se lit seule').toBeNull();
    boutonAjouts(el)!.click();
    await poser();
    expect(boutonAjouts(el)!.classList.contains('active')).toBe(true);
    railRamene(el).click();
    await poser();
    await poser();
    expect(boutonAjouts(el)!.classList.contains('active'), 'le tri Titre n’a pas été repris').toBe(false);
    expect(el.querySelector('.grid .card .ct')?.textContent, 'la grille n’est pas triée par titre').toBe(ALBUMS[0].title);
    expect(defilementGrille(el), 'le saut n’a pas atteint le premier album en X').toBe(PREMIER_X * 10);
    expect(lettre(el, 'X')?.getAttribute('aria-label')).toBeNull();
  });
});

describe('le rail A–Z sur « Derniers ajouts », en pages (#4800)', () => {
  it('reste, et une lettre repasse au tri Titre puis saute', { timeout: 120_000 }, async () => {
    const el = await ecran();
    boutonAjouts(el)!.click();
    await poser();
    railRamene(el).click();
    await poser();
    await poser();
    await poser();
    expect(boutonAjouts(el)!.classList.contains('active')).toBe(false);
    const apres = urls.filter((u) => /\/library\/albums\?/.test(u)).slice(-3);
    expect(apres.every((u) => /sort=title/.test(u)), 'la liste n’est pas redemandée triée par titre').toBe(true);
    expect(defilementGrille(el), 'le saut n’a pas atteint le premier album en X').toBe(PREMIER_X * 10);
  });

  it('le bouton « Derniers ajouts » ne disparaît pas pendant le rechargement', { timeout: 120_000 }, async () => {
    const el = await ecran();
    const bouton = boutonAjouts(el);
    expect(bouton, 'le bouton « Derniers ajouts » manque').not.toBeNull();
    retenirAjouts = true;
    bouton!.click();
    await poser();
    // La page triée par date n'est pas revenue : c'est l'instant du défaut.
    expect(relacher.length, 'la liste par date n’a pas été demandée').toBeGreaterThan(0);
    expect(boutonAjouts(el), 'le bouton a disparu pendant le rechargement').not.toBeNull();
    expect(boutonAjouts(el), 'le bouton a été démonté puis remonté').toBe(bouton);
    relacher.forEach((r) => r());
    await poser();
    expect(boutonAjouts(el)).toBe(bouton);
    expect(bouton!.classList.contains('active')).toBe(true);
  });
});

describe('le rail A–Z sur l’onglet « Ajouts récents »', () => {
  it('est là, et une lettre ramène sur Albums, trié par titre, à cette lettre', { timeout: 120_000 }, async () => {
    albums.set(ALBUMS as any);
    const el = await ecran();
    el.querySelector<HTMLButtonElement>('.tab[data-onglet="recent"]')!.click();
    await poser();
    expect(el.querySelector('.tab[data-onglet="recent"]')!.classList.contains('active')).toBe(true);
    railRamene(el).click();
    await poser();
    await poser();
    expect(el.querySelector('.tab[data-onglet="albums"]')!.classList.contains('active'), 'l’onglet Albums n’a pas été repris').toBe(true);
    expect(defilementGrille(el), 'le saut n’a pas atteint le premier album en X').toBe(PREMIER_X * 10);
  });
});

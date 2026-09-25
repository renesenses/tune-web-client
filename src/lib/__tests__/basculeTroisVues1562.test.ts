// @vitest-environment jsdom
/**
 * tune-web-client#1562 — jfpaquet, fil 1919, 0.9.163 Windows, 6 704 albums :
 *
 * > « In "My Library" using the little button to change between the 3 albums
 * >   views does not work well : hesitating and slow, and I've put only 6
 * >   thousands albums. I fear that will be a problem with 40.000+ albums. »
 *
 * CE BANC COMPTE, IL NE CHRONOMÈTRE PAS. Une durée sous jsdom dépend de la
 * charge de la machine ; un nombre de vignettes montées et un nombre de
 * requêtes, non. Mesuré sur `origin/main` (91954d65), 6 704 albums :
 *
 *   liste entière chargée : chaque bascule montait 6 704 vignettes pleines
 *     (228 000 nœuds en grille et en carrousel, 60 000 en liste), 0 requête ;
 *     le premier montage lançait 670 `GET /library/albums/{id}` (un par album
 *     sans pochette, qu'`AlbumArt` va chercher) ;
 *   en pages (#4800) : chaque bascule montait 6 704 cases, 0 requête.
 *
 * Avec la fenêtre de rendu (`lib/fenetreDeRendu`), une bascule monte
 * `FENETRE_INITIALE` éléments et une cale, quelle que soit la bibliothèque, et
 * ne fait toujours AUCUNE requête : les données déjà là ne sont pas redemandées.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope, libraryLoading } from '../stores/library';
import { activeView } from '../stores/navigation';
import { _remiseAZeroPourTests } from '../stores/albumsPagines';
import { FENETRE_INITIALE, PAS_FENETRE, SEUIL_SANS_FENETRE, elargir, fenetreNeuve, plafondDe } from '../fenetreDeRendu';

const TOTAL = 6704;
/** Rangés par titre ; un sur dix sans pochette, comme une vraie discothèque. */
const ALBUMS = Array.from({ length: TOTAL }, (_, i) => ({
  id: i + 1,
  title: `${String.fromCharCode(65 + Math.floor((i * 26) / TOTAL))}${String(i).padStart(5, '0')}`,
  artist_name: 'Artiste',
  year: 2000,
  cover_path: i % 10 === 0 ? null : `c/${i + 1}.jpg`,
  source: 'local',
  added_at: 1_000 + i,
}));

let urls: string[] = [];
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
    return reponse({ items: ALBUMS.slice(offset, offset + limit), total: TOTAL, limit, offset });
  }
  const m = u.pathname.match(/\/library\/albums\/(\d+)$/);
  if (m) return reponse(ALBUMS[Number(m[1]) - 1]);
  return reponse([]);
}

/** Un `IntersectionObserver` piloté : rien n'entre dans le cadre tout seul. */
let observes: { el: Element; cb: IntersectionObserverCallback }[] = [];
function faireEntrer(el: Element) {
  for (const o of observes.filter((x) => x.el === el)) {
    o.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], {} as IntersectionObserver);
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const attendre = (ms = 40) => new Promise((r) => setTimeout(r, ms));
async function poser() { flushSync(); await attendre(); flushSync(); await attendre(); flushSync(); }

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  urls = [];
  observes = [];
  _remiseAZeroPourTests();
  vi.stubGlobal('fetch', vi.fn(async (e: any) => {
    const u = typeof e === 'string' ? e : e?.url ?? String(e);
    urls.push(u);
    return servir(u);
  }));
  vi.stubGlobal('IntersectionObserver', class {
    private cb: IntersectionObserverCallback;
    constructor(cb: IntersectionObserverCallback) { this.cb = cb; }
    observe(el: Element) { observes.push({ el, cb: this.cb }); }
    unobserve(el: Element) { observes = observes.filter((o) => !(o.el === el && o.cb === this.cb)); }
    disconnect() { observes = observes.filter((o) => o.cb !== this.cb); }
  } as unknown as typeof IntersectionObserver);
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { setTimeout(() => f(0), 0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver);
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
  vi.unstubAllGlobals();
});

async function ecran(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} });
  await poser();
  return hote;
}
const vue = (el: HTMLElement) => el.querySelector('.viewtog[data-vue]')?.getAttribute('data-vue');
/** Les éléments montés de la vue courante : vignettes pleines ET cases vides. */
const montes = (el: HTMLElement) => el.querySelectorAll('.grid > [data-i], .rows > [data-i], .carrou > [data-i]').length;
const pleines = (el: HTMLElement) => el.querySelectorAll('.card:not(.sq), .lrow:not(.sq), .ccard:not(.sq)').length;

/** Trois bascules — grille → liste → carrousel → grille — comptées une à une. */
async function troisBascules(el: HTMLElement) {
  const tours: { vers: string | null | undefined; requetes: string[]; montes: number; pleines: number; cale: boolean }[] = [];
  for (let k = 0; k < 3; k++) {
    const avant = urls.length;
    el.querySelector<HTMLButtonElement>('.viewtog[data-vue]')!.click();
    await poser();
    tours.push({
      vers: vue(el), requetes: urls.slice(avant), montes: montes(el), pleines: pleines(el),
      cale: !!el.querySelector('.grid > .cale, .rows > .cale, .carrou > .cale'),
    });
  }
  return tours;
}

describe('#1562 — la fenêtre de rendu, en logique pure', () => {
  it('une clef neuve repart de la fenêtre initiale ; elargir ne rétrécit jamais', () => {
    let f = fenetreNeuve('grid');
    expect(plafondDe(f, 'grid')).toBe(FENETRE_INITIALE);
    f = elargir(f, 'grid');
    expect(plafondDe(f, 'grid')).toBe(FENETRE_INITIALE + PAS_FENETRE);
    f = elargir(f, 'grid', 5000);
    expect(plafondDe(f, 'grid')).toBe(5000);
    // La bascule : autre clef, fenêtre initiale DANS LE MÊME CALCUL.
    expect(plafondDe(f, 'list')).toBe(FENETRE_INITIALE);
    // Une petite bibliothèque n'a pas de fenêtre : tout est monté, comme avant.
    expect(plafondDe(f, 'list', SEUIL_SANS_FENETRE)).toBe(SEUIL_SANS_FENETRE);
    expect(plafondDe(f, 'list', SEUIL_SANS_FENETRE + 1)).toBe(FENETRE_INITIALE);
  });
});

describe('#1562 — basculer entre les trois vues, 6 704 albums, liste entière déjà chargée', () => {
  it('chaque bascule ne monte que la fenêtre, et ne fait AUCUNE requête', { timeout: 300_000 }, async () => {
    albums.set(ALBUMS as any);
    const el = await ecran();
    expect(vue(el)).toBe('grid');
    // Le premier montage : la fenêtre, pas la collection. Et donc pas un
    // `GET /library/albums/{id}` par album sans pochette de TOUTE la
    // bibliothèque — seulement pour ceux de la fenêtre.
    expect(montes(el), 'le premier montage a monté toute la collection').toBeLessThanOrEqual(FENETRE_INITIALE);
    const fiches = urls.filter((u) => /\/library\/albums\/\d+$/.test(u)).length;
    expect(fiches, 'une fiche demandée par album sans pochette de TOUTE la bibliothèque').toBeLessThanOrEqual(Math.ceil(FENETRE_INITIALE / 10));

    const tours = await troisBascules(el);
    expect(tours.map((t) => t.vers)).toEqual(['list', 'carousel', 'grid']);
    for (const t of tours) {
      expect(t.requetes, `bascule vers ${t.vers} : une requête est repartie alors que tout était là`).toEqual([]);
      expect(t.montes, `bascule vers ${t.vers} : ${t.montes} éléments montés sur ${TOTAL}`).toBe(FENETRE_INITIALE);
      expect(t.pleines).toBe(FENETRE_INITIALE);
      expect(t.cale, `bascule vers ${t.vers} : pas de cale pour tenir la place du reste`).toBe(true);
    }
  });

  it('la cale qui entre dans le cadre élargit la fenêtre, sans requête', { timeout: 300_000 }, async () => {
    albums.set(ALBUMS as any);
    const el = await ecran();
    const avant = urls.filter((u) => !/\/library\/albums\/\d+$/.test(u)).length;
    const laCale = el.querySelector('.grid > .cale');
    expect(laCale, 'la grille n’a pas de cale').not.toBeNull();
    faireEntrer(laCale!);
    await poser();
    expect(montes(el)).toBe(FENETRE_INITIALE + PAS_FENETRE);
    expect(urls.filter((u) => !/\/library\/albums\/\d+$/.test(u)).length, 'élargir a relancé une requête de liste').toBe(avant);
  });

  // B commence à l'album 258 : juste au-delà de la fenêtre initiale.
  it('le rail A–Z monte sa cible avant de sauter', { timeout: 300_000 }, async () => {
    albums.set(ALBUMS as any);
    const el = await ecran();
    const t = [...el.querySelectorAll<HTMLButtonElement>('.rail .rl')].find((b) => b.textContent === 'B');
    expect(t, 'le rail n’offre pas la lettre B').toBeTruthy();
    t!.click();
    await poser();
    const cible = ALBUMS.findIndex((a) => a.title.startsWith('B'));
    expect(cible).toBeGreaterThan(FENETRE_INITIALE);
    expect(el.querySelector(`.grid [data-letter="B"]`), 'la cible du saut n’a pas été montée').not.toBeNull();
  });
});

describe('#1562 — basculer entre les trois vues, 6 704 albums, en pages (#4800)', () => {
  it('chaque bascule ne monte que la fenêtre, et ne redemande aucune page', { timeout: 300_000 }, async () => {
    const el = await ecran();
    expect(vue(el)).toBe('grid');
    expect(montes(el)).toBeLessThanOrEqual(FENETRE_INITIALE);
    const tours = await troisBascules(el);
    expect(tours.map((t) => t.vers)).toEqual(['list', 'carousel', 'grid']);
    for (const t of tours) {
      expect(t.requetes, `bascule vers ${t.vers} : une page déjà là a été redemandée`).toEqual([]);
      expect(t.montes, `bascule vers ${t.vers} : ${t.montes} cases montées sur ${TOTAL}`).toBe(FENETRE_INITIALE);
      expect(t.cale).toBe(true);
    }
  });
});

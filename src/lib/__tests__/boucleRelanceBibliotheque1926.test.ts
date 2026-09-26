// @vitest-environment jsdom
/**
 * Fil forum 1926 — BOUCLE DE RELANCE INFINIE DANS LA BIBLIOTHÈQUE.
 *
 * `LibraryV2` demandait la première page dans un effet qui lisait le magasin
 * `albumsPagines` ENTIER (`void $albumsPagines.generation`). L'effet se
 * rejouait donc à CHAQUE écriture du magasin, pas seulement quand la
 * génération avançait. Sur un serveur qui répond 500 à `GET /library/albums`,
 * `demanderPage` écrivait `erreur` → l'effet repartait → nouvelle requête →
 * nouvel échec → … sans fin : rafale continue de requêtes, fil principal
 * saturé, onglet figé.
 *
 * Ce banc monte la Bibliothèque (et la barre latérale, pour le clic de
 * navigation) sur un serveur en panne et exige :
 *  - un nombre de requêtes BORNÉ sans geste de l'utilisateur (≤ 2) ;
 *  - l'erreur DITE à l'écran ;
 *  - une interface qui répond : un clic dans la barre change `activeView` ;
 *  - une case vide qui entre dans le cadre ne relance pas la page en échec
 *    avant son délai ;
 *  - la liste ENTIÈRE (recherche) en échec ne boucle pas non plus.
 *
 * ⚠️ La simulation est BORNÉE : au-delà de `PLAFOND` requêtes, le faux
 * serveur ne répond plus jamais (promesse pendante). Sans cette borne, la
 * contre-épreuve sur `origin/main` ne rendrait pas la main — les réponses
 * résolues sans réseau enchaînent les micro-tâches et affament la boucle
 * d'événements. Avec elle, `origin/main` échoue proprement par DÉPASSEMENT
 * du nombre de requêtes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import Sidebar from '../../components/v2/Sidebar.svelte';
import { albums, libraryFolderScope, libraryLoading } from '../stores/library';
import { activeView } from '../stores/navigation';
import { _remiseAZeroPourTests, albumsPagines } from '../stores/albumsPagines';

const PLAFOND = 25;

let urls: string[] = [];
let enPanne = true;
const TOTAL = 250;
const ALBUMS = Array.from({ length: TOTAL }, (_, i) => ({
  id: i + 1,
  title: `${String.fromCharCode(65 + Math.floor(i / 10))}${i % 10}`,
  artist_name: 'Artiste', year: 2000, cover_path: null, source: 'local', added_at: 1_000 + i,
}));

function reponse(corps: unknown, status = 200): Response {
  const texte = typeof corps === 'string' ? corps : JSON.stringify(corps);
  return {
    ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Internal Server Error',
    headers: new Map([['content-type', typeof corps === 'string' ? 'text/plain' : 'application/json']]),
    json: async () => (typeof corps === 'string' ? JSON.parse(corps) : corps), text: async () => texte,
    clone() { return this; },
  } as unknown as Response;
}
function servir(url: string): Response {
  const u = new URL(url, 'http://tune.test');
  if (u.pathname.endsWith('/library/albums')) {
    if (enPanne) return reponse('panne simulée', 500);
    const limit = Number(u.searchParams.get('limit') ?? 50);
    const offset = Number(u.searchParams.get('offset') ?? 0);
    return reponse({ items: ALBUMS.slice(offset, offset + limit), total: TOTAL, limit, offset });
  }
  return reponse([]);
}
const requetesAlbums = () => urls.filter((u) => /\/library\/albums\?/.test(u));
const pagesDemandees = () => requetesAlbums().filter((u) => !/limit=2000/.test(u) && !/limit=1&/.test(u));
const chargementsComplets = () => requetesAlbums().filter((u) => /limit=2000/.test(u));

let observes: { el: Element; cb: IntersectionObserverCallback }[] = [];
function faireEntrer(el: Element) {
  for (const o of observes) {
    if (o.el === el) o.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], {} as IntersectionObserver);
  }
}

const montes: Record<string, any>[] = [];
let hote: HTMLDivElement | null = null;
const attendre = (ms = 40) => new Promise((r) => setTimeout(r, ms));
async function poser() {
  flushSync(); await attendre(); flushSync(); await attendre(); flushSync();
}
async function ecranMonte(avecBarre = false): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  if (avecBarre) {
    const barre = document.createElement('div');
    barre.className = 'hote-barre';
    hote.appendChild(barre);
    montes.push(mount(Sidebar, { target: barre, props: {} }));
  }
  const lib = document.createElement('div');
  hote.appendChild(lib);
  montes.push(mount(LibraryV2, { target: lib, props: {} }));
  await poser();
  return hote;
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  urls = [];
  observes = [];
  enPanne = true;
  _remiseAZeroPourTests();
  vi.stubGlobal('fetch', vi.fn((entree: any) => {
    const url = typeof entree === 'string' ? entree : entree?.url ?? String(entree);
    urls.push(url);
    // La borne (sur les listes d’albums seules) : au-delà, plus jamais de réponse — la boucle s'arrête d'elle-même.
    if (requetesAlbums().length > PLAFOND) return new Promise<Response>(() => {});
    return Promise.resolve(servir(url));
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
  while (montes.length) unmount(montes.pop()!);
  if (hote) hote.remove();
  hote = null;
  albums.set([]);
  _remiseAZeroPourTests();
  vi.unstubAllGlobals();
});

describe('fil 1926 — un serveur en panne sur /library/albums', () => {
  it("la Bibliothèque ne relance pas la première page en boucle, dit l'erreur, et l'interface répond", { timeout: 60_000 }, async () => {
    const el = await ecranMonte(true);
    await poser();
    await poser();
    expect(requetesAlbums().length, `requêtes sans geste : ${requetesAlbums().length}`).toBeLessThanOrEqual(2);
    expect(requetesAlbums().length).toBeGreaterThanOrEqual(1);
    expect(get(albumsPagines).erreur).not.toBeNull();
    expect(get(albumsPagines).enVol.size).toBe(0);
    // L'erreur est DITE, pas une bibliothèque vide.
    expect(el.textContent).toContain(get(albumsPagines).erreur!);
    // Un clic de navigation passe.
    const reglages = el.querySelector<HTMLButtonElement>('.hote-barre button.reglages');
    expect(reglages, 'bouton Réglages de la barre introuvable').not.toBeNull();
    reglages!.click();
    flushSync();
    expect(get(activeView)).toBe('settings');
    // Et, le temps passant sans geste, rien ne repart.
    const avant = requetesAlbums().length;
    await poser();
    expect(requetesAlbums().length).toBe(avant);
  });

  it("une case vide qui entre dans le cadre ne relance pas une page en échec avant son délai", { timeout: 60_000 }, async () => {
    // La première page arrive, la deuxième échoue.
    enPanne = false;
    const el = await ecranMonte();
    expect(pagesDemandees()).toHaveLength(1);
    enPanne = true;
    const grille = el.querySelector('.grid')!;
    faireEntrer(grille.querySelector('.card.sq[data-i="150"]')!);
    await poser();
    expect(pagesDemandees()).toHaveLength(2);
    expect(get(albumsPagines).erreur).not.toBeNull();
    // D'autres cases de la même page entrent dans le cadre : pas de nouvelle
    // requête tant que le délai court, et l'échec n'a rien relancé seul.
    faireEntrer(grille.querySelector('.card.sq[data-i="160"]')!);
    faireEntrer(grille.querySelector('.card.sq[data-i="170"]')!);
    await poser();
    expect(pagesDemandees()).toHaveLength(2);
  });

  it('la liste ENTIÈRE en échec (recherche) ne se redemande pas en boucle', { timeout: 60_000 }, async () => {
    const el = await ecranMonte();
    const champ = el.querySelector<HTMLInputElement>('.v2-rech input')!;
    expect(champ).not.toBeNull();
    champ.value = 'A';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    await poser();
    await poser();
    expect(chargementsComplets().length, `chargements complets : ${chargementsComplets().length}`).toBeLessThanOrEqual(1);
    expect(requetesAlbums().length, `requêtes : ${requetesAlbums().length}`).toBeLessThanOrEqual(3);
  });
});

describe('fil 1926 — le nominal ne change pas', () => {
  it('un serveur sain : une page de 100, puis la page suivante au défilement, une seule fois', { timeout: 60_000 }, async () => {
    enPanne = false;
    const el = await ecranMonte();
    expect(pagesDemandees()).toHaveLength(1);
    const grille = el.querySelector('.grid')!;
    expect(grille.querySelectorAll('[data-i]').length).toBe(TOTAL);
    faireEntrer(grille.querySelector('.card.sq[data-i="150"]')!);
    await poser();
    expect(pagesDemandees()).toHaveLength(2);
    faireEntrer(grille.querySelector('[data-i="199"]')!);
    await poser();
    expect(pagesDemandees()).toHaveLength(2);
    expect(chargementsComplets()).toHaveLength(0);
  });
});

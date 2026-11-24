// @vitest-environment jsdom
/**
 * Fil du forum 3013 — banc de mesure ET témoin : la grille des albums en pages, sur une
 * grande bibliothèque (60 000 albums), saut à « R » puis défilement.
 *
 * Le serveur factice tient chaque page EN ATTENTE (un serveur lent) tant que
 * le banc ne la libère pas. On compte les requêtes de pages émises, celles
 * qui sont en vol en même temps, et le temps passé par l'écran à recevoir une
 * page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope, libraryLoading } from '../stores/library';
import { activeView } from '../stores/navigation';
import { _remiseAZeroPourTests, invaliderBibliotheque } from '../stores/albumsPagines';
import { bibliothequeEtendueActive } from '../bibliothequeEtendue';

const TOTAL = 60_000;
const REPERE_R = 40_000;
const album = (i: number) => ({
  id: i + 1, title: `${i >= REPERE_R ? 'R' : 'A'}${String(i).padStart(6, '0')}`,
  artist_name: 'Artiste', year: 2000, cover_path: null, source: 'local', added_at: 1_000 + i,
});

function reponse(corps: unknown): Response {
  const texte = JSON.stringify(corps);
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => texte, clone() { return this; },
  } as unknown as Response;
}
function page(u: URL) {
  const limit = Number(u.searchParams.get('limit') ?? 50);
  const offset = Number(u.searchParams.get('offset') ?? 0);
  const items = Array.from({ length: Math.max(0, Math.min(limit, TOTAL - offset)) }, (_, k) => album(offset + k));
  return reponse({ items, total: TOTAL, limit, offset, reperes_alphabetiques: { A: 0, R: REPERE_R } });
}

let urls: string[] = [];
let enAttente: { url: string; liberer: () => void }[] = [];
let enVol = 0;
let maxEnVol = 0;
const pages = () => urls.filter((u) => /\/library\/albums\?limit=100&/.test(u));

let observes: { el: Element; cb: IntersectionObserverCallback }[] = [];
function faireEntrer(el: Element) {
  for (const o of observes) {
    if (o.el === el) o.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], {} as IntersectionObserver);
  }
}
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const attendre = (ms = 30) => new Promise((r) => setTimeout(r, ms));
async function poser() { flushSync(); await attendre(); flushSync(); await attendre(); flushSync(); }

beforeEach(() => {
  try { localStorage.clear(); } catch { /* */ }
  urls = []; enAttente = []; enVol = 0; maxEnVol = 0; observes = [];
  _remiseAZeroPourTests();
  bibliothequeEtendueActive.set(false);
  vi.stubGlobal('fetch', vi.fn(async (entree: any) => {
    const url = typeof entree === 'string' ? entree : entree?.url ?? String(entree);
    urls.push(url);
    const u = new URL(url, 'http://tune.test');
    if (!u.pathname.endsWith('/library/albums')) return reponse([]);
    // La première page répond tout de suite ; les autres attendent le banc.
    if (u.searchParams.get('offset') === '0') return page(u);
    enVol++; maxEnVol = Math.max(maxEnVol, enVol);
    await new Promise<void>((r) => enAttente.push({ url, liberer: r }));
    enVol--;
    return page(u);
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
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver);
  activeView.set('library');
  libraryFolderScope.set(null as any);
  libraryLoading.set(false);
  albums.set([]);
});
afterEach(() => {
  for (const a of enAttente) a.liberer();
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  albums.set([]);
  _remiseAZeroPourTests();
  vi.unstubAllGlobals();
});

describe('fil 3013 — mesure du défilement sous « R » (60 000 albums, serveur lent)', () => {
  it('au plus deux pages en vol, la plus récente d’abord, rien de périmé ne part', { timeout: 120_000 }, async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(LibraryV2, { target: hote, props: {} });
    await poser();
    const r = [...hote.querySelectorAll<HTMLButtonElement>('.rail .rl')].find((b) => b.textContent === 'R');
    expect(r).toBeTruthy();
    r!.click();
    await poser(); await poser();
    const apresSaut = pages().length;

    // Huit « gestes » : à chacun, la première case vide de la page suivante
    // entre dans le cadre. Le serveur ne répond à aucune.
    const grille = hote.querySelector<HTMLElement>('.grid')!;
    const bornes = () => { const l = [...grille.querySelectorAll<HTMLElement>('[data-i]')].map((e) => Number(e.dataset.i)); return [l.length, Math.min(...l), Math.max(...l)]; };
    const vuApresSaut = bornes();
    let manquees = 0;
    for (let k = 1; k <= 8; k++) {
      const i = REPERE_R + k * 100;
      // jsdom n'a pas de mise en page : une colonne, un pas de 210 px.
      grille.scrollTop = i * 210;
      grille.dispatchEvent(new Event('scroll'));
      await poser();
      const el = grille.querySelector(`[data-i="${i}"]`);
      if (el) faireEntrer(el); else manquees++;
      await poser();
    }
    const apresDefilement = pages().length;
    const maxPendantLeDefilement = maxEnVol;
    const offsetsEnvoyes = () => pages().map((u) => Number(new URL(u, 'http://x').searchParams.get('offset')));
    const envoyesApresDefilement = offsetsEnvoyes();

    // Le serveur rend la plus ancienne page en vol : la suivante à partir
    // doit être la DERNIÈRE demandée, celle que l'écran montre.
    enAttente.shift()!.liberer();
    await poser();
    const suivante = offsetsEnvoyes().at(-1);

    // Une fin de scan pendant que des pages attendent leur tour.
    invaliderBibliotheque();
    await poser(); await poser();

    // Le serveur répond enfin : temps passé à poser chaque page.
    const durees: number[] = [];
    while (enAttente.length) {
      const t = performance.now();
      enAttente.shift()!.liberer();
      await poser();
      durees.push(performance.now() - t);
    }
    console.log('[banc 3013 web]', JSON.stringify({
      apresSaut, vuApresSaut, manquees, fin: bornes(), apresDefilement, maxPendantLeDefilement,
      envoyesApresDefilement, suivante, offsets: offsetsEnvoyes(), msParPage: durees.map((d) => Math.round(d)),
    }));

    expect(manquees, 'le banc doit voir chaque case visée').toBe(0);
    // 🔴 Avant : neuf pages en vol à la fois pour huit gestes.
    expect(maxPendantLeDefilement, 'pages en vol en même temps').toBeLessThanOrEqual(2);
    expect(suivante, 'la page en vue passe avant celles déjà dépassées').toBe(REPERE_R + 800);
    // Les pages dépassées, périmées par la fin de scan avant d'être parties,
    // ne partent jamais.
    for (const o of [200, 300, 400, 500, 600, 700]) {
      expect(offsetsEnvoyes(), `page ${REPERE_R + o}`).not.toContain(REPERE_R + o);
    }
  });
});

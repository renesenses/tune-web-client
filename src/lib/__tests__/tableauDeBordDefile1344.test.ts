// @vitest-environment jsdom
//
// #1344 — FabienM, forum fil 1859, 20/09/2026 09 h 04, 0.9.158, Windows,
// point 6 sur 6 :
//
//   « La page "Tableau de bord" est mal désignée. Impossible de scroller pour
//     faire défiler par le bas, espace perdu en dessous de Recommandations »
//
// ## LA CAUSE, LUE DANS LA COQUILLE
//
// `ShellV2` monte DEUX composants en FRÈRES sur cette vue :
//
//     {:else if $activeView === 'dashboard'}
//       <DashboardView />
//       <RecommendationsSection />
//
// et `.main{min-width:0; overflow:hidden; display:flex; position:relative}`,
// avec `.main > :global(*){flex:1 1 auto; …}`. D'où les DEUX moitiés de la
// plainte, et elles n'ont qu'une seule cause — la mise en page :
//
//  1. **rien ne défile** : `.main` COUPE ce qui dépasse, et chaque écran de la
//     coquille porte son propre conteneur de défilement (`.scroll` dans
//     `HistoriqueV2`, `SearchV2`, …). `DashboardView` n'en a pas : sa racine
//     `.dashboard` n'a ni `overflow-y` ni hauteur. « Top artistes » est donc
//     coupé au bas de la fenêtre, hors d'atteinte ;
//  2. **la colonne de droite** : `RecommendationsSection` n'est pas empilé
//     SOUS le tableau de bord, il est posé À CÔTÉ par le `display:flex` du
//     parent, et étiré sur toute la hauteur pour trois vignettes.
//
// ## CE QUE CE TÉMOIN REFUSE DE FAIRE
//
// Il ne cherche pas `overflow-y` dans le source : une garde de texte est
// satisfaite par la règle posée n'importe où — sur une classe morte, sur un
// écran que personne n'atteint, ou derrière une media query. La question du
// ticket est justement : QUEL élément, dans la pile réellement montée sous le
// tableau de bord, retient le débordement, et les deux blocs sont-ils côte à
// côte ou l'un sous l'autre ?
//
// Il MONTE donc la vraie coquille sur la vraie vue, avec les feuilles des
// composants COMPILÉES par Svelte (portée comprise) et posées dans le
// document, puis il LIT le style calculé. C'est le procédé du témoin de
// #1323, sur le troisième écran de la même famille.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView } from '../stores/navigation';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 900], ['clientWidth', 1656]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

/**
 * Les feuilles des trois composants en cause, compilées puis posées dans le
 * document : `getComputedStyle` répond alors sur les VRAIES règles, et sur
 * elles seules — les sélecteurs portent le suffixe de portée du composant,
 * exactement comme en production.
 */
const COMPOSANTS = [
  'src/components/v2/ShellV2.svelte',
  'src/components/v2-heritage/DashboardView.svelte',
  'src/components/v2-heritage/RecommendationsSection.svelte',
];

interface Feuille { chemin: string; portee: string; el: HTMLStyleElement }
let feuilles: Feuille[] = [];

function injecterFeuilles(): Feuille[] {
  return COMPOSANTS.map((chemin) => {
    const src = readFileSync(resolve(process.cwd(), chemin), 'utf-8');
    const { css } = compile(src, { css: 'external', filename: chemin });
    if (!css?.code) throw new Error(`${chemin} : aucune feuille compilée`);
    const portee = css.code.match(/\.(svelte-[a-z0-9]+)/)?.[1];
    if (!portee) throw new Error(`${chemin} : aucune classe de portée`);
    const el = document.createElement('style');
    el.textContent = css.code;
    document.head.appendChild(el);
    return { chemin, portee, el };
  });
}

/** La feuille compilée ici et le composant monté par Vite portent-ils la MÊME
 *  portée ? Sinon aucune règle ne s'applique et tout passerait au vert pour
 *  une mauvaise raison. */
function verifierPortee(racine: HTMLElement, chemin: string): void {
  const f = feuilles.find((x) => x.chemin === chemin)!;
  if (!racine.querySelectorAll(`.${f.portee}`).length) {
    throw new Error(`${chemin} : la portée ${f.portee} n'est sur aucun élément monté`);
  }
}

/**
 * 🔴 UN ÉLÉMENT DU COMPOSANT NOMMÉ, et d'aucun autre.
 *
 * `.top-section` n'est pas unique sur cet écran : `DashboardHighlights`, monté
 * DANS le tableau de bord, porte la même classe. Un `querySelector`
 * ordinaire rendait donc le bloc des classements, dont le parent n'a jamais
 * été `.main` — le témoin échouait en désignant le mauvais élément. On
 * qualifie par la classe de PORTÉE du composant, celle-là même que Svelte
 * pose et que `verifierPortee` confronte au DOM monté.
 */
function dansLeComposant(racine: HTMLElement, chemin: string, selecteur: string): HTMLElement | null {
  const f = feuilles.find((x) => x.chemin === chemin)!;
  return racine.querySelector<HTMLElement>(`${selecteur}.${f.portee}`);
}

/** Le premier ancêtre qui RETIENT le débordement, `.main` exclu (il COUPE). */
function ascenseurAuDessus(depart: Element): HTMLElement | null {
  let n: Element | null = depart;
  while (n && !n.classList.contains('main')) {
    const o = getComputedStyle(n as HTMLElement).overflowY;
    if (o === 'auto' || o === 'scroll') return n as HTMLElement;
    n = n.parentElement;
  }
  return null;
}

/** La chaîne des classes, du départ à `.main` — de quoi lire un échec. */
function pile(depart: Element): string {
  const out: string[] = [];
  let n: Element | null = depart;
  while (n && n !== document.body) {
    const c = [...n.classList].filter((x) => !x.startsWith('svelte-')).join('.');
    out.push(c ? `.${c}` : n.tagName.toLowerCase());
    if (n.classList.contains('main')) break;
    n = n.parentElement;
  }
  return out.join(' < ');
}

/** Douze recommandations : celles de la capture, et de quoi déborder. */
const RECOS = Array.from({ length: 12 }, (_, i) => ({
  id: 300 + i, title: `Reco ${i + 1}`, artist_name: `Artiste ${i + 1}`, cover_path: null,
}));

const TABLEAU = {
  total_plays: 76, total_listening_ms: 25_440_000, unique_tracks: 54, unique_artists: 43,
  top_artists: Array.from({ length: 10 }, (_, i) => ({ artist_name: `Artiste ${i + 1}`, plays: 20 - i, listening_ms: 600_000 })),
  top_albums: [], top_tracks: [], by_hour: [], by_weekday: [], on_this_day: [],
};

function corpsPour(url: string): unknown {
  if (url.includes('/recommendations')) return RECOS;
  if (url.includes('/history/dashboard')) return TABLEAU;
  if (url.includes('/stats')) return { track_count: 0, album_count: 0 };
  return [];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

/** La coquille, sur la vue « Tableau de bord » — celle de la capture. */
async function poserTableauDeBord(): Promise<HTMLElement> {
  history.replaceState(null, '', '/#dashboard');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote });
  activeView.set('dashboard');
  for (let i = 0; i < 20; i++) await respirer();
  flushSync();
  verifierPortee(hote, 'src/components/v2/ShellV2.svelte');
  return hote;
}

beforeEach(() => {
  locale.set('fr');
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  feuilles = injecterFeuilles();
  activeView.set('home');
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
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
  for (const f of feuilles) f.el.remove();
  feuilles = [];
  activeView.set('home');
  try { localStorage.clear(); } catch { /* idem */ }
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

describe('#1344 — Tableau de bord : « impossible de scroller »', () => {
  it('la mesure qui FONDE le ticket : la zone de contenu coupe le débordement', async () => {
    const el = await poserTableauDeBord();
    const main = el.querySelector<HTMLElement>('.main')!;
    const cs = getComputedStyle(main);
    // Sans ces deux règles, ce qui dépasse resterait atteignable et il n'y
    // aurait rien à corriger : c'est la prémisse du ticket, et on la mesure.
    expect(cs.overflow || cs.overflowY).toContain('hidden');
    expect(['auto', 'scroll']).not.toContain(cs.overflowY);
  });

  it('🔴 le tableau de bord a un ascenseur au-dessus de lui', async () => {
    const el = await poserTableauDeBord();
    const tb = el.querySelector<HTMLElement>('.main .dashboard');
    expect(tb, 'le tableau de bord n’est pas rendu : le montage a échoué').not.toBeNull();
    verifierPortee(el, 'src/components/v2-heritage/DashboardView.svelte');

    expect(
      ascenseurAuDessus(tb!),
      `rien ne retient le débordement entre le tableau de bord et .main — pile : ${pile(tb!)}`,
    ).not.toBeNull();
  });

  it('🔴 « Recommandations » est EMPILÉ sous le tableau de bord, pas posé à côté', async () => {
    const el = await poserTableauDeBord();
    verifierPortee(el, 'src/components/v2-heritage/RecommendationsSection.svelte');
    const tb = el.querySelector<HTMLElement>('.main .dashboard');
    const recos = dansLeComposant(el, 'src/components/v2-heritage/RecommendationsSection.svelte', '.main .top-section');
    expect(tb, 'le tableau de bord n’est pas rendu').not.toBeNull();
    expect(recos, 'les recommandations ne sont pas rendues : le décor n’a pas pris').not.toBeNull();

    // Ils partagent un parent — et ce parent n'est plus `.main` : c'est lui
    // qui porte l'ascenseur mesuré ci-dessus.
    const parent = tb!.parentElement!;
    expect(
      recos!.parentElement,
      'le tableau de bord et les recommandations ne sont pas dans le même conteneur',
    ).toBe(parent);
    expect(
      parent.classList.contains('main'),
      'les deux blocs sont toujours des frères DIRECTS de .main : ils subissent son display:flex',
    ).toBe(false);

    // Et ce parent EMPILE : ni rangée flex, ni colonnes. C'est la seconde
    // moitié de la plainte — « espace perdu en dessous de Recommandations ».
    const cs = getComputedStyle(parent);
    if (cs.display === 'flex' || cs.display === 'inline-flex') {
      expect(cs.flexDirection, 'le conteneur pose les deux blocs EN LIGNE').toBe('column');
    }
    expect(cs.display, 'le conteneur est en colonnes : les blocs restent côte à côte').not.toContain('grid');

    // Le repère qui tranche sans mise en page : dans l'ordre du document,
    // les recommandations viennent APRÈS le tableau de bord.
    expect(
      tb!.compareDocumentPosition(recos!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

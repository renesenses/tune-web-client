// @vitest-environment jsdom
//
// #1137 — « Défilement des pochettes : ni molette ni flèches ».
//
// Pascal (bluevelvet), fil 1765, 11/09/2026, rejoignant Mac Brehlit :
//
// > « Sur PC, il serait très pratique de pouvoir faire défiler les pochettes
// >   avec les touches fléchées du clavier ou par scrolling avec la molette,
// >   sans avoir à attraper précisément la barre de défilement. Il en va de
// >   même pour les rangées d'albums présentées horizontalement. »
//
// Le geste lui-même existe depuis #1327 (`lib/defilementHorizontal.ts`) et ses
// témoins sont dans `defilementHorizontal1137.test.ts`. Ce qui manquait, c'est
// le BRANCHEMENT : il n'était posé que sur les bandes de `PageWidgets` et le
// carrousel de `LibraryV2`. Quatre rangées de pochettes restaient sans lui —
// « Top artistes », « Mix par genre » et « Radios favorites » du tableau de
// bord, « Recommandations » de l'accueil — et ces quatre-là masquent EN PLUS
// leur ascenseur (`scrollbar-width:none`, `::-webkit-scrollbar{display:none}`).
// Il n'y avait donc même pas la barre que Pascal accepte d'attraper : à la
// souris, ces rangées étaient inatteignables au-delà de ce qui tenait à
// l'écran. Le bandeau du palmarès de `PodcastsV2` est dans le même cas, barre
// visible.
//
// ## 🔴 CE QUE CE TÉMOIN NE PEUT PAS PROUVER
//
// jsdom ne met rien en page : aucune largeur, aucun débordement, aucun
// ascenseur. `scrollWidth`, `clientWidth` et `scrollBy` n'y existent qu'autant
// qu'on les pose. Ce fichier ne prouve donc NI qu'une rangée déborde
// réellement à l'écran, NI de combien de pixels elle avance pour de vrai, NI
// l'arbitrage avec la page sous une vraie mise en page (celui-là se lit dans
// les témoins de `deplacementMolette`, qui le jugent sur des nombres).
//
// Ce qu'il prouve, et qui est précisément ce qui manquait : sur la rangée
// RÉELLEMENT RENDUE par chaque composant, un `wheel` vertical et un
// `ArrowRight`/`ArrowLeft` produisent un déplacement HORIZONTAL, la rangée est
// atteignable au clavier (`tabindex`), et arrivée au bout elle LAISSE PASSER
// l'événement au lieu de figer la page. Une rangée sans le branchement échoue
// ici : rien ne bouge et l'événement n'est pas pris.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { t } from '../i18n';
import DashboardHighlights from '../../components/v2-heritage/DashboardHighlights.svelte';
import RecommendationsSection from '../../components/v2-heritage/RecommendationsSection.svelte';
import PodcastsV2 from '../../components/v2/PodcastsV2.svelte';
import { PAS_FLECHE } from '../defilementHorizontal';

vi.setConfig({ testTimeout: 30_000 });

/** Ce que rend le serveur, par route. Tout le reste : une liste vide. */
function corpsPour(url: string): unknown {
  if (url.includes('/library/history/top-artists')) {
    return Array.from({ length: 12 }, (_, i) => ({
      artist_id: 100 + i, name: `Artiste ${i + 1}`, plays: 30 - i, listening_ms: 600_000,
    }));
  }
  if (url.includes('/home/top-mixes')) {
    return Array.from({ length: 8 }, (_, i) => ({
      genre: `Genre ${i + 1}`, track_count: 20 + i, playlist_id: 500 + i,
    }));
  }
  if (url.includes('/home/radio-picks')) {
    return Array.from({ length: 8 }, (_, i) => ({
      id: 700 + i, name: `Radio ${i + 1}`, logo_url: null,
    }));
  }
  if (url.includes('/library/recommendations')) {
    return Array.from({ length: 12 }, (_, i) => ({
      id: 300 + i, title: `Album ${i + 1}`, artist_name: `Artiste ${i + 1}`, cover_path: null,
    }));
  }
  if (url.includes('/podcasts/top')) {
    return Array.from({ length: 20 }, (_, i) => ({
      id: 900 + i, feed_url: `https://exemple.test/f${i}.xml`,
      title: `Podcast ${i + 1}`, author: `Auteur ${i + 1}`, image_url: null,
    }));
  }
  if (url.includes('/library/stats')) return { tracks: 0, albums: 0, artists: 0 };
  return [];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

async function monterEcran(composant: any): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: {} });
  for (let i = 0; i < 20; i++) await respirer();
  flushSync();
  return hote;
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
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
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

/**
 * La seule mise en page que jsdom n'a pas : une rangée qui DÉBORDE.
 *
 * 1 200 px de pochettes dans 400 px de fenêtre, une position qui se retient, et
 * `scrollBy` qui l'applique en la bornant — c'est ce que fait le navigateur, et
 * c'est tout ce dont le geste a besoin pour être jugé.
 */
function poserRangee(el: HTMLElement, largeurContenu = 1200, largeurCadre = 400) {
  let position = 0;
  const max = largeurContenu - largeurCadre;
  Object.defineProperty(el, 'scrollWidth', { get: () => largeurContenu, configurable: true });
  Object.defineProperty(el, 'clientWidth', { get: () => largeurCadre, configurable: true });
  Object.defineProperty(el, 'scrollLeft', {
    get: () => position,
    set: (v: number) => { position = Math.max(0, Math.min(max, v)); },
    configurable: true,
  });
  Object.defineProperty(el, 'scrollBy', {
    value: (o: ScrollToOptions) => { position = Math.max(0, Math.min(max, position + (o?.left ?? 0))); },
    configurable: true,
  });
  return {
    position: () => position,
    aller: (v: number) => { position = Math.max(0, Math.min(max, v)); },
    max,
  };
}

/** Un cran de molette VERTICAL, rendu tel quel : c'est le geste de Pascal. */
function molette(el: HTMLElement, deltaY: number, majuscule = false): WheelEvent {
  const e = new WheelEvent('wheel', { deltaX: 0, deltaY, shiftKey: majuscule, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}

function touche(el: HTMLElement, key: string): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}

/** Les quatre exigences, sur une rangée réellement rendue par un écran. */
function exigerLeGeste(rangee: HTMLElement, ou: string) {
  const modele = poserRangee(rangee);

  // 1. La molette VERTICALE déplace la rangée en LARGEUR.
  const bas = molette(rangee, 120);
  expect(modele.position(), `${ou} : la molette ne déplace pas la rangée`).toBe(120);
  expect(bas.defaultPrevented, `${ou} : la molette n’est pas prise`).toBe(true);

  // 1 bis. `Maj` + molette, l'idiome universel, marche en toutes circonstances.
  molette(rangee, 60, true);
  expect(modele.position(), `${ou} : Maj+molette ne déplace pas la rangée`).toBe(180);

  // 2. Et dans l'autre sens.
  molette(rangee, -60);
  expect(modele.position(), `${ou} : la molette ne revient pas en arrière`).toBe(120);

  // 3. Les FLÈCHES, l'autre moitié de la demande de Pascal.
  const droite = touche(rangee, 'ArrowRight');
  expect(modele.position(), `${ou} : la flèche droite ne déplace pas la rangée`).toBe(120 + PAS_FLECHE);
  expect(droite.defaultPrevented, `${ou} : la flèche droite n’est pas prise`).toBe(true);
  touche(rangee, 'ArrowLeft');
  expect(modele.position(), `${ou} : la flèche gauche ne déplace pas la rangée`).toBe(120);

  // 4. Atteignable au clavier : sans cela, aucune flèche n'arrive jamais.
  expect(rangee.getAttribute('tabindex'), `${ou} : la rangée n’est pas atteignable au clavier`).toBe('0');

  // 5. 🔴 Arrivée au bout, elle LAISSE PASSER — sinon la page se fige dès
  //    qu'on survole une rangée, et c'est le défaut de #1327.
  modele.aller(modele.max);
  const apresButee = molette(rangee, 120);
  expect(apresButee.defaultPrevented, `${ou} : la rangée confisque la molette en butée`).toBe(false);
  expect(modele.position()).toBe(modele.max);

  // 6. Une touche qui n'est pas une flèche ne lui appartient pas.
  modele.aller(200);
  const autre = touche(rangee, 'a');
  expect(autre.defaultPrevented).toBe(false);
  expect(modele.position()).toBe(200);
}

/** La rangée du composant, nommée par sa classe — et une seule. */
function rangeeDe(el: HTMLElement, classe: string): HTMLElement {
  const trouvees = el.querySelectorAll<HTMLElement>(`.${classe}`);
  expect(trouvees.length, `« .${classe} » n’est pas rendue : le montage a échoué`).toBe(1);
  return trouvees[0];
}

describe('#1137 — le tableau de bord : ses trois rangées répondent à la molette et aux flèches', () => {
  it('🔴 « Top artistes »', async () => {
    const el = await monterEcran(DashboardHighlights);
    exigerLeGeste(rangeeDe(el, 'top-artists-row'), 'Top artistes');
  });

  it('🔴 « Mix par genre »', async () => {
    const el = await monterEcran(DashboardHighlights);
    exigerLeGeste(rangeeDe(el, 'mixes-row'), 'Mix par genre');
  });

  it('🔴 « Radios favorites »', async () => {
    const el = await monterEcran(DashboardHighlights);
    exigerLeGeste(rangeeDe(el, 'recs-carousel'), 'Radios favorites');
  });
});

describe('#1137 — l’accueil : « Recommandations » répond à la molette et aux flèches', () => {
  it('🔴 la rangée des pochettes recommandées', async () => {
    const el = await monterEcran(RecommendationsSection);
    exigerLeGeste(rangeeDe(el, 'recs-carousel'), 'Recommandations');
  });

  it('🔴 et le bandeau du palmarès des podcasts, dix pochettes numérotées', async () => {
    const el = await monterEcran(PodcastsV2);
    // Le palmarès est la section « Tous » du second niveau d'onglets : on
    // l'ouvre comme l'utilisateur, par son bouton, et non en forçant un état.
    const tous = get(t)('v2.pod.secAll' as never);
    const onglet = Array.from(el.querySelectorAll<HTMLButtonElement>('nav.sections button[role="tab"]'))
      .find((b) => b.textContent?.trim() === tous);
    expect(onglet, 'l’onglet du palmarès n’est pas rendu').toBeTruthy();
    onglet!.click();
    for (let i = 0; i < 20; i++) await respirer();
    flushSync();
    exigerLeGeste(rangeeDe(el, 'tete'), 'Palmarès des podcasts');
  });

  it('elle se nomme pour les lecteurs d’écran, comme les bandes de l’accueil', async () => {
    const el = await monterEcran(RecommendationsSection);
    const rangee = rangeeDe(el, 'recs-carousel');
    expect(rangee.getAttribute('role')).toBe('group');
    expect(rangee.getAttribute('aria-label')?.length).toBeGreaterThan(0);
  });
});

// @vitest-environment jsdom
//
// #929 — UN MODE DE PARCOURS EN CARROUSEL POUR LA VUE ALBUMS.
//
// OLIVE, fil 1483, 19/08/2026 : « Pourrait-on envisager une vue des albums en
// 3D comme sur JRiver ». La réponse de Bertrand, vingt-quatre minutes plus
// tard, déplace la demande et c'est elle qu'on construit ici :
//
// > « On écoute en grand, mais on parcourt sa bibliothèque en petit, sur une
// > grille pensée pour un bureau. […] Le plaisir vient des pochettes en
// > grand, pas de la troisième dimension — et les deux ne sont pas liés. »
//
// Mesuré avant d'écrire une ligne, sur le `main` du 20/09/2026 : ZÉRO
// occurrence de carrousel, de cover-flow ou de `perspective` dans le client ;
// la grille `minmax(148px,1fr)` de `LibraryV2` est le SEUL mode de parcours.
// `TvView` n'est pas une piste : c'est un mode d'ÉCOUTE, sans liste ni grille.
//
// ## Ce que ces témoins gardent, et pourquoi chacun existe
//
// 1. 🔴 LA MOLETTE ET LE CLAVIER NE VOLENT PAS LE DÉFILEMENT DE LA PAGE.
//    C'est le défaut que #1327 vient tout juste de corriger sur les rangées
//    éditoriales (Gros Bidon, fil 1858, 20/09 : « la zone permettant le
//    défilement vers le bas est très étroite »). Le seul moyen de ne pas le
//    réintroduire est de ne PAS réécrire le geste : le carrousel emploie
//    l'action partagée `use:defilementHorizontal`. Le témoin ne lit pas le
//    source pour s'en assurer — il dispatche un vrai `wheel` sur le vrai
//    nœud monté, avec un ancêtre qui peut encore défiler.
// 2. 🔴 LE NOMBRE D'ALBUMS NE CHANGE PAS. Le carrousel montre la MÊME liste
//    que la grille, filtrée et triée par les mêmes contrôles — pas un
//    sous-ensemble, pas un « les cinquante premiers ». Le témoin compare les
//    titres RENDUS dans les deux modes, puis rejoue la comparaison après un
//    changement de tri.
// 3. 🔴 RIEN NE SE MONTE TANT QUE LE MODE N'EST PAS CHOISI. Pas de seconde
//    liste peinte en permanence sous la grille : c'est le sujet de #1256, et
//    on n'y ajoute pas. Le témoin vérifie l'ABSENCE du carrousel dans l'arbre
//    tant que la grille est active, et l'absence de la grille ensuite.
//
// ⚠️ Ce que ce fichier ne peut pas prouver : jsdom ne met rien en page. Les
// largeurs de pochette, la perspective et l'aspect « défilé de pochettes » ne
// se jugent que dans un navigateur. Les dimensions lues par l'action sont donc
// POSÉES à la main sur le nœud (`defineProperty`), exactement comme le
// navigateur les rendrait sur une rangée qui déborde.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { albums, libraryLoading, libraryFolderScope } from '../stores/library';
import { activeView } from '../stores/navigation';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/**
 * Sept albums, dont l'ordre par TITRE et l'ordre par ARTISTE diffèrent : sans
 * cela, le témoin du tri passerait sur une liste qui ne bouge pas.
 */
const ALBUMS = [
  { id: 1, title: 'Abbey Road', artist_name: 'Zappa, Frank', year: 1969, cover_path: null, source: 'local' },
  { id: 2, title: 'Blue Train', artist_name: 'Coltrane, John', year: 1957, cover_path: null, source: 'local' },
  { id: 3, title: 'Cosmogramma', artist_name: 'Ellington, Duke', year: 2010, cover_path: null, source: 'local' },
  { id: 4, title: 'Dummy', artist_name: 'Barbieri, Gato', year: 1994, cover_path: null, source: 'local' },
  { id: 5, title: 'Either/Or', artist_name: 'Yorke, Thom', year: 1997, cover_path: null, source: 'local' },
  { id: 6, title: 'Funeral', artist_name: 'Ayler, Albert', year: 2004, cover_path: null, source: 'local' },
  { id: 7, title: 'Grace', artist_name: 'Davis, Miles', year: 1994, cover_path: null, source: 'local' },
];

const TITRES_PAR_TITRE = ALBUMS.map((a) => a.title);
const TITRES_PAR_ARTISTE = [...ALBUMS]
  .sort((x, y) => x.artist_name.localeCompare(y.artist_name))
  .map((a) => a.title);

function reponsePour() {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => [],
    text: async () => '[]',
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

const attendre = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function ecranMonte(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  flushSync();
  return hote;
}

/** Le bouton qui fait tourner les modes d'affichage. Il PORTE le mode courant. */
function bascule(el: HTMLElement): HTMLButtonElement {
  const b = el.querySelector<HTMLButtonElement>('button.viewtog[data-vue]');
  expect(b, 'la bascule d’affichage n’expose pas le mode courant (`data-vue`)').not.toBeNull();
  return b!;
}

/** Amène l'écran sur un mode donné en cliquant la bascule, au plus trois fois. */
function allerA(el: HTMLElement, mode: string) {
  for (let i = 0; i < 4; i++) {
    const b = bascule(el);
    if (b.dataset.vue === mode) return;
    b.click();
    flushSync();
  }
  throw new Error(`le mode « ${mode} » n’est pas atteignable par la bascule`);
}

/** Les titres RENDUS, dans l'ordre du DOM — pas ceux du magasin. */
const titresRendus = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLElement>('.card .ct, .ccard .ct, .lrow .ltt')].map((n) => n.textContent!.trim());

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  vi.stubGlobal('fetch', vi.fn(async () => reponsePour()));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
  activeView.set('library');
  libraryFolderScope.set(null as any);
  libraryLoading.set(false);
  albums.set(ALBUMS as any);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  albums.set([] as any);
  vi.unstubAllGlobals();
});

describe('#929 — le carrousel est un mode DE PLUS, pas un remplacement', () => {
  it('🔴 la bascule atteint un troisième mode, et la grille reste accessible', async () => {
    const el = await ecranMonte();

    expect(bascule(el).dataset.vue, 'l’écran ne s’ouvre plus sur la grille').toBe('grid');
    allerA(el, 'carousel');
    expect(
      el.querySelector('.carrou'),
      'aucun carrousel monté : le troisième mode n’existe pas',
    ).not.toBeNull();

    // Et on en ressort : un mode dont on ne peut pas sortir remplacerait la
    // grille au lieu de s'ajouter à elle.
    allerA(el, 'grid');
    expect(el.querySelector('.grid .card'), 'la grille n’est pas revenue').not.toBeNull();
  });

  it('🔴 le choix survit à un rechargement — il se range avec les autres choix de l’écran', async () => {
    const el = await ecranMonte();
    allerA(el, 'carousel');

    expect(
      localStorage.getItem('tune_v2_ecran_lib.display'),
      'le mode carrousel n’est pas retenu : au retour, l’écran repart sur la grille',
    ).toBe('carousel');

    // Et il est RELU : un choix écrit mais refusé à la lecture par
    // `lireChoix` retomberait silencieusement sur la grille (la liste permise
    // valide chaque valeur, voir `preferencesEcran`).
    unmount(monte!); monte = null; hote!.remove(); hote = null;
    const el2 = await ecranMonte();
    expect(
      bascule(el2).dataset.vue,
      'le mode retenu n’est pas relu : `carousel` n’est pas dans la liste permise de `lireChoix`',
    ).toBe('carousel');
  });
});

describe('#929 — le nombre d’albums ne change pas', () => {
  it('🔴 le carrousel rend EXACTEMENT les albums de la grille, dans le même ordre', async () => {
    const el = await ecranMonte();

    const enGrille = titresRendus(el);
    expect(enGrille, 'la grille n’a rien rendu : le témoin ne mesure plus rien').toEqual(TITRES_PAR_TITRE);

    allerA(el, 'carousel');
    const enCarrousel = titresRendus(el);
    expect(
      enCarrousel.length,
      'le carrousel ne montre pas le même nombre d’albums que la grille',
    ).toBe(enGrille.length);
    expect(enCarrousel, 'le carrousel a re-filtré ou re-trié la liste pour son compte').toEqual(enGrille);
  });

  it('🔴 il suit le TRI de l’écran, comme la grille', async () => {
    const el = await ecranMonte();
    allerA(el, 'carousel');

    // Le menu de tri est celui de l'écran : le carrousel n'a pas le sien.
    const parArtiste = [...el.querySelectorAll<HTMLButtonElement>('.menu button')]
      .find((b) => /artist/i.test(b.textContent ?? '') || b.textContent?.trim() === 'Artiste');
    expect(parArtiste, 'le menu de tri de l’écran a disparu en mode carrousel').not.toBeUndefined();
    parArtiste!.click();
    flushSync();

    expect(
      titresRendus(el),
      'le carrousel ignore le tri de l’écran : il ne montre pas la même liste',
    ).toEqual(TITRES_PAR_ARTISTE);
  });
});

describe('#929 — rien ne se monte tant que le mode n’est pas choisi', () => {
  it('🔴 aucun carrousel dans l’arbre tant que la grille est active', async () => {
    const el = await ecranMonte();
    expect(
      el.querySelector('.carrou'),
      'une seconde liste est peinte sous la grille — c’est le sujet de #1256, on n’y ajoute pas',
    ).toBeNull();
  });

  it('🔴 la grille quitte l’arbre quand le carrousel prend la main', async () => {
    const el = await ecranMonte();
    allerA(el, 'carousel');
    expect(
      el.querySelector('.grid .card'),
      'la grille reste montée sous le carrousel : deux fois les mêmes pochettes en mémoire',
    ).toBeNull();
    expect(el.querySelector('.rows .lrow'), 'la liste reste montée sous le carrousel').toBeNull();
  });
});

describe('#929 — la molette et le clavier ne volent pas le défilement de la page', () => {
  /**
   * Pose sur un nœud les dimensions que le navigateur rendrait. jsdom ne met
   * rien en page : sans cela, `scrollWidth === clientWidth === 0`, l'action
   * jugerait la rangée non défilante et le témoin serait VIDE — un vert qui
   * ne garde rien.
   */
  function mesurer(el: HTMLElement, d: Record<string, number>) {
    for (const [k, v] of Object.entries(d)) {
      Object.defineProperty(el, k, { value: v, configurable: true, writable: true });
    }
  }

  async function carrouselMesure() {
    const el = await ecranMonte();
    allerA(el, 'carousel');
    const rangee = el.querySelector<HTMLElement>('.carrou');
    expect(rangee, 'pas de carrousel monté').not.toBeNull();
    // La rangée déborde, et elle est AU MILIEU de sa course : c'est le cas
    // courant, et c'est précisément celui que #1327 avait mal gardé.
    mesurer(rangee!, { scrollLeft: 300, scrollWidth: 4000, clientWidth: 900 });
    // La page, elle, peut encore descendre.
    mesurer(hote!, { scrollTop: 0, scrollHeight: 3000, clientHeight: 800 });
    rangee!.scrollBy = vi.fn();
    return rangee!;
  }

  it('🔴 la molette VERTICALE reste à la page tant qu’elle peut descendre', async () => {
    const rangee = await carrouselMesure();
    const e = new WheelEvent('wheel', { deltaY: 120, deltaX: 0, bubbles: true, cancelable: true });
    rangee.dispatchEvent(e);
    expect(
      e.defaultPrevented,
      'le carrousel confisque la molette : la page ne défile plus dès qu’on le survole — c’est le défaut #1327, réintroduit',
    ).toBe(false);
    expect(rangee.scrollBy, 'le carrousel a bougé alors qu’il laissait passer l’événement').not.toHaveBeenCalled();
  });

  it('🔴 `Maj` + molette fait défiler le carrousel, lui', async () => {
    const rangee = await carrouselMesure();
    const e = new WheelEvent('wheel', { deltaY: 120, deltaX: 0, shiftKey: true, bubbles: true, cancelable: true });
    rangee.dispatchEvent(e);
    expect(e.defaultPrevented, '`Maj` + molette ne fait rien : l’idiome universel du défilement horizontal est perdu').toBe(true);
    expect(rangee.scrollBy).toHaveBeenCalled();
  });

  it('🔴 les flèches ←/→ déplacent le carrousel, et il est atteignable au clavier', async () => {
    const rangee = await carrouselMesure();
    expect(
      rangee.getAttribute('tabindex'),
      'le carrousel n’est pas atteignable au clavier : l’action partagée ne lui est pas appliquée',
    ).toBe('0');
    const e = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    rangee.dispatchEvent(e);
    expect(e.defaultPrevented, 'la flèche droite ne déplace pas le carrousel').toBe(true);
    expect(rangee.scrollBy).toHaveBeenCalled();
  });

  it('🔴 le geste n’est pas RÉÉCRIT : c’est l’action partagée, corrigée par #1327', () => {
    const src = lire('../../components/v2/LibraryV2.svelte');
    expect(src, 'le carrousel n’emploie pas l’action partagée').toContain('use:defilementHorizontal');
    // Une copie locale du geste divergerait au premier correctif — et c'est
    // ainsi que le défaut de #1327 reviendrait par la porte de derrière.
    expect(src, 'un second gestionnaire de molette a été écrit dans l’écran').not.toMatch(/onwheel=|addEventListener\('wheel'/);
  });
});

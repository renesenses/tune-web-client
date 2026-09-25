/**
 * LA FENÊTRE DE RENDU DE LA BIBLIOTHÈQUE — tune-web-client#1562.
 *
 * jfpaquet, fil 1919, 0.9.163 Windows, 6 704 albums : « using the little
 * button to change between the 3 albums views does not work well : hesitating
 * and slow, and I've put only 6 thousands albums. I fear that will be a
 * problem with 40.000+ albums. »
 *
 * ## Ce qu'une bascule coûtait (mesuré sous jsdom, 6 704 albums)
 *
 * Les trois vues sont trois branches `{#if}` sœurs : une bascule démonte la
 * collection ENTIÈRE et remonte la collection ENTIÈRE dans l'autre dessin.
 *
 *  - liste entière chargée (dès qu'une facette, la recherche ou la frise l'a
 *    demandée — et en 0.9.163, toujours) : 6 704 vignettes pleines montées à
 *    chaque clic, 228 000 nœuds pour la grille et le carrousel, 60 000 pour la
 *    liste ; et au premier montage, un `GET /library/albums/{id}` par album
 *    sans pochette (`AlbumArt` va la chercher) ;
 *  - en pages (#4800) : 6 704 cases, vides pour la plupart, remontées de même.
 *
 * Le coût était LINÉAIRE en nombre d'albums : la crainte de 40 000 était
 * fondée. `content-visibility:auto` (#1559) épargne la peinture des cases hors
 * du cadre, pas leur création.
 *
 * ## Ce que fait la fenêtre
 *
 * Au-delà de `SEUIL_SANS_FENETRE` albums, chaque vue ne monte que ses
 * `FENETRE_INITIALE` premiers, suivis d'une
 * CALE : un seul élément, de la taille estimée de tout ce qui reste, qui tient
 * la barre de défilement honnête. Quand la cale approche du cadre, la fenêtre
 * s'élargit — d'un pas, ou d'autant qu'il faut pour couvrir le cadre si l'on a
 * tiré la barre loin d'un coup. Une bascule coûte donc une fenêtre, quelle que
 * soit la taille de la bibliothèque.
 *
 * La fenêtre est attachée à une CLEF (la vue, le mode paginé ou non, l'onglet) :
 * changer de vue repart d'une fenêtre neuve, SANS effet qui la remettrait à
 * zéro après coup — un effet passerait après le rendu, et la bascule aurait
 * d'abord monté l'ancienne largeur. Chaque vue a son propre conteneur
 * défilant, qui repart en haut : c'était déjà le cas avant la fenêtre.
 *
 * Le rail A–Z élargit la fenêtre jusqu'à sa cible AVANT de sauter.
 */

/**
 * En deçà, pas de fenêtre : tout est monté, comme avant. Une bascule y coûte
 * moins de six cents vignettes, et la géométrie du défilement reste exacte.
 */
export const SEUIL_SANS_FENETRE = 600;
/** Ce qu'une vue monte d'emblée : plus que ce que montre un grand écran. */
export const FENETRE_INITIALE = 200;
/** Ce qu'on ajoute quand la cale approche du cadre. */
export const PAS_FENETRE = 200;

export interface Fenetre {
  clef: string;
  n: number;
}

export const fenetreNeuve = (clef = ''): Fenetre => ({ clef, n: FENETRE_INITIALE });

/**
 * Le nombre d'éléments à monter pour la clef courante, sur une liste de
 * `total` éléments.
 */
export function plafondDe(f: Fenetre, clef: string, total = Number.POSITIVE_INFINITY): number {
  if (total <= SEUIL_SANS_FENETRE) return total;
  return f.clef === clef ? f.n : FENETRE_INITIALE;
}

/**
 * La fenêtre élargie d'un pas — ou jusqu'à `jusqua` éléments si c'est plus
 * (saut A–Z, barre tirée loin). Ne rétrécit jamais.
 */
export function elargir(f: Fenetre, clef: string, jusqua = 0): Fenetre {
  const n = f.clef === clef ? f.n : FENETRE_INITIALE;
  return { clef, n: Math.max(n + PAS_FENETRE, Math.ceil(jusqua)) };
}

export interface OptionsCale {
  /** Éléments NON montés, que la cale représente. */
  restant: number;
  /** Éléments montés avant elle. */
  rendus: number;
  /** Le sens du défilement : la liste et la grille descendent, le carrousel file. */
  horizontal?: boolean;
  /** Taille par élément quand rien n'est encore mesurable (px). */
  repli: number;
  /** La cale approche du cadre : il faut `besoin` éléments montés au total. */
  surVue: (besoin: number) => void;
}

/**
 * Taille moyenne d'un élément monté, le long du défilement : la distance du
 * premier élément à la cale, divisée par leur nombre. Sur une grille, c'est
 * une hauteur de rangée divisée par le nombre de colonnes — exactement ce
 * qu'il faut pour estimer la place du reste.
 */
function moyenne(el: HTMLElement, o: OptionsCale): number {
  const premier = el.parentElement?.firstElementChild as HTMLElement | null;
  if (!premier || premier === el || o.rendus <= 0) return o.repli;
  const a = premier.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  const d = o.horizontal ? b.left - a.left : b.top - a.top;
  return d > 0 ? d / o.rendus : o.repli;
}

/**
 * La cale en fin de vue. Action Svelte : `use:cale={{ … }}`.
 *
 * Elle se dimensionne, et observe son entrée dans le cadre de son conteneur
 * (le parent, qui défile). À chaque élargissement, elle se RE-observe : si elle
 * est encore dans le cadre (barre tirée tout en bas), l'observateur le redit
 * aussitôt, et la fenêtre continue de s'élargir jusqu'à couvrir la vue.
 */
export function cale(el: HTMLElement, options: OptionsCale) {
  let o = options;
  const dimensionner = () => {
    const taille = `${Math.max(0, Math.round(o.restant * moyenne(el, o)))}px`;
    if (o.horizontal) el.style.width = taille; else el.style.height = taille;
  };
  const besoin = (): number => {
    const racine = el.parentElement;
    if (!racine) return o.rendus;
    const m = moyenne(el, o);
    const r = racine.getBoundingClientRect();
    const c = el.getBoundingClientRect();
    // Jusqu'où il faut monter : le bord lointain du cadre, plus un cadre.
    const fin = o.horizontal ? r.right + racine.clientWidth : r.bottom + racine.clientHeight;
    const debut = o.horizontal ? c.left : c.top;
    return o.rendus + (m > 0 ? Math.max(0, Math.ceil((fin - debut) / m)) : 0);
  };
  let io: IntersectionObserver | null = null;
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver((entrees) => {
      if (entrees.some((e) => e.isIntersecting && e.target === el)) o.surVue(besoin());
    }, { root: el.parentElement, rootMargin: '100%' });
  }
  dimensionner();
  io?.observe(el);
  return {
    update(n: OptionsCale) {
      const elargie = n.rendus !== o.rendus;
      o = n;
      dimensionner();
      if (elargie && io) { io.unobserve(el); io.observe(el); }
    },
    destroy() { io?.disconnect(); io = null; },
  };
}

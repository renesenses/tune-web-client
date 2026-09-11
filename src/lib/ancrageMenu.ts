/**
 * Où poser un menu déroulant qu'on a SORTI de sa ligne.
 *
 * ## Pourquoi ce module existe
 *
 * Un menu posé dans la ligne qui l'ouvre se fait rogner par le premier
 * ancêtre qui contient sa peinture — et il y en a toujours un :
 *
 *  - `renesenses/tune-web-client#872` : `.queue-item` porte
 *    `content-visibility: auto`, qui implique `contain: layout style paint`.
 *    Le panneau commence à `top: calc(100% + 4px)`, donc entièrement hors de
 *    la boîte de 56 px de la ligne. Jean Valjean voyait un cadre vide.
 *  - `renesenses/tune-web-client#861` : la même `TrackContextMenu`, cette
 *    fois dans une liste en `overflow-y: auto`.
 *
 * `lib/portail` règle le rognage en portant le nœud à la racine du document.
 * Mais un nœud à la racine ne sait plus où était son bouton : il faut lui
 * donner ses coordonnées ÉCRAN. C'est tout ce que fait ce module.
 *
 * ## Pourquoi il est à part, et pas recopié
 *
 * `MenuPisteV2` portait déjà ce calcul, en dur dans son `<script>`. Le client
 * actuel en avait besoin mot pour mot. Recopier, c'était accepter que les deux
 * menus dérivent — exactement ce que `renesenses/tune-server-rust#1848`
 * reprochait déjà à leur CONTENU, et que `lib/menuPiste` a réglé de la même
 * façon. Le calcul est ici, les deux menus l'appellent, un test le tient.
 */

/** Ce qu'on retient du bouton : sa boîte écran. Compatible `DOMRect`. */
export interface AncreMenu {
  top: number;
  bottom: number;
  right: number;
}

/** Ce qu'on retient de la fenêtre. Compatible `window`. */
export interface CadreFenetre {
  innerWidth: number;
  innerHeight: number;
}

/** Largeur du panneau, en dur dans les deux feuilles de style. */
export const LARGEUR_MENU = 208;

/** Hauteur d'une entrée, mesurée sur le gabarit rendu (7 px + 7 px + 20 px). */
const HAUTEUR_ENTREE = 34;

/** Jeu entre le panneau et le bouton, puis entre le panneau et le bord. */
const JEU = 4;
const MARGE_BORD = 8;

/**
 * Le style à poser sur un panneau en `position: fixed`.
 *
 * Il s'ouvre sous le bouton, aligné à DROITE sur lui, et remonte au-dessus
 * quand le bas de la fenêtre est trop proche — sans quoi, sur la dernière
 * ligne d'une liste, il naîtrait hors de l'écran. Il est par ailleurs borné
 * aux deux bords latéraux : un bouton collé au bord droit ne doit pas pousser
 * le panneau hors du cadre.
 */
export function styleMenuAncre(
  ancre: AncreMenu,
  nbEntrees: number,
  fenetre: CadreFenetre,
  largeur: number = LARGEUR_MENU,
): string {
  const hauteurEstimee = nbEntrees * HAUTEUR_ENTREE + MARGE_BORD;
  const versLeHaut = ancre.bottom + hauteurEstimee + MARGE_BORD > fenetre.innerHeight;
  const gauche = Math.max(
    MARGE_BORD,
    Math.min(ancre.right - largeur, fenetre.innerWidth - largeur - MARGE_BORD),
  );
  const vertical = versLeHaut
    ? `bottom:${fenetre.innerHeight - ancre.top + JEU}px;`
    : `top:${ancre.bottom + JEU}px;`;
  return `left:${gauche}px;` + vertical;
}

/**
 * Faire défiler une rangée horizontale à la MOLETTE et aux FLÈCHES — #1137.
 *
 * Pascal (bluevelvet), fil 1765, 11/09/2026, rejoignant Mac Brehlit :
 *
 * > « Il en va de même pour les rangées d'albums présentées horizontalement :
 * > il faut là aussi attraper la barre pour se déplacer latéralement, ce qui
 * > n'est pas très pratique. »
 *
 * ⚠️ CECI NE TRAITE QUE LE SYMPTÔME, et c'est assumé. Pascal propose mieux —
 * un bouton « Plus » qui ouvre la rubrique en VERTICAL, à la façon de Roon,
 * et supprime le besoin de barre horizontale. Sa proposition règle en prime
 * la découvrabilité : une rangée coupée ne dit pas combien d'albums elle
 * cache. C'est un autre travail, et il reste à faire ; en attendant, une
 * rangée qui répond à la molette coûte peu et ne ferme aucune porte.
 *
 * ## Les trois pièges, et pourquoi ils comptent
 *
 * 1. 🔴 **Ne JAMAIS confisquer le défilement de la page.** Une rangée qui
 *    avale la molette une fois arrivée au bout rend la page impossible à
 *    faire défiler dès que le pointeur la survole. C'est le défaut le plus
 *    courant de ce geste, et le plus pénible. On ne prend l'événement que si
 *    la rangée peut RÉELLEMENT avancer dans ce sens.
 * 2. **Un geste horizontal de pavé tactile est déjà horizontal.** Quand
 *    `deltaX` est non nul, le navigateur fait le bon travail : on ne s'en
 *    mêle pas, sinon les deux s'additionnent et la rangée saute.
 * 3. **Une rangée qui ne déborde pas n'est pas une rangée qui défile.**
 *    `scrollWidth <= clientWidth` : rien à faire, et surtout rien à prendre.
 */

/** De combien une flèche déplace la rangée. Une vignette et sa gouttière. */
export const PAS_FLECHE = 220;

/**
 * La rangée peut-elle avancer de `delta` dans ce sens ?
 *
 * 🔴 L'ARRONDI VA VERS LE BORD QU'ON TESTE, et pas toujours dans le même sens.
 * Un défilement en cours rend des positions fractionnaires — 599,6 au bord
 * droit, 0,4 au bord gauche — et un arrondi unique se trompe forcément d'un
 * côté : `Math.ceil(0,4)` vaut 1, donc « il reste de la place à gauche »,
 * alors qu'il n'en reste pas. La rangée prendrait l'événement sans bouger, et
 * la page resterait figée sous le pointeur — exactement le défaut que cette
 * fonction existe pour éviter. On arrondit donc VERS le bord : au plancher à
 * gauche, au plafond à droite.
 */
export function peutDefiler(el: Pick<HTMLElement, 'scrollLeft' | 'scrollWidth' | 'clientWidth'>, delta: number): boolean {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 0) return false;
  return delta < 0 ? Math.floor(el.scrollLeft) > 0 : Math.ceil(el.scrollLeft) < max;
}

/**
 * Ce que la molette doit faire : le déplacement horizontal, ou `0` pour
 * « laisser passer ».
 *
 * Rend `0` — donc « ne prends pas l'événement » — dans les trois cas du
 * commentaire d'en-tête.
 */
export function deplacementMolette(
  el: Pick<HTMLElement, 'scrollLeft' | 'scrollWidth' | 'clientWidth'>,
  e: Pick<WheelEvent, 'deltaX' | 'deltaY'>,
): number {
  if (e.deltaX !== 0) return 0;
  const d = e.deltaY;
  if (!d) return 0;
  return peutDefiler(el, d) ? d : 0;
}

/**
 * L'action Svelte : `use:defilementHorizontal` sur la rangée.
 *
 * Elle rend aussi la rangée atteignable au clavier — c'est l'autre moitié de
 * la demande de Pascal (« les touches fléchées ») — sans voler le focus :
 * `tabindex` n'est posé que si l'appelant ne l'a pas déjà fait.
 */
export function defilementHorizontal(el: HTMLElement) {
  const molette = (e: WheelEvent) => {
    const d = deplacementMolette(el, e);
    if (!d) return;            // la page garde son défilement
    e.preventDefault();
    el.scrollBy({ left: d, behavior: 'auto' });
  };
  const clavier = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' ? PAS_FLECHE : e.key === 'ArrowLeft' ? -PAS_FLECHE : 0;
    if (!d || !peutDefiler(el, d)) return;
    e.preventDefault();
    el.scrollBy({ left: d, behavior: 'smooth' });
  };
  // `passive: false` : sans lui le navigateur refuse `preventDefault()` sur
  // un `wheel`, et la page défilerait EN PLUS de la rangée.
  el.addEventListener('wheel', molette, { passive: false });
  el.addEventListener('keydown', clavier);
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
  return {
    destroy() {
      el.removeEventListener('wheel', molette);
      el.removeEventListener('keydown', clavier);
    },
  };
}

/**
 * Guard for the "wheel down to reveal the queue" gesture in Lecture en cours.
 *
 * Bug #1261 (Scordia, Firefox): pressing the mouse wheel revealed the queue.
 * Blocking Firefox's middle-press autoscroll at `mousedown` stopped the view
 * from jumping — the tester confirmed that much in 0.9.49 — but the queue kept
 * opening. The reason is that the press itself is not the culprit: pressing a
 * mouse wheel almost always rotates it a little, and that rotation is a
 * genuine `wheel` event which the reveal gesture happily accumulated.
 *
 * A press is not a scroll, so its rotation must not count.
 */

/**
 * How long after a middle-button press a wheel event is still considered part
 * of that press. Generous enough to cover the rotation that lands just after
 * `mouseup`, short enough that a deliberate scroll a moment later still works.
 */
export const NP_MIDDLE_PRESS_GUARD_MS = 400;

/** Bit 2 of `MouseEvent.buttons` — the middle (wheel) button. */
const MIDDLE_BUTTON_BIT = 4;

/**
 * Does this wheel event belong to a middle-button press rather than a scroll?
 *
 * Both checks are needed and neither is redundant:
 * - `buttons` catches the rotation emitted while the wheel is still held down;
 * - the elapsed-time window catches the rotation that arrives just after the
 *   button is released, when `buttons` has already dropped back to 0.
 *
 * @param buttons             `MouseEvent.buttons` of the wheel event.
 * @param msSinceMiddlePress  Milliseconds since the last middle-button press,
 *                            or `Infinity` if there has not been one.
 */
export function isMiddlePressWheel(buttons: number, msSinceMiddlePress: number): boolean {
  return (buttons & MIDDLE_BUTTON_BIT) !== 0 || msSinceMiddlePress < NP_MIDDLE_PRESS_GUARD_MS;
}

/**
 * Fil 1619 (Jean Valjean, 0.9.126, Firefox) : faire dérouler les PAROLES à la
 * molette ouvrait la file d'attente par-dessus le texte.
 *
 * Le geste de découverte est posé sur la racine de la vue, et un `wheel` émis
 * dans un cadre qui défile lui-même (paroles, crédits, fiche du chemin du
 * signal, liste de la file) remonte jusqu'à elle — que le cadre ait consommé
 * le défilement ou non. Or un défilement qui agit DANS un cadre n'est pas un
 * défilement de la page : il ne doit ni armer ni déclencher le geste.
 *
 * Chaque sélecteur ci-dessous désigne un bloc `overflow-y: auto` de l'écran ;
 * la garde `parolesMoletteEtHautDePage.test.ts` vérifie que la liste et le
 * CSS ne divergent pas. Le conteneur `.np-scroll` n'y figure PAS : c'est le
 * défilement de la page elle-même sur un petit écran, celui que le geste doit
 * justement accompagner.
 */
export const NP_INNER_SCROLLER_SELECTOR = '.np-lyrics, .np-credits, .signal-path-card, .qs-track-list';

/**
 * La molette agit-elle dans un cadre défilant interne plutôt que sur la page ?
 *
 * @param target  `WheelEvent.target` — l'élément le plus profond sous le curseur.
 */
export function isInnerScrollerWheel(target: EventTarget | null): boolean {
  const el = target as Element | null;
  if (!el || typeof el.closest !== 'function') return false;
  return el.closest(NP_INNER_SCROLLER_SELECTOR) !== null;
}

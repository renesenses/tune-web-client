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

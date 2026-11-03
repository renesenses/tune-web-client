/**
 * Un clic est-il tombé DANS un menu déroulant (`.drop`) de la Bibliothèque ?
 *
 * tune-server-rust#7597 (01/11/2026) — on lit le CHEMIN du clic
 * (`composedPath()`), figé au départ de l'événement, et non
 * `e.target.closest('.drop')` : un clic qui remplace son propre bouton
 * (descendre dans un sous-dossier du panneau « Répertoire ») laisse une cible
 * détachée du document au moment où `window` l'entend, et `closest` n'y
 * trouve plus aucun ancêtre.
 */
export function clicDansUnMenu(e: Event, selecteur = '.drop'): boolean {
  const chemin = typeof e.composedPath === 'function' ? e.composedPath() : [];
  if (chemin.some((n) => n instanceof Element && n.matches(selecteur))) return true;
  // Repli (navigateur sans `composedPath`) : l'ancien test.
  const cible = e.target as Element | null;
  return !!(cible && typeof cible.closest === 'function' && cible.closest(selecteur));
}

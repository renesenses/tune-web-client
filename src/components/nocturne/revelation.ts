/**
 * Action Svelte : appelle `suite` chaque fois que l'élément approche de la
 * zone visible — le rendu progressif des longues grilles (bibliothèques de
 * plusieurs milliers d'albums) sans monter des milliers de tuiles d'un coup.
 */
export function revelerParTranches(noeud: HTMLElement, suite: () => void) {
  let rappel = suite;
  const obs = new IntersectionObserver(
    (entrees) => { if (entrees.some((e) => e.isIntersecting)) rappel(); },
    { rootMargin: '600px 0px' },
  );
  obs.observe(noeud);
  return {
    update(nouvelle: () => void) { rappel = nouvelle; },
    destroy() { obs.disconnect(); },
  };
}

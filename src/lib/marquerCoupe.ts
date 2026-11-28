/**
 * Interface « Salon » (itération 5) — pose `data-coupe` sur un texte d'une
 * ligne quand il dépasse sa boîte, et le retire quand il tient.
 *
 * La barre latérale de Salon FOND la fin d'un nom de liste trop long, comme
 * la référence, au lieu des points de suspension. Un masque appliqué à tous
 * les noms pâlirait aussi la fin des noms courts : seule la mise en page sait
 * qui dépasse (`scrollWidth` contre `clientWidth`), d'où cette action. Elle
 * remesure au redimensionnement et quand le texte change (`update`).
 */
export function marquerCoupe(node: HTMLElement, _texte?: unknown) {
  const mesurer = () => {
    if (node.scrollWidth > node.clientWidth + 1) node.setAttribute('data-coupe', '');
    else node.removeAttribute('data-coupe');
  };
  const observateur = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(mesurer) : null;
  observateur?.observe(node);
  mesurer();
  return { update: mesurer, destroy: () => observateur?.disconnect() };
}

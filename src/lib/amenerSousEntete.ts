/**
 * AMENER UNE CARTE À L'ÉCRAN SANS FAIRE DÉFILER LE CADRE QUI LA PORTE.
 *
 * « Profils trop haut !! » (Réglages, serveur de test .18, Safari) : la carte
 * visée par une ancre était collée tout en haut, l'en-tête (onglets, grappe
 * avatar) disparu ou recouvert.
 *
 * Cause : `scrollIntoView({ block: 'start' })` fait défiler TOUS les
 * ancêtres, y compris ceux en `overflow:hidden` (`.v2-settings`, `.main`,
 * `.v2-shell`), qui restent déplaçables par script. Quand la carte est près
 * de la fin du contenu, `.pane` arrive en butée et ne peut plus l'amener en
 * haut : le navigateur reporte le reste du déplacement sur le cadre extérieur
 * et pousse la barre d'onglets hors de vue. Rien ne le ramène ensuite, le
 * cadre n'ayant pas de barre de défilement.
 *
 * Remède : ne déplacer QUE le conteneur qui défile vraiment, en bornant la
 * cible à son défilement possible, et garder un `retrait` sous le bord haut.
 */

/** Air laissé au-dessus de la carte visée, pour que son halo reste visible. */
export const RETRAIT_SOUS_ENTETE = 16;

/** Le plus proche ancêtre qui défile réellement (overflow auto/scroll), sinon null. */
export function conteneurDefilant(el: Element | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === 'auto' || oy === 'scroll') return p;
  }
  return null;
}

/**
 * Position de défilement qui place `el` à `retrait` px sous le bord haut du
 * conteneur, bornée à [0, défilement maximal]. Pure : testable sans navigateur.
 */
export function cibleDefilement(
  hautEl: number,
  hautConteneur: number,
  defilementActuel: number,
  hauteurContenu: number,
  hauteurVisible: number,
  retrait: number = RETRAIT_SOUS_ENTETE,
): number {
  const voulu = defilementActuel + (hautEl - hautConteneur) - retrait;
  const max = Math.max(0, hauteurContenu - hauteurVisible);
  return Math.min(max, Math.max(0, voulu));
}

/** Amène `el` sous le haut de son conteneur défilant, sans toucher aux autres cadres. */
export function amenerSousEntete(el: Element | null | undefined, retrait: number = RETRAIT_SOUS_ENTETE): void {
  if (!el) return;
  const c = conteneurDefilant(el);
  if (!c) return;
  const top = cibleDefilement(
    el.getBoundingClientRect().top,
    c.getBoundingClientRect().top,
    c.scrollTop,
    c.scrollHeight,
    c.clientHeight,
    retrait,
  );
  c.scrollTo({ top });
}

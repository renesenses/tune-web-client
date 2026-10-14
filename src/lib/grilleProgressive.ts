/**
 * LA GRILLE PROGRESSIVE — web#1716, onglet Artistes (fil 2256).
 *
 * ## Ce qu'on corrige
 *
 * L'onglet Artistes rendait TOUTES ses cartes d'un coup. Chaque carte monte
 * `PochetteActions` (sept abonnements aux favoris, cinq boutons) et
 * `AlbumArt` : c'est le coût JavaScript du MONTAGE, que
 * `content-visibility:auto` n'évite pas — il n'économise que la mise en page
 * et la peinture des cartes hors cadre.
 *
 * Mesuré le 13/10/2026 sur une base de test (Chromium sans tête, Shrek) :
 * 1 295 artistes → une tâche de 1,0 à 1,25 s avant la première carte ;
 * 4 000 artistes → une tâche de 4,3 à 5,0 s. Le temps croît avec le nombre
 * d'artistes, à chaque ouverture, pistes en cache ou non.
 *
 * ## Ce que ce module promet
 *
 * Le compte de cartes À MONTER, et rien d'autre : une tranche d'abord, la
 * suivante quand le bas de la grille approche, et assez pour atteindre une
 * lettre du rail ou une position de défilement mémorisée. La liste, son ordre
 * et ses ancres ne changent pas : les cartes montées sont toujours un PRÉFIXE
 * de la liste affichée.
 */

/** Une tranche : une quinzaine de rangées sur un écran de bureau (8 colonnes). */
export const TRANCHE_GRILLE = 120;

/** La tranche suivante, sans dépasser la liste. */
export function trancheSuivante(montees: number, total: number, pas: number = TRANCHE_GRILLE): number {
  return Math.min(total, Math.max(montees, 0) + pas);
}

/**
 * Assez de cartes pour que l'index visé soit monté, plus une tranche pour
 * remplir l'écran sous lui. Jamais MOINS que ce qui est déjà monté : un saut
 * vers le haut ne démonte rien.
 */
export function montageJusqua(index: number, montees: number, total: number, pas: number = TRANCHE_GRILLE): number {
  if (index < 0) return Math.min(total, montees);
  return Math.min(total, Math.max(montees, index + 1 + pas));
}

/**
 * Le premier index de la liste dont la clé vaut `cle` — la première carte
 * d'une lettre du rail —, ou -1.
 */
export function premierIndex<T>(liste: readonly T[], cle: (x: T) => string, valeur: string): number {
  for (let i = 0; i < liste.length; i++) if (cle(liste[i]) === valeur) return i;
  return -1;
}

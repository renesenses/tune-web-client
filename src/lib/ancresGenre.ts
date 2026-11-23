/**
 * Puces d'ancrage et « Voir plus » de l'écran d'un genre (Streaming › Genres
 * › un genre). Demandé par Bertrand le 15/11/2026 (rc12) : chaque rubrique
 * (« New Releases », « Press Awards »…) était une longue grille complète, et
 * il fallait la faire défiler en entier pour atteindre la suivante.
 *
 * Deux gestes, aucune donnée en plus :
 *  - une rangée de puces, une par rubrique PRÉSENTE, qui amène à la rubrique ;
 *  - chaque grille ne montre d'abord que DEUX rangées ; « Voir plus » montre
 *    le reste de la rubrique. Rien n'est retiré : la suite est déjà chargée.
 */

/** Largeur minimale d'une pochette et écart de `.grid` (StreamingV2). */
export const LARGEUR_TUILE = 150;
export const ECART_GRILLE = 20;
/** Rangées montrées avant « Voir plus ». */
export const RANGEES_INITIALES = 2;

/**
 * Le nombre de colonnes de `.grid` (`repeat(auto-fill, minmax(150px, 1fr))`,
 * `gap: 20px`) pour une largeur donnée. `0` quand la largeur est inconnue
 * (élément pas encore mesuré) : l'appelant montre alors TOUT.
 */
export function colonnesDeGrille(largeur: number, tuile = LARGEUR_TUILE, ecart = ECART_GRILLE): number {
  if (!Number.isFinite(largeur) || largeur <= 0) return 0;
  return Math.max(1, Math.floor((largeur + ecart) / (tuile + ecart)));
}

/** Combien de pochettes montrer d'abord ; `Infinity` si la largeur est inconnue. */
export function limiteInitiale(largeur: number): number {
  const c = colonnesDeGrille(largeur);
  return c > 0 ? c * RANGEES_INITIALES : Infinity;
}

/** Une puce : l'identifiant DOM de la rubrique et son libellé. */
export interface AncreRubrique {
  id: string;
  libelle: string;
}

/** L'identifiant DOM d'une rubrique du genre. */
export function idAncre(rubrique: string): string {
  return `genre-rub-${rubrique || 'defaut'}`;
}

/**
 * La rubrique « courante » : la dernière dont le haut est passé sous le seuil
 * (le bas de la rangée de puces figée). Avant la première, c'est la première.
 */
export function rubriqueCourante(positions: readonly { id: string; haut: number }[], seuil: number): string | null {
  if (!positions.length) return null;
  let courante = positions[0].id;
  for (const p of positions) {
    if (p.haut <= seuil) courante = p.id;
    else break;
  }
  return courante;
}

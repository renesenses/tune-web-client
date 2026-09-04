/**
 * Quelle année d'un album, et dans quel sens.
 *
 * ## Deux années, très inégalement renseignées
 *
 * Un album porte jusqu'à quatre champs de date : `year` et `release_date`
 * disent la parution de CETTE édition ; `original_year` et `original_date`
 * disent la première parution de l'œuvre. « Wish You Were Here » sort en 1975
 * et l'édition rangée ici date de 1994.
 *
 * MESURE SUR LE .18, 04/09/2026, sur 4255 albums :
 *
 * | champ            | rempli |
 * |------------------|--------|
 * | `year`           | 3049 (72 %) |
 * | `original_year`  | 90 (2 %) |
 * | `original_date`  | 90 (2 %) |
 * | `release_date`   | 0 |
 *
 * Et les deux années ne diffèrent que sur 28 albums.
 *
 * ## Ce que cette mesure impose
 *
 * `release_date` n'est proposé nulle part : un choix qui ne trierait RIEN
 * n'est pas un choix. Et « année d'origine » seule fait tomber la
 * bibliothèque de 3049 albums datés à 90 — l'écran doit donc annoncer la
 * couverture de chaque mode, sinon le choix ressemble à une panne.
 *
 * Le mode `auto` — origine si connue, sinon édition — est celui que l'écran
 * appliquait déjà en dur. Il reste le défaut : c'est le seul qui garde les
 * 72 % de couverture tout en plaçant les 90 albums réédités à leur date de
 * création.
 */
import type { Album } from './types';

/** Quelle année lire. */
export type ModeAnnee = 'auto' | 'edition' | 'origine';

/** Bornes de vraisemblance : au-delà, c'est une donnée abîmée, pas une année. */
const MIN = 1800;
const MAX = 2200;

function valide(y: unknown): number | null {
  return typeof y === 'number' && y > MIN && y < MAX ? y : null;
}

/**
 * L'année à retenir pour cet album, ou `null` s'il n'en a pas dans ce mode.
 *
 * `null` n'est pas un défaut à masquer : l'écran range ces albums sous
 * « Année inconnue » plutôt que de les faire disparaître.
 */
export function anneeAlbum(a: Album | null | undefined, mode: ModeAnnee = 'auto'): number | null {
  if (!a) return null;
  const edition = valide(a.year);
  const origine = valide(a.original_year);
  if (mode === 'edition') return edition;
  if (mode === 'origine') return origine;
  return origine ?? edition;
}

/** Combien d'albums portent une année dans ce mode — ce que l'écran annonce. */
export function couvertureAnnees(albums: readonly Album[], mode: ModeAnnee): number {
  return albums.reduce((n, a) => n + (anneeAlbum(a, mode) != null ? 1 : 0), 0);
}

/**
 * Compare deux années pour un tri, sens compris.
 *
 * Un album SANS année part en dernier dans les DEUX sens : en ordre croissant,
 * le mettre en tête reviendrait à le dire plus ancien que tout, ce qu'on ne
 * sait pas.
 */
export function comparerAnnees(
  ya: number | null,
  yb: number | null,
  ordre: 'asc' | 'desc',
): number {
  if (ya == null && yb == null) return 0;
  if (ya == null) return 1;
  if (yb == null) return -1;
  return ordre === 'asc' ? ya - yb : yb - ya;
}

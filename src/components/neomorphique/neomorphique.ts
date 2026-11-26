/**
 * Thème « Néomorphique » (itération 1, 26/11/2026) — les règles que les
 * tests appellent : la course de la molette et l'échelle des VU-mètres.
 */

/** La course de la molette : de −135° (0) à +135° (1), comme un potentiomètre. */
export const ANGLE_MIN = -135;
export const ANGLE_MAX = 135;

/** Le pas de la molette au clavier (flèches) et à la molette de la souris. */
export const PAS_MOLETTE = 0.02;
/** Page précédente / suivante : un grand pas. */
export const GRAND_PAS_MOLETTE = 0.1;
/** Glisser : la fraction gagnée par pixel de déplacement vertical. */
export const FRACTION_PAR_PIXEL = 1 / 160;

export function borner01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/** L'angle de l'index de la molette pour une valeur 0..1. */
export function angleMolette(v: number): number {
  return ANGLE_MIN + borner01(v) * (ANGLE_MAX - ANGLE_MIN);
}

/**
 * La valeur visée par une touche du clavier, ou `null` si la touche ne règle
 * rien. Flèches haut/droite : plus ; bas/gauche : moins ; Page : grand pas ;
 * Début / Fin : 0 / 1 (le comportement d'un `role="slider"` selon l'ARIA APG).
 */
export function valeurAuClavier(v: number, touche: string): number | null {
  switch (touche) {
    case 'ArrowUp': case 'ArrowRight': return borner01(v + PAS_MOLETTE);
    case 'ArrowDown': case 'ArrowLeft': return borner01(v - PAS_MOLETTE);
    case 'PageUp': return borner01(v + GRAND_PAS_MOLETTE);
    case 'PageDown': return borner01(v - GRAND_PAS_MOLETTE);
    case 'Home': return 0;
    case 'End': return 1;
    default: return null;
  }
}

/** Glisser vers le haut monte, vers le bas descend (`dy` = y départ − y courant). */
export function valeurAuGlisser(depart: number, dy: number): number {
  return borner01(depart + dy * FRACTION_PAR_PIXEL);
}

/** Molette de la souris : un cran vers le haut (deltaY < 0) monte d'un pas. */
export function valeurALaRoulette(v: number, deltaY: number): number {
  if (!deltaY) return borner01(v);
  return borner01(v - Math.sign(deltaY) * PAS_MOLETTE);
}

/* ── VU-mètres à segments ──────────────────────────────────────────── */

export const SEGMENTS_VU = 12;
/** Le bas de l'échelle, en dBFS : en dessous, aucun segment. */
export const PLANCHER_VU_DB = -48;
/** À partir de ce niveau, les segments prennent la couleur d'état. */
export const SEUIL_HAUT_VU_DB = -6;

/** Le nombre de segments allumés pour un niveau en dBFS. */
export function segmentsAllumes(db: number, n = SEGMENTS_VU, plancher = PLANCHER_VU_DB): number {
  if (!Number.isFinite(db) || db <= plancher) return 0;
  if (db >= 0) return n;
  return Math.max(0, Math.min(n, Math.round(((db - plancher) / -plancher) * n)));
}

/** Le segment `i` (0 en bas) est-il dans la zone haute de l'échelle ? */
export function segmentHaut(i: number, n = SEGMENTS_VU, plancher = PLANCHER_VU_DB): boolean {
  const dbDuSegment = plancher + ((i + 1) / n) * -plancher;
  return dbDuSegment > SEUIL_HAUT_VU_DB;
}

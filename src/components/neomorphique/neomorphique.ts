/**
 * Thème « Néomorphique » (itération 1, 26/11/2026) — les règles que les
 * tests appellent : la course de la molette, ses garde-fous de volume et
 * l'échelle des VU-mètres.
 */
import { bornerCurseur, plafondDuCurseur, type LimitesVolume } from '../../lib/limitesVolume';
import { normaliserVolumeSortie, volumeCommandable, volumeFixe } from '../../lib/capacitesVolumeSortie';

/* ── SÉCURITÉ AUDITIVE (itération 10, 28/11/2026) ──────────────────────
   La molette passe par EXACTEMENT les mêmes garde-fous que le curseur de
   l'interface actuelle (`VolumeControl.svelte`, `handleVolume`) :
     - refus en volume verrouillé (PURE « Forcer à 100 % »), en volume FIXE
       (le curseur actuel ne s'affiche même pas : `VolumeFixe`) et sur une
       sortie qui ne se règle pas ;
     - plafond de la zone : limite de SÉCURITÉ toujours, limite de CONFORT
       tant que le volume est dessous (`bornerCurseur`, `plafondDuCurseur`) ;
     - grille de la sortie (`normaliserVolumeSortie`).
   La touche Fin, Page↑, la roulette ou un glisser ne peuvent donc pas
   demander plus que le curseur. L'envoi lui-même (limiteur, refus du
   verrou relu, volume maître d'un groupe) est celui du curseur aussi :
   `envoyerVolumeOuReverrouiller` + `reglerVolume` (MoletteNeomorphique). */

export type ZoneMolette = LimitesVolume & { fixed_volume?: boolean | null };

/** La molette peut-elle régler le volume de cette zone ? */
export function moletteAutorisee(zone: ZoneMolette | null | undefined, verrouille: boolean): boolean {
  return !verrouille && !!zone && volumeCommandable(zone) && !volumeFixe(zone);
}

/**
 * La position RÉELLEMENT envoyée pour une demande `brut` (0..1), depuis le
 * volume `actuel` : l'expression même de `handleVolume`. `null` = rien à
 * envoyer (sortie refusée, hors grille).
 */
export function cibleMolette(zone: ZoneMolette | null | undefined, brut: number, actuel: number): number | null {
  if (!zone) return null;
  return normaliserVolumeSortie(zone, bornerCurseur(zone, brut, actuel), plafondDuCurseur(zone, actuel));
}

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

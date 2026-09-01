/// Échelles du bargraphe du mode Grand écran (#2514).
///
/// ⚠ Le bargraphe affiche du **dBFS**, et rien d'autre.
///
/// Le serveur ne publie aucune mesure de SONIE temps réel : l'événement
/// `playback.audio_levels` porte des crêtes et des moyennes (RMS) par canal,
/// en dBFS. Il n'y a donc ni R128, ni LUFS, ni LKFS à afficher, et surtout pas
/// les échelles +9 / +18 des instruments de sonie — annoncer une échelle qu'on
/// ne calcule pas serait exactement le défaut qu'on corrige ailleurs.
///
/// D'où l'invariant, tenu par les tests : `maxDb` vaut 0 (la pleine échelle
/// numérique) et aucune graduation n'est positive. Une échelle qui monterait
/// au-dessus de 0 dBFS ne pourrait rien vouloir dire d'autre que de la sonie.
///
/// « Échelle commutable » est l'une des fonctions demandées : on la sert en
/// changeant la PLAGE affichée, pas l'unité. La plage large montre les
/// passages calmes, la plage resserrée dilate les 20 dB du haut, là où vivent
/// les masters modernes.

import { RED_FROM_DB } from './tvVuScale';

export type BarScaleId = 'wide' | 'zoom';

export interface BarScale {
  id: BarScaleId;
  /** Graduation basse, en dBFS. */
  minDb: number;
  /** Graduation haute : toujours 0, la pleine échelle numérique. */
  maxDb: number;
  /** Graduations, en dBFS, de la plus basse à 0. */
  ticks: readonly number[];
}

export const BAR_SCALES: Record<BarScaleId, BarScale> = {
  wide: {
    id: 'wide',
    minDb: -60,
    maxDb: 0,
    ticks: [-60, -50, -40, -30, -20, -12, -6, -3, 0],
  },
  zoom: {
    id: 'zoom',
    minDb: -20,
    maxDb: 0,
    ticks: [-20, -15, -12, -10, -6, -3, 0],
  },
};

export const BAR_SCALE_IDS: readonly BarScaleId[] = ['wide', 'zoom'];

/** Plage large par défaut : on montre tout avant de proposer de zoomer. */
export const BAR_SCALE_DEFAULT: BarScaleId = 'wide';

export function isBarScaleId(value: unknown): value is BarScaleId {
  return typeof value === 'string' && (BAR_SCALE_IDS as readonly string[]).includes(value);
}

export function readBarScale(stored: unknown): BarScaleId {
  if (typeof stored !== 'object' || stored === null) return BAR_SCALE_DEFAULT;
  const raw = (stored as Record<string, unknown>).vuBarScale;
  return isBarScaleId(raw) ? raw : BAR_SCALE_DEFAULT;
}

/**
 * Libellé du bouton d'échelle, DÉRIVÉ de la plage réellement dessinée.
 *
 * Pas de chaîne traduite ici, et c'est délibéré : un libellé écrit à la main
 * peut annoncer « −60 » pendant que le graphe en dessine 40. Celui-ci ne le
 * peut pas. Le signe est le vrai signe moins typographique, comme sur les
 * cadrans à aiguille.
 */
export function barScaleLabel(scale: BarScale): string {
  return `−${Math.abs(scale.minDb)} dBFS`;
}

/**
 * dBFS → position 0…1 sur la barre, bornée à l'échelle.
 *
 * Linéaire en décibels : un décibel occupe la même longueur partout, ce qui
 * est la lecture attendue d'un bargraphe (contrairement au cadran à aiguille,
 * volontairement resserré à gauche pour imiter un vrai VU).
 */
export function barFraction(db: number, scale: BarScale): number {
  const clamped = Math.min(scale.maxDb, Math.max(scale.minDb, db));
  return (clamped - scale.minDb) / (scale.maxDb - scale.minDb);
}

/**
 * Début de la zone rouge sur la barre. Reprend `RED_FROM_DB` du cadran : un
 * seul seuil de « on approche de la saturation » pour les deux instruments.
 */
export function redFraction(scale: BarScale): number {
  return barFraction(RED_FROM_DB, scale);
}

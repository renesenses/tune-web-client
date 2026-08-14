import type { EqBand } from './api';

/**
 * Bande paramétrique neutre : un seul point à 1 kHz, gain 0 dB.
 *
 * C'est la même bande que celle posée à la première ouverture du mode
 * paramétrique (`EqualizerView.switchExpertSubMode`). Elle laisse un point à
 * manipuler à l'écran tout en étant strictement inaudible : côté serveur,
 * `EqBandSpec::is_neutral()` l'écarte du cascade de biquads, `EqProcessor`
 * se retrouve sans filtre et `is_enabled()` renvoie false — le signal repart
 * intact.
 */
export const NEUTRAL_PARAMETRIC_BAND: EqBand = { freq: 1000, gain: 0, q: 1.41, type: 'peak' };

/**
 * Remise à zéro des bandes de l'égaliseur PARAMÉTRIQUE.
 *
 * Le bouton « Réinitialiser » appelait `applyPreset('flat')`, qui ne remet à
 * plat que la grille GRAPHIQUE (`gains`). En sous-mode paramétrique, `pBands`
 * n'était jamais touché : `sendToServer()` renvoyait au serveur les bandes
 * inchangées et la courbe restait audible — « l'égaliseur paramétrique ne se
 * réinitialise pas », Jean Valjean, forum #1385.
 *
 * Retourne une NOUVELLE liste (jamais la même référence) pour que la
 * réactivité Svelte 5 la voie changer même quand l'ancienne valeur était déjà
 * une bande unique neutre.
 */
export function resetParametricBands(): EqBand[] {
  return [{ ...NEUTRAL_PARAMETRIC_BAND }];
}

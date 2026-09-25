/**
 * Cadence de la boucle de dessin du crête-mètre — #1256.
 *
 * Levente Toth (fil 1848, 0.9.155, MacBook) mesure un navigateur nettement
 * plus chargé sur « Lecture en cours » que sur l'Accueil. Deux faits de code,
 * relevés sur `CreteMetre.svelte`, en sont des suspects (la cause n'est PAS
 * mesurée) :
 *
 * 1. la boucle redessinait à CHAQUE image de l'écran — jusqu'à 120 fois par
 *    seconde sur un écran ProMotion — là où `AudioVisualizer` se limite à
 *    ~30 images par seconde ;
 * 2. elle ne s'arrêtait JAMAIS : à l'arrêt, elle redessinait un cadran vide à
 *    pleine cadence, tant que l'écran restait monté.
 *
 * Ce module porte les deux règles, pour que le test puisse les APPELER :
 *
 * - on ne dessine qu'une image sur ~33 ms (30 i/s) ;
 * - hors lecture, une fois les barres retombées au plancher et le trait PPM
 *   décroché, la boucle ne se ré-arme plus. Elle repart quand la lecture
 *   reprend (le composant relance son effet sur `joue`).
 */
import { PLANCHER_DB, type EtatPpm } from './peakMetre';
import {
  CADENCE_HZ, CRAN_CADENCE_DEFAUT, intervalleCreteMs, tempsDeDessinerA,
  type CranCadence,
} from './cadenceAnimations';

/**
 * Cadence de dessin, alignée sur celle d'`AudioVisualizer`.
 *
 * 🔴 Elle n'est plus écrite ici : depuis le 23/09/2026 (#1256) elle est le cran
 * PAR DÉFAUT du réglage utilisateur, et ces deux constantes sont dérivées de lui
 * — une seconde copie du 30 divergerait le jour où le défaut bougerait. La
 * valeur, elle, n'a pas bougé d'un tiers de milliseconde : `cadenceAnimations`
 * porte le test qui le mesure.
 */
export const CADENCE_CRETE_HZ = CADENCE_HZ[CRAN_CADENCE_DEFAUT];
export const INTERVALLE_CRETE_MS = intervalleCreteMs(CRAN_CADENCE_DEFAUT);

/**
 * Tolérance d'une milliseconde : à 60 Hz, deux images font 33,3 ms — sans
 * elle, l'arrondi des horodatages ferait sauter une image sur deux de trop.
 *
 * Le cran est OPTIONNEL et retombe sur le défaut : les appelants qui ne
 * connaissent pas le réglage (et le témoin de #1269) gardent le comportement
 * livré, au bit près.
 */
export function tempsDeDessiner(
  maintenant: number,
  dernier: number,
  cran: CranCadence = CRAN_CADENCE_DEFAUT,
): boolean {
  return tempsDeDessinerA(maintenant, dernier, cran);
}

/**
 * Sous ce seuil, une barre n'allume plus aucun segment de 1 dB
 * (`Math.round(fractionDe(db) * 60) === 0`) : la dessiner encore ne change
 * aucun pixel.
 */
export const SEUIL_REPOS_DB = PLANCHER_DB + 0.5;

/** La boucle peut-elle s'arrêter ? Seulement hors lecture, tout étant retombé. */
export function retombeAuRepos(joue: boolean, barres: readonly number[], ppm: readonly EtatPpm[]): boolean {
  if (joue) return false;
  return barres.every((db) => db <= SEUIL_REPOS_DB) && ppm.every((p) => p.db === null);
}

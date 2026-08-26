export type FullVolumeToggle = 'audiophile' | 'volume-lock';

export interface AudiophileSafetyState {
  audiophileEnabled: boolean;
  volumeLockEnabled: boolean;
}

/**
 * Une bascule exige-t-elle l'accord explicite qui autorise un volume à 100 % ?
 *
 * Le verrou est global : l'armer est toujours une décision plein niveau,
 * même si la zone courante n'est pas encore en PURE. L'activation de PURE ne
 * présente ce risque que lorsque ce verrou est déjà armé. Les deux
 * désactivations sont sans danger et restent immédiates.
 */
export function fullVolumeConfirmationRequired(
  toggle: FullVolumeToggle,
  state: AudiophileSafetyState,
): boolean {
  if (toggle === 'volume-lock') return !state.volumeLockEnabled;
  return !state.audiophileEnabled && state.volumeLockEnabled;
}

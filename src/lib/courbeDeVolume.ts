/**
 * La loi de volume d'une zone — miroir exact de `volume_scale` du serveur
 * (tune-server-rust, `tune-core/src/audio/volume_scale.rs`, #6787).
 *
 * # Pourquoi ce module existe
 *
 * Fil ASR #49 (aedagnino, 22/10/2026) : « toute zone joue beaucoup trop fort »,
 * il fallait descendre vers 5 %. Le volume d'une sortie LOGICIELLE multipliait
 * directement les échantillons : 50 % ne valaient que −6 dB. Le navigateur
 * faisait de même, `audio.volume = curseur`.
 *
 * Le serveur publie désormais, pour chaque zone, `volume_curve` :
 * - `"db60"` (sortie locale, zone navigateur) : le volume est une POSITION de
 *   curseur, et le gain suit une loi en dB sur 60 dB (chaque point vaut
 *   0,6 dB), prolongée sous 10 % (−54 dB) par une droite jusqu'au silence ;
 * - `"linear"` (appareils réseau) : le nombre part tel quel sur l'échelle de
 *   l'appareil, qui a sa propre courbe — pas de double courbe ;
 * - absent : serveur antérieur, rien ne change (linéaire).
 *
 * Ce module ne décide RIEN : il lit `volume_curve`. C'est ce qui garantit que
 * le navigateur n'applique la courbe que là où le serveur l'applique, et
 * qu'un client plus récent que son serveur reste linéaire.
 *
 * # La règle d'or : jamais de hausse
 *
 * Pour toute position `p`, `gainPerceptif(p) <= p` : un volume enregistré
 * sous l'ancienne loi joue au même niveau (0 et 100 %) ou plus bas, jamais
 * plus haut. Témoin : `courbeDeVolume6787.test.ts`.
 */

/** Code publié par le serveur pour la loi perceptive. */
export const COURBE_DB60 = 'db60';

/** Plage de la loi : 0 % → −60 dB (avant le genou), 100 % → 0 dB. */
export const PLAGE_PERCEPTIVE_DB = 60;

/** Sous cette position, une droite jusqu'au silence : 0 reste le silence. */
export const GENOU_PERCEPTIF = 0.1;

const GAIN_AU_GENOU = Math.pow(10, (-PLAGE_PERCEPTIVE_DB * (1 - GENOU_PERCEPTIF)) / 20);

/** Le gain linéaire (0..1) d'une position de curseur, loi `db60`. */
export function gainPerceptif(position: number): number {
  if (!(position > 0)) return 0; // couvre 0, les négatifs et NaN
  if (position >= 1) return 1;
  if (position < GENOU_PERCEPTIF) return (GAIN_AU_GENOU * position) / GENOU_PERCEPTIF;
  return Math.pow(10, (-PLAGE_PERCEPTIVE_DB * (1 - position)) / 20);
}

/** L'inverse exact de [`gainPerceptif`]. */
export function positionPerceptive(gain: number): number {
  if (!(gain > 0)) return 0;
  if (gain >= 1) return 1;
  if (gain < GAIN_AU_GENOU) return Math.min(GENOU_PERCEPTIF, (gain / GAIN_AU_GENOU) * GENOU_PERCEPTIF);
  return Math.min(1, Math.max(GENOU_PERCEPTIF, 1 + (20 * Math.log10(gain)) / PLAGE_PERCEPTIVE_DB));
}

export type ZoneAvecCourbe = { volume_curve?: string | null } | null | undefined;

/** La zone suit-elle la loi perceptive ? Seul le serveur le dit. */
export function estPerceptive(zone: ZoneAvecCourbe): boolean {
  return zone?.volume_curve === COURBE_DB60;
}

/** Le gain linéaire que représente `volume` (0..1) sur l'échelle de la zone. */
export function gainDeLaZone(zone: ZoneAvecCourbe, volume: number): number {
  if (estPerceptive(zone)) return gainPerceptif(volume);
  if (!Number.isFinite(volume)) return 0;
  return Math.max(0, Math.min(1, volume));
}

/** Le `volume` (0..1) qui représente le gain linéaire `gain` sur la zone. */
export function volumeDepuisGain(zone: ZoneAvecCourbe, gain: number): number {
  if (estPerceptive(zone)) return positionPerceptive(gain);
  if (!Number.isFinite(gain)) return 0;
  return Math.max(0, Math.min(1, gain));
}

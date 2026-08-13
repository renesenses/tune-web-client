/// Échelle des VU-mètres du mode Grand écran (TvVuMeters).
///
/// Historique : le cadran était un VU broadcast −20…+3 VU, avec 0 VU calé sur
/// −14 dBFS (#323) puis −18 dBFS (#370). Dans les deux cas la butée haute
/// (+3 VU) tombait à −11 puis −15 dBFS de RMS — sous le niveau où vit la
/// quasi-totalité des masters modernes (−12…−8 dBFS RMS). Les aiguilles
/// restaient donc collées en butée dans le rouge, et l'instrument ne mesurait
/// plus rien (#439).
///
/// L'échelle est désormais élargie jusqu'à la pleine échelle numérique :
/// l'aiguille lit directement le RMS en dBFS sur −40…0, et la zone rouge ne
/// couvre que les vrais −3…0 dBFS.

/** Graduation basse du cadran (dBFS). */
export const MIN_DB = -40;
/** Graduation haute : la pleine échelle numérique. */
export const MAX_DB = 0;
/** Début de la zone rouge : seuls les vrais −3…0 dBFS de RMS l'atteignent. */
export const RED_FROM_DB = -3;
/// Témoin de crête : quasi pleine échelle. À −3 dBFS il restait allumé en
/// continu sur les masters limités, dont les crêtes vivent au-dessus.
export const PEAK_LAMP_DBFS = -0.5;

/** Graduations du cadran (dBFS). */
export const TICKS = [-40, -30, -20, -15, -10, -7, -5, -3, -1, 0];
/** Graduations chiffrées (valeur absolue affichée, comme sur un vrai cadran). */
export const LABELED_TICKS = [-40, -30, -20, -10, -5, -3, 0];

/**
 * dBFS → position 0…1 sur l'arc (gauche → droite), bornée au cadran.
 * Courbe légèrement logarithmique comme un vrai cadran (resserrée à gauche).
 */
export function dbToFraction(db: number): number {
  const t = (Math.min(MAX_DB, Math.max(MIN_DB, db)) - MIN_DB) / (MAX_DB - MIN_DB);
  return Math.pow(t, 0.75);
}

/**
 * La loi du CURSEUR de volume d'une zone — miroir exact de `volume_scale` du
 * serveur (tune-server-rust, `tune-core/src/audio/volume_scale.rs`, #6787).
 *
 * # Pourquoi ce module existe
 *
 * Fil ASR #49 (aedagnino, 22/10/2026) : « toute zone joue beaucoup trop fort »,
 * il fallait descendre vers 5 %. Le volume d'une sortie LOGICIELLE multiplie
 * directement les échantillons : un curseur linéaire à 50 % ne vaut que −6 dB.
 *
 * # Ce que publie le serveur
 *
 * `volume` garde partout son sens historique : le GAIN linéaire (0..1). Le
 * serveur publie en plus `volume_curve` :
 * - `"db60"` (sortie locale, zone navigateur) : le CURSEUR suit une loi en dB
 *   sur 60 dB (chaque point vaut 0,6 dB), prolongée sous 10 % (−54 dB) par
 *   une droite jusqu'au silence. Une zone enregistrée à 5 % de gain (−26 dB)
 *   se lit à 57 % sur le curseur et joue au MÊME niveau (décision de Bertrand
 *   du 23/10 : « convertir au même niveau en dB ») ;
 * - `"linear"` (appareils réseau) ou absent (serveur antérieur) : le curseur
 *   est le nombre, comme avant.
 *
 * Le client convertit donc à deux endroits seulement : à la LECTURE (gain du
 * serveur → curseur, `volumeDepuisGain`, magasin `zoneVolume`) et à l'ENVOI
 * (curseur → gain, `gainDeLaZone`, dans `api.setVolume`). Un oubli à la
 * lecture affiche un curseur plus bas ; à l'envoi, `api.setVolume` convertit
 * toujours — une valeur déjà en gain y est relue comme un curseur et joue
 * PLUS BAS, jamais plus haut (`gainPerceptif(p) <= p`).
 *
 * La conversion du curseur est arrondie vers le BAS :
 * `gainPerceptif(positionPerceptive(g)) <= g`, et un aller-retour de plus ne
 * change plus rien. Témoin : `courbeDeVolume6787.test.ts`.
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

/** Le flottant voisin (un ulp) de `x` > 0 fini, comme `f64::from_bits(bits ± 1)`
 *  côté serveur. */
const bits = new DataView(new ArrayBuffer(8));
function voisin(x: number, sens: 1 | -1): number {
  bits.setFloat64(0, x);
  const b = bits.getBigUint64(0);
  bits.setBigUint64(0, sens > 0 ? b + 1n : b - 1n);
  return bits.getFloat64(0);
}
const ulpDessous = (x: number) => voisin(x, -1);
const ulpDessus = (x: number) => voisin(x, 1);

/** L'inverse de [`gainPerceptif`], arrondi vers le BAS : la position rendue
 *  ne rend jamais plus que `gain`, et c'est la plus haute qui le respecte
 *  (relire puis renvoyer le curseur une seconde fois ne change rien). */
export function positionPerceptive(gain: number): number {
  if (!(gain > 0)) return 0;
  if (gain >= 1) return 1;
  let p =
    gain < GAIN_AU_GENOU
      ? Math.min(GENOU_PERCEPTIF, (gain / GAIN_AU_GENOU) * GENOU_PERCEPTIF)
      : Math.min(1, Math.max(GENOU_PERCEPTIF, 1 + (20 * Math.log10(gain)) / PLAGE_PERCEPTIVE_DB));
  while (p > 0 && gainPerceptif(p) > gain) p = Math.max(0, ulpDessous(p));
  for (let i = 0; i < 8; i++) {
    const q = ulpDessus(p);
    if (q <= 1 && gainPerceptif(q) <= gain) p = q;
    else break;
  }
  return p;
}

export type ZoneAvecCourbe = { volume_curve?: string | null } | null | undefined;

/** La zone dont on règle le volume, pour lire sa loi de curseur
 *  (`api.setVolume`). Branché par le magasin des zones ; sans lui (tests), le
 *  curseur est le gain, comme avant. */
let resoudreLaZone: (zoneId: number) => ZoneAvecCourbe = () => null;
export function brancherZonePourLeCurseur(f: (zoneId: number) => ZoneAvecCourbe) {
  resoudreLaZone = f;
}
export function zonePourLeCurseur(zoneId: number): ZoneAvecCourbe {
  return resoudreLaZone(zoneId);
}

/** La zone suit-elle la loi perceptive ? Seul le serveur le dit. */
export function estPerceptive(zone: ZoneAvecCourbe): boolean {
  return zone?.volume_curve === COURBE_DB60;
}

/** Le gain (`volume` du serveur, 0..1) d'une position de CURSEUR sur la zone. */
export function gainDeLaZone(zone: ZoneAvecCourbe, volume: number): number {
  if (estPerceptive(zone)) return gainPerceptif(volume);
  if (!Number.isFinite(volume)) return 0;
  return Math.max(0, Math.min(1, volume));
}

/** La position du CURSEUR (0..1) du gain `gain` (`volume` du serveur). */
export function volumeDepuisGain(zone: ZoneAvecCourbe, gain: number): number {
  if (estPerceptive(zone)) return positionPerceptive(gain);
  if (!Number.isFinite(gain)) return 0;
  return Math.max(0, Math.min(1, gain));
}

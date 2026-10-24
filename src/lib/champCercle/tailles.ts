/**
 * Tune Circle (rc8) — tailles des planètes et arrondis. Fonctions pures, sans
 * Svelte ni DOM : le moteur et l'écran les partagent, les bancs les lisent.
 *
 * Règle de la maquette validée le 23/10/2026 : l'AIRE d'une planète est
 * proportionnelle à son nombre d'albums. Le rayon suit donc la racine carrée
 * du rapport à la plus grande bibliothèque affichée, avec un plancher pour
 * qu'une petite bibliothèque reste visible et cliquable.
 *
 * Vie privée (contrat rc8) : la taille d'un CONTACT n'est connue que s'il
 * partage déjà sa bibliothèque avec moi ; sinon `albums` vaut `null` et la
 * planète prend la taille par défaut, qui ne dit rien.
 */

/** Rayon relatif minimal (0..1) : une planète ne descend jamais sous ce seuil. */
export const PLANCHER_RAYON = 0.26;

/** Rayon relatif d'une planète dont on ne connaît pas la bibliothèque. */
export const RAYON_PAR_DEFAUT = 0.4;

/**
 * Rayon relatif (plancher..1) d'une planète de `albums` albums, quand la plus
 * grande bibliothèque affichée en compte `max`.
 *
 * - aire ∝ albums : rayon = √(albums / max) ;
 * - inconnu (`null`, négatif, non fini) → {@link RAYON_PAR_DEFAUT} ;
 * - jamais sous {@link PLANCHER_RAYON}, jamais au-dessus de 1.
 */
export function rayonRelatif(albums: number | null | undefined, max: number, plancher = PLANCHER_RAYON): number {
  if (albums == null || !Number.isFinite(albums) || albums < 0) return RAYON_PAR_DEFAUT;
  if (!Number.isFinite(max) || max <= 0) return plancher;
  return Math.min(1, Math.max(plancher, Math.sqrt(albums / max)));
}

/** La plus grande bibliothèque CONNUE d'une liste (les inconnues ne comptent pas). */
export function maxConnu(valeurs: (number | null | undefined)[]): number {
  let m = 0;
  for (const v of valeurs) if (v != null && Number.isFinite(v) && v > m) m = v;
  return m;
}

/**
 * Arrondi à `chiffres` chiffres significatifs (2 par défaut, contrat rc8) :
 * 9 336 → 9 300, 1 249 → 1 200, 87 → 87, 0 → 0. Le cloud arrondit déjà ;
 * l'écran ré-arrondit ce qu'il affiche, au cas où.
 */
export function arrondiSignificatif(n: number, chiffres = 2): number {
  if (!Number.isFinite(n) || n === 0) return 0;
  const signe = n < 0 ? -1 : 1;
  const a = Math.abs(n);
  const puissance = Math.floor(Math.log10(a)) - chiffres + 1;
  if (puissance <= 0) return signe * Math.round(a);
  const pas = 10 ** puissance;
  return signe * Math.round(a / pas) * pas;
}

/**
 * Coordonnée arrondie au demi-degré (contrat rc8 : environ 50 km). Le cloud
 * le fait aussi ; le client le fait AVANT d'envoyer, pour que la position
 * exacte d'un clic ne quitte jamais le navigateur.
 */
export function arrondiDemiDegre(v: number): number {
  // Comme le cloud (annexe du contrat) : le demi-pas s'arrondit LOIN de zéro
  // (-12.25 → -12.5), et jamais « -0 ».
  const r = (Math.sign(v) * Math.round(Math.abs(v) * 2)) / 2;
  return r === 0 ? 0 : r;
}

/** Nombre maximal de genres d'un contact (contrat rc8 : les 8 premiers). */
export const GENRES_MAX = 8;

/**
 * Taille relative (0..1) d'une grappe de genre, d'après le total d'albums du
 * genre dans le cercle, rapporté à la plus grosse grappe affichée. Même règle
 * d'aire que les planètes.
 */
export function tailleGrappe(albums: number, maxGrappe: number): number {
  return rayonRelatif(Math.max(0, albums), maxGrappe, 0.45);
}

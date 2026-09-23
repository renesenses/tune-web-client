/**
 * Combien de titres une lecture aléatoire met dans la file d'attente
 * (tune-server-rust#2901).
 *
 * ## Le réglage existait, mais nulle part où le toucher
 *
 * Le serveur borne depuis longtemps le tirage aléatoire : `shuffle_max_tracks`
 * (`tune-core/src/playback/queue.rs`), défaut **500**, plancher **1**, plafond
 * **5 000**. Mesuré sur le .18 le 23/09/2026 :
 *
 *     GET /api/v1/system/config
 *       → { …, "shuffle_max_tracks": 500,
 *                "shuffle_max_tracks_min": 1,
 *                "shuffle_max_tracks_max": 5000 }
 *
 * Aucun écran ne le montrait. Une bibliothèque de 47 000 titres repart donc
 * toujours sur les mêmes 500, sans que rien ne dise pourquoi — et sans moyen
 * de relever la limite autrement qu'en base.
 *
 * ## 🔴 Les bornes viennent du SERVEUR, jamais d'ici
 *
 * `MIN_REPLI` / `MAX_REPLI` ne sont pas le contrat : ils ne servent qu'au
 * serveur ANTÉRIEUR à #2901, qui publie la valeur sans publier ses bornes.
 * Recopier 1 et 5 000 dans le balisage figerait l'écran le jour où le serveur
 * élargit sa plage — c'est exactement la dérive que `bornesCrossfeed` évite
 * côté crossfeed, et on la suit ici.
 */

/** La clé de réglage, côté serveur. Elle voyage dans les deux sens : le `GET`
 *  la publie, le `PATCH` l'écrit. */
export const CLE_FILE_ALEATOIRE = 'shuffle_max_tracks';
/** Les bornes publiées par le serveur, en LECTURE seule — on ne les écrit
 *  jamais. */
export const CLE_FILE_ALEATOIRE_MIN = 'shuffle_max_tracks_min';
export const CLE_FILE_ALEATOIRE_MAX = 'shuffle_max_tracks_max';

/** Le défaut du serveur. Il sert à remplir le champ quand le serveur n'a rien
 *  pu dire, et à rougir si jamais il dérivait. */
export const FILE_ALEATOIRE_DEFAUT = 500;

/** Repli SEULEMENT, pour un serveur qui ne publie pas ses bornes. */
export const FILE_ALEATOIRE_MIN_REPLI = 1;
export const FILE_ALEATOIRE_MAX_REPLI = 5000;

export interface BornesFileAleatoire {
  min: number;
  max: number;
}

/** Un entier exploitable, ou `null`. Le serveur peut republier la valeur en
 *  CHAÎNE : `settings` ne stocke que des chaînes, et `GET /system/config`
 *  reparse clé par clé — une clé oubliée ressort brute. */
function entier(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Les bornes que le SERVEUR applique, s'il les publie ; sinon les nôtres.
 *
 * Une borne absente, non numérique, nulle ou négative retombe sur le repli :
 * mieux vaut un champ un peu court qu'un champ bloqué à zéro. Un couple
 * INVERSÉ (`min > max`) est refusé en bloc — il ne décrit aucun intervalle, et
 * en garder une moitié donnerait un champ impossible à remplir.
 */
export function bornesFileAleatoire(
  config: Record<string, unknown> | null | undefined,
): BornesFileAleatoire {
  const min = entier(config?.[CLE_FILE_ALEATOIRE_MIN]);
  const max = entier(config?.[CLE_FILE_ALEATOIRE_MAX]);
  if (min === null || max === null || min < 1 || max < 1 || min > max) {
    return { min: FILE_ALEATOIRE_MIN_REPLI, max: FILE_ALEATOIRE_MAX_REPLI };
  }
  return { min, max };
}

/**
 * Ramène une saisie dans les bornes du serveur.
 *
 * 🔴 Une valeur VIDE n'est pas un zéro : le champ qu'on vient d'effacer ne
 * doit pas partir en « 0 piste », ce que le serveur traduirait en refus. Elle
 * retombe sur le défaut, lui-même borné — comme `reglagesCrossfeed` borne sa
 * charge utile avant l'envoi, pour que l'écran montre la valeur qui sera
 * RÉELLEMENT appliquée, pas celle qu'on a demandée.
 */
export function bornerFileAleatoire(valeur: unknown, bornes: BornesFileAleatoire): number {
  const n = entier(valeur) ?? FILE_ALEATOIRE_DEFAUT;
  return Math.min(bornes.max, Math.max(bornes.min, n));
}

/** La valeur courante, telle que l'écran doit la montrer avant toute
 *  modification. Clé absente = serveur qui applique son propre défaut. */
export function lireFileAleatoire(
  config: Record<string, unknown> | null | undefined,
  bornes: BornesFileAleatoire = bornesFileAleatoire(config),
): number {
  return bornerFileAleatoire(config?.[CLE_FILE_ALEATOIRE], bornes);
}

/** Le corps du `PATCH /system/config`, borné. Une seule clé : les bornes sont
 *  en lecture seule. */
export function versPatchFileAleatoire(
  valeur: unknown,
  bornes: BornesFileAleatoire,
): Record<string, number> {
  return { [CLE_FILE_ALEATOIRE]: bornerFileAleatoire(valeur, bornes) };
}

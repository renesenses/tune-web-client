/**
 * Le délai de relecture des partages réseau (tune-server-rust#5792, fil 2148).
 *
 * Un NAS ne prévient pas Tune de ce qui change chez lui : le serveur va voir
 * lui-même, à ce rythme. Le réglage serveur est en SECONDES
 * (`network_poll_interval_secs`, défaut 300, de 60 à 3 600) ; l'écran parle en
 * MINUTES, l'unité dans laquelle on y pense.
 *
 * 🔴 Les bornes viennent du serveur (`…_min` / `…_max`), comme pour
 * `fileAleatoire.ts` ; les replis ne servent qu'à un serveur qui ne les publie
 * pas. Un serveur qui ne publie pas la CLÉ ne connaît pas le réglage : l'écran
 * ne montre alors rien (`lireSondeReseau` rend `null`).
 */

export const CLE_SONDE_RESEAU = 'network_poll_interval_secs';
export const CLE_SONDE_RESEAU_MIN = 'network_poll_interval_secs_min';
export const CLE_SONDE_RESEAU_MAX = 'network_poll_interval_secs_max';

/** Défaut et replis du serveur, en secondes. */
export const SONDE_RESEAU_DEFAUT_S = 300;
export const SONDE_RESEAU_MIN_REPLI_S = 60;
export const SONDE_RESEAU_MAX_REPLI_S = 3600;

/** Bornes en MINUTES, telles que le champ les montre. */
export interface BornesSondeReseau {
  min: number;
  max: number;
}

function entier(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Les bornes du serveur, converties en minutes entières CONTENUES dans
 *  l'intervalle serveur (61 s → 2 min, jamais 1). */
export function bornesSondeReseau(
  config: Record<string, unknown> | null | undefined,
): BornesSondeReseau {
  let min = entier(config?.[CLE_SONDE_RESEAU_MIN]);
  let max = entier(config?.[CLE_SONDE_RESEAU_MAX]);
  if (min === null || max === null || min < 1 || max < 1 || min > max) {
    min = SONDE_RESEAU_MIN_REPLI_S;
    max = SONDE_RESEAU_MAX_REPLI_S;
  }
  const mn = Math.max(1, Math.ceil(min / 60));
  const mx = Math.max(mn, Math.floor(max / 60));
  return { min: mn, max: mx };
}

/** Une saisie en minutes, ramenée dans les bornes ; vide ⇒ le défaut. */
export function bornerSondeReseau(valeur: unknown, bornes: BornesSondeReseau): number {
  const n = entier(valeur) ?? Math.round(SONDE_RESEAU_DEFAUT_S / 60);
  return Math.min(bornes.max, Math.max(bornes.min, n));
}

/** La valeur courante en minutes, ou `null` si le serveur ne connaît pas le
 *  réglage. */
export function lireSondeReseau(
  config: Record<string, unknown> | null | undefined,
  bornes: BornesSondeReseau = bornesSondeReseau(config),
): number | null {
  const s = entier(config?.[CLE_SONDE_RESEAU]);
  if (s === null) return null;
  return bornerSondeReseau(Math.round(s / 60), bornes);
}

/** Le corps du `PATCH /system/config` : des secondes, bornées. */
export function versPatchSondeReseau(
  minutes: unknown,
  bornes: BornesSondeReseau,
): Record<string, number> {
  return { [CLE_SONDE_RESEAU]: bornerSondeReseau(minutes, bornes) * 60 };
}

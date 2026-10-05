/**
 * PRÉVENIR AVANT DE COUPER L'ÉGALISEUR — tune-server-rust#5215.
 *
 * Levente (fil 1974, casque) : « when the user switches off the EQ —
 * suddenly without warning the volume settings are back to without EQ so
 * significantly higher […] a few times I shocked myself ». L'égaliseur retire
 * du niveau (sa réserve anti-écrêtage) ; le couper le rend d'un coup.
 *
 * ## Le saut, calculé depuis ce que le serveur publie
 *
 * `GET /zones/{id}/dsp` → `level_compensation` dit ce que l'égaliseur retire
 * au niveau moyen (`eq_db`), ce que la compensation de niveau rend par le
 * volume (`rendered_db`) et sur quel volume (`volume`). Le saut à la coupure
 * est la différence entre les deux états :
 *
 *   - égaliseur allumé : `eq_db + crossfeed_db + rendu`
 *   - égaliseur coupé  : `crossfeed_db + rendu'`, où `rendu'` est ce que le
 *     même volume rend encore de la seule compensation du crossfeed.
 *
 * Si la compensation rend déjà tout, le saut est nul : on ne dérange
 * personne. À volume 100 %, rien n'est rendu et le saut vaut ce que
 * l'égaliseur retire — le cas du ticket.
 *
 * Le ReplayGain de la piste n'entre pas dans ce calcul (le serveur ne le
 * compte pas non plus) : le chiffre est un ordre de grandeur, et la fenêtre
 * dit « environ ».
 *
 * Un serveur qui ne publie pas ces champs : saut INCONNU, et l'on prévient
 * quand même, sans chiffre — se taire serait reproduire le défaut.
 */
import type { LevelCompensation } from './api';
import { estCompensation } from './compensationNiveau';

/** À partir de quel saut (dB) la fenêtre s'ouvre. */
export const SEUIL_SAUT_DB = 3;

/** Le choix « Ne plus afficher », propre à ce navigateur. */
export const CLE_NE_PLUS_AVERTIR = 'tune-eq-off-warning-dismissed';

/** Ce que le volume `volume` (linéaire) rend d'une compensation `db` — la
 *  règle du serveur (`part_rendue_par_le_volume`) : rabot à l'unité. */
function rendu(db: number, volume: number | undefined, parLeFlux: boolean): number {
  if (db <= 0 || parLeFlux) return db;
  if (typeof volume !== 'number' || !Number.isFinite(volume)) return db;
  if (volume <= 0) return db;
  const marge = Math.max(0, -20 * Math.log10(Math.min(volume, 1)));
  return Math.min(db, marge);
}

/**
 * Le saut de niveau, en dB (positif = plus fort), que produirait la coupure
 * de l'égaliseur. `null` quand le serveur ne publie pas de quoi le calculer.
 */
export function sautALaCoupure(lc: unknown): number | null {
  if (!estCompensation(lc)) return null;
  const etat = lc as LevelCompensation;
  const eq = Math.min(0, etat.eq_db);
  const cf = Math.min(0, etat.crossfeed_db);
  if (!etat.enabled) return -eq;
  const parLeFlux = etat.applied_by === 'stream_gain';
  const renduAvant = typeof etat.rendered_db === 'number'
    ? etat.rendered_db
    : rendu(etat.compensation_db, etat.volume, parLeFlux);
  const renduApres = rendu(-cf, etat.volume, parLeFlux);
  const saut = renduApres - eq - renduAvant;
  return Math.max(0, Math.round(saut * 10) / 10);
}

/** Faut-il prévenir ? Saut inconnu : oui. Saut connu : au-delà du seuil. */
export function doitAvertir(saut: number | null): boolean {
  return saut == null || saut >= SEUIL_SAUT_DB;
}

/** « Ne plus afficher » a-t-il été coché ? Un stockage refusé vaut « non ». */
export function avertissementMasque(): boolean {
  try {
    return localStorage.getItem(CLE_NE_PLUS_AVERTIR) === '1';
  } catch {
    return false;
  }
}

export function masquerAvertissement(): void {
  try {
    localStorage.setItem(CLE_NE_PLUS_AVERTIR, '1');
  } catch {
    /* fenêtre privée, stockage refusé : la fenêtre reviendra, rien de pire */
  }
}

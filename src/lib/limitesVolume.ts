import { volumeDepuisGain } from './courbeDeVolume';
/**
 * tune-server-rust#6541 — boutons + / − et limites de volume d'une zone
 * (fil forum 2335, alec_eiffel).
 *
 * Le SERVEUR tient les deux limites, pour tous les clients
 * (`tune_core::audio::volume_limites`) :
 * - la limite de **sécurité** (`volume_limit_safety`) borne tout, boutons
 *   compris ;
 * - la limite de **confort** (`volume_limit_comfort`) borne le curseur quand
 *   il MONTE : au-dessus d'elle, seuls les boutons font monter.
 *
 * Ce module ne fait que DIRE ces règles à l'écran (curseur plafonné, boutons
 * désactivés en butée) : il ne protège rien à lui seul, et c'est voulu — une
 * limite tenue par l'interface ne tiendrait pas contre l'appli Android, le pont
 * LMS ou un client tiers.
 *
 * Fractions linéaires 0..1, comme `volume`. `null` / absent = pas de limite.
 */

export type LimitesVolume = {
  /** tune-server-rust#6787 — loi du curseur ; les limites restent des GAINS. */
  volume_curve?: string | null;
  volume_limit_safety?: number | null;
  volume_limit_comfort?: number | null;
  /** Code publié par le serveur quand les limites n'ont pas cours sur la zone. */
  volume_limits_refusal?: string | null;
};

/** Les codes de refus publiés par le serveur (`volume_limits_refusal`, et
 *  `error` du 409 d'un PUT /volume-limits). */
export const REFUS_ZONE_PURE = 'limite_refusee_zone_pure';
export const REFUS_VOLUME_FIXE = 'limite_refusee_volume_fixe';

/** Le refus publié pour cette zone, ou null si les limites y ont cours. */
export function refusDeLimite(zone: LimitesVolume | null | undefined): string | null {
  const r = zone?.volume_limits_refusal;
  return typeof r === 'string' && r !== '' ? r : null;
}

/** Clé de traduction de la phrase d'un refus (code inconnu : null). */
export function cleTexteRefus(code: string | null | undefined): string | null {
  if (code === REFUS_ZONE_PURE) return 'devices.volumeLimitRefusedPure';
  if (code === REFUS_VOLUME_FIXE) return 'devices.volumeLimitRefusedFixed';
  return null;
}

/** Pas des boutons, en fraction : celui du serveur par défaut (0,02). */
export const PAS_BOUTON = 0.02;

function valide(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1 ? v : null;
}

/** Le serveur connaît-il les limites (et la route `/volume/step`) ? Un
 *  serveur antérieur n'émet pas la clé : les boutons retombent alors sur
 *  `PUT /volume`. */
export function serveurConnaitLesLimites(zone: object | null | undefined): boolean {
  return !!zone && 'volume_limit_safety' in zone;
}

export function securite(zone: LimitesVolume | null | undefined): number | null {
  // Zone PURE ou à volume fixe : le serveur ignore les limites déjà posées.
  if (refusDeLimite(zone)) return null;
  return valide(zone?.volume_limit_safety);
}

/** Le confort tel qu'il agit : jamais au-dessus de la sécurité. */
export function confort(zone: LimitesVolume | null | undefined): number | null {
  if (refusDeLimite(zone)) return null;
  const c = valide(zone?.volume_limit_comfort);
  const s = securite(zone);
  if (c === null) return null;
  return s === null ? c : Math.min(c, s);
}

/** Jusqu'où le CURSEUR peut monter depuis `actuel` : `min(sécurité,
 *  max(confort, actuel))`. Même règle que le serveur. */
export function plafondDuCurseur(zone: LimitesVolume | null | undefined, actuel: number): number {
  // tune-server-rust#6787 — les limites sont des GAINS ; `actuel` et la
  // valeur rendue sont des positions du curseur de la zone.
  const s = curseurDeLimite(zone, securite(zone)) ?? 1;
  const c = curseurDeLimite(zone, confort(zone));
  const haut = c === null ? 1 : Math.max(c, actuel);
  return Math.min(s, haut);
}

/** La valeur du curseur bornée comme le serveur la bornera. */
export function bornerCurseur(zone: LimitesVolume | null | undefined, cible: number, actuel: number): number {
  return Math.max(0, Math.min(cible, plafondDuCurseur(zone, actuel)));
}

/** Le bouton + est-il en butée (sécurité atteinte) ? */
export function plusEnButee(zone: LimitesVolume | null | undefined, actuel: number): boolean {
  return actuel >= (curseurDeLimite(zone, securite(zone)) ?? 1) - 1e-6;
}

/** Une limite (gain) sur le curseur de la zone (tune-server-rust#6787). */
function curseurDeLimite(zone: LimitesVolume | null | undefined, limite: number | null): number | null {
  return limite === null ? null : volumeDepuisGain(zone, limite);
}

/** Une saisie de limite en % (texte), ramenée à une fraction ; vide = pas de
 *  limite. `undefined` = saisie illisible (à refuser). */
export function limiteDepuisPourcent(texte: string): number | null | undefined {
  const t = texte.trim().replace(',', '.').replace(/%$/, '').trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 1 || n > 100) return undefined;
  return n / 100;
}

/** Une limite (fraction) en % pour un champ de saisie ; vide si aucune. */
export function pourcentDeLimite(v: number | null | undefined): string {
  const x = valide(v);
  return x === null ? '' : String(Math.round(x * 1000) / 10);
}

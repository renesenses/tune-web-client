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
  volume_limit_safety?: number | null;
  volume_limit_comfort?: number | null;
};

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
  return valide(zone?.volume_limit_safety);
}

/** Le confort tel qu'il agit : jamais au-dessus de la sécurité. */
export function confort(zone: LimitesVolume | null | undefined): number | null {
  const c = valide(zone?.volume_limit_comfort);
  const s = securite(zone);
  if (c === null) return null;
  return s === null ? c : Math.min(c, s);
}

/** Jusqu'où le CURSEUR peut monter depuis `actuel` : `min(sécurité,
 *  max(confort, actuel))`. Même règle que le serveur. */
export function plafondDuCurseur(zone: LimitesVolume | null | undefined, actuel: number): number {
  const s = securite(zone) ?? 1;
  const c = confort(zone);
  const haut = c === null ? 1 : Math.max(c, actuel);
  return Math.min(s, haut);
}

/** La valeur du curseur bornée comme le serveur la bornera. */
export function bornerCurseur(zone: LimitesVolume | null | undefined, cible: number, actuel: number): number {
  return Math.max(0, Math.min(cible, plafondDuCurseur(zone, actuel)));
}

/** Le bouton + est-il en butée (sécurité atteinte) ? */
export function plusEnButee(zone: LimitesVolume | null | undefined, actuel: number): boolean {
  return actuel >= (securite(zone) ?? 1) - 1e-6;
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

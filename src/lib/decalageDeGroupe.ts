/**
 * tune-server-rust#9149 (Jon, fil 2757) — le décalage manuel d'une zone qui
 * suit la meneuse de son groupe, côté client : bornes et saisie.
 *
 * Les bornes viennent du serveur (`GET /zones/{id}/group-offset`) ; celles-ci
 * ne servent que tant qu'il n'a pas répondu.
 */
export const DECALAGE_MIN_MS = -2000;
export const DECALAGE_MAX_MS = 2000;
export const PAS_MS = 10;

/** Ramène une saisie (texte du champ, valeur du curseur) dans les bornes, au pas de 10 ms. */
export function bornerDecalage(
  valeur: unknown,
  min: number = DECALAGE_MIN_MS,
  max: number = DECALAGE_MAX_MS,
): number {
  const n = typeof valeur === 'number' ? valeur : Number(valeur);
  if (!Number.isFinite(n)) return 0;
  const arrondi = Math.round(n / PAS_MS) * PAS_MS;
  return Math.min(max, Math.max(min, arrondi)) || 0;
}

/** Vrai si `zoneId` mène `groupe` : son réglage ne vaut alors pas. */
export function mene(groupe: { leader_id?: number | null; zone_ids: number[] } | undefined, zoneId: number | null): boolean {
  if (!groupe || zoneId === null) return false;
  const meneuse = groupe.leader_id ?? groupe.zone_ids[0];
  return meneuse === zoneId;
}

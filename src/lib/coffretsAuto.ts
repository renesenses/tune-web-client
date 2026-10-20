/**
 * « Coffrets automatiques » — Réglages › Bibliothèque › Options d'analyse.
 * tune-server-rust#6554 (fil 2294, Marco Polo et Gros Bidon), go de Bertrand
 * du 19/10/2026.
 *
 * Didier range tous ses albums à plusieurs disques en `Album/CD 1`,
 * `Album/CD 2`… : ils paraissaient TOUS sous Coffrets. Marco tient, lui, à la
 * réunion automatique. Le serveur (`tune_core::db::coffrets_auto`) lit la clé
 * {@link CLE_COFFRETS_AUTO} ; ABSENTE, elle vaut « actif » — le comportement
 * d'avant. Coupé, Tune ne réunit plus les disques rangés dossier par dossier
 * et ne range plus sous Coffrets un simple album à plusieurs disques. Les
 * coffrets déjà réunis restent réunis (« Défaire le coffret » les rend à
 * leurs disques).
 */
export const CLE_COFFRETS_AUTO = 'library_auto_box_sets';

/**
 * La valeur publiée par `GET /system/config`, lue comme le serveur la lit :
 * seul un « non » explicite coupe. Absente, illisible : actif.
 */
export function coffretsAutoDepuisConfig(v: unknown): boolean {
  if (v === false || v === 0) return false;
  if (typeof v === 'string') {
    return !['false', '0', 'no', 'off'].includes(v.trim().replace(/^"|"$/g, '').toLowerCase());
  }
  return true;
}

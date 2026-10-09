/**
 * « Analyser la bibliothèque au démarrage » — Réglages › Bibliothèque ›
 * Analyse automatique.
 *
 * Le serveur (tune-server-rust, `auto_scan::CLE_SCAN_AU_DEMARRAGE`) décide le
 * scan de démarrage dans cet ordre : ce réglage s'il a été posé, sinon sa
 * configuration de déploiement (`TUNE_AUTO_SCAN`, `tune.toml`), sinon non.
 * `GET /system/config` publie TOUJOURS la valeur qui vaudra au prochain
 * démarrage. La valeur prend effet au démarrage suivant du serveur.
 */
export const CLE_SCAN_AU_DEMARRAGE = 'library_scan_on_startup';

/**
 * La valeur effective publiée par le serveur, ou `null` quand la clé est
 * absente : serveur antérieur au réglage, l'interrupteur ne s'affiche pas.
 */
export function scanAuDemarrageDepuisConfig(config: unknown): boolean | null {
  if (!config || typeof config !== 'object' || !(CLE_SCAN_AU_DEMARRAGE in config)) return null;
  const v = (config as Record<string, unknown>)[CLE_SCAN_AU_DEMARRAGE];
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    return ['true', '1', 'yes', 'on'].includes(v.trim().replace(/^"|"$/g, '').toLowerCase());
  }
  return false;
}

/**
 * tune-server-rust#5189 — la ligne « Température du processeur » de l'écran
 * « État du serveur ».
 *
 * Le serveur publie `cpu_temp_c` dans `GET /system/diagnostics` : un nombre en
 * °C, ou `null` quand il n'a aucun capteur lisible (macOS, Windows, conteneur,
 * machine virtuelle). Un serveur antérieur n'envoie pas le champ du tout.
 *
 * Trois cas, trois rendus :
 *  - nombre   → « 52 °C », arrondi à l'entier ;
 *  - `null`   → le libellé « indisponible » passé TRADUIT par l'appelant ;
 *  - absent   → `null` : pas de ligne. L'écran dit ce qu'il SAIT, et un
 *               serveur qui ne connaît pas le champ ne dit pas « pas de capteur ».
 *
 * Pas de seuil ni d'alerte : ce n'est pas demandé.
 */
export function temperatureProcesseur(valeur: unknown, indisponible: string): string | null {
  if (valeur === undefined) return null;
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return indisponible;
  return `${Math.round(valeur)} °C`;
}

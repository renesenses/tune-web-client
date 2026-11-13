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
/**
 * tune-server-rust#8011 (suite de #6450) — `temperature_illisible` de
 * `GET /system/diagnostics` : `null` quand la garde thermique mesure, sinon le
 * motif (`temperature_illisible`, `temperature_figee`). Le serveur ne bride
 * plus les analyses dans ce cas : elles tournent à la vitesse réglée, SANS
 * surveillance de la chaleur, et l'écran « État du serveur » doit le dire.
 *
 * Rend l'avertissement à afficher (traduit par l'appelant selon le motif), ou
 * `null` : température lue, ou serveur antérieur qui n'envoie pas le champ.
 */
export function avertissementTemperature(
  motif: unknown,
  libelles: { illisible: string; figee: string },
): string | null {
  if (motif === 'temperature_figee') return libelles.figee;
  if (typeof motif === 'string' && motif.trim() !== '') return libelles.illisible;
  return null;
}

export function temperatureProcesseur(valeur: unknown, indisponible: string): string | null {
  if (valeur === undefined) return null;
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return indisponible;
  return `${Math.round(valeur)} °C`;
}

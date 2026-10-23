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
 * tune-server-rust#5410 — `analyses_bridees` de `GET /system/diagnostics` :
 * `null` quand la garde thermique mesure, sinon le motif
 * (`temperature_illisible`, `temperature_figee`). Les analyses de fond
 * tournent alors à un fichier à la fois, et l'écran doit le dire.
 *
 * Rend la phrase à afficher (traduite par l'appelant selon le motif), ou
 * `null` : pas de bridage, ou serveur antérieur qui n'envoie pas le champ.
 */
export function bridageDesAnalyses(
  motif: unknown,
  libelles: { illisible: string; figee: string },
): string | null {
  if (motif === 'temperature_figee') return libelles.figee;
  if (typeof motif === 'string' && motif.trim() !== '') return libelles.illisible;
  return null;
}

/**
 * tune-server-rust#6713 — `analyses_bridage_leve` de `GET /system/diagnostics`
 * : le motif d'une température illisible quand l'UTILISATEUR a levé le
 * bridage (Réglages, niveau Expert), `null` sinon. Les analyses tournent
 * alors à la vitesse réglée : l'écran le dit, pour que ce choix ne s'oublie
 * pas. Absent chez un serveur antérieur : rien.
 */
export const CLE_LEVER_LE_BRIDAGE = 'background_analysis_unthrottle_unreadable_temperature';

export function bridageLeve(motif: unknown, libelle: string): string | null {
  return typeof motif === 'string' && motif.trim() !== '' ? libelle : null;
}

export function temperatureProcesseur(valeur: unknown, indisponible: string): string | null {
  if (valeur === undefined) return null;
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return indisponible;
  return `${Math.round(valeur)} °C`;
}

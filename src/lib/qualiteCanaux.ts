/**
 * tune-web-client#3173 (fil forum 2713, rc12) — le menu « Qualité » porte DEUX
 * groupes de choix qui ne mesurent pas la même chose :
 *  - les CANAUX : Stéréo, Multicanal (#7725, #8560) ;
 *  - les PALIERS : DSD, Hi-Res, CD, Compressé, Hi-Res vérifié / douteux.
 *
 * Ils étaient réunis par OU, comme les valeurs d'une même facette (#898) :
 * « DSD + Multicanal » gardait les DSD 2.0 et ajoutait les multicanaux PCM,
 * « DSD + Multicanal + Stéréo » rendait presque toute la bibliothèque.
 *
 * La règle : OU à l'intérieur de chaque groupe, ET entre les deux groupes —
 * comme deux facettes distinctes. DSD + Multicanal = les DSD multicanaux ;
 * DSD + Stéréo + Multicanal = tous les DSD.
 *
 * Elle s'applique à UN exemplaire (une version) : une carte qui regroupe un
 * DSD 2.0 et un PCM 5.1 ne répond pas à « DSD + Multicanal ».
 */

/** Les clés du groupe « canaux ». Tout le reste est un palier. */
export const CLES_CANAUX: ReadonlySet<string> = new Set(['stereo', 'multichannel']);

export function estCleCanaux(cle: string): boolean {
  return CLES_CANAUX.has(cle);
}

/**
 * Les choix cochés sont-ils satisfaits ? `repond(cle)` dit si l'exemplaire
 * relève de la clé. Aucun choix : vrai.
 */
export function repondAuxQualites(cles: Iterable<string>, repond: (cle: string) => boolean): boolean {
  const canaux: string[] = [];
  const paliers: string[] = [];
  for (const c of cles) (estCleCanaux(c) ? canaux : paliers).push(c);
  return (!canaux.length || canaux.some(repond)) && (!paliers.length || paliers.some(repond));
}

/**
 * Les choix à appliquer pour COMPTER la valeur `cle` du menu : `cle` elle-même,
 * plus les choix cochés de l'AUTRE groupe. Le groupe de `cle` se compte sans
 * lui-même (règle des facettes, #898) ; l'autre groupe, lui, est un filtre
 * comme un autre : sous « DSD », « Multicanal » compte les DSD multicanaux.
 */
export function qualitesPourCompter(cochees: readonly string[], cle: string): string[] {
  return [...cochees.filter((c) => estCleCanaux(c) !== estCleCanaux(cle)), cle];
}

/** Un choix de canaux est-il coché ? */
export function filtreDeCanaux(cochees: Iterable<string>): boolean {
  for (const c of cochees) if (estCleCanaux(c)) return true;
  return false;
}

/**
 * Relecture de #3174 — les canaux qu'affiche le badge d'une version présentée
 * sous un choix de canaux : ceux de la version qui RÉPONDENT au choix. Un
 * album qui mêle pistes 2.0 et 5.1 présenté sous « Stéréo » dit « 2.0 », pas
 * « 5.1 ». Lus dans `min_channels` (à défaut `max_channels`) et `max_channels`.
 */
export function canauxRepondants(
  album: { min_channels?: number | null; max_channels?: number | null },
  cochees: Iterable<string>,
): number[] {
  const choix = new Set([...cochees].filter(estCleCanaux));
  const max = Number(album.max_channels ?? 0);
  const min = Number(album.min_channels ?? album.max_channels ?? 0);
  return [...new Set([min, max])].filter((n) => n > 0
    && ((choix.has('stereo') && n <= 2) || (choix.has('multichannel') && n > 2)));
}

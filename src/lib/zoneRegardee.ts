/**
 * « Cet événement concerne-t-il la zone que je regarde ? »
 *
 * La question était posée deux fois en ligne dans `App.svelte`, avec la même
 * expression recopiée — et une troisième fois elle a été OUBLIÉE : à la
 * réception de `playback.queue.cleared`, le cache de file était vidé sans
 * filtre (#753). Vider la file du Sonos effaçait donc l'affichage de la file
 * de l'Eversolo, qui n'avait pas bougé. Tant que rien ne recharge la file,
 * l'écran ment.
 *
 * La règle vit désormais ici, pour qu'un test l'APPELLE au lieu de relire
 * `App.svelte`.
 */

interface ZoneMinimale {
  id?: number | null;
  group_id?: string | null;
}

/**
 * Vrai quand `zoneEvenement` est la zone courante, ou un membre du même
 * groupe.
 *
 * 🔴 Le groupe compte : deux zones synchronisées partagent leur file, et un
 * événement émis par le suiveur concerne bien ce qu'affiche le meneur.
 *
 * `null`/`undefined` des deux côtés ne se rencontrent PAS : un événement sans
 * zone ne concerne aucune zone en particulier, et deux zones sans groupe ne
 * sont pas groupées ensemble — c'est le défaut qu'on trouve partout où
 * `a?.x === b?.x` fait correspondre deux absences.
 */
export function concerneLaZoneRegardee(
  zoneEvenement: number | null | undefined,
  zoneCourante: ZoneMinimale | null | undefined,
  toutesLesZones: readonly ZoneMinimale[] = [],
): boolean {
  if (zoneEvenement == null || zoneCourante?.id == null) return false;
  if (zoneCourante.id === zoneEvenement) return true;

  const groupeCourant = zoneCourante.group_id;
  if (groupeCourant == null) return false;

  const emettrice = toutesLesZones.find((z) => z.id === zoneEvenement);
  return emettrice?.group_id != null && emettrice.group_id === groupeCourant;
}

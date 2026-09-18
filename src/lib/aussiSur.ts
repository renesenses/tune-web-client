/**
 * « Aussi sur … » — phase 5 du chantier UPnP (D1-b, Bertrand 14/09/2026).
 *
 * Quand un album existe à la fois dans la bibliothèque locale et sur un
 * serveur UPnP, la grille ne montre que le local (#4146). La fiche le DIT,
 * dans les deux sens, sans rien fusionner :
 *
 *   - album local  → « Aussi sur Salon » (ou plusieurs serveurs) ;
 *   - album distant → « Aussi dans la bibliothèque locale ».
 *
 * Serveur : `GET /library/albums/{id}/aussi-sur`, qui rapproche par la même
 * règle SQL que le masquage — un album masqué est toujours signalé.
 */

export interface AussiSur {
  album_id: number;
  /** Vrai : la contrepartie est l'album LOCAL. */
  local: boolean;
  /** Nom du serveur UPnP, quand l'indexation l'a noté. */
  serveur: string | null;
}

export interface MentionAussiSur {
  cle: 'v2.album.alsoOnLocal' | 'v2.album.alsoOn' | 'v2.album.alsoOnNetwork';
  /** Les noms de serveurs, sans doublon, dans l'ordre reçu. */
  serveurs: string[];
}

/** La mention à afficher, ou `null` s'il n'y a rien à dire. */
export function mentionAussiSur(liste: readonly AussiSur[] | null | undefined): MentionAussiSur | null {
  if (!liste?.length) return null;
  if (liste.some((x) => x.local)) return { cle: 'v2.album.alsoOnLocal', serveurs: [] };
  const serveurs = [...new Set(liste.map((x) => x.serveur?.trim()).filter((n): n is string => !!n))];
  return serveurs.length
    ? { cle: 'v2.album.alsoOn', serveurs }
    : { cle: 'v2.album.alsoOnNetwork', serveurs: [] };
}

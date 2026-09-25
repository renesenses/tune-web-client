/**
 * Les hôtes des AUTRES serveurs Tune que ce client parcourt — tune-server-rust#4954.
 *
 * `artworkUrl` (#1360) réécrit une adresse absolue `…/api/v1/library/artwork/<condensat>`
 * vers le condensat demandé à NOTRE serveur : c'est ce qui répare les lignes
 * d'historique que la .157 et ses aînées ont écrites en adresse LAN, quel que
 * soit l'hôte enregistré (un bail DHCP renouvelé et il ne mène plus nulle part).
 *
 * Mais `pochetteDistante` fabrique exactement la même forme pour un serveur Tune
 * DISTANT, et sa pochette n'existe pas chez nous : 404, tuile grise. Ce registre
 * dit à `artworkUrl` quels hôtes sont des dépôts distants : pour eux, la pochette
 * passe par le relais (que srv#4977 ouvre à ce seul cas). Tout autre hôte garde
 * la réécriture de #1360.
 *
 * Module sans dépendance : `api.ts` et `tuneRemote.ts` l'importent tous deux sans
 * cycle.
 */
const hotes = new Set<string>();

/** Retient `hôte:port` d'un serveur Tune distant ouvert par `depotDistant`. */
export function retenirDepotTuneDistant(hote: string): void {
  // Même normalisation que `URL.host`, qui efface le port par défaut (`:80`).
  try {
    hotes.add(new URL(`http://${hote}`).host);
  } catch {
    hotes.add(hote.toLowerCase());
  }
}

/** `hôte:port` (forme de `URL.host`) désigne-t-il un dépôt Tune distant connu ? */
export function estDepotTuneDistant(hote: string): boolean {
  return hotes.has(hote.toLowerCase());
}

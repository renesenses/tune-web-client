/**
 * L'arrêt : quand il est possible, et par où il passe.
 *
 * Le bouton Stop de la barre de transport a existé, a été retiré le 05/09/2026
 * au profit du double-clic sur Lecture, puis redemandé le 08/09/2026 :
 * « Et le bouton Stop de la transport barre !! ?? !! ». Les deux chemins
 * cohabitent désormais et appellent le MÊME `stopAndSync` — ce fichier existe
 * pour que la condition, elle, ne soit écrite qu'une fois et qu'un test puisse
 * l'APPELER plutôt que relire la barre.
 *
 * Ce que l'arrêt est, et n'est pas : ce n'est pas une commande de MUSIQUE —
 * position et file sont conservées de part et d'autre, vérifié sur le .18 —
 * c'est une commande d'APPAREIL. `orchestrator.stop(zone, device)` envoie un
 * STOP au périphérique, ce qui libère un renderer DLNA ou AirPlay là où la
 * pause le garde. C'est tout l'intérêt du geste, et la raison pour laquelle il
 * mérite un bouton visible : personne ne devine un double-clic.
 */

/**
 * Peut-on arrêter ?
 *
 * Deux conditions, et pas une de plus :
 *
 *  - une zone. Sans destination, il n'y a rien à libérer ;
 *  - une source qui n'est pas la RADIO. Un flux en direct ne se reprend pas où
 *    on l'a laissé : l'arrêter et le relancer donne un autre moment de
 *    l'antenne. Le bouton autonome excluait déjà la radio avant son retrait —
 *    on ne réintroduit pas ce que la version précédente avait raison d'écarter.
 *
 * `source` absente ou inconnue n'est PAS une radio : une piste locale sans
 * champ `source` reste arrêtable.
 */
export function arretPossible(
  zoneId: number | null | undefined,
  source: string | null | undefined,
): boolean {
  return zoneId != null && source !== 'radio';
}

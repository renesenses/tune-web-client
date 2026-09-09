/**
 * Ce que Tune doit DIRE apres avoir envoye une piste Bandcamp a une zone.
 *
 * #2076 — Bilou, fil forum 1509, zone navigateur « Ce PC » :
 *
 *   « Cette zone (browser) marche pourtant parfaitement (sur mes haut-parleurs
 *     du PC) pour la radio et pour toute lecture de ma bibliotheque. Pourquoi
 *     pas de son sur la seule source Bandcamp ??? »
 *
 * Tune lui repondait, en rouge : « Ce PC — cette zone n'a pas accepte le MP3
 * 128 kbit/s de Bandcamp. Essayez une autre zone. » Le message accusait la
 * zone, et l'envoyait changer de materiel.
 *
 * La zone n'avait rien refuse. Une zone NAVIGATEUR n'a, par construction,
 * aucun peripherique de sortie : l'onglet EST la sortie et tire `stream_url`
 * lui-meme (`playAndSync` → `handleBrowserPlayback`). Le serveur y rend donc
 * TOUJOURS `output_sent = false`, y compris quand le son sort — il l'ecrit
 * lui-meme, trois fois :
 *
 *   tune-core/src/orchestrator.rs:724
 *     « Une zone navigateur n'a pas de peripherique de sortie : la sortie est
 *       l'onglet, qui tire `stream_url` lui-meme. `output_sent` y vaut donc
 *       toujours faux »
 *   tune-core/src/orchestrator/transport.rs:1036-1041
 *   tune-core/src/orchestrator.rs:1392 (garde des zones orphelines)
 *
 * `output_sent === false` ne dit donc RIEN sur une zone navigateur. Le seul
 * signal qui y ait un sens est `stream_url` : avec, l'onglet a de quoi jouer ;
 * sans, Tune n'a pas obtenu de flux — et ce n'est toujours pas la zone.
 *
 * La fonction est pure et vit hors du composant pour que ce raisonnement soit
 * verifiable sans monter un DOM.
 */

/** La zone telle que `POST /zones/{id}/play` la rend. */
export type RetourEnvoi = {
  output_sent?: boolean;
  stream_url?: string | null;
  error?: string | null;
};

export type VerdictEnvoi =
  /** Le titre est parti. */
  | 'succes'
  /** Une sortie reelle a refuse le flux : la nommer est juste. */
  | 'refusDeLaZone'
  /** Zone navigateur sans flux a tirer : Tune n'a rien obtenu a lui donner. */
  | 'aucunFlux'
  /** `playAndSync` a deja montre `zone.error` : ne rien ajouter par-dessus. */
  | 'dejaSignale';

/**
 * @param apres la zone rendue par l'envoi
 * @param estZoneNavigateur `isBrowserZone(zone)` — passe par l'appelant pour
 *        que ce module reste sans dependance (et donc testable seul)
 */
export function verdictEnvoiBandcamp(
  apres: RetourEnvoi,
  estZoneNavigateur: boolean,
): VerdictEnvoi {
  // Un `zone.error` a deja produit une notification rouge dans `playAndSync`
  // (`checkPlayError`). L'ancien code enchainait par-dessus une notification
  // VERTE de succes : deux messages contradictoires pour une seule lecture.
  if (apres.error) return 'dejaSignale';
  if (estZoneNavigateur) {
    return apres.stream_url ? 'succes' : 'aucunFlux';
  }
  return apres.output_sent === false ? 'refusDeLaZone' : 'succes';
}

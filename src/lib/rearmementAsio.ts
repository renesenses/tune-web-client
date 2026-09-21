/**
 * LE REFUS ASIO QUI ACCUSE LE MATÉRIEL — renesenses/tune-server-rust#4556.
 *
 * Le DAC de Marco Polo était refusé alors que Windows le voyait. Après un
 * plantage de pilote ASIO, Tune pose un témoin **sur disque** et n'énumère
 * plus ASIO au démarrage suivant : il retombe en WASAPI, ne trouve pas la
 * zone, et affiche « la sortie n'est plus disponible » — **en accusant le
 * matériel alors qu'il sait qu'il n'a pas regardé**. Le témoin étant un
 * fichier, redémarrer n'y change rien : seul un réarmement l'efface.
 *
 * Le serveur dit désormais la vérité, et donne de quoi agir. Ce module ne
 * décide QUE d'une chose : cet événement mérite-t-il un bouton, et lequel ?
 * Il ne touche ni au réseau ni à l'écran — c'est ce qui le rend testable sans
 * monter la coquille.
 */

/** Le motif stable que le serveur pose sur l'événement et dans le corps du 409. */
export const MOTIF_ASIO_BLOQUE = 'asio_scan_blocked_after_crash';

/**
 * 🔴 Le coupe-circuit posé par l'EXPLOITANT — `asio_scan_disabled_by_env` —
 * n'a délibérément aucun bouton : un geste d'interface ne doit pas contourner
 * une décision d'exploitation. Et sous ce coupe-circuit **aucune cause n'est
 * mesurée** : rien n'ayant été énuméré, supposer une cause par-dessus un refus
 * serait un second mensonge. La phrase du serveur suffit.
 */
export interface DonneesEchecLecture {
  reason?: unknown;
  can_rearm?: unknown;
  rearm_endpoint?: unknown;
}

export interface OffreDeRearmement {
  /** La route que LE SERVEUR annonce — jamais une constante du client. */
  route: string;
}

/**
 * Cet échec de lecture offre-t-il un réarmement ?
 *
 * ⚠️ On teste `reason`, **pas** `code` : `code` porte l'identifiant de FAMILLE
 * (`zone_output_unavailable`), partagé avec le refus ordinaire ; le motif
 * précis vit dans `reason`, et c'est le même nom de champ dans l'événement et
 * dans le corps du 409.
 *
 * ⚠️ On teste la **présence** des trois champs, pas leur valeur : un refus
 * ordinaire ne les porte pas du tout.
 *
 * 🔴 La route vient du serveur. Notre propre triage l'avait écrite FAUSSE — il
 * y manquait le segment `audio` — et une URL en dur se serait trompée en
 * silence chez l'utilisateur.
 */
export function offreDeRearmement(
  donnees: DonneesEchecLecture | null | undefined,
): OffreDeRearmement | null {
  if (!donnees) return null;
  if (donnees.reason !== MOTIF_ASIO_BLOQUE) return null;
  if (donnees.can_rearm !== true) return null;
  const route = donnees.rearm_endpoint;
  if (typeof route !== 'string' || route.trim() === '') return null;
  return { route: route.trim() };
}

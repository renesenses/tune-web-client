/**
 * Source Radio France de l'écran Podcasts — `renesenses/tune-server-rust#1026`.
 *
 * Le client ne savait pas si une clé d'API Radio France était configurée. Pour
 * l'apprendre, il APPELAIT `/api/v1/podcasts/radiofrance/shows` et lisait le
 * refus du serveur — `400 {"code":"bad_request","error":"radiofrance_api_key
 * not configured"}` — comme la réponse « non ». Une erreur serveur à chaque
 * ouverture de l'écran, sur toute machine sans clé, c'est-à-dire presque
 * toutes : aucun client n'offre de champ pour la saisir.
 *
 * Le serveur porte désormais `radiofrance_api_key_set` dans
 * `/api/v1/system/config`, sur le modèle de `discogs_token_set`. La question se
 * pose, elle ne se déduit plus d'un échec.
 *
 * Un serveur ANTÉRIEUR au drapeau ne renvoie pas le champ. Dans ce cas
 * seulement, on retombe sur l'ancienne détection par l'échec : mieux vaut un
 * 400 qu'une section Radio France définitivement muette chez qui a posé une
 * clé.
 */

export type EtatSourceRadioFrance = {
  /**
   * Le serveur déclare-t-il une clé posée ? Commande l'affichage de la section
   * GraphQL (onglets de stations + recherche d'émissions).
   */
  cleDeclaree: boolean;
  /**
   * Faut-il appeler `/podcasts/radiofrance/shows` ? Faux quand le serveur a
   * déjà dit que la clé manque — c'est tout l'objet du correctif.
   */
  interrogerLesEmissions: boolean;
};

/** Ce que l'écran fait quand `/system/config` n'a rien pu dire. */
export const REPLI_SERVEUR_MUET: EtatSourceRadioFrance = {
  cleDeclaree: false,
  interrogerLesEmissions: true,
};

/**
 * Décide, à partir de la configuration serveur, si la section Radio France
 * s'affiche et si les émissions doivent être demandées.
 */
export function etatSourceRadioFrance(config: unknown): EtatSourceRadioFrance {
  const declare =
    config && typeof config === 'object'
      ? (config as Record<string, unknown>).radiofrance_api_key_set
      : undefined;

  if (declare === true) {
    return { cleDeclaree: true, interrogerLesEmissions: true };
  }
  if (declare === false) {
    // Le serveur a répondu « pas de clé ». Le sonder ne peut produire qu'un 400.
    return { cleDeclaree: false, interrogerLesEmissions: false };
  }
  // Champ absent : serveur antérieur au drapeau, ou configuration illisible.
  return REPLI_SERVEUR_MUET;
}

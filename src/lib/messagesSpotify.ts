/**
 * Les refus de connexion Spotify, dits en phrases qui disent QUOI FAIRE —
 * renesenses/tune-server-rust#8198, volet 1 (contrat, section A).
 *
 * Le serveur rend, sur `POST /streaming/spotify/auth`, `…/connect` et
 * `…/retour`, un `400` de la forme
 * `{"code": "<code>", "service": "spotify", "error": "<texte>"}`. Le texte
 * est en français sans accents, quelle que soit la langue de l'interface :
 * on ne le montre plus, on montre la phrase traduite du CODE.
 *
 * Les trois premiers codes viennent de tune-server-rust#8155 : jusqu'ici ils
 * n'étaient traduits nulle part (étude, § 1.2).
 */

/** Code serveur → clé de traduction. */
export const CLES_CODES_SPOTIFY: Readonly<Record<string, string>> = {
  spotify_callback_sans_code: 'v2.spotify.err.callbackSansCode',
  spotify_autorisation_refusee: 'v2.spotify.err.autorisationRefusee',
  spotify_state_inconnu: 'v2.spotify.err.stateInconnu',
  spotify_client_id_absent: 'v2.spotify.err.clientIdAbsent',
  spotify_code_invalide: 'v2.spotify.err.codeInvalide',
  spotify_redirect_uri_differente: 'v2.spotify.err.redirectUriDifferente',
  spotify_client_id_refuse: 'v2.spotify.err.clientIdRefuse',
  spotify_compte_non_autorise: 'v2.spotify.err.compteNonAutorise',
};

/** La clé qui explique ce code Spotify, ou `null` s'il n'en est pas un. */
export function cleCodeSpotify(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(CLES_CODES_SPOTIFY, code) ? CLES_CODES_SPOTIFY[code] : null;
}

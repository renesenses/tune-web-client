/**
 * La saisie du Client ID Spotify, vérifiée AVANT tout envoi —
 * renesenses/tune-server-rust#8198, volet 1.
 *
 * Vu en direct le 09/11/2026 : Spotify répondait « INVALID_CLIENT: Invalid
 * client » après un collage erroné. Un Client ID, c'est exactement 32
 * caractères hexadécimaux, copiés dans Settings › Basic Information de
 * l'application Spotify.
 *
 * ⚠️ L'identifiant de l'adresse `developer.spotify.com/dashboard/<id>` N'EST
 * PAS le Client ID (vérifié avec Alex le 09/11) : on n'en extrait RIEN, on
 * refuse l'adresse comme le reste.
 *
 * - 32 hex (espaces autour tolérés) : accepté ;
 * - adresse du tableau de bord : refusée, motif nommé ;
 * - tout le reste : refusé, sans rien envoyer.
 */

export type AnalyseClientId =
  | { etat: 'vide' }
  | { etat: 'ok'; clientId: string }
  | { etat: 'adresse_tableau_de_bord' }
  | { etat: 'invalide' };

const HEX32 = /^[0-9a-fA-F]{32}$/;
const TABLEAU_DE_BORD = /^(?:https?:\/\/)?developer\.spotify\.com\/dashboard(?:[/?#].*)?$/i;

export function analyserClientIdSpotify(brut: string | null | undefined): AnalyseClientId {
  const s = (brut ?? '').trim();
  if (!s) return { etat: 'vide' };
  if (HEX32.test(s)) return { etat: 'ok', clientId: s };
  if (TABLEAU_DE_BORD.test(s)) return { etat: 'adresse_tableau_de_bord' };
  return { etat: 'invalide' };
}

/** Les codes du serveur quand il refuse lui-même la forme (même règle, côté serveur). */
export const CODES_CLIENT_ID_INVALIDE: readonly string[] = [
  'spotify_client_id_invalide',
  'spotify_client_id_adresse_du_tableau_de_bord',
];

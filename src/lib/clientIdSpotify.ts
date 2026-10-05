/**
 * Le Client ID Spotify saisi sur la carte Streaming (forum, fil 221).
 *
 * Chacun crée SA propre application Spotify (developer.spotify.com) et doit en
 * donner le Client ID à Tune. Jusqu'ici aucun écran ne le permettait : il ne
 * se posait que côté serveur, au démarrage (`TUNE_SPOTIFY_CLIENT_ID` ou
 * `tune.toml`). Sans lui, le serveur tourne avec `"placeholder"` et Spotify
 * répond `invalid_client` à tout ; un testeur a fini par coller son Client ID
 * dans le seul champ offert, celui de l'adresse de retour.
 *
 * Le champ passe par la route d'Accès et jetons
 * (`POST /services/tokens/spotify` `{ client_id }`), que le serveur applique à
 * chaud. Il n'est offert que si le serveur publie
 * `spotify_client_id_configure: false` dans `GET /system/env` : sur un serveur
 * plus ancien (champ absent), la carte reste telle qu'elle était.
 */
import type { ServiceTokenSaveResult } from './api/metadata';

export type EtatClientId = 'enregistre' | 'refuse' | 'impose';

export interface RetourClientId {
  etat: EtatClientId;
  /** Le message du serveur, tel quel. */
  message: string;
}

/** Le serveur dit-il qu'il n'a AUCUN Client ID Spotify ? */
export function clientIdSpotifyManquant(
  env: { spotify_client_id_configure?: unknown } | null | undefined,
): boolean {
  return env?.spotify_client_id_configure === false;
}

/** La réponse de `POST /services/tokens/spotify`, lue en trois états. */
export function lireRetourClientId(
  r: (ServiceTokenSaveResult & { etat?: unknown }) | null | undefined,
): RetourClientId {
  const message = (r?.validation_message ?? r?.message ?? r?.error ?? '').toString();
  const etat: EtatClientId =
    r?.etat === 'enregistre' || r?.etat === 'refuse' || r?.etat === 'impose'
      ? r.etat
      : r?.valid === true
        ? 'enregistre'
        : 'refuse';
  return { etat, message };
}

/** La clé i18n de la ligne qui accompagne le message du serveur. */
export function cleDuRetourClientId(etat: EtatClientId): string {
  switch (etat) {
    case 'enregistre':
      return 'v2.set.spotifyClientIdSaved';
    case 'impose':
      return 'v2.set.spotifyClientIdEnv';
    default:
      return 'v2.set.spotifyClientIdRejected';
  }
}

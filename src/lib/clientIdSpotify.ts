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

/**
 * web#2304 (fils 2384 et 2385, rc7 Windows) — un Client ID erroné ne pouvait
 * être ni corrigé ni effacé : le champ de la carte Streaming n'apparaît que
 * si AUCUN Client ID n'est enregistré, et la ligne Spotify de Services &
 * Jetons arrive avec `fields: []`, donc sans aucun bouton.
 *
 * La ligne `spotify` de `GET /services/tokens` dit désormais D'OÙ vient le
 * Client ID (`spotify_client_id_source`, tune-server-rust#6777) :
 * - `db` : enregistré depuis l'écran → « Modifier » et « Effacer » ;
 * - `env` / `config` : imposé par le serveur → aucun geste, on le dit ;
 * - absent (serveur plus ancien) mais un Client ID configuré → « Modifier »
 *   seulement : l'ancienne route d'effacement emporterait toutes les clés
 *   `spotify_*` (Spotify Connect…), on ne la branche pas.
 */
export type GesteClientId = {
  /** Ce que dit la ligne : clé i18n de l'état. */
  cle: string;
  modifier: boolean;
  effacer: boolean;
};

export function gestesClientIdSpotify(
  ligne: { spotify_client_id_configure?: unknown; spotify_client_id_source?: unknown } | null | undefined,
): GesteClientId | null {
  if (!ligne || ligne.spotify_client_id_configure !== true) return null;
  const source = ligne.spotify_client_id_source;
  if (source === 'db') return { cle: 'v2.set.spotifyClientIdStored', modifier: true, effacer: true };
  if (source === 'env' || source === 'config') {
    return { cle: 'v2.set.spotifyClientIdImposed', modifier: false, effacer: false };
  }
  // Serveur sans `spotify_client_id_source` : on ne sait pas d'où il vient.
  return { cle: 'v2.set.spotifyClientIdConfigured', modifier: true, effacer: false };
}

/**
 * Efface le SEUL Client ID (`DELETE /services/tokens/spotify/client-id`),
 * puis rend la nouvelle ligne. `effacer` est injecté pour les témoins.
 */
export async function effacerClientIdSpotify(
  effacer: () => Promise<{ spotify_client_id_configure?: unknown } | null | undefined>,
): Promise<{ ok: boolean; manque: boolean; erreur?: string }> {
  try {
    const r = await effacer();
    return { ok: true, manque: r?.spotify_client_id_configure !== true };
  } catch (e: any) {
    return { ok: false, manque: false, erreur: typeof e?.message === 'string' ? e.message : String(e) };
  }
}

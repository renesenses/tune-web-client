/**
 * Ranger une piste de SERVICE dans une playlist de CE service — #1268.
 *
 * Cyrille Moutia (fil 1850, 19/09/2026) : « Lorsque je fais ajouter à une
 * playlist dans Streaming Qobuz un titre, il ne m'est pas proposé mes
 * playlists existantes. » Depuis tune-server-rust#1848, l'entrée « Ajouter à
 * une playlist » est ABSENTE pour une piste de service — une playlist Tune ne
 * peut pas la porter (`playlist_tracks.track_id` référence `tracks(id)`). Un
 * titre Qobuz n'allait donc dans AUCUNE playlist.
 *
 * Le serveur sait pourtant écrire chez le service :
 * `POST /streaming/{service}/playlists/{id}/tracks` (`{ track_ids: [..] }` →
 * `{ added }`), et lister les playlists du compte :
 * `GET /streaming/{service}/playlists`. `add_tracks_to_playlist` est
 * implémenté pour Qobuz, Tidal, Deezer et Spotify ; les autres services
 * répondent « Unsupported » (trait par défaut) — on ne leur propose rien.
 *
 * Une piste de service va donc dans les playlists de SON service, jamais dans
 * celles de Tune, ni dans celles d'un autre service.
 */
import type { Track } from './types';
import { estPisteLocale } from './pisteFile';

/** Les services dont le serveur implémente `add_tracks_to_playlist`. */
export const SERVICES_PLAYLIST_ECRITURE = ['qobuz', 'tidal', 'deezer', 'spotify'] as const;

/**
 * Le service dont la piste peut rejoindre une playlist, ou `null` : piste
 * locale (elle va dans les playlists Tune), service sans écriture, ou piste
 * sans identifiant chez son service.
 */
export function serviceDePlaylist(t: Pick<Track, 'id' | 'source' | 'source_id'>): string | null {
  if (estPisteLocale(t)) return null;
  const s = String(t.source ?? '').toLowerCase();
  if (!(SERVICES_PLAYLIST_ECRITURE as readonly string[]).includes(s)) return null;
  if (t.source_id == null || String(t.source_id).trim() === '') return null;
  return s;
}

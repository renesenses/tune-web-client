/**
 * Verser des pistes dans une playlist TUNE — le corps de
 * `POST /playlists/{id}/tracks`, et la création d'une playlist pleine.
 *
 * `corpsAjoutPlaylist` et `versStreaming` viennent de `AddToPlaylistModal`
 * (#4889), sortis tels quels pour que la fenêtre partagée et « Créer une
 * playlist » de l'écran d'une étiquette (web#3267, fil 2912) parlent de la
 * même forme.
 *
 * 🔴 L'ORDRE. Le serveur range `track_ids` PUIS `streaming_tracks` : un lot
 * mêlé (bibliothèque, Qobuz, bibliothèque) envoyé d'un bloc perdrait son
 * ordre. `creerPlaylistAvecPistes` envoie donc les TRONÇONS contigus de même
 * famille, l'un après l'autre, chacun à la fin de la playlist.
 */
import * as api from './api';
import type { Playlist, StreamingTrackInfo, Track } from './types';
import { estPisteLocale, rangeableEnPlaylist } from './pisteFile';

export function versStreaming(track: Track): StreamingTrackInfo {
  return {
    source: track.source!,
    source_id: track.source_id!,
    title: track.title,
    artist_name: track.artist_name,
    album_title: track.album_title,
    duration_ms: track.duration_ms,
    format: track.format,
    sample_rate: track.sample_rate,
    bit_depth: track.bit_depth,
    channels: track.channels,
    cover_path: track.cover_path,
    // #4889 — l'album CHEZ LE SERVICE, pour rouvrir l'album depuis la
    // playlist. Une piste de service porte son id d'album dans `album_id`
    // (chaîne à l'exécution) ou dans `album_id_service` (Historique).
    album_id: track.album_id_service ?? (track.album_id != null ? String(track.album_id) : null),
  };
}

/**
 * 🔴 La BIBLIOTHÈQUE se reconnaît par `estPisteLocale`, jamais par
 * `source === 'local'` : une piste UPnP intégrée (#4201) porte
 * `source: 'upnp'` et un `id` de bibliothèque bien réel.
 */
export function corpsAjoutPlaylist(lot: readonly Track[]): {
  trackIds: number[];
  streamingTracks: StreamingTrackInfo[] | undefined;
} {
  const locales = lot.filter(estPisteLocale);
  const distantes = lot.filter((x) => !estPisteLocale(x));
  return {
    trackIds: locales.map((x) => x.id!),
    streamingTracks: distantes.length ? distantes.map(versStreaming) : undefined,
  };
}

/** Les suites contiguës de pistes de même famille (bibliothèque / service), dans l'ordre. */
export function tronconsParFamille(lot: readonly Track[]): Track[][] {
  const troncons: Track[][] = [];
  let famille: boolean | null = null;
  for (const t of lot) {
    const locale = estPisteLocale(t);
    if (locale !== famille) { troncons.push([]); famille = locale; }
    troncons[troncons.length - 1].push(t);
  }
  return troncons;
}

export interface PlaylistCreee {
  id: number;
  nom: string;
  /** Titres que le serveur a ENREGISTRÉS (son `track_count`), pas ceux envoyés. */
  ajoutees: number;
}

type Deps = Pick<typeof api, 'createPlaylist' | 'addPlaylistTracks' | 'deletePlaylist'>;

/**
 * Crée une playlist Tune `nom` et y verse `pistes`, dans l'ordre.
 *
 * Un tronçon refusé (422 : titres de service incomplets) ne coûte que ses
 * propres titres. Si AUCUN titre n'entre, la playlist vide est retirée et
 * l'erreur remonte : on ne laisse pas une playlist vide derrière un échec.
 */
export async function creerPlaylistAvecPistes(
  nom: string,
  pistes: readonly Track[],
  deps: Deps = api,
): Promise<PlaylistCreee> {
  const rangeables = pistes.filter(rangeableEnPlaylist);
  const pl = await deps.createPlaylist(nom);
  const id = Number(pl.id);
  let ajoutees = 0;
  let derniere: unknown = null;
  for (const lot of tronconsParFamille(rangeables)) {
    const { trackIds, streamingTracks } = corpsAjoutPlaylist(lot);
    try {
      const r: Playlist = await deps.addPlaylistTracks(id, trackIds, undefined, streamingTracks);
      if (typeof r?.track_count === 'number') ajoutees = Math.max(ajoutees, r.track_count);
    } catch (e) {
      derniere = e;
    }
  }
  if (ajoutees === 0) {
    try { await deps.deletePlaylist(id); } catch { /* déjà dit par l'erreur ci-dessous */ }
    throw derniere ?? new Error('playlist_empty');
  }
  return { id, nom, ajoutees };
}

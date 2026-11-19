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

/** Au-delà, un tronçon est coupé : requêtes bornées, et un avancement « k / n » qui bouge. */
export const TAILLE_ENVOI = 200;

/** Les envois à faire, dans l'ordre : tronçons de famille, coupés à `TAILLE_ENVOI`. */
export function envoisOrdonnes(lot: readonly Track[], taille = TAILLE_ENVOI): Track[][] {
  return tronconsParFamille(lot).flatMap((t) => {
    const morceaux: Track[][] = [];
    for (let i = 0; i < t.length; i += taille) morceaux.push(t.slice(i, i + taille));
    return morceaux;
  });
}

/** `(envoyes, total)` après chaque envoi — titres envoyés, pas enregistrés. */
export type Avancement = (envoyes: number, total: number) => void;

type DepsVerser = Pick<typeof api, 'addPlaylistTracks'>;

export interface Versement {
  /** `track_count` de la playlist après le dernier envoi accepté (null : aucun). */
  trackCount: number | null;
  /** Envois acceptés / refusés. */
  reussis: number;
  /** Titres portés par les envois ACCEPTÉS (à comparer à `lot.length`). */
  titresAcceptes: number;
  echecs: number;
  /** La dernière erreur, pour la dire quand rien n'est passé. */
  derniere: unknown;
}

/**
 * Verse `lot` dans la playlist Tune `id`, À LA FIN, dans l'ordre (voir en
 * tête). Un envoi refusé (422, réseau) ne coûte que ses titres ; il est
 * COMPTÉ, jamais tu.
 */
export async function verserDansPlaylist(
  id: number,
  lot: readonly Track[],
  deps: DepsVerser = api,
  avancement?: Avancement,
): Promise<Versement> {
  const v: Versement = { trackCount: null, reussis: 0, titresAcceptes: 0, echecs: 0, derniere: null };
  let envoyes = 0;
  const morceaux = envoisOrdonnes(lot);
  for (const morceau of morceaux) {
    const { trackIds, streamingTracks } = corpsAjoutPlaylist(morceau);
    try {
      const r: Playlist = await deps.addPlaylistTracks(id, trackIds, undefined, streamingTracks);
      v.reussis++;
      v.titresAcceptes += morceau.length;
      if (typeof r?.track_count === 'number') v.trackCount = r.track_count;
    } catch (e) {
      v.echecs++;
      v.derniere = e;
    }
    envoyes += morceau.length;
    // Un seul envoi : rien à suivre, « n / n » ne dirait rien.
    if (morceaux.length > 1) avancement?.(envoyes, lot.length);
  }
  return v;
}

/** Aucun titre de la liste ne peut entrer dans une playlist Tune : rien n'est créé. */
export class AucunTitreRangeable extends Error {
  constructor() { super('no track can go into a playlist'); this.name = 'AucunTitreRangeable'; }
}

export interface PlaylistCreee {
  id: number;
  nom: string;
  /** Titres que le serveur a ENREGISTRÉS (son `track_count`), pas ceux envoyés. */
  ajoutees: number;
  /** Titres demandés (la liste reçue, rangeables ou non). */
  demandees: number;
}

type Deps = Pick<typeof api, 'createPlaylist' | 'addPlaylistTracks' | 'deletePlaylist'>;

/**
 * Crée une playlist Tune `nom` et y verse `pistes`, dans l'ordre.
 *
 * - Aucun titre rangeable : `AucunTitreRangeable`, AVANT toute création.
 * - Playlist créée sans `id` : erreur explicite (comme SearchV2).
 * - Rien d'enregistré : la playlist vide est retirée et l'erreur remonte.
 * - `ajoutees < demandees` : à l'appelant de dire « N sur M ».
 */
export async function creerPlaylistAvecPistes(
  nom: string,
  pistes: readonly Track[],
  deps: Deps = api,
  avancement?: Avancement,
): Promise<PlaylistCreee> {
  const rangeables = pistes.filter(rangeableEnPlaylist);
  if (!rangeables.length) throw new AucunTitreRangeable();
  const pl = await deps.createPlaylist(nom);
  if (pl?.id == null) throw new Error('created playlist has no id');
  const id = Number(pl.id);
  const v = await verserDansPlaylist(id, rangeables, deps, avancement);
  const ajoutees = v.trackCount ?? 0;
  if (ajoutees === 0) {
    try { await deps.deletePlaylist(id); } catch { /* déjà dit par l'erreur ci-dessous */ }
    throw v.derniere ?? new Error('playlist_empty');
  }
  return { id, nom, ajoutees, demandees: pistes.length };
}

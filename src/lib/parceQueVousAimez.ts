/**
 * « Parce que vous aimez <artiste> » — renesenses/tune-web-client#3118
 * (demande de FabienM, fil 2864 ; go de Bertrand le 16/11/2026, rc13).
 *
 * Le serveur compose (`GET /home/because-you-like`, tune-server-rust) :
 * jusqu'à cinq playlists de cinquante titres, une par artiste parmi les plus
 * écoutés du profil — bibliothèque d'abord, services connectés en complément.
 * La composition est STABLE sur la journée : un rafraîchissement de l'accueil
 * ne rebat pas les cartes.
 *
 * Ce module ne fait que trois choses : traduire les titres du serveur en
 * `Track` (pour `lectureEnMasse`), lancer la lecture, et enregistrer la
 * playlist générée comme une playlist Tune.
 */
import * as api from './api';
import { lireListe } from './lectureEnMasse';
import type { StreamingTrackInfo, Track } from './types';

/** Un titre tel que le serveur le rend : local, ou d'un service. */
export interface TitreGenere {
  source: string;
  track_id?: number | null;
  source_id?: string | null;
  title: string;
  artist_name?: string | null;
  album_title?: string | null;
  album_id?: number | null;
  duration_ms?: number | null;
  cover_path?: string | null;
}

/** Une playlist générée. */
export interface PlaylistGeneree {
  /** Stable pour un artiste : `pvaa-<hachage>`. */
  id: string;
  /** L'artiste « que vous aimez ». */
  artist: string;
  plays?: number;
  track_count: number;
  duration_ms?: number;
  /** Les premiers artistes proches présents dans la liste (5 au plus). */
  similar_artists: string[];
  /** Jusqu'à quatre pochettes distinctes, pour la mosaïque. */
  covers: string[];
  /** `local`, puis les services qui ont complété. */
  sources: string[];
  tracks: TitreGenere[];
}

export interface ReponseParceQueVousAimez {
  date?: string;
  playlists: PlaylistGeneree[];
}

/** Ce que rend la route, ou une liste vide quand la forme est inattendue
 *  (serveur antérieur : 404, attrapé par l'appelant). */
export async function chargerPlaylistsGenerees(limite?: number): Promise<PlaylistGeneree[]> {
  const r = await api.getBecauseYouLike(limite);
  const liste = Array.isArray(r?.playlists) ? r.playlists : [];
  return liste.filter((p) => p && typeof p.artist === 'string' && Array.isArray(p.tracks) && p.tracks.length > 0);
}

/** Un titre local porte `track_id` ; un titre de service, la paire `source` + `source_id`. */
export function estLocal(t: TitreGenere): boolean {
  return (t.source ?? 'local') === 'local' && typeof t.track_id === 'number' && t.track_id > 0;
}

/** Les titres en `Track`, la forme que lisent la lecture en masse et la file. */
export function versPistes(p: PlaylistGeneree): Track[] {
  const pistes: Track[] = [];
  for (const t of p.tracks ?? []) {
    const commun = {
      title: t.title,
      artist_name: t.artist_name ?? null,
      album_title: t.album_title ?? null,
      duration_ms: t.duration_ms ?? 0,
      cover_path: t.cover_path ?? null,
    };
    if (estLocal(t)) {
      pistes.push({ ...commun, id: t.track_id!, source: 'local', album_id: t.album_id ?? null } as unknown as Track);
    } else if (t.source && t.source_id) {
      pistes.push({ ...commun, id: null, source: t.source, source_id: String(t.source_id) } as unknown as Track);
    }
  }
  return pistes;
}

/** « Lire » : la liste dans son ordre, sur la zone donnée. */
export function lirePlaylistGeneree(zoneId: number, p: PlaylistGeneree): Promise<number> {
  return lireListe(versPistes(p), {
    lire: (c) => api.play(zoneId, c as any),
    enfiler: (c) => api.addToQueue(zoneId, c),
  });
}

/**
 * Les titres par SEGMENTS de même nature, dans l'ordre : une requête qui mêle
 * `track_ids` et `streaming_tracks` range les locaux d'abord, et l'ordre
 * composé par le serveur serait perdu.
 */
export function segments(p: PlaylistGeneree): Array<{ ids: number[]; services: StreamingTrackInfo[] }> {
  const sortie: Array<{ ids: number[]; services: StreamingTrackInfo[] }> = [];
  let courant: { ids: number[]; services: StreamingTrackInfo[] } | null = null;
  let localCourant: boolean | null = null;
  for (const t of p.tracks ?? []) {
    const local = estLocal(t);
    if (!local && !(t.source && t.source_id)) continue;
    if (courant == null || local !== localCourant) {
      courant = { ids: [], services: [] };
      sortie.push(courant);
      localCourant = local;
    }
    if (local) courant.ids.push(t.track_id!);
    else
      courant.services.push({
        source: t.source as any,
        source_id: String(t.source_id),
        title: t.title,
        artist_name: t.artist_name ?? null,
        album_title: t.album_title ?? null,
        duration_ms: t.duration_ms ?? 0,
        cover_path: t.cover_path ?? null,
      });
  }
  return sortie;
}

/**
 * « Enregistrer comme playlist » : une playlist Tune neuve, nommée `nom`, qui
 * reçoit les titres dans l'ordre. Rend l'identifiant de la playlist créée.
 */
export async function enregistrerPlaylistGeneree(
  p: PlaylistGeneree,
  nom: string,
  description?: string,
): Promise<number> {
  const creee: any = await api.createPlaylist(nom, description);
  const id = Number(creee?.id);
  if (!Number.isFinite(id) || id <= 0) throw new Error('playlist_not_created');
  for (const s of segments(p)) {
    await api.addPlaylistTracks(id, s.ids, undefined, s.services.length ? s.services : undefined);
  }
  return id;
}

/** La ligne sous la vignette : « avec A, B, C », ou rien. */
export function texteVoisins(p: PlaylistGeneree, modele: string, max = 3): string | null {
  const noms = (p.similar_artists ?? []).filter((n) => typeof n === 'string' && n.trim()).slice(0, max);
  return noms.length ? modele.replace('{artistes}', noms.join(', ')) : null;
}

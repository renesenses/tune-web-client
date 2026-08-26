import type { HistoryEntry } from '../stores/history';
import type { Track } from '../types';

/**
 * Une tuile de la section « Récemment joué » de l'accueil.
 *
 * La section est, par construction, une liste d'ALBUMS : l'historique du
 * navigateur est dédoublonné par album avant affichage. `firstTrack` porte la
 * lecture la plus récente rattachée à cet album — c'est elle qui sert à
 * relancer la lecture et à retrouver l'album quand il n'a pas d'identifiant.
 */
export interface RecentAlbumEntry {
  id: number | null;
  title: string;
  artist_id?: number | null;
  artist_name: string;
  cover_path?: string | null;
  source?: string | null;
  source_id?: string | null;
  firstTrack: Track;
  /**
   * Titre de la piste réellement écoutée — la plus récente rattachée à cet
   * album (#2336). `null` quand il n'apprendrait rien : piste sans album
   * (radio, flux d'URL), ou piste qui porte le nom de son album.
   */
  playedTitle: string | null;
}

/** Plafond historique de la section — appliqué APRÈS dédoublonnage. */
export const RECENTLY_PLAYED_LIMIT = 20;

/**
 * Construit la clé de dédoublonnage d'une entrée d'historique.
 *
 * On préfère `album_id` pour le local, puis `source` + `album_title` pour le
 * streaming, et on retombe sur le chemin de fichier ou le titre pour tout ce
 * qui n'a ni l'un ni l'autre (radios, flux d'URL).
 */
function dedupKey(t: Track): string | null {
  if (t.album_id) return `local:${t.album_id}`;
  if (t.source && t.album_title) return `stream:${t.source}:${t.album_title}`;
  if (t.source && t.source_id) return `stream:${t.source}:${t.source_id}`;
  if (t.file_path) return `url:${t.file_path}`;
  if (t.title) return `title:${t.title}:${t.artist_name ?? ''}`;
  return null;
}

/**
 * Dérive les tuiles « Récemment joué » depuis l'historique de lecture du
 * navigateur, du plus récent au plus ancien.
 */
export function deriveRecentlyPlayed(
  history: HistoryEntry[],
  limit: number = RECENTLY_PLAYED_LIMIT,
): RecentAlbumEntry[] {
  const seen = new Set<string>();
  const albums: RecentAlbumEntry[] = [];
  for (const entry of history) {
    const t = entry.track;
    const key = dedupKey(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const title = t.album_title ?? t.title;
    albums.push({
      id: t.album_id ?? null,
      title,
      artist_id: t.artist_id ?? null,
      artist_name: t.artist_name ?? '',
      cover_path: t.cover_path ?? null,
      source: t.source ?? null,
      source_id: t.source_id ?? null,
      firstTrack: t,
      playedTitle: t.title && t.title !== title ? t.title : null,
    });
    if (albums.length >= limit) break;
  }
  return albums;
}

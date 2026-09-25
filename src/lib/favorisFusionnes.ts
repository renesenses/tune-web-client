/**
 * LES FAVORIS D'UN PROFIL, BIBLIOTHÈQUE ET SERVICES FUSIONNÉS — le SEUL
 * chargeur (#1509).
 *
 * Bertrand, 03/09/2026 : « Sidebar Favoris et ceux des services de
 * streaming ?? ». L'écran Favoris n'appelait que `getFavorites`, c'est-à-dire
 * les favoris de la BIBLIOTHÈQUE. Les cœurs posés sur une pochette Qobuz ou
 * Tidal partent, eux, dans `streaming_favorites` — une autre table, un autre
 * appel. Ils s'enregistraient donc bien et ne réapparaissaient nulle part :
 * mesure sur le .18 le 03/09/2026, deux favoris de service rangés (un Qobuz,
 * un Tidal) et zéro affiché.
 *
 * L'écran a été corrigé ce jour-là, dans son propre corps. Le widget
 * « Vos favoris » de l'Accueil, lui, avait gardé la lecture d'origine —
 * `getFavorites` seul, seau `albums` seul — et FabienM (fil 1896, 23/09/2026)
 * le voyait vide avec 2 albums, 113 pistes et 12 artistes sur l'écran Favoris.
 * Même défaut, une autre surface : la leçon de `favorisLocaux` et de
 * `streamingFavorites`, une fois de plus. On EXTRAIT donc le chargeur ici,
 * et les deux surfaces l'appellent.
 *
 * Pas de deuxième grille ni de quatrième onglet : un album aimé est un album
 * aimé. Un favori de service est converti dans la forme locale, `id` à `null`
 * et `source` / `source_id` renseignés — c'est ce couple que la lecture et la
 * fiche savent déjà suivre, et la pastille du service se dessine toute seule.
 */
import * as api from './api';
import type { Album, Artist, Track } from './types';

// Les DEUX dates sont REPORTÉES, et l'ordre compte : `first_seen_at` est
// celle que Tune pose lui-même à la première vue du favori, `created_at`
// celle du service — que le service REFAIT (#1060 : 21 favoris Qobuz,
// 21 dates distinctes sur 16 secondes, l'instant d'une recopie). `dateDe`
// préfère la première et retombe sur la seconde.
//
// ⚠️ Ces trois fonctions RECOPIENT champ par champ : tout champ oublié ici
// est silencieusement perdu avant d'atteindre le tri. C'est ainsi que la
// date d'ajout avait déjà disparu une fois (#2715).
export const versAlbum = (f: api.StreamingFavorite) =>
  ({
    id: null,
    title: f.title ?? '',
    artist_name: f.artist ?? '',
    cover_path: f.cover_url ?? null,
    source: f.service,
    source_id: f.service_id,
    created_at: f.created_at ?? null,
    first_seen_at: f.first_seen_at ?? null,
  }) as unknown as Album;
export const versPiste = (f: api.StreamingFavorite) =>
  ({
    id: null,
    title: f.title ?? '',
    artist_name: f.artist ?? '',
    album_title: f.album ?? '',
    cover_path: f.cover_url ?? null,
    source: f.service,
    source_id: f.service_id,
    duration_ms: 0,
    created_at: f.created_at ?? null,
    first_seen_at: f.first_seen_at ?? null,
  }) as unknown as Track;
export const versArtiste = (f: api.StreamingFavorite) =>
  ({
    id: null,
    name: f.title ?? f.artist ?? '',
    image_path: f.cover_url ?? null,
    source: f.service,
    source_id: f.service_id,
    created_at: f.created_at ?? null,
    first_seen_at: f.first_seen_at ?? null,
  }) as unknown as Artist;

export interface FavorisFusionnes {
  /** La réponse brute de la bibliothèque — l'écran y lit encore `playlists`
   *  et `smartPlaylistIds`. */
  locaux: Awaited<ReturnType<typeof api.getFavorites>>;
  /** Les favoris de service, bruts — l'écran y lit encore les playlists. */
  services: api.StreamingFavorite[];
  /** Bibliothèque PUIS services, dans la forme locale. */
  albums: Album[];
  tracks: Track[];
  artists: Artist[];
}

/**
 * Les deux sources en PARALLÈLE, et celle des services au mieux : un serveur
 * plus ancien ne sert pas la route, et cela ne doit pas vider les favoris de
 * la bibliothèque.
 */
export async function chargerFavorisFusionnes(pid: number): Promise<FavorisFusionnes> {
  const [f, s] = await Promise.all([
    api.getFavorites(pid),
    api.getProfileStreamingFavorites(pid).catch(() => [] as api.StreamingFavorite[]),
  ]);
  const services = Array.isArray(s) ? s : [];
  return {
    locaux: f,
    services,
    albums: [...(f?.albums ?? []), ...services.filter((x) => x.item_type === 'album').map(versAlbum)],
    tracks: [...(f?.tracks ?? []), ...services.filter((x) => x.item_type === 'track').map(versPiste)],
    artists: [...(f?.artists ?? []), ...services.filter((x) => x.item_type === 'artist').map(versArtiste)],
  };
}

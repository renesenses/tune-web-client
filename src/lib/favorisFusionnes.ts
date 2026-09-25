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
import { fusionnerPlaylistsFavorites, type PlaylistFavorite } from './streamingFavorites';
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

/**
 * LES QUATRE AUTRES SEAUX — playlists, playlists intelligentes, collections,
 * collections intelligentes (widgets de l'Accueil, 25/09/2026).
 *
 * Ils vivaient dans le corps de `FavoritesV2` (#3822, #4798, 05/09). Les
 * widgets « Playlists favorites », « Smart playlists favorites »,
 * « Collections favorites » et « Smart collections favorites » de l'Accueil
 * en ont besoin à leur tour : on les sort ICI, et l'écran comme les widgets
 * les appellent. La leçon de #1509 — un second chargeur diverge au premier
 * changement — vaut pour ces quatre-là comme pour les trois premiers.
 */

/**
 * Les playlists en favori, bibliothèque ET services, par le fusionneur de
 * #2370 (jamais un second). Les playlists INTELLIGENTES n'y sont pas : elles
 * ont leur propre espace d'identifiants (#4798).
 */
export function playlistsFavorites(fusion: FavorisFusionnes): PlaylistFavorite[] {
  return fusionnerPlaylistsFavorites(
    (fusion.locaux?.playlists ?? []) as any,
    fusion.services.filter((x) => x.item_type === 'playlist') as any,
  );
}

/**
 * Les playlists INTELLIGENTES en favori (#4798), marquées `smart`.
 *
 * Le serveur n'en rend que les IDENTIFIANTS ; on les apparie avec
 * `getSmartPlaylists()`, une seule requête, au mieux — un serveur qui ne les
 * sert pas ne doit rien vider. Jamais rapprochées d'une playlist ordinaire
 * par le numéro seul : l'id 1 existe dans les deux tables.
 */
export async function smartPlaylistsFavorites(fusion: FavorisFusionnes): Promise<any[]> {
  const f = fusion.locaux;
  const idsSmartPl = new Set(f?.smartPlaylistIds ?? []);
  if (!idsSmartPl.size) return [];
  const sps = await api.getSmartPlaylists().catch(() => [] as any[]);
  return (sps ?? []).filter((sp: any) => idsSmartPl.has(sp.id)).map((sp: any) => ({ ...sp, smart: true }));
}

/**
 * Les collections en favori, les deux familles À PART : leurs espaces
 * d'identifiants se recouvrent (l'id 1 est à la fois « favorites » et
 * « Audiophile »). Chacune au mieux : une famille qui manque ne vide pas
 * l'autre.
 */
export async function collectionsFavorites(
  fusion: FavorisFusionnes,
): Promise<{ collections: any[]; smartCollections: any[] }> {
  const f = fusion.locaux;
  const ids = new Set(f?.collectionIds ?? []);
  const idsSmart = new Set(f?.smartCollectionIds ?? []);
  if (!ids.size && !idsSmart.size) return { collections: [], smartCollections: [] };
  const [cs, ss2] = await Promise.all([
    ids.size ? api.getCollections().catch(() => [] as any[]) : Promise.resolve([] as any[]),
    idsSmart.size ? api.listSmartCollections().catch(() => [] as any[]) : Promise.resolve([] as any[]),
  ]);
  return {
    collections: (cs ?? []).filter((c: any) => ids.has(c.id)).map((c: any) => ({ ...c, smart: false })),
    smartCollections: (ss2 ?? []).filter((c: any) => idsSmart.has(c.id)).map((c: any) => ({ ...c, smart: true })),
  };
}

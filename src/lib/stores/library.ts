import { writable, derived } from 'svelte/store';
import type { Album, Artist, Track } from '../types';

/**
 * `recent` — l'onglet « Ajouts récents » (#3039). Sevy Tabroc le demandait au
 * même rang qu'Albums, comme chez Audirvana : « je souhaite voir les albums que
 * j'ai récemment ajoutés à ma bibliothèque locale ».
 */
export type LibraryTab = 'albums' | 'artists' | 'tracks' | 'genres' | 'years' | 'labels' | 'folders' | 'recent';

export const libraryTab = writable<LibraryTab>('albums');
export const libraryLoading = writable<boolean>(false);

// Albums
export const albums = writable<Album[]>([]);
export const selectedAlbum = writable<Album | null>(null);
export const albumTracks = writable<Track[]>([]);

// Artists
export const artists = writable<Artist[]>([]);
export const selectedArtist = writable<Artist | null>(null);
export const artistAlbums = writable<Album[]>([]);

// Tracks
export const tracks = writable<Track[]>([]);

// Cross-view filters (set from NowPlaying, consumed by LibraryView)
export const yearFilter = writable<number | null>(null);

/**
 * Portée de répertoire de la Bibliothèque — LA source de vérité, pour les deux
 * clients. `null` = toute la bibliothèque. Écrite par l'écran Répertoires
 * (« Voir en bibliothèque ») et par la croix de la pastille ; lue par la
 * pastille ET par les chargeurs, en dérivé, donc suivie tant que l'écran vit.
 *
 * Elle remplace `pendingLibraryFolder`, un dépôt consommé UNE fois dans
 * l'initialiseur d'un `$state` : posé alors que la Bibliothèque était déjà
 * montée, il n'était jamais lu, et les listes déjà pleines passaient pour
 * « chargées » — l'écran montrait la bibliothèque entière sous la pastille du
 * répertoire (renesenses/tune-server-rust#3101). Voir `lib/porteeBibliotheque`.
 */
export const libraryFolderScope = writable<string | null>(null);

// Reset library sub-navigation (artist detail, album detail) to root view.
// Call this whenever the user explicitly navigates to the Library from the sidebar/tabbar.
export function resetLibraryNavigation() {
  selectedArtist.set(null);
  selectedAlbum.set(null);
  // Un clic délibéré sur « Bibliothèque » demande TOUTE la bibliothèque : la
  // portée de répertoire tombe avec le reste de la sous-navigation.
  libraryFolderScope.set(null);
}

// Genres (derived from albums)
export const genres = derived(albums, ($albums) => {
  const genreMap = new Map<string, number>();
  $albums.forEach((a) => {
    if (a.genre) {
      genreMap.set(a.genre, (genreMap.get(a.genre) ?? 0) + 1);
    }
  });
  return [...genreMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
});

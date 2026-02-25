import { writable, derived } from 'svelte/store';
import type { Album, Artist, Track } from '../types';

export type LibraryTab = 'albums' | 'artists' | 'tracks' | 'genres';

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

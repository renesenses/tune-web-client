import { writable } from 'svelte/store';
import type { Album, Artist, Track } from '../types';

export type LibraryTab = 'albums' | 'artists' | 'tracks';

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

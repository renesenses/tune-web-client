import { writable } from 'svelte/store';
import type { Playlist, StreamingPlaylist } from '../types';

export const playlists = writable<Playlist[]>([]);
export const playlistsLoaded = writable<boolean>(false);

// Streaming playlists cache (persists across view changes)
export const streamingPlaylistsCache = writable<Record<string, StreamingPlaylist[]>>({});
export const streamingPlaylistsLoaded = writable<boolean>(false);

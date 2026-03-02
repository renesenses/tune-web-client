import { writable } from 'svelte/store';
import type { Playlist } from '../types';

export const playlists = writable<Playlist[]>([]);
export const playlistsLoaded = writable<boolean>(false);

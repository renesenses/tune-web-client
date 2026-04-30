import { writable } from 'svelte/store';

export type View = 'home' | 'nowplaying' | 'library' | 'queue' | 'playlists' | 'playlistmanager' | 'playlistshub' | 'smartplaylists' | 'browse' | 'search' | 'settings' | 'history' | 'streaming' | 'metadata' | 'radios' | 'radiofavorites' | 'genres' | 'mediaservers' | 'favorites' | 'podcasts' | 'zonemanager' | 'diagnostics' | 'dj' | 'party' | 'collections' | 'smartcollections' | 'dashboard' | 'services' | 'genretree';
export const activeView = writable<View>('home');
export const mobileNowPlayingOpen = writable(false);

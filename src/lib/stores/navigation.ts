import { writable } from 'svelte/store';

export type View = 'home' | 'nowplaying' | 'library' | 'queue' | 'playlists' | 'browse' | 'search' | 'settings' | 'history' | 'streaming' | 'metadata' | 'radios' | 'genres' | 'mediaservers';
export const activeView = writable<View>('home');
export const mobileNowPlayingOpen = writable(false);

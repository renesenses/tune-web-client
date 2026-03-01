import { writable } from 'svelte/store';

export type View = 'home' | 'nowplaying' | 'library' | 'queue' | 'playlists' | 'browse' | 'search' | 'settings' | 'history' | 'streaming' | 'metadata' | 'radios';
export const activeView = writable<View>('home');

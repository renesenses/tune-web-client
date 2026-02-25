import { writable } from 'svelte/store';

export type View = 'home' | 'nowplaying' | 'library' | 'queue' | 'playlists' | 'search' | 'settings' | 'history';
export const activeView = writable<View>('home');

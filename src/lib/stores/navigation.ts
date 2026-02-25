import { writable } from 'svelte/store';

export type View = 'home' | 'nowplaying' | 'library' | 'queue' | 'playlists' | 'search' | 'settings' | 'history' | 'streaming';
export const activeView = writable<View>('home');

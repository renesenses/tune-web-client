import { writable } from 'svelte/store';

export type View = 'nowplaying' | 'library' | 'queue' | 'playlists' | 'search' | 'settings' | 'history';
export const activeView = writable<View>('nowplaying');

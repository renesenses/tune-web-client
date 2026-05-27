import { writable, get } from 'svelte/store';

export type View = 'home' | 'nowplaying' | 'library' | 'queue' | 'playlists' | 'playlistmanager' | 'playlistshub' | 'smartplaylists' | 'smart-ai' | 'browse' | 'search' | 'settings' | 'history' | 'streaming' | 'metadata' | 'radios' | 'radiofavorites' | 'genres' | 'mediaservers' | 'favorites' | 'podcasts' | 'zonemanager' | 'diagnostics' | 'dj' | 'party' | 'collections' | 'smartcollections' | 'dashboard' | 'services' | 'genretree' | 'equalizer' | 'plugins' | 'admin';
export const activeView = writable<View>('home');
export const mobileNowPlayingOpen = writable(false);
export const pendingSearchQuery = writable<string>('');

export interface NavContext {
  view: View;
  albumId?: number | null;
  artistId?: number | null;
  tab?: string | null;
}

export function getNavContext(extra?: Partial<NavContext>): NavContext {
  return { view: get(activeView), ...extra };
}

import { writable, get } from 'svelte/store';

export type View = 'home' | 'nowplaying' | 'library' | 'queue' | 'playlists' | 'playlistmanager' | 'playlistshub' | 'smartplaylists' | 'smart-ai' | 'browse' | 'search' | 'settings' | 'history' | 'streaming' | 'metadata' | 'radios' | 'radiofavorites' | 'genres' | 'mediaservers' | 'favorites' | 'podcasts' | 'zonemanager' | 'diagnostics' | 'collections' | 'smartcollections' | 'dashboard' | 'services' | 'genretree' | 'equalizer' | 'plugins' | 'onboarding' | 'offline' | 'alarms' | 'login' | 'converter' | 'shortcuts' | 'oxygen';
export const activeView = writable<View>('home');
export const previousView = writable<View | null>(null);

// Track previous view on every navigation
let _lastView: View = 'home';
activeView.subscribe(v => {
  if (v !== _lastView) {
    previousView.set(_lastView);
    _lastView = v;
  }
});

// Bumped when a sidebar nav item is clicked, so a list/detail view (playlists,
// collections) can reset to its list when the user clicks its nav entry while
// already inside a detail. Views watch this and clear their local selection.
export const listResetNonce = writable(0);
export function requestListReset() {
  listResetNonce.update(n => n + 1);
}

// Optional tab to open when navigating to settings (consumed once by SettingsView)
export const settingsInitialTab = writable<string | null>(null);
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

const scrollPositions = new Map<string, number>();

export function saveScrollPosition(view: string, scrollTop: number) {
  scrollPositions.set(view, scrollTop);
}

export function getScrollPosition(view: string): number {
  return scrollPositions.get(view) ?? 0;
}

// Intra-view list<->detail scroll preservation. Views that swap a list for a
// detail inside their own scroll container (Collections, Playlists, the
// hierarchical Media Servers / Browse folders) save the container's scrollTop
// under a key on open, and restore it on Back. The restore polls a bounded
// number of frames until the re-rendered list is tall enough to hold the
// offset (a single set clamps to 0 before layout).
const detailScrolls = new Map<string, number>();
export function saveDetailScroll(key: string, el: HTMLElement | null | undefined) {
  if (el) detailScrolls.set(key, el.scrollTop);
}
export function restoreDetailScroll(key: string, el: HTMLElement | null | undefined) {
  const target = detailScrolls.get(key) ?? 0;
  if (!el) return;
  if (target <= 0) { el.scrollTop = 0; return; }
  let attempts = 0;
  const tick = () => {
    if (el.scrollHeight >= target + el.clientHeight || attempts >= 30) {
      el.scrollTop = target;
      return;
    }
    attempts += 1;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

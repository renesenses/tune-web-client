import { writable, get } from 'svelte/store';
import { activeView, type View } from './navigation';
import { libraryTab } from './library';
import { activeStreamingService, streamingGenreBreadcrumb, pendingStreamingAlbum, pendingStreamingArtist } from './streaming';
import * as api from '../api';

export interface Shortcut {
  id: string;
  name: string;
  icon: string;
  view: View;
  state: Record<string, any>;
  pinned?: boolean;
}

// A discrete sub-item a shortcut can point at (playlist, collection, smart
// playlist/collection, podcast, radio, genre…). Every detail-list view
// publishes its currently-open item here via `setShortcutTarget`, so
// `captureCurrentView` snapshots it generically and `navigateToShortcut`
// reopens it through a single `tune:shortcut-restore` event — instead of the
// old ad-hoc per-view getters that left most screens uncovered (a shortcut to
// a smart playlist/collection landed on the list, not the item).
//
// `key` is the STABLE identity of the target (e.g. `smartplaylists:12`), used
// both for de-duplication (no two shortcuts on the same target) and for the
// owning view to recognise its own item on restore. `restore` is an opaque
// payload the view uses to reopen (usually `{ id, name }`).
export interface ShortcutTarget {
  key: string;
  restore: any;
  label?: string;
}

export const currentShortcutTarget = writable<ShortcutTarget | null>(null);

/** A detail view calls this when it opens an item (so a shortcut points at it). */
export function setShortcutTarget(t: ShortcutTarget | null) {
  currentShortcutTarget.set(t);
}

/** A detail view calls this when it returns to its list (or unmounts). */
export function clearShortcutTarget() {
  currentShortcutTarget.set(null);
}

export const shortcuts = writable<Shortcut[]>([]);

let _loaded = false;

export async function loadShortcuts() {
  if (_loaded) return;
  try {
    const config = await api.getConfig();
    const raw = config?.shortcuts;
    if (typeof raw === 'string') {
      shortcuts.set(JSON.parse(raw));
    } else if (Array.isArray(raw)) {
      shortcuts.set(raw);
    }
    _loaded = true;
  } catch { /* ignore */ }
}

async function persist() {
  const items = get(shortcuts);
  const resp = await api.updateConfig({ shortcuts: JSON.stringify(items) });
  console.log('shortcuts_persisted', items.length, resp);
}

export function captureCurrentView(): Partial<Shortcut> {
  const view = get(activeView);
  const state: Record<string, any> = {};

  // --- View-level configuration (not a discrete item) ---
  if (view === 'library') {
    state.tab = get(libraryTab);
    const stored = localStorage.getItem('tune_album_sort');
    const storedOrder = localStorage.getItem('tune_album_sort_order');
    if (stored) state.albumSort = stored;
    if (storedOrder) state.albumSortOrder = storedOrder;
  }

  if (view === 'streaming') {
    state.streamingService = get(activeStreamingService);
    const breadcrumb = get(streamingGenreBreadcrumb);
    if (breadcrumb.length > 0) {
      state.genreBreadcrumb = breadcrumb;
    }
    // A shortcut from a specific Qobuz/Tidal album (or artist) should reopen
    // THAT item, not just the service's whole library (Elie). Streaming items
    // restore through the deep-link stores, so they keep their own mechanism.
    const item = (window as any).__tuneStreamingShortcut?.();
    if (item) state.streamingItem = item;
  }

  if (view === 'mediaservers') {
    const msState = (window as any).__tuneMediaServerState?.();
    if (msState) state.mediaServer = msState;
  }

  // A shortcut from a specific playlist should reopen THAT playlist (Elie).
  // (Playlists/Collections keep their existing getters + restore events so
  // they are untouched by the generic mechanism below.)
  if (view === 'playlists') {
    const pl = (window as any).__tunePlaylistShortcut?.();
    if (pl) state.playlist = pl;
  }

  if (view === 'collections') {
    const col = (window as any).__tuneCollectionShortcut?.();
    if (col) state.collection = col;
  }

  // A shortcut from a specific settings sub-page should reopen THAT tab
  // (e.g. "Réseau et audio"), not the default general tab (Elie).
  if (view === 'settings') {
    const tab = (window as any).__tuneSettingsShortcut?.();
    if (tab) state.settingsTab = tab;
  }

  // --- Generic discrete sub-item (smart playlists, smart collections,
  // smart collections, podcasts, radios, genres, favorites…) ---
  const target = get(currentShortcutTarget);
  if (target) {
    state.target = { key: target.key, restore: target.restore };
  }

  return { view, state };
}

function generateId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return 'sc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }
}

/**
 * Stable de-dup key for a shortcut. When the view points at a discrete target
 * we key on the target identity ALONE (so two shortcuts to the same smart
 * playlist collapse, but two different ones don't). Otherwise we key on the
 * full view + config (so e.g. two Library shortcuts with different sorts are
 * still allowed as distinct).
 */
function shortcutKey(view: string, state: Record<string, any>): string {
  const t = state?.target?.key;
  if (t) return `${view}::${t}`;
  // Legacy shapes (shortcuts saved before the generic target existed).
  if (state?.playlist?.playlistId != null) return `${view}::playlists:${state.playlist.playlistId}`;
  if (state?.collection?.collectionId != null) return `${view}::collections:${state.collection.collectionId}`;
  return `${view}:${JSON.stringify(state || {})}`;
}

export async function addShortcut(name: string, icon: string) {
  const captured = captureCurrentView();
  const key = shortcutKey(captured.view!, captured.state || {});
  // Don't create a second shortcut to the same target (Elie).
  const existing = get(shortcuts).find(s => shortcutKey(s.view, s.state || {}) === key);
  if (existing) return existing;
  const shortcut: Shortcut = {
    id: generateId(),
    name,
    icon: icon || '⭐',
    view: captured.view!,
    state: captured.state || {},
    pinned: true,
  };
  shortcuts.update(s => [...s, shortcut]);
  await persist();
  return shortcut;
}

export async function removeShortcut(id: string) {
  shortcuts.update(s => s.filter(sc => sc.id !== id));
  await persist();
}

export async function renameShortcut(id: string, name: string) {
  shortcuts.update(s => s.map(sc => sc.id === id ? { ...sc, name } : sc));
  await persist();
}

export async function reorderShortcuts(newOrder: Shortcut[]) {
  shortcuts.set(newOrder);
  await persist();
}

export async function togglePin(id: string) {
  shortcuts.update(s => s.map(sc => sc.id === id ? { ...sc, pinned: !sc.pinned } : sc));
  await persist();
}

/**
 * Normalise a shortcut's state into a generic target (covers both the new
 * `state.target` shape and legacy per-view shapes saved before the refactor).
 */
function targetFor(shortcut: Shortcut): ShortcutTarget | null {
  const s = shortcut.state || {};
  return s.target?.key ? (s.target as ShortcutTarget) : null;
}

export function navigateToShortcut(shortcut: Shortcut) {
  if (shortcut.state?.tab && shortcut.view === 'library') {
    libraryTab.set(shortcut.state.tab);
  }
  if (shortcut.state?.streamingService && shortcut.view === 'streaming') {
    activeStreamingService.set(shortcut.state.streamingService);
  }
  activeView.set(shortcut.view);

  if (shortcut.state?.genreBreadcrumb && shortcut.view === 'streaming') {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('tune:shortcut-restore-genre', {
        detail: shortcut.state,
      }));
    }, 100);
  }

  // Reopen a specific streaming album/artist via the existing deep-link stores;
  // StreamingView's pendingStreaming* effects pick it up once the service is set.
  if (shortcut.state?.streamingItem && shortcut.view === 'streaming') {
    const item = shortcut.state.streamingItem;
    setTimeout(() => {
      if (item.kind === 'album' && item.album) {
        pendingStreamingAlbum.set(item.album);
      } else if (item.kind === 'artist' && item.artist) {
        pendingStreamingArtist.set(item.artist);
      }
    }, 150);
  }

  if (shortcut.state?.mediaServer && shortcut.view === 'mediaservers') {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('tune:shortcut-restore-mediaserver', {
        detail: shortcut.state,
      }));
    }, 200);
  }

  if (shortcut.state?.settingsTab && shortcut.view === 'settings') {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('tune:shortcut-restore-settings', {
        detail: shortcut.state,
      }));
    }, 150);
  }

  if (shortcut.state?.playlist && shortcut.view === 'playlists') {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('tune:shortcut-restore-playlist', {
        detail: shortcut.state!.playlist,
      }));
    }, 150);
  }

  if (shortcut.state?.collection && shortcut.view === 'collections') {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('tune:shortcut-restore-collection', {
        detail: shortcut.state!.collection,
      }));
    }, 150);
  }

  // Generic discrete-item restore: one event, every detail-list view listens
  // for it and reopens the item when `detail.view` matches its own.
  const target = targetFor(shortcut);
  if (target) {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('tune:shortcut-restore', {
        detail: { view: shortcut.view, target },
      }));
    }, 150);
  }

  if (shortcut.state?.albumSort) {
    localStorage.setItem('tune_album_sort', shortcut.state.albumSort);
    localStorage.setItem('tune_album_sort_order', shortcut.state.albumSortOrder || 'asc');
    window.dispatchEvent(new CustomEvent('tune:shortcut-applied', { detail: shortcut.state }));
  }
}

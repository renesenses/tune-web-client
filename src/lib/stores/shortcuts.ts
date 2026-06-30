import { writable, get } from 'svelte/store';
import { activeView, type View } from './navigation';
import { libraryTab } from './library';
import { activeStreamingService, streamingGenreBreadcrumb } from './streaming';
import * as api from '../api';

export interface Shortcut {
  id: string;
  name: string;
  icon: string;
  view: View;
  state: Record<string, any>;
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
  try {
    await api.updateConfig({ shortcuts: JSON.stringify(items) });
  } catch (e) {
    console.error('shortcuts_persist_failed', e);
  }
}

export function captureCurrentView(): Partial<Shortcut> {
  const view = get(activeView);
  const state: Record<string, any> = {};

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
  }

  if (view === 'mediaservers') {
    const msState = (window as any).__tuneMediaServerState?.();
    if (msState) state.mediaServer = msState;
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

export async function addShortcut(name: string, icon: string) {
  const captured = captureCurrentView();
  const shortcut: Shortcut = {
    id: generateId(),
    name,
    icon: icon || '⭐',
    view: captured.view!,
    state: captured.state || {},
  };
  shortcuts.update(s => [...s, shortcut]);
  await persist();
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

  if (shortcut.state?.mediaServer && shortcut.view === 'mediaservers') {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('tune:shortcut-restore-mediaserver', {
        detail: shortcut.state,
      }));
    }, 200);
  }

  if (shortcut.state?.albumSort) {
    localStorage.setItem('tune_album_sort', shortcut.state.albumSort);
    localStorage.setItem('tune_album_sort_order', shortcut.state.albumSortOrder || 'asc');
    window.dispatchEvent(new CustomEvent('tune:shortcut-applied', { detail: shortcut.state }));
  }
}

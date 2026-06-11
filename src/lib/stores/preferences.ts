import { writable } from 'svelte/store';
import type { Locale } from '../i18n';

export type ThemeMode = 'dark' | 'light' | 'oled' | 'midnight';
export type VolumeDisplay = 'percent' | 'dB';
export type StartupView = 'home' | 'nowplaying' | 'library' | 'queue' | 'playlists' | 'search' | 'settings';

export interface Preferences {
  theme: ThemeMode;
  language: Locale;
  volumeDisplay: VolumeDisplay;
  startupView: StartupView;
  defaultZoneId: number | null;
  hiddenDeviceIds: string[];
}

const STORAGE_KEY = 'tune-preferences';

const defaults: Preferences = {
  theme: 'dark',
  language: 'fr',
  volumeDisplay: 'percent',
  startupView: 'home',
  defaultZoneId: null,
  hiddenDeviceIds: [],
};

function loadPrefs(): Preferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...defaults, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { ...defaults };
}

function createPreferences() {
  const { subscribe, set, update } = writable<Preferences>(loadPrefs());
  let initialized = false;
  subscribe((v) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    } catch { /* ignore */ }
    if (initialized) {
      fetch('/api/v1/system/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ui_preferences: JSON.stringify(v) }),
      }).catch(() => {});
    }
  });
  initialized = true;
  return { subscribe, set, update };
}

export const preferences = createPreferences();

// Apply theme immediately on module load (before App mounts) to prevent flash.
// The FOUC script in index.html handles the very first paint, but this ensures
// the theme is also applied as soon as JS modules are evaluated.
applyTheme(loadPrefs().theme);

export async function syncPreferencesFromServer() {
  try {
    const res = await fetch('/api/v1/system/config');
    if (!res.ok) return;
    const config = await res.json();
    if (config.ui_preferences) {
      const server: Partial<Preferences> = typeof config.ui_preferences === 'string'
        ? JSON.parse(config.ui_preferences)
        : config.ui_preferences;
      const hasLocal = !!localStorage.getItem(STORAGE_KEY);
      if (hasLocal) {
        preferences.update((local) => ({ ...defaults, ...server, ...local }));
      } else {
        preferences.update(() => ({ ...defaults, ...server }));
      }
    }
  } catch { /* ignore */ }
}

export function applyTheme(theme: ThemeMode) {
  if (theme === 'dark') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  // Also persist the theme value for external consumers
  try { localStorage.setItem('tune-theme', theme); } catch { /* ignore */ }
}

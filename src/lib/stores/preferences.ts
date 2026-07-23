import { writable } from 'svelte/store';
import type { Locale } from '../i18n';

export type ThemeMode = 'dark' | 'light' | 'oled' | 'midnight';
export type VolumeDisplay = 'percent' | 'dB';
export type StartupView = 'home' | 'nowplaying' | 'library' | 'queue' | 'playlists' | 'search' | 'settings';

/** Layout mode for the Oxygen library view. */
export type OxygenViewMode = 'album' | 'grid' | 'detail';

/** Facets available in the Oxygen browse rail (Phase 2+). Stored so users can
 *  pick which ones show. Kept here (ui_preferences) so config syncs per install. */
export const OXYGEN_FACETS_ALL = ['genre', 'label', 'mood', 'year', 'rating', 'collection', 'country', 'folder', 'untagged'] as const;

export interface Preferences {
  theme: ThemeMode;
  language: Locale;
  volumeDisplay: VolumeDisplay;
  startupView: StartupView;
  defaultZoneId: number | null;
  hiddenDeviceIds: string[];
  // --- Oxygen advanced library view (parameterizable) ---
  oxygenEnabled: boolean;
  oxygenView: OxygenViewMode;
  oxygenFacets: string[];
}

const STORAGE_KEY = 'tune-preferences';

const defaults: Preferences = {
  theme: 'dark',
  language: 'fr',
  volumeDisplay: 'percent',
  startupView: 'home',
  defaultZoneId: null,
  hiddenDeviceIds: [],
  oxygenEnabled: false,
  oxygenView: 'detail',
  oxygenFacets: ['genre', 'label', 'year', 'country', 'collection', 'folder'],
};

function loadPrefs(): Preferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...defaults, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { ...defaults };
}

const hadLocalPrefs = !!localStorage.getItem(STORAGE_KEY);

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
      if (hadLocalPrefs) {
        preferences.update((local) => ({ ...defaults, ...server, ...local }));
      } else {
        preferences.update(() => ({ ...defaults, ...server }));
      }
    }
  } catch { /* ignore */ }
  // Sync server-side default zone into local preferences
  try {
    const res = await fetch('/api/v1/system/settings/default-zone');
    if (res.ok) {
      const data = await res.json();
      if (data.zone_id != null) {
        preferences.update((p) => ({ ...p, defaultZoneId: data.zone_id }));
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

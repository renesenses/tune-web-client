import { writable } from 'svelte/store';

export type ThemeMode = 'dark' | 'light';
export type VolumeDisplay = 'percent' | 'dB';
export type StartupView = 'nowplaying' | 'library' | 'queue' | 'playlists' | 'search' | 'settings';

export interface Preferences {
  theme: ThemeMode;
  volumeDisplay: VolumeDisplay;
  startupView: StartupView;
  defaultZoneId: number | null;
}

const STORAGE_KEY = 'tune-preferences';

const defaults: Preferences = {
  theme: 'dark',
  volumeDisplay: 'percent',
  startupView: 'nowplaying',
  defaultZoneId: null,
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
  subscribe((v) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    } catch { /* ignore */ }
  });
  return { subscribe, set, update };
}

export const preferences = createPreferences();

export function applyTheme(theme: ThemeMode) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

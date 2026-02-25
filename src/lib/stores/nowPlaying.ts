import { writable, derived } from 'svelte/store';
import { currentZone } from './zones';
import type { Track, PlaybackState, RepeatMode } from '../types';

// Seek position in milliseconds
export const seekPositionMs = writable<number>(0);

// Shuffle & repeat as separate stores (set via API, updated via WS)
export const shuffleEnabled = writable<boolean>(false);
export const repeatMode = writable<RepeatMode>('off');

// Mute: stores the pre-mute volume (null = not muted)
export const mutedVolume = writable<number | null>(null);

// Derived from current zone
export const currentTrack = derived(currentZone, ($zone) => $zone?.current_track ?? null);
export const playbackState = derived(currentZone, ($zone): PlaybackState => ($zone?.state as PlaybackState) ?? 'stopped');
export const zoneVolume = derived(currentZone, ($zone) => $zone?.volume ?? 0.5);

// Seek interpolation timer (increments by 1000ms every second when playing)
let seekTimer: ReturnType<typeof setInterval> | null = null;

export function startSeekTimer() {
  stopSeekTimer();
  seekTimer = setInterval(() => {
    seekPositionMs.update((pos) => pos + 1000);
  }, 1000);
}

export function stopSeekTimer() {
  if (seekTimer) {
    clearInterval(seekTimer);
    seekTimer = null;
  }
}

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
export const zoneVolume = writable<number>(0.5);
currentZone.subscribe(($zone) => {
  if ($zone?.volume !== undefined) zoneVolume.set($zone.volume);
});

// Seek interpolation timer (smooth 200ms ticks for fluid progress bar)
let seekTimer: ReturnType<typeof setInterval> | null = null;
const TICK_MS = 200;

export function startSeekTimer() {
  if (seekTimer) return; // already running
  seekTimer = setInterval(() => {
    seekPositionMs.update((pos) => pos + TICK_MS);
  }, TICK_MS);
}

export function stopSeekTimer() {
  if (seekTimer) {
    clearInterval(seekTimer);
    seekTimer = null;
  }
}

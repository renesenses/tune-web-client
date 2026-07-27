import { writable, derived } from 'svelte/store';
import { currentZone, currentZoneId } from './zones';
import type { Track, PlaybackState } from '../types';

// Seek position in milliseconds
export const seekPositionMs = writable<number>(0);

// Shuffle as a separate store (set via API, updated via WS)
export const shuffleEnabled = writable<boolean>(false);

// repeatMode lives in a leaf module (repeatStore) to break the
// zones ↔ nowPlaying import cycle; re-export it so existing importers of
// `./nowPlaying` keep working.
export { repeatMode } from './repeatStore';

// Mute: stores the pre-mute volume (null = not muted)
export const mutedVolume = writable<number | null>(null);

// Derived from current zone
export const currentTrack = derived(currentZone, ($zone) => $zone?.current_track ?? null);

/** Id de bibliothèque de la piste en lecture, ou null (radio / piste streaming).
 *
 *  `current_track` n'a pas la même forme selon la route qui a rempli le store :
 *  `GET /zones` sérialise la structure interne du serveur, dont le champ est
 *  `track_id` (zones.rs), tandis que `/zones/{id}/state` construit son JSON à la
 *  main et le nomme `id` (playback.rs). Comparer `$currentTrack.id` échoue donc
 *  silencieusement sur la forme la plus courante — passer par ce store plutôt
 *  que de relire le champ à la main. */
export const currentTrackId = derived(currentTrack, ($track) => {
  const t = $track as (Track & { track_id?: number | null }) | null;
  return t?.track_id ?? t?.id ?? null;
});
export const playbackState = derived(currentZone, ($zone): PlaybackState => ($zone?.state as PlaybackState) ?? 'stopped');
const _zoneVol = writable<number>(0.5);
let _volLocalUntil = 0;
currentZoneId.subscribe(() => { _volLocalUntil = 0; });
currentZone.subscribe(($zone) => {
  if ($zone?.volume !== undefined && Date.now() > _volLocalUntil) {
    const v = $zone.volume > 1 ? $zone.volume / 100 : $zone.volume;
    _zoneVol.set(v);
  }
});
export const zoneVolume = {
  subscribe: _zoneVol.subscribe,
  set(v: number) { _volLocalUntil = Date.now() + 2000; _zoneVol.set(v); },
  update(fn: (v: number) => number) { _volLocalUntil = Date.now() + 2000; _zoneVol.update(fn); },
};

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

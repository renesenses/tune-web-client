import { writable, derived } from 'svelte/store';
import type { Track } from '../types';

export const queueTracks = writable<Track[]>([]);
export const queuePosition = writable<number>(0);
export const queueLength = writable<number>(0);

/** Next 5 tracks after the current position */
export const upNextTracks = derived(
  [queueTracks, queuePosition],
  ([$tracks, $pos]) => $tracks.slice($pos + 1, $pos + 6)
);

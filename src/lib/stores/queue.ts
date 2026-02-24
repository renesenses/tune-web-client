import { writable } from 'svelte/store';
import type { Track } from '../types';

export const queueTracks = writable<Track[]>([]);
export const queuePosition = writable<number>(0);
export const queueLength = writable<number>(0);

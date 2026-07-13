import { writable } from 'svelte/store';
import type { RepeatMode } from '../types';

// Repeat mode lives in its own leaf module (no imports from zones/nowPlaying)
// so both zones.ts (playAndSync) and nowPlaying.ts can import it statically.
//
// Previously repeatMode was defined in nowPlaying.ts, which statically imports
// currentZone from zones.ts; zones.ts in turn needed repeatMode, creating a
// zones ↔ nowPlaying cycle. The cycle made module-init order ambiguous, so a
// bundling that initialised nowPlaying first read currentZone before it existed
// → "Cannot access 'X' before initialization" (TDZ) → the whole SPA threw at
// load → black screen. Extracting repeatMode here breaks the cycle: nowPlaying
// → zones is now one-way, so the init order is deterministic.
export const repeatMode = writable<RepeatMode>('off');

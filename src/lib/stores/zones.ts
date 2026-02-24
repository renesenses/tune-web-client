import { writable, derived } from 'svelte/store';
import type { Zone } from '../types';

export const zones = writable<Zone[]>([]);
export const currentZoneId = writable<number | null>(null);

export const currentZone = derived(
  [zones, currentZoneId],
  ([$zones, $currentZoneId]) => {
    if ($currentZoneId !== null) {
      return $zones.find((z) => z.id === $currentZoneId) ?? $zones[0] ?? null;
    }
    return $zones[0] ?? null;
  }
);

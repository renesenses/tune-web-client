import { writable, derived } from 'svelte/store';
import type { Zone } from '../types';
import * as api from '../api';

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

export function syncZone(zone: Zone) {
  zones.update((zs) => zs.map((z) => z.id === zone.id ? zone : z));
}

export async function playAndSync(zoneId: number, body?: Parameters<typeof api.play>[1]): Promise<Zone> {
  const zone = await api.play(zoneId, body);
  syncZone(zone);
  return zone;
}

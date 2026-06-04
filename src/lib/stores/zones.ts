import { writable, derived, get } from 'svelte/store';
import type { Zone } from '../types';
import * as api from '../api';
import { notifications } from './notifications';
import { isBrowserZone, browserPlay, browserPause, browserResume, browserStop } from './browserAudio';

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

function checkPlayError(zone: Zone) {
  if (zone.error) {
    notifications.error(zone.error, 8000);
  }
}

/** After a play/next/previous, start browser audio if this is a browser zone */
function handleBrowserPlayback(zone: Zone) {
  if (isBrowserZone(zone) && zone.stream_url) {
    browserPlay(zone.stream_url);
  }
}

export async function playAndSync(zoneId: number, body?: Parameters<typeof api.play>[1]): Promise<Zone> {
  const zone = await api.play(zoneId, body);
  checkPlayError(zone);
  syncZone(zone);
  handleBrowserPlayback(zone);
  return zone;
}

export async function nextAndSync(zoneId: number): Promise<Zone> {
  const zone = await api.next(zoneId);
  checkPlayError(zone);
  syncZone(zone);
  handleBrowserPlayback(zone);
  return zone;
}

export async function previousAndSync(zoneId: number): Promise<Zone> {
  const zone = await api.previous(zoneId);
  checkPlayError(zone);
  syncZone(zone);
  handleBrowserPlayback(zone);
  return zone;
}

export async function resumeAndSync(zoneId: number): Promise<Zone> {
  const zone = await api.resume(zoneId);
  checkPlayError(zone);
  syncZone(zone);
  // For browser zones, resume local audio
  if (isBrowserZone(zone)) {
    browserResume();
  }
  return zone;
}

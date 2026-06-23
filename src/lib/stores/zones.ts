import { writable, derived, get } from 'svelte/store';
import type { Zone } from '../types';
import * as api from '../api';
import { notifications } from './notifications';
// Lazy import to avoid circular dependency (browserAudio imports zones)
function isBrowserZone(zone: { output_type?: string } | null | undefined): boolean {
  return zone?.output_type === 'browser';
}
async function getBrowserAudio() {
  return await import('./browserAudio');
}

export const zones = writable<Zone[]>([]);

function loadSavedZoneId(): number | null {
  try {
    const v = localStorage.getItem('tune_current_zone_id');
    return v ? parseInt(v, 10) : null;
  } catch { return null; }
}

export const currentZoneId = writable<number | null>(loadSavedZoneId());

currentZoneId.subscribe((id) => {
  try {
    if (id !== null) localStorage.setItem('tune_current_zone_id', String(id));
    else localStorage.removeItem('tune_current_zone_id');
  } catch {}
});

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
async function handleBrowserPlayback(zone: Zone) {
  if (isBrowserZone(zone) && zone.stream_url) {
    const { browserPlay } = await getBrowserAudio();
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
  await api.next(zoneId);
  const zone = await api.getZone(zoneId);
  checkPlayError(zone);
  syncZone(zone);
  handleBrowserPlayback(zone);
  return zone;
}

export async function previousAndSync(zoneId: number): Promise<Zone> {
  await api.previous(zoneId);
  const zone = await api.getZone(zoneId);
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
    const { browserResume } = await getBrowserAudio();
    browserResume();
  }
  return zone;
}

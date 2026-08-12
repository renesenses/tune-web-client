import { writable, derived, get } from 'svelte/store';
import type { Zone } from '../types';
import * as api from '../api';
import { notifications } from './notifications';
import { loopByDefault } from './loopByDefault';
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

// "Follow me" (opt-in): switching the active zone pauses the zone you leave,
// so nothing keeps playing behind you. When OFF, zones stay fully independent
// (multi-room). Elie.
function loadFollowMe(): boolean {
  try { return localStorage.getItem('tune_follow_me') === '1'; } catch { return false; }
}
export const followMe = writable<boolean>(loadFollowMe());
followMe.subscribe((v) => {
  try { localStorage.setItem('tune_follow_me', v ? '1' : '0'); } catch {}
});

/** Switch the active zone. With "follow me" enabled, pauses the zone being
 *  left if it is currently playing (nothing keeps playing behind you). */
export async function switchZone(id: number) {
  const prevId = get(currentZoneId);
  currentZoneId.set(id);
  if (get(followMe) && prevId !== null && prevId !== id) {
    const prev = get(zones).find((z) => z.id === prevId);
    if (prev && prev.state === 'playing') {
      try { await api.pause(prevId); } catch { /* ignore */ }
    }
  }
}

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

/**
 * Zones with a play just initiated: zoneId → epoch-ms until which a
 * `playback.error` should read as "still loading" rather than a real failure.
 * A slow HI-RES DASH pre-transcode (Tidal/Qobuz) holds the stream open for
 * several seconds before the first byte reaches the renderer; the server can
 * emit a transient error in that window even though playback then starts, which
 * showed a scary "Erreur" toast (#1146). During the grace window we show
 * "chargement…" instead; a failure that persists past it still surfaces.
 */
export const playPendingUntil = new Map<number, number>();
// Worst observed HI-RES DASH pre-transcode is ~23 s (#1146); 20 s left the
// tail end of a slow start outside the window and still toasting an error.
const PLAY_GRACE_MS = 30000;

function withinPlayGrace(zoneId: number): boolean {
  const until = playPendingUntil.get(zoneId);
  return until != null && Date.now() < until;
}

/**
 * Should this playback error be shown as "chargement…" instead of an error?
 *
 * True only for a *transient* failure inside the post-play grace window — the
 * slow HI-RES pre-transcode case the window was built for (#1146).
 *
 * A `fatal` error is never suppressed. An audio device that refuses to open
 * will not recover, and the server reports it within a second of the play
 * request, i.e. squarely inside the window: suppressing it would show a
 * spinner and then nothing at all, because the server emits that error once
 * and stops the zone right after.
 */
export function suppressedByPlayGrace(
  zoneId: number | null | undefined,
  fatal: boolean = false,
): boolean {
  if (fatal || zoneId == null) return false;
  return withinPlayGrace(zoneId);
}

async function loadingInstead(): Promise<void> {
  // Dynamic import: i18n pulls stores of its own; keep zones.ts cycle-free
  // (same pattern as the nowPlaying import in playAndSync below).
  const { t } = await import('../i18n');
  notifications.info(get(t)('common.loading'));
}

function checkPlayError(zone: Zone) {
  if (zone.error) {
    // Same grace treatment as the WS playback.error branch (#1146): a
    // zone.error read back right after a slow HI-RES play is usually the
    // pre-transcode still working, not a real failure.
    if (zone.id != null && withinPlayGrace(zone.id)) {
      loadingInstead();
      return;
    }
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
  // Open a grace window so a transient playback.error during a slow HI-RES
  // pre-transcode reads as "chargement…" rather than a failure (see above).
  playPendingUntil.set(zoneId, Date.now() + PLAY_GRACE_MS);
  let zone: Zone;
  try {
    zone = await api.play(zoneId, body);
  } catch (e) {
    // Overlapping tap while a slow HI-RES pre-transcode is in flight: the
    // server rejects the duplicate with "DASH file already being decoded"
    // while the first request keeps working and playback then starts. That
    // is "loading", not a failure (#1146).
    if (withinPlayGrace(zoneId) && String(e).includes('already being decoded')) {
      loadingInstead();
      return api.getZone(zoneId);
    }
    throw e;
  }
  checkPlayError(zone);
  syncZone(zone);
  handleBrowserPlayback(zone);
  // "Lire en boucle par défaut" (Elie): start playback in repeat-one so a
  // finished track restarts from the beginning. The player's repeat button
  // stays the manual override. repeatMode is imported dynamically because
  // nowPlaying.ts statically imports currentZone/currentZoneId from this file;
  // a static import here would recreate the zones ↔ nowPlaying cycle.
  if (get(loopByDefault)) {
    try {
      const { repeatMode } = await import('./nowPlaying');
      if (get(repeatMode) !== 'one') {
        const r = await api.setRepeat(zoneId, 'one');
        repeatMode.set(r.repeat);
      }
    } catch {
      /* non-fatal */
    }
  }
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
  // For browser zones, resume local audio.
  //
  // On passe `stream_url` : sans elle la reprise se faisait à l'aveugle sur un
  // élément dont la source avait pu mourir pendant la pause (le navigateur
  // lâche la connexion, et la session serveur est à consommateur unique).
  // `audio.play()` ne rendait alors ni son ni erreur — « No sound » d'Alex.
  // Le chemin événementiel (App.svelte, `playback.resumed`) re-pointait déjà
  // l'élément sur `stream_url` ; le bouton Lecture, lui, ne le faisait pas.
  if (isBrowserZone(zone)) {
    const { browserResume } = await getBrowserAudio();
    browserResume(zone.stream_url);
  }
  return zone;
}

// Browser audio playback store
// Manages an HTML5 <audio> element for zones with output_type === 'browser'.
// The server streams audio via its existing HTTP streamer; this store simply
// points the <audio> element at the stream URL and wires play/pause/seek/volume.

import { writable, get } from 'svelte/store';
import { currentZone, syncZone } from './zones';
import { seekPositionMs, startSeekTimer, stopSeekTimer } from './nowPlaying';
import * as api from '../api';

// The singleton <audio> element used for browser playback
let audioElement: HTMLAudioElement | null = null;

// Current stream URL loaded into the audio element
export const browserStreamUrl = writable<string | null>(null);

// Whether browser audio is actively playing
export const browserAudioPlaying = writable<boolean>(false);

// Browser audio volume (0..1)
export const browserAudioVolume = writable<number>(1.0);

/** Returns true if the given zone should use browser-local audio */
export function isBrowserZone(zone: { output_type?: string } | null | undefined): boolean {
  return zone?.output_type === 'browser';
}

/** Get or create the singleton audio element */
function getAudio(): HTMLAudioElement {
  if (!audioElement) {
    audioElement = new Audio();
    audioElement.crossOrigin = 'anonymous';
    audioElement.preload = 'none';

    audioElement.addEventListener('playing', () => {
      browserAudioPlaying.set(true);
      startSeekTimer();
    });

    audioElement.addEventListener('pause', () => {
      browserAudioPlaying.set(false);
      stopSeekTimer();
    });

    audioElement.addEventListener('ended', async () => {
      browserAudioPlaying.set(false);
      stopSeekTimer();
      // Auto-advance to next track.
      //
      // api.next() returns only { status, queue_position } — no zone, no
      // stream_url — so the previous `api.next().then(syncZone)` was a no-op
      // (syncZone matched on an undefined id) and the browser never started the
      // next track: playback stopped at every track boundary (Rhorn, web UI).
      // Re-fetch the zone to get the next track's stream_url and play it with
      // force:true, since the server serves the next track under the SAME
      // per-zone stream URL — without the forced reload the element replays the
      // just-ended buffer ("repeat instead of advance", Elie).
      const zone = get(currentZone);
      if (zone?.id != null) {
        try {
          await api.next(zone.id);
          const z = await api.getZone(zone.id);
          syncZone(z);
          if (isBrowserZone(z) && z.stream_url) {
            browserPlay(z.stream_url, true);
          }
        } catch {
          /* non-fatal */
        }
      }
    });

    audioElement.addEventListener('timeupdate', () => {
      if (audioElement) {
        seekPositionMs.set(Math.floor(audioElement.currentTime * 1000));
      }
    });

    audioElement.addEventListener('error', (e) => {
      console.error('Browser audio error:', audioElement?.error);
      browserAudioPlaying.set(false);
      stopSeekTimer();
    });
  }
  return audioElement;
}

/**
 * Load and play a stream URL in the browser.
 *
 * `force` reloads the element even when the URL string is unchanged. On a
 * track change the server may serve the next track under the SAME per-zone
 * stream URL; without a forced reload, `audio.play()` on the just-ended element
 * replayed the OLD buffered track — the album "repeated instead of advancing"
 * (Elie, browser output). Track-change callers pass `force: true`.
 */
export function browserPlay(streamUrl: string, force = false) {
  const audio = getAudio();
  const currentUrl = get(browserStreamUrl);
  // Use a relative URL so the browser connects to the same host
  // (the server returns an absolute URL with the advertised IP, which
  // may not be reachable from the browser if behind a proxy/NAT).
  let relativeUrl = streamUrl;
  try {
    const u = new URL(streamUrl);
    relativeUrl = u.pathname + u.search;
  } catch {
    // keep as-is if not a valid URL
  }
  if (force || currentUrl !== relativeUrl) {
    // Cache-bust when the URL is unchanged so the element fetches the new
    // track instead of replaying its buffered contents.
    audio.src =
      force && currentUrl === relativeUrl
        ? relativeUrl + (relativeUrl.includes('?') ? '&' : '?') + '_t=' + Date.now()
        : relativeUrl;
    audio.load();
    browserStreamUrl.set(relativeUrl);
  }
  audio.volume = get(browserAudioVolume);
  audio.play().catch((e) => {
    console.warn('Browser audio play failed (may need user gesture):', e);
  });
}

/** Pause browser audio */
export function browserPause() {
  const audio = getAudio();
  audio.pause();
}

/** Resume browser audio */
export function browserResume() {
  const audio = getAudio();
  if (audio.src) {
    audio.play().catch((e) => {
      console.warn('Browser audio resume failed:', e);
    });
  }
}

/** Stop browser audio and clear the source */
export function browserStop() {
  const audio = getAudio();
  audio.pause();
  audio.removeAttribute('src');
  audio.load(); // reset
  browserStreamUrl.set(null);
  browserAudioPlaying.set(false);
  stopSeekTimer();
}

/** Seek to a position in milliseconds */
export function browserSeek(positionMs: number) {
  const audio = getAudio();
  if (audio.duration && isFinite(audio.duration)) {
    audio.currentTime = positionMs / 1000;
    seekPositionMs.set(positionMs);
  }
}

/** Set browser audio volume (0..1) */
export function browserSetVolume(volume: number) {
  browserAudioVolume.set(volume);
  const audio = getAudio();
  audio.volume = Math.max(0, Math.min(1, volume));
}

/** Clean up the audio element (call on app destroy) */
export function browserAudioDestroy() {
  if (audioElement) {
    audioElement.pause();
    audioElement.removeAttribute('src');
    audioElement.load();
    audioElement = null;
  }
  browserStreamUrl.set(null);
  browserAudioPlaying.set(false);
}

/**
 * Transport actions shared by every surface that drives a zone.
 *
 * Play/pause is not a one-liner: it has to cope with a zone that is merely
 * paused, one that is stopped on a track it must restart (radio needs its
 * stream URL, streaming its service id, local its track id), and a YouTube
 * iframe that may be playing with or without a zone behind it. That logic
 * lived inside TransportBar, which was fine while the transport bar was the
 * only caller — the mini player is the second, and duplicating it would mean
 * two behaviours drifting apart on the cases testers actually hit.
 *
 * Moved verbatim, stores read with `get()` instead of `$` since this is a
 * module rather than a component.
 */
import { get } from 'svelte/store';
import * as api from './api';
import type { Zone, NowPlaying } from './types';
import { playAndSync, nextAndSync, previousAndSync, resumeAndSync } from './stores/zones';
import { ytPlayerState, ytLoading, pauseVideo, resumeVideo } from './stores/ytPlayer';
import { isBrowserZone, browserPause } from './stores/browserAudio';

export type PlayState = 'playing' | 'paused' | 'stopped' | string;

export async function togglePlayPause(
  zone: Zone | null | undefined,
  // La piste vient de `currentTrack`, qui derive du now-playing de la zone :
  // c'est un NowPlaying, pas un Track (l'identifiant y est optionnel).
  track: NowPlaying | null | undefined,
  playState: PlayState,
): Promise<void> {
  const yt = get(ytPlayerState);
  const ytActive = yt.active;
  const ytPlaying = yt.playing;
  const ytTrack = yt.track;

  if (zone?.id && playState !== 'stopped') {
    if (ytActive) ytLoading.set(true);
    if (playState === 'playing') {
      await api.pause(zone.id);
      if (isBrowserZone(zone)) browserPause();
    } else {
      await resumeAndSync(zone.id);
    }
  } else if (zone?.id && playState === 'stopped' && track) {
    const trackId = (track as any).track_id ?? track.id;
    const body =
      track.source === 'radio' && track.source_id
        ? { source: 'radio' as any, source_id: track.source_id }
        : track.source && track.source !== 'local' && track.source_id
          ? { source: track.source as any, source_id: track.source_id }
          : trackId != null
            ? { track_id: trackId }
            : undefined;
    await playAndSync(zone.id, body);
  } else if (zone?.id && playState === 'stopped' && ytActive && ytTrack?.source_id) {
    ytLoading.set(true);
    await playAndSync(zone.id, { source: ytTrack.source as any, source_id: ytTrack.source_id });
  } else if (ytActive) {
    if (ytPlaying) pauseVideo();
    else resumeVideo();
  }
}

export async function skipNext(zone: Zone | null | undefined): Promise<void> {
  if (!zone?.id) return;
  if (get(ytPlayerState).active) ytLoading.set(true);
  await nextAndSync(zone.id);
}

export async function skipPrevious(zone: Zone | null | undefined): Promise<void> {
  if (!zone?.id) return;
  if (get(ytPlayerState).active) ytLoading.set(true);
  await previousAndSync(zone.id);
}

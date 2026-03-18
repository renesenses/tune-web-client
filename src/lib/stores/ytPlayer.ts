import { writable } from 'svelte/store';
import type { Track } from '../types';

export interface YTPlayerState {
  active: boolean;
  videoId: string | null;
  playing: boolean;
  currentTime: number; // seconds
  duration: number;    // seconds
  track: Track | null;
  showVideo: boolean;  // true = IFrame visible over artwork area
}

export interface YTVideoRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Rect of the NowPlaying artwork area — drives IFrame positioning. */
export const ytVideoRect = writable<YTVideoRect | null>(null);

type PlayerActions = {
  play: (videoId: string) => void;
  pause: () => void;
  resume: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void; // 0-100
};

let _playerActions: PlayerActions | null = null;

export const ytPlayerState = writable<YTPlayerState>({
  active: false,
  videoId: null,
  playing: false,
  currentTime: 0,
  duration: 0,
  track: null,
  showVideo: false,
});

/**
 * True while yt-dlp is extracting the audio URL and the DLNA zone hasn't
 * started yet.  Set to true by playVideo(), cleared by clearYTLoading().
 */
export const ytLoading = writable<boolean>(false);

/** Called by YTPlayer.svelte on mount to register player control callbacks. */
export function _registerYTPlayer(actions: PlayerActions): void {
  _playerActions = actions;
}

/** Start playing a YouTube video (via IFrame Player). */
export function playVideo(videoId: string, track: Track | null = null): void {
  ytPlayerState.update(s => ({ ...s, active: true, videoId, playing: false, currentTime: 0, track }));
  ytLoading.set(true);
  _playerActions?.play(videoId);
}

/** Clear the loading flag once the DLNA zone confirms playback started. */
export function clearYTLoading(): void {
  ytLoading.set(false);
}

export function pauseVideo(): void {
  _playerActions?.pause();
}

export function resumeVideo(): void {
  _playerActions?.resume();
}

export function seekTo(seconds: number): void {
  _playerActions?.seekTo(seconds);
}

export function setYTVolume(volume: number): void {
  _playerActions?.setVolume(Math.round(Math.max(0, Math.min(100, volume))));
}

export function stopVideo(): void {
  ytLoading.set(false);
  ytVideoRect.set(null);
  ytPlayerState.update(() => ({
    active: false,
    videoId: null,
    playing: false,
    currentTime: 0,
    duration: 0,
    track: null,
    showVideo: false,
  }));
}

/** Show the IFrame over the NowPlaying artwork area. */
export function showYTVideo(rect: YTVideoRect): void {
  ytVideoRect.set(rect);
  ytPlayerState.update(s => ({ ...s, showVideo: true }));
}

/** Hide the IFrame (back off-screen). */
export function hideYTVideo(): void {
  ytVideoRect.set(null);
  ytPlayerState.update(s => ({ ...s, showVideo: false }));
}

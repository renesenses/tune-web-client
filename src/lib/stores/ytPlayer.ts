import { writable } from 'svelte/store';
import type { Track } from '../types';

export interface YTPlayerState {
  active: boolean;
  videoId: string | null;
  playing: boolean;
  currentTime: number; // seconds
  duration: number;    // seconds
  track: Track | null;
}

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
});

/** Called by YTPlayer.svelte on mount to register player control callbacks. */
export function _registerYTPlayer(actions: PlayerActions): void {
  _playerActions = actions;
}

/** Start playing a YouTube video (via IFrame Player). */
export function playVideo(videoId: string, track: Track | null = null): void {
  ytPlayerState.update(s => ({ ...s, active: true, videoId, playing: false, currentTime: 0, track }));
  _playerActions?.play(videoId);
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
  ytPlayerState.update(() => ({
    active: false,
    videoId: null,
    playing: false,
    currentTime: 0,
    duration: 0,
    track: null,
  }));
}

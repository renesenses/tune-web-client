import { writable } from 'svelte/store';

export interface AudioLevels {
  zone_id: number;
  rms_left_db: number;
  rms_right_db: number;
  peak_left_db: number;
  peak_right_db: number;
  rms_left: number;
  rms_right: number;
  spectrum: number[];
}

const defaultLevels: AudioLevels = {
  zone_id: 0,
  rms_left_db: -96,
  rms_right_db: -96,
  peak_left_db: -96,
  peak_right_db: -96,
  rms_left: 0,
  rms_right: 0,
  spectrum: [],
};

export const audioLevels = writable<AudioLevels>(defaultLevels);

export function handleAudioLevelsEvent(data: any) {
  audioLevels.set({
    zone_id: data.zone_id ?? 0,
    rms_left_db: data.rms_left_db ?? -96,
    rms_right_db: data.rms_right_db ?? -96,
    peak_left_db: data.peak_left_db ?? -96,
    peak_right_db: data.peak_right_db ?? -96,
    rms_left: data.rms_left ?? 0,
    rms_right: data.rms_right ?? 0,
    spectrum: Array.isArray(data.spectrum) ? data.spectrum : [],
  });
}

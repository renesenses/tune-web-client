import { get } from 'svelte/store';
import { currentZone } from './stores/zones';
import { playbackState, seekPositionMs } from './stores/nowPlaying';
import * as api from './api';

let preMuteVolume: number | null = null;

export function setupKeyboardShortcuts(): () => void {
  function handler(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const zone = get(currentZone);
    if (!zone?.id) return;

    switch (e.code) {
      case 'Space': {
        e.preventDefault();
        const state = get(playbackState);
        if (state === 'playing') api.pause(zone.id);
        else api.resume(zone.id);
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (e.shiftKey) {
          api.next(zone.id);
        } else {
          const pos = get(seekPositionMs);
          api.seek(zone.id, pos + 10000);
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (e.shiftKey) {
          api.previous(zone.id);
        } else {
          const pos = get(seekPositionMs);
          api.seek(zone.id, Math.max(0, pos - 10000));
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const vol = zone.volume ?? 0.5;
        api.setVolume(zone.id, Math.min(1, vol + 0.05));
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        const vol = zone.volume ?? 0.5;
        api.setVolume(zone.id, Math.max(0, vol - 0.05));
        break;
      }
      case 'KeyN':
        if (!e.metaKey && !e.ctrlKey) api.next(zone.id);
        break;
      case 'KeyP':
        if (!e.metaKey && !e.ctrlKey) api.previous(zone.id);
        break;
      case 'KeyM': {
        if (e.metaKey || e.ctrlKey) break;
        const vol = zone.volume ?? 0.5;
        if (vol > 0) {
          preMuteVolume = vol;
          api.setVolume(zone.id, 0);
        } else if (preMuteVolume !== null) {
          api.setVolume(zone.id, preMuteVolume);
          preMuteVolume = null;
        } else {
          api.setVolume(zone.id, 0.5);
        }
        break;
      }
    }
  }

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}

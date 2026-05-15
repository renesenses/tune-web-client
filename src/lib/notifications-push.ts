// Browser push notifications for track changes
// Only shows notifications when the tab is not focused (document.hidden)

import { tuneWS } from './websocket';
import { artworkUrl } from './api';

const STORAGE_KEY = 'tune-push-notifications-enabled';

export function isPushEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function setPushEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(enabled));
  if (enabled) {
    requestPermissionIfNeeded();
  }
}

async function requestPermissionIfNeeded(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

let unsubscribe: (() => void) | null = null;

export function initPushNotifications(): void {
  if (unsubscribe) return; // already subscribed

  unsubscribe = tuneWS.onEvent((event) => {
    if (!isPushEnabled()) return;
    if (!document.hidden) return; // tab is focused, skip

    // Listen for track change events
    if (event.type === 'playback.track_changed' || event.type === 'TRACK_CHANGED') {
      const track = event.data?.track ?? event.data;
      if (!track?.title) return;

      showTrackNotification(track);
    }
  });
}

export function destroyPushNotifications(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

function showTrackNotification(track: {
  title: string;
  artist_name?: string | null;
  album_title?: string | null;
  cover_path?: string | null;
  album_id?: number | null;
}): void {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const body = [track.artist_name, track.album_title].filter(Boolean).join(' - ');

  const iconUrl = track.cover_path
    ? artworkUrl(track.cover_path, 128)
    : undefined;

  try {
    const n = new Notification(track.title, {
      body: body || undefined,
      icon: iconUrl,
      tag: 'tune-track-change', // replaces previous notification
      silent: true,
    });
    // Auto-close after 5 seconds
    setTimeout(() => n.close(), 5000);
  } catch {
    // Notifications may fail in some contexts (e.g. service worker required)
  }
}

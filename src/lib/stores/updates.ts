import { writable } from 'svelte/store';
import * as api from '../api';

export const updateAvailable = writable(false);
export const latestVersion = writable<string | null>(null);

let pollTimer: ReturnType<typeof setInterval> | null = null;

async function poll() {
  try {
    const info = await api.checkForUpdate();
    updateAvailable.set(!!info?.update_available);
    latestVersion.set(info?.latest_version ?? null);
  } catch {
    // server checks GitHub on its own; transient failures are silent.
  }
}

export function startUpdatePolling() {
  if (pollTimer) return;
  poll();
  pollTimer = setInterval(poll, 30 * 60 * 1000);
}

export function stopUpdatePolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

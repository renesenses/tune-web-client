import { writable } from 'svelte/store';
import * as api from '../api';

export const updateAvailable = writable(false);
export const latestVersion = writable<string | null>(null);
export const currentVersion = writable<string | null>(null);
export const updateBannerDismissed = writable(false);

const DISMISSED_KEY = 'tune_update_dismissed_version';

let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Compare two semver strings. Returns true if b > a. */
function isNewer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (nb > na) return true;
    if (nb < na) return false;
  }
  return false;
}

async function poll() {
  try {
    // Try the server's own update check first
    const info = await api.checkForUpdate();
    const cur = info?.current_version ?? info?.current ?? null;
    const lat = info?.latest_version ?? info?.latest ?? null;
    if (cur) currentVersion.set(cur);
    if (lat) latestVersion.set(lat);
    const hasUpdate = !!info?.update_available || (cur && lat && isNewer(cur, lat));
    updateAvailable.set(!!hasUpdate);
    checkDismissed(lat);
    return;
  } catch {
    // Server endpoint unavailable — fall back to direct GitHub check
  }

  // Fallback: fetch current version from /api/v1/status, latest from GitHub
  try {
    const [statusRes, ghRes] = await Promise.all([
      fetch(`${window.location.protocol}//${window.location.host}/api/v1/status`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('https://api.github.com/repos/renesenses/tune-server-rust/releases/latest').then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    const cur = statusRes?.version ?? statusRes?.server_version ?? null;
    const lat = ghRes?.tag_name?.replace(/^v/, '') ?? null;

    if (cur) currentVersion.set(cur);
    if (lat) latestVersion.set(lat);

    if (cur && lat && isNewer(cur, lat)) {
      updateAvailable.set(true);
    } else {
      updateAvailable.set(false);
    }
    checkDismissed(lat);
  } catch {
    // Both failed — stay silent
  }
}

function checkDismissed(version: string | null) {
  if (!version) return;
  const dismissed = localStorage.getItem(DISMISSED_KEY);
  updateBannerDismissed.set(dismissed === version);
}

export function dismissUpdateBanner() {
  let lat: string | null = null;
  latestVersion.subscribe(v => (lat = v))();
  if (lat) {
    localStorage.setItem(DISMISSED_KEY, lat);
    updateBannerDismissed.set(true);
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

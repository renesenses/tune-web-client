import { writable } from 'svelte/store';
import * as api from '../api';
import { normaliserVerificationMaj } from '../miseAJour';
import { estPlusRecente } from '../versions';

export const updateAvailable = writable(false);
export const latestVersion = writable<string | null>(null);
export const currentVersion = writable<string | null>(null);
export const updateBannerDismissed = writable(false);
/**
 * tune-server-rust#6068 — le serveur sait-il installer lui-même ? Faux sur un
 * build `.no-auto-update` ou une installation Homebrew : la pastille de la
 * barre latérale ne propose alors plus le geste d'installation, elle montre
 * `updateInstallHint` en infobulle (même règle que Réglages).
 */
export const updateInstallable = writable(true);
export const updateInstallHint = writable<string | null>(null);

const DISMISSED_KEY = 'tune_update_dismissed_version';

let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * `b` est-elle plus récente que `a` ? Pré-versions comprises (1.0.0-rc1) :
 * voir `../versions`. L'ancienne version passait `0-rc1` à `Number` (NaN) et
 * ne voyait jamais rc1 → rc2 ni rc1 → 1.0.0.
 */
function isNewer(a: string, b: string): boolean {
  return estPlusRecente(a, b);
}

async function poll() {
  try {
    // Try the server's own update check first
    // Même traduction que l'écran Réglages, au même endroit : les deux noms
    // du serveur (`current`/`latest`) vers ceux du client. Elle était recopiée
    // ici et dans `SettingsView`, et ABSENTE de `SettingsV2` — c'est ainsi que
    // le bouton de mise à jour du nouveau client avait disparu.
    const info = normaliserVerificationMaj(await api.checkForUpdate());
    const cur = info?.current_version ?? null;
    const lat = info?.latest_version ?? null;
    if (cur) currentVersion.set(cur);
    if (lat) latestVersion.set(lat);
    const hasUpdate = !!info?.update_available || (cur && lat && isNewer(cur, lat));
    updateAvailable.set(!!hasUpdate);
    updateInstallable.set(info ? info.installable : true);
    updateInstallHint.set(info ? info.install_hint : null);
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

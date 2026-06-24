import { writable, derived } from 'svelte/store';
import * as api from '../api';
import type { LicenseStatus } from '../api';

export interface LicenseState {
  loaded: boolean;
  tier: string;
  licenseKey: string | null;
  expiresAt: string | null;
  features: Record<string, { enabled: boolean; display_name: string }>;
  zoneLimit: number;
  hardwareFingerprint: string | null;
}

const defaultState: LicenseState = {
  loaded: false,
  tier: 'free',
  licenseKey: null,
  expiresAt: null,
  features: {},
  zoneLimit: 3,
  hardwareFingerprint: null,
};

export const licenseState = writable<LicenseState>(defaultState);

export const isPremium = derived(licenseState, ($s) => $s.tier === 'premium' || $s.tier === 'pro');

export const tier = derived(licenseState, ($s) => $s.tier);

export async function loadLicense(): Promise<void> {
  try {
    const status: LicenseStatus = await api.getLicenseStatus();
    licenseState.set({
      loaded: true,
      tier: status.tier ?? 'free',
      licenseKey: status.license_key ?? null,
      expiresAt: status.expires_at ?? null,
      features: status.features ?? {},
      zoneLimit: status.zone_limit ?? 3,
      hardwareFingerprint: status.hardware_fingerprint ?? null,
    });
  } catch {
    // Endpoint may not exist yet — treat as free tier
    licenseState.update((s) => ({ ...s, loaded: true }));
  }
}

export function checkFeature(name: string): boolean {
  let enabled = false;
  licenseState.subscribe((s) => {
    const feat = s.features[name];
    enabled = feat?.enabled ?? false;
  })();
  return enabled;
}

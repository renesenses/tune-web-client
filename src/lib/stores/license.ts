import { writable, derived } from 'svelte/store';
import * as api from '../api';
import type { LicenseStatus, LicenseSessionConflict, LicenseOfflineGrace } from '../api';

export interface LicenseState {
  loaded: boolean;
  tier: string;
  licenseKey: string | null;
  expiresAt: string | null;
  features: Record<string, { enabled: boolean; display_name: string; available?: boolean }>;
  /**
   * 🔴 `null` veut dire ILLIMITÉ, et c'est ce que le serveur envoie.
   *
   * Mesuré sur le .18 le 06/09/2026, `GET /cloud/license/status` avec
   * `tier: "premium"` : `zone_limit` vaut `null`. Le champ existe, il est
   * simplement vide — c'est ainsi que le serveur dit « pas de plafond ».
   *
   * Ce magasin lisait `status.zone_limit ?? 3` : il traduisait donc
   * « illimité » par **3**, le plafond du palier GRATUIT. L'écran Réglages
   * annonçait « Zones autorisées : 3 » sur un serveur premium qui en portait
   * quatorze. « En premium, Zones autorisées est illimité !! » (Bertrand,
   * 06/09/2026).
   *
   * ⚠️ Purement de l'AFFICHAGE : le plafond réel est appliqué côté serveur,
   * au point d'étranglement de la lecture (`enforce_zone_cap` dans
   * `orchestrator.play()`). Rien ici ne l'assouplit.
   */
  zoneLimit: number | null;
  hardwareFingerprint: string | null;
  /** Non-null while the licence is active on another of the user's servers. */
  sessionConflict: LicenseSessionConflict | null;
  /**
   * Fenêtre de tolérance hors ligne (#1999) : `null` quand il n'y a rien à
   * annoncer. Sur un serveur ancien le champ n'existe pas — on reste `null`,
   * l'interface se tait, rien ne casse.
   */
  offlineGrace: LicenseOfflineGrace | null;
}

const defaultState: LicenseState = {
  loaded: false,
  tier: 'free',
  licenseKey: null,
  expiresAt: null,
  features: {},
  zoneLimit: 3,
  hardwareFingerprint: null,
  sessionConflict: null,
  offlineGrace: null,
};

/** Les deux paliers qui n'ont pas de plafond de zones. */
function estPremium(t: string | null | undefined): boolean {
  return t === 'premium' || t === 'pro';
}

export const licenseState = writable<LicenseState>(defaultState);

export const isPremium = derived(licenseState, ($s) => $s.tier === 'premium' || $s.tier === 'pro');

export const tier = derived(licenseState, ($s) => $s.tier);

/** True when premium is suppressed here because the licence is live elsewhere. */
export const sessionConflict = derived(licenseState, ($s) => $s.sessionConflict);

/**
 * La fenêtre de tolérance hors ligne, seulement quand elle mérite d'être
 * annoncée. Tant que la vérification est fraîche (`ok`) on se tait : un serveur
 * qui a manqué un battement va très bien et n'a rien à signaler.
 */
export const offlineGrace = derived(licenseState, ($s) =>
  $s.offlineGrace && $s.offlineGrace.phase !== 'ok' ? $s.offlineGrace : null,
);

export async function loadLicense(): Promise<void> {
  try {
    const status: LicenseStatus = await api.getLicenseStatus();
    licenseState.set({
      loaded: true,
      tier: status.tier ?? 'free',
      licenseKey: status.license_key ?? null,
      expiresAt: status.expires_at ?? null,
      features: status.features ?? {},
      // Un serveur ANCIEN n'envoie pas le champ du tout : on retombe alors
      // sur le plafond du palier, pas sur « illimité » — accorder l'illimité
      // à un gratuit par défaut serait le défaut symétrique.
      zoneLimit: status.zone_limit ?? (estPremium(status.tier) ? null : 3),
      hardwareFingerprint: status.hardware_fingerprint ?? null,
      sessionConflict: status.session_conflict ?? null,
      offlineGrace: status.offline_grace ?? null,
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

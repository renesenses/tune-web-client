/**
 * Réglages proposés pour un appareil identifié — ce que d'autres utilisateurs
 * de Tune ont retenu pour la même marque et le même modèle.
 *
 * Porté de l'ancien écran Appareils (`DevicesSettings`), seul à le proposer.
 * La règle vit ici pour qu'un test l'APPELLE.
 */
import type { DevicePreset } from './api';
import type { Zone } from './types';

/** Sous ce nombre d'occurrences, une « habitude » n'en est pas une. */
export const OCCURRENCES_MIN = 3;

/** Déjà réglée à la main : on ne propose pas de remplacer un choix. */
export function aDesReglagesLocaux(z: Partial<Zone>): boolean {
  return !!(z.dlna_native_flac || z.alac_passthrough || z.aac_passthrough || z.dlna_lpcm
    || z.dlna_cap_16bit || z.dlna_wav24 || (z.dlna_play_delay_ms ?? 0) > 0
    || (z.gain_trim_db ?? 0) !== 0);
}

/** Une proposition n'a de sens que pour un appareil identifié et encore vierge. */
export function zoneAProposer(z: Partial<Zone>): boolean {
  const identifie = !!(z.brand ?? (z as any).detected_manufacturer) && !!(z.model ?? (z as any).detected_model);
  return z.id != null && identifie && !aDesReglagesLocaux(z);
}

/** La meilleure proposition retenue, ou `null`. */
export function propositionRetenue(presets: readonly DevicePreset[] | undefined): DevicePreset | null {
  const p = presets?.[0];
  return p && p.occurrences >= OCCURRENCES_MIN && Object.keys(p.settings ?? {}).length > 0 ? p : null;
}

export function resumeProposition(p: DevicePreset): string {
  return Object.entries(p.settings).map(([k, v]) => (v === true ? k : `${k}=${v}`)).join(' · ');
}

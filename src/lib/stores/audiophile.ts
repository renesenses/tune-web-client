import { derived, get, writable } from 'svelte/store';
import * as api from '../api';

/**
 * Mode PURE (audiophile) de la zone courante, et verrou de volume qui
 * l'accompagne.
 *
 * L'état vivait dans TransportBar, seul consommateur à l'époque. VolumeControl
 * en a besoin aussi (griser le curseur), et NowPlaying affiche le même
 * VolumeControl : un état par composant aurait donné trois lectures réseau et
 * trois vérités possibles. Une seule ici.
 */
export const audiophileEnabled = writable<boolean>(false);

/**
 * Réglage serveur global `audiophile_lock_volume` : le mode PURE impose-t-il
 * le volume à 100 % ? **Faux par défaut** — cocher « Audiophile » ne doit pas
 * changer le niveau sans prévenir.
 */
export const audiophileLockVolume = writable<boolean>(false);

/**
 * Le curseur de volume doit-il être gelé ? Uniquement quand les DEUX
 * conditions tiennent : zone en PURE **et** verrou armé.
 */
export const volumeLocked = derived(
  [audiophileEnabled, audiophileLockVolume],
  ([$enabled, $lock]) => $enabled && $lock,
);

/**
 * Le serveur peut renvoyer un booléen ou la chaîne « true » selon que le
 * réglage a été écrit par un PATCH (texte brut) ou lu depuis les défauts.
 */
export function isOn(v: unknown): boolean {
  return v === true || v === 'true';
}

// Une réponse tardive d'une zone qu'on vient de quitter ne doit pas écraser
// l'état de la zone courante — même garde que celle qui existait dans
// TransportBar.
let generation = 0;

export async function refreshAudiophile(zoneId: number | null | undefined): Promise<void> {
  if (!zoneId) {
    audiophileEnabled.set(false);
    return;
  }
  const gen = ++generation;
  try {
    const res = await api.getAudiophileMode(zoneId);
    if (gen === generation) audiophileEnabled.set(res.enabled);
  } catch {
    if (gen === generation) audiophileEnabled.set(false);
  }
}

export async function refreshVolumeLock(): Promise<void> {
  try {
    const cfg = await api.getConfig();
    audiophileLockVolume.set(isOn((cfg as Record<string, unknown>).audiophile_lock_volume));
  } catch {
    // Serveur injoignable : on n'invente pas un verrou, on laisse le curseur
    // libre. Une restriction supposée est pire qu'une restriction absente.
    audiophileLockVolume.set(false);
  }
}

export async function setVolumeLock(
  enabled: boolean,
  confirmFullVolume = false,
): Promise<void> {
  if (enabled && !get(audiophileLockVolume) && !confirmFullVolume) {
    throw new Error('full_volume_confirmation_required');
  }
  audiophileLockVolume.set(enabled);
  try {
    await api.updateConfig({
      audiophile_lock_volume: enabled,
      ...(confirmFullVolume ? { _confirm_full_volume: true } : {}),
    });
  } catch (e) {
    audiophileLockVolume.set(!enabled);
    throw e;
  }
}

/** Le volume est-il gelé en ce moment ? Version non réactive, pour les gardes. */
export function isVolumeLocked(): boolean {
  return get(volumeLocked);
}

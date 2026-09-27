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

/** Verrou effectif de la zone courante, surcharge par zone comprise. */
export const audiophileLockVolume = writable<boolean>(false);

/** Réglage global historique, désormais utilisé comme valeur par défaut. */
export const audiophileGlobalLockVolume = writable<boolean>(false);

/**
 * Surcharge de la zone courante, TELLE QUE LE SERVEUR LA REND.
 *
 * `null` = la zone n'a pas de réglage propre, elle hérite du défaut général ;
 * un booléen = elle a le sien. C'est la troisième position du sélecteur
 * (`audiophile.lockInherit`, #2526) : sans état réactif, l'écran ne pouvait pas
 * savoir laquelle des trois montrer, et la seule chose qu'il savait faire était
 * de basculer entre deux. Une zone surchargée ne pouvait alors plus revenir à
 * l'héritage — un état que l'API atteint (`setZoneVolumeLock(id, null)`) et que
 * l'utilisateur ne pouvait plus.
 *
 * NE PAS confondre avec `audiophileLockVolume`, qui est la valeur EFFECTIVE,
 * héritage déjà résolu par le serveur. Celle-ci est la surcharge brute, et
 * c'est le seul endroit du client où elle est publiée.
 */
export const audiophileZoneLockOverride = writable<boolean | null>(null);

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
let currentLockOverride: boolean | null = null;
let currentAudiophileZoneId: number | null = null;

/**
 * UN SEUL écrivain pour la surcharge courante.
 *
 * La variable privée servait déjà à quatre endroits ; y ajouter un store sans
 * passer par un point unique, c'était garantir qu'ils divergeraient — et la
 * divergence serait invisible, puisque l'un pilote l'affichage et l'autre le
 * repli d'héritage.
 */
function memoriserSurcharge(valeur: boolean | null): void {
  currentLockOverride = valeur;
  audiophileZoneLockOverride.set(valeur);
}

export async function refreshAudiophile(zoneId: number | null | undefined): Promise<void> {
  if (!zoneId) {
    generation += 1;
    currentAudiophileZoneId = null;
    memoriserSurcharge(null);
    audiophileEnabled.set(false);
    audiophileLockVolume.set(get(audiophileGlobalLockVolume));
    return;
  }
  const gen = ++generation;
  currentAudiophileZoneId = zoneId;
  try {
    const res = await api.getAudiophileMode(zoneId);
    if (gen === generation) {
      memoriserSurcharge(res.lock_volume ?? null);
      audiophileEnabled.set(res.enabled);
      audiophileLockVolume.set(
        typeof res.effective_lock_volume === 'boolean'
          ? res.effective_lock_volume
          : (currentLockOverride ?? get(audiophileGlobalLockVolume)),
      );
    }
  } catch {
    if (gen === generation) {
      memoriserSurcharge(null);
      audiophileEnabled.set(false);
      audiophileLockVolume.set(get(audiophileGlobalLockVolume));
    }
  }
}

export async function refreshVolumeLock(): Promise<void> {
  try {
    const cfg = await api.getConfig();
    const enabled = isOn((cfg as Record<string, unknown>).audiophile_lock_volume);
    audiophileGlobalLockVolume.set(enabled);
    if (currentLockOverride === null) audiophileLockVolume.set(enabled);
  } catch {
    // Serveur injoignable : on n'invente pas un verrou, on laisse le curseur
    // libre. Une restriction supposée est pire qu'une restriction absente.
    audiophileGlobalLockVolume.set(false);
    if (currentLockOverride === null) audiophileLockVolume.set(false);
  }
}

export async function setVolumeLock(
  enabled: boolean,
  confirmFullVolume = false,
): Promise<void> {
  if (enabled && !get(audiophileGlobalLockVolume) && !confirmFullVolume) {
    throw new Error('full_volume_confirmation_required');
  }
  const previous = get(audiophileGlobalLockVolume);
  audiophileGlobalLockVolume.set(enabled);
  if (currentLockOverride === null) audiophileLockVolume.set(enabled);
  try {
    await api.updateConfig({
      audiophile_lock_volume: enabled,
      ...(confirmFullVolume ? { _confirm_full_volume: true } : {}),
    });
  } catch (e) {
    audiophileGlobalLockVolume.set(previous);
    if (currentLockOverride === null) audiophileLockVolume.set(previous);
    throw e;
  }
}

/** Modifier la surcharge de la zone courante ou d'une autre zone. */
export async function setZoneVolumeLock(
  zoneId: number,
  enabled: boolean | null,
  confirmFullVolume = false,
) {
  if (enabled === true && !confirmFullVolume) {
    throw new Error('full_volume_confirmation_required');
  }
  const res = await api.setAudiophileVolumeLock(zoneId, enabled, confirmFullVolume);
  if (zoneId === currentAudiophileZoneId) {
    memoriserSurcharge(res.lock_volume ?? null);
    audiophileLockVolume.set(
      res.effective_lock_volume
        ?? currentLockOverride
        ?? get(audiophileGlobalLockVolume),
    );
  }
  return res;
}

/** Le volume est-il gelé en ce moment ? Version non réactive, pour les gardes. */
export function isVolumeLocked(): boolean {
  return get(volumeLocked);
}

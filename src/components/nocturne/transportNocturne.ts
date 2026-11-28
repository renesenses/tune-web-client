/**
 * Les gestes de transport de Nocturne (barre de lecture, lecture en cours) :
 * les mêmes appels que la barre historique (`*AndSync`, `api.seek`…).
 */
import { get } from 'svelte/store';
import * as api from '../../lib/api';
import type { RepeatMode, Zone } from '../../lib/types';
import {
  currentZone, currentZoneId, zones, pauseAndSync, resumeAndSync, nextAndSync, previousAndSync,
} from '../../lib/stores/zones';
import { playbackState, seekPositionMs, shuffleEnabled, zoneVolume } from '../../lib/stores/nowPlaying';
import { repeatMode } from '../../lib/stores/repeatStore';
import { signalerEchecLecture } from '../../lib/echecLecture';
import { volumeCommandable } from '../../lib/capacitesVolumeSortie';
import { volumeDuCurseur } from '../../lib/volumeDuCurseur';
import { creerLimiteurVolume } from '../../lib/limiteurVolume';
import { envoyerVolumeOuReverrouiller } from '../../lib/refusDeVolume';
import { reglerVolume as reglerVolumeDeZone } from '../../lib/volumeDeGroupe';
import { isVolumeLocked, refreshAudiophile } from '../../lib/stores/audiophile';
import { leverSourdineSiBesoin } from '../../lib/sourdine';
import { isBrowserZone, browserSetVolume } from '../../lib/stores/browserAudio';
import { notifications } from '../../lib/stores/notifications';
import { t } from '../../lib/i18n';

function zid(): number | null { return get(currentZoneId); }

export function lecturePause(): void {
  const z = zid();
  if (z == null) return;
  (get(playbackState) === 'playing' ? pauseAndSync(z) : resumeAndSync(z)).catch(signalerEchecLecture);
}
export function suivant(): void { const z = zid(); if (z != null) nextAndSync(z).catch(signalerEchecLecture); }
export function precedent(): void { const z = zid(); if (z != null) previousAndSync(z).catch(signalerEchecLecture); }

export function aleatoireActif(): boolean {
  return (get(currentZone) as Zone | null)?.shuffle ?? get(shuffleEnabled);
}
export function repetitionCourante(): RepeatMode {
  return (get(currentZone) as Zone | null)?.repeat ?? get(repeatMode);
}

export async function basculerAleatoire(): Promise<void> {
  const z = zid();
  if (z == null) return;
  const suivant = !aleatoireActif();
  try {
    await api.setShuffle(z, suivant);
    shuffleEnabled.set(suivant);
    zones.update((zs) => zs.map((x) => (x.id === z ? { ...x, shuffle: suivant } : x)));
  } catch (e) { signalerEchecLecture(e); }
}

/** Règle la répétition (`off` → `all` → `one` sans argument). */
export async function reglerRepetition(mode?: RepeatMode): Promise<void> {
  const z = zid();
  if (z == null) return;
  const r = repetitionCourante();
  const cible: RepeatMode = mode ?? (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off');
  try {
    await api.setRepeat(z, cible);
    repeatMode.set(cible);
    zones.update((zs) => zs.map((x) => (x.id === z ? { ...x, repeat: cible } : x)));
  } catch (e) { signalerEchecLecture(e); }
}

/** Saute à `ms` dans la piste en cours. */
export function chercherA(ms: number): void {
  const z = zid();
  if (z == null) return;
  const cible = Math.max(0, Math.round(ms));
  seekPositionMs.set(cible);
  api.seek(z, cible).catch(signalerEchecLecture);
}

/**
 * Sécurité auditive (itération 14) — le volume de Nocturne prend EXACTEMENT le
 * chemin du curseur de Tune (`VolumeControl.handleVolume`) :
 * - refusé si le volume est verrouillé (PURE « Forcer à 100 % »), fixe, ou si
 *   la sortie ne se commande pas ;
 * - borné par `volumeDuCurseur` (sécurité, confort, grille de la sortie) ;
 * - sourdine levée si besoin, zone navigateur réglée dans l'onglet ;
 * - envoi limité (`creerLimiteurVolume`) par `reglerVolume` de
 *   `volumeDeGroupe` (volume maître d'une zone groupée), et sur refus du
 *   serveur, relecture du verrou (`envoyerVolumeOuReverrouiller`).
 * Avant, la barre envoyait `api.setVolume` brut : aucun plafond côté écran.
 * Rend la valeur posée (pour recaler le curseur), ou `null` si refusé.
 */
const limiterVolume = creerLimiteurVolume();

export function volumeAutorise(zone: Zone | null | undefined): boolean {
  return !!zone && zone.id != null && !isVolumeLocked() && !volumeFixe(zone) && volumeCommandable(zone);
}

export function reglerVolume(brut: number): number | null {
  const zone = get(currentZone) as Zone | null;
  if (!zone || zone.id == null || !volumeAutorise(zone)) return null;
  const val = volumeDuCurseur(zone, brut, get(zoneVolume));
  if (val === null) return null;
  leverSourdineSiBesoin({ ...zone, id: zone.id }, val);
  zoneVolume.set(val);
  if (isBrowserZone(zone)) browserSetVolume(val, zone);
  const zoneId = zone.id;
  limiterVolume(() => {
    if (get(currentZoneId) !== zoneId || isVolumeLocked()) return;
    void envoyerVolumeOuReverrouiller(zoneId, val, {
      envoyer: reglerVolumeDeZone,
      relireVerrou: refreshAudiophile,
      verrouille: isVolumeLocked,
      direVerrou: () => notifications.error(get(t)('audiophile.volumeLockedHint' as any)),
    });
  });
  return val;
}

/** Changement de zone : une consigne en attente ne part pas vers l'autre. */
export function annulerVolumeEnAttente(): void { limiterVolume.annuler(); }

/**
 * L'étiquette de sortie de la zone, d'après son chemin du signal : `TESS` si
 * l'étape est sur le chemin, sinon bit-perfect ou transcodé. `null` sans chemin.
 */
export function etiquetteSortie(zone: Zone | null | undefined): 'tess' | 'bitPerfect' | 'transcode' | null {
  const sp = zone?.signal_path;
  if (!sp) return null;
  if (sp.tess || (sp.steps ?? []).some((s) => /tess/i.test(`${s.name} ${s.description ?? ''}`))) return 'tess';
  return sp.bit_perfect ? 'bitPerfect' : 'transcode';
}

/** Le volume est-il fixe ou matériel (pas de curseur logiciel à montrer) ? */
export function volumeFixe(zone: Zone | null | undefined): boolean {
  return zone?.fixed_volume === true;
}

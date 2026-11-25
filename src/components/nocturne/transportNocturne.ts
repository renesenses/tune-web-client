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

let minuterieVolume: ReturnType<typeof setTimeout> | null = null;
/** Volume (0..1) : l'affichage suit tout de suite, l'envoi est groupé. */
export function reglerVolume(v: number): void {
  zoneVolume.set(v);
  const z = zid();
  if (z == null) return;
  if (minuterieVolume) clearTimeout(minuterieVolume);
  minuterieVolume = setTimeout(() => { api.setVolume(z, v).catch(signalerEchecLecture); }, 120);
}

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

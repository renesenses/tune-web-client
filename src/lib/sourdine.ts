/**
 * La sourdine est une VRAIE sourdine : `muted`, jamais `volume 0`.
 *
 * Décision de Bertrand du 21/10/2026 (tune-server-rust #6700) : le bouton
 * haut-parleur, la touche M et la sourdine du curseur mobile envoyaient
 * `setVolume(zone, 0)` et gardaient l'ancien volume dans un magasin du
 * client. Le serveur, lui, ne voyait qu'un volume à zéro, et un renderer DLNA
 * (Eversolo DMP-A8, .18) qui remontait ensuite son ancien volume faisait
 * croire la zone audible, à 80 %, sur un appareil muet.
 *
 * Désormais la sourdine passe par `POST /zone-manager/zones/{id}/mute`
 * (`SetMute` vers l'appareil). Le volume n'est jamais touché : lever la
 * sourdine rend le son au volume d'avant, sans qu'aucun client n'ait à s'en
 * souvenir. L'état affiché est celui de la zone (`zone.muted`), que le
 * serveur pousse (`playback.muted`) à tous les clients.
 */
import * as api from './api';
import { volumeDepuisGain } from './courbeDeVolume';
import { zones } from './stores/zones';
import { browserSetVolume, isBrowserZone } from './stores/browserAudio';

export interface ZoneSourdine {
  id: number;
  muted?: boolean;
  volume?: number;
  output_type?: string;
  volume_curve?: string | null;
}

export interface DependancesSourdine {
  /** La commande au serveur : `SetMute`, jamais un volume. */
  muteZone: (zoneId: number, muted: boolean) => Promise<unknown>;
  /** Pose l'état affiché (optimiste, puis rétabli en cas de refus). */
  poserMuet: (zoneId: number, muted: boolean) => void;
  /** Zone navigateur : l'`<audio>` de cet onglet, que le serveur ne pilote pas. */
  audioLocal?: (volume: number) => void;
}

/** La position du CURSEUR d'une zone (le serveur peut encore rendre du
 *  pour-cent ; `volume` est le gain, tune-server-rust#6787). */
function volumeLineaire(zone: ZoneSourdine): number {
  const v = zone.volume ?? 0.5;
  return volumeDepuisGain(zone, v > 1 ? v / 100 : v);
}

/** Pose `muted` sur la zone voulue (cœur testable, dépendances injectées). */
export async function poserSourdine(
  zone: ZoneSourdine,
  muted: boolean,
  deps: DependancesSourdine,
): Promise<void> {
  const avant = Boolean(zone.muted);
  deps.poserMuet(zone.id, muted);
  deps.audioLocal?.(muted ? 0 : volumeLineaire(zone));
  try {
    await deps.muteZone(zone.id, muted);
  } catch (e) {
    deps.poserMuet(zone.id, avant);
    deps.audioLocal?.(avant ? 0 : volumeLineaire(zone));
    throw e;
  }
}

/** Bascule la sourdine (cœur testable). */
export function basculerSourdine(zone: ZoneSourdine, deps: DependancesSourdine): Promise<void> {
  return poserSourdine(zone, !zone.muted, deps);
}

/** Pose `muted` dans le magasin des zones, sans relire le serveur. */
export function poserMuetDansLesZones(zoneId: number, muted: boolean): void {
  zones.update((liste) => liste.map((z) => (z?.id === zoneId ? { ...z, muted } : z)));
}

function dependances(zone: ZoneSourdine): DependancesSourdine {
  return {
    muteZone: api.muteZone,
    poserMuet: poserMuetDansLesZones,
    audioLocal: isBrowserZone(zone) ? (v: number) => browserSetVolume(v, zone) : undefined,
  };
}

/** Le bouton haut-parleur et la touche M. */
export function basculerSourdineZone(zone: ZoneSourdine): Promise<void> {
  return basculerSourdine(zone, dependances(zone));
}

/**
 * Un geste de volume qui MONTE le son lève la sourdine : bouger le curseur
 * d'une zone muette doit s'entendre. Rien ne part si la zone n'est pas muette.
 */
export function leverSourdineSiBesoin(zone: ZoneSourdine, volume: number): void {
  if (!zone.muted || volume <= 0) return;
  void poserSourdine(zone, false, dependances(zone)).catch(() => {});
}

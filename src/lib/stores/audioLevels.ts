import { derived, writable } from 'svelte/store';
import { currentZoneId } from './zones';

export interface AudioLevels {
  zone_id: number;
  rms_left_db: number;
  rms_right_db: number;
  peak_left_db: number;
  peak_right_db: number;
  rms_left: number;
  rms_right: number;
  spectrum: number[];
  /** Niveau absolu par bande, en dBFS (serveur ≥ 0.9.63). Vide sinon. */
  spectrum_db: number[];
}

const defaultLevels: AudioLevels = {
  zone_id: 0,
  rms_left_db: -96,
  rms_right_db: -96,
  peak_left_db: -96,
  peak_right_db: -96,
  rms_left: 0,
  rms_right: 0,
  spectrum: [],
  spectrum_db: [],
};

/// Niveaux les plus récents de CHAQUE zone.
///
/// Tune est multi-room : plusieurs zones peuvent jouer en même temps, et
/// chacune publie ses propres `playback.audio_levels`. Un état global unique
/// gardait la dernière trame reçue, d'où qu'elle vienne — l'analyseur affichait
/// donc alternativement une zone puis l'autre, et restait figé sur les niveaux
/// d'une zone que l'utilisateur ne regardait même pas.
const levelsByZone = writable<Record<number, AudioLevels>>({});

/// Niveaux de la zone actuellement sélectionnée — ce que l'interface doit
/// afficher. Retombe au silence tant que la zone choisie n'a rien émis, plutôt
/// que d'hériter des aiguilles de la précédente.
export const audioLevels = derived(
  [levelsByZone, currentZoneId],
  ([$byZone, $zoneId]) => ($zoneId != null ? ($byZone[$zoneId] ?? defaultLevels) : defaultLevels)
);

/// Niveaux d'UNE zone nommée, quelle qu'elle soit.
///
/// `audioLevels` ne rend que ceux de la zone SÉLECTIONNÉE. La bande « Zones
/// d'écoute actives » en montre plusieurs à la fois : sans ce sélecteur, le
/// même analyseur serait dessiné sous chaque vignette, et il n'y aurait aucun
/// moyen de le remarquer — trois zones qui jouent, une seule animation, la
/// même partout.
export function levelsForZone(zoneId: number) {
  return derived(levelsByZone, ($byZone) => $byZone[zoneId] ?? defaultLevels);
}

export function handleAudioLevelsEvent(data: any) {
  const zoneId = data.zone_id ?? 0;
  const levels: AudioLevels = {
    zone_id: zoneId,
    rms_left_db: data.rms_left_db ?? -96,
    rms_right_db: data.rms_right_db ?? -96,
    peak_left_db: data.peak_left_db ?? -96,
    peak_right_db: data.peak_right_db ?? -96,
    rms_left: data.rms_left ?? 0,
    rms_right: data.rms_right ?? 0,
    spectrum: Array.isArray(data.spectrum) ? data.spectrum : [],
    spectrum_db: Array.isArray(data.spectrum_db) ? data.spectrum_db : [],
  };
  levelsByZone.update((m) => ({ ...m, [zoneId]: levels }));
}

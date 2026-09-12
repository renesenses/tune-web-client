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
  /**
   * 🔴 #892 — ce que le serveur ANNONCE de son analyse, et que le client
   * jetait depuis #2866 (PR #2987, v0.9.129).
   *
   * La FFT du serveur n'est plus figée à 2048 : elle suit la fenêtre — 2048 à
   * 44,1 et 48 kHz, 4096 à 96 kHz, 8192 au-delà — et sa résolution est
   * CONSTANTE, ~25 Hz, de 44,1 à 192 kHz. Le client recopiait 2048 en dur et
   * rejouait une troncature périmée : à 96 kHz il se croyait à 46,9 Hz de
   * résolution là où le serveur en a 25, et écartait des repères que
   * l'analyseur sait parfaitement distinguer. Pascal ne voyait l'échelle
   * commencer qu'à 250 Hz (fil 1765).
   *
   * `null` / vide = serveur antérieur, ou champ absent : les appelants
   * retombent sur l'ancienne hypothèse, qui reste juste pour ces serveurs-là.
   */
  spectrum_fft_size: number | null;
  /**
   * La résolution VRAIE, en Hz. Ce n'est PAS `sample_rate / spectrum_fft_size`
   * — le zéro-padding resserre les raies sans ajouter d'information, et le
   * serveur le dit explicitement.
   */
  spectrum_resolution_hz: number | null;
  /**
   * Un booléen PAR BANDE : l'analyse la sépare-t-elle vraiment de ses
   * voisines ? Quand il est là, il fait autorité — inutile de rejouer la
   * troncature du serveur pour le deviner.
   */
  spectrum_resolved: boolean[];
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
  spectrum_fft_size: null,
  spectrum_resolution_hz: null,
  spectrum_resolved: [],
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
    spectrum_fft_size: typeof data.spectrum_fft_size === 'number' ? data.spectrum_fft_size : null,
    spectrum_resolution_hz:
      typeof data.spectrum_resolution_hz === 'number' ? data.spectrum_resolution_hz : null,
    spectrum_resolved: Array.isArray(data.spectrum_resolved) ? data.spectrum_resolved : [],
  };
  levelsByZone.update((m) => ({ ...m, [zoneId]: levels }));
}

import { writable } from 'svelte/store';
import type { Track } from '../types';

export interface HistoryEntry {
  track: Track;
  playedAt: string; // ISO timestamp
  zoneName: string;
  /** Le NUMÉRO de la zone, quand le serveur le donne — voir `nomDeZone`. */
  zoneId?: number | null;
  /**
   * L'objet qu'on avait lancé — #904. Servi par `/library/history` depuis la
   * v0.9.131 et jeté par les deux écrans jusqu'ici. Absent pour 65,8 % des
   * écoutes (mesuré sur la .18) : ce n'est pas une anomalie, c'est le cas
   * courant, et les lignes sans contexte restent des lignes plates.
   */
  contexte?: import('../historiqueParContexte').ContexteEcoute | null;
}

const STORAGE_KEY = 'tune-playback-history';
const MAX_ENTRIES = 200;

function load(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function createHistoryStore() {
  const { subscribe, set, update } = writable<HistoryEntry[]>(load());
  subscribe((v) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    } catch { /* ignore */ }
  });
  return {
    subscribe,
    add(track: Track, zoneName: string) {
      update((entries) => {
        // Avoid duplicate if same track played consecutively
        const prev = entries.length > 0 ? entries[0].track : null;
        if (prev) {
          if (track.id && prev.id === track.id) return entries;
          if (!track.id && prev.file_path && prev.file_path === track.file_path) return entries;
        }
        const entry: HistoryEntry = { track, playedAt: new Date().toISOString(), zoneName };
        return [entry, ...entries].slice(0, MAX_ENTRIES);
      });
    },
    clear() {
      set([]);
    },
  };
}

export const playbackHistory = createHistoryStore();

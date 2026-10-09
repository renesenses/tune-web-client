/**
 * tune-server-rust#4969 (Gros Bidon, fil 1929) — un bargraphe PAR CANAL en
 * lecture multicanale, pour voir d'un coup d'œil quels canaux portent du
 * signal : un LFE muet, un « 7.1 » qui n'est qu'un 5.1, un centre absent.
 *
 * Le serveur publie `channel_levels` (et `channel_names` quand l'ordre par
 * défaut FLAC/WAV fait foi) dans `playback.audio_levels`, seulement à partir
 * de trois canaux. Ce module ne fait que lire ces niveaux et les ramener à des
 * hauteurs : 🔴 affichage seulement, rien ici ne touche à l'audio.
 *
 * Les repères (`FL`, `FR`, `FC`, `LFE`…) viennent du serveur et ne se
 * traduisent PAS : ce sont des noms d'instrument, comme L / R / dB.
 */
import type { AudioLevels } from './stores/audioLevels';

/** Bas de l'échelle, en dBFS : en dessous, la barre est vide. */
export const PLANCHER_DB = -60;

/**
 * Sous ce niveau de crête, le canal est déclaré MUET. C'est l'information que
 * cherche le testeur ; −90 dBFS laisse passer le bruit de fond d'un canal
 * réellement utilisé et éteint un canal rempli de zéros (le serveur rend
 * −96 pour un silence numérique).
 */
export const SEUIL_MUET_DB = -90;

export interface BarreDeCanal {
  /** Nom du canal (`FL`, `LFE`…) ou, à défaut, son numéro à partir de 1. */
  nom: string;
  /** Hauteur de la barre RMS, de 0 à 1. */
  hauteur: number;
  /** Position du repère de crête, de 0 à 1. */
  crete: number;
  /** Surcharge constatée par le serveur dans la fenêtre. */
  over: boolean;
  /** Aucun signal sur ce canal dans la fenêtre. */
  muet: boolean;
}

/** dBFS → 0..1 sur l'échelle [PLANCHER_DB, 0]. */
export function hauteurDb(db: number): number {
  if (!Number.isFinite(db)) return 0;
  const h = (db - PLANCHER_DB) / -PLANCHER_DB;
  return Math.min(1, Math.max(0, h));
}

/**
 * Les barres à dessiner pour une trame, ou `[]` quand il n'y a pas lieu d'en
 * dessiner : stéréo, mono, serveur qui ne publie pas les niveaux par canal.
 */
export function barresParCanal(niv: Pick<AudioLevels, 'channel_levels' | 'channel_names'> | null): BarreDeCanal[] {
  const canaux = niv?.channel_levels ?? [];
  if (canaux.length <= 2) return [];
  const noms = niv?.channel_names && niv.channel_names.length === canaux.length ? niv.channel_names : null;
  return canaux.map((c, i) => ({
    nom: noms ? noms[i] : String(i + 1),
    hauteur: hauteurDb(c.rms_db),
    crete: hauteurDb(c.peak_db),
    over: c.over,
    muet: !(c.peak_db > SEUIL_MUET_DB),
  }));
}

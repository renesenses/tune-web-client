/**
 * « Faits rapides » de la page album (Nocturne, itération 7) — les données de
 * Tune seulement :
 *   - écoutes : somme des `play_count` des titres (absent si aucun titre ne
 *     porte le compte : le serveur ne dit rien plutôt qu'un zéro menteur) ;
 *   - dernière écoute : le plus récent `last_played_at` des titres ;
 *   - première écoute : la plus ancienne écoute de l'album dans l'historique.
 *     Historique lu en entier (`items.length >= total`) : la date est exacte.
 *     Historique tronqué (plus de 1 000 écoutes) : la plus ancienne écoute
 *     VUE n'est qu'une borne — la vraie première écoute est ce jour-là ou
 *     avant ; elle s'écrit « au plus tard le … » (itération 8). Album absent
 *     de la partie lue : rien.
 */
import type { Track } from '../../lib/types';

export function ecoutesDesTitres(pistes: readonly Pick<Track, 'play_count'>[]): number | null {
  const avec = pistes.filter((p) => typeof p.play_count === 'number');
  return avec.length ? avec.reduce((n, p) => n + (p.play_count ?? 0), 0) : null;
}

export function derniereEcoute(pistes: readonly Pick<Track, 'last_played_at'>[]): string | null {
  let max: string | null = null;
  for (const p of pistes) {
    const d = p.last_played_at;
    if (d && (!max || Date.parse(d) > Date.parse(max))) max = d;
  }
  return max;
}

export interface PremiereEcoute {
  date: string;
  /** Vrai : historique tronqué, la vraie première écoute est ce jour-là ou avant. */
  auPlusTard: boolean;
}

export function premiereEcoute(
  historique: { items?: { album_id?: number | null; played_at?: string | null }[]; total?: number } | null | undefined,
  albumId: number,
): PremiereEcoute | null {
  const items = historique?.items ?? [];
  let min: string | null = null;
  for (const e of items) {
    if (e?.album_id !== albumId || !e.played_at) continue;
    if (!min || Date.parse(e.played_at) < Date.parse(min)) min = e.played_at;
  }
  if (!min) return null;
  const complet = typeof historique?.total === 'number' && items.length >= historique.total;
  return { date: min, auPlusTard: !complet };
}

/** « 24 bits / 96 kHz », « DSD64 », ou rien pour un format compressé sans résolution. */
export function resolution(a: { sample_rate?: number | null; bit_depth?: number | null; format?: string | null }): string {
  const sr = a.sample_rate ?? 0;
  if (/^ds[df]$/i.test(a.format ?? '') || sr >= 2_822_400) return `DSD${Math.round(sr / 44_100) || ''}`;
  if (!sr) return '';
  const khz = sr % 1000 === 0 ? String(sr / 1000) : (sr / 1000).toFixed(1);
  return a.bit_depth ? `${a.bit_depth} bits / ${khz} kHz` : `${khz} kHz`;
}

/**
 * « Faits rapides » de la page album (Nocturne, itération 7) — les données de
 * Tune seulement :
 *   - écoutes : somme des `play_count` des titres (absent si aucun titre ne
 *     porte le compte : le serveur ne dit rien plutôt qu'un zéro menteur) ;
 *   - dernière écoute : le plus récent `last_played_at` des titres ;
 *   - première écoute : la plus ancienne écoute de l'album dans l'historique,
 *     SEULEMENT si l'historique lu est complet (`items.length >= total`) ; un
 *     historique tronqué donnerait une date fausse : on ne montre rien.
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

export function premiereEcoute(
  historique: { items?: { album_id?: number | null; played_at?: string | null }[]; total?: number } | null | undefined,
  albumId: number,
): string | null {
  const items = historique?.items ?? [];
  if (typeof historique?.total !== 'number' || items.length < historique.total) return null;
  let min: string | null = null;
  for (const e of items) {
    if (e?.album_id !== albumId || !e.played_at) continue;
    if (!min || Date.parse(e.played_at) < Date.parse(min)) min = e.played_at;
  }
  return min;
}

/** « 24 bits / 96 kHz », « DSD64 », ou rien pour un format compressé sans résolution. */
export function resolution(a: { sample_rate?: number | null; bit_depth?: number | null; format?: string | null }): string {
  const sr = a.sample_rate ?? 0;
  if (/^ds[df]$/i.test(a.format ?? '') || sr >= 2_822_400) return `DSD${Math.round(sr / 44_100) || ''}`;
  if (!sr) return '';
  const khz = sr % 1000 === 0 ? String(sr / 1000) : (sr / 1000).toFixed(1);
  return a.bit_depth ? `${a.bit_depth} bits / ${khz} kHz` : `${khz} kHz`;
}

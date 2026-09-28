/** One configured music root holding files for an album (#1684 / server #4907). */
export interface ExemplaireAlbum {
  racine: string;
  format: string | null;
  sample_rate: number | null;
  bit_depth: number | null;
  pistes: number;
  joignable: boolean;
  prefere: boolean;
}

/** Older servers do not send `exemplaires`; unknown roots cannot be selected. */
export function repertoiresDeLecture(album: unknown): ExemplaireAlbum[] {
  const rows = (album as { exemplaires?: unknown } | null)?.exemplaires;
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  return rows.flatMap((row: unknown) => {
    if (!row || typeof row !== 'object') return [];
    const e = row as Record<string, unknown>;
    const root = typeof e.racine === 'string' ? e.racine : '';
    if (!root.trim() || seen.has(root)) return [];
    seen.add(root);
    return [{
      racine: root,
      format: typeof e.format === 'string' ? e.format : null,
      sample_rate: typeof e.sample_rate === 'number' ? e.sample_rate : null,
      bit_depth: typeof e.bit_depth === 'number' ? e.bit_depth : null,
      pistes: typeof e.pistes === 'number' ? e.pistes : 0,
      joignable: e.joignable === true,
      prefere: e.prefere === true,
    }];
  });
}

export function qualiteDuRepertoire(e: ExemplaireAlbum): string {
  const format = e.format?.toUpperCase();
  const rate = e.sample_rate ? `${Math.round(e.sample_rate / 100) / 10} kHz` : null;
  const depth = e.bit_depth ? `${e.bit_depth}-bit` : null;
  return [format, rate, depth].filter(Boolean).join(' · ');
}

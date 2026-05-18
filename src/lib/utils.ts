/** Format milliseconds as m:ss */
export function formatTime(ms: number | undefined | null): string {
  if (!ms || ms < 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Format milliseconds as total duration string (e.g., "1h 23min") */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

/** Format a number with locale separators */
export function formatNumber(n: number): string {
  return n.toLocaleString('fr-FR');
}

/** Format album year, showing original year when it differs from release year */
export function formatAlbumYear(album: { year?: number | null; original_year?: number | null; release_date?: string | null; original_date?: string | null }): string {
  const rd = album.release_date;
  const od = album.original_date;
  if (rd || od) {
    const fmt = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    if (od && rd && od !== rd) return `${fmt(od)} (rééd. ${fmt(rd)})`;
    return fmt((od || rd)!);
  }
  const y = album.year;
  const oy = album.original_year;
  if (oy && y && oy !== y) return `${oy} (rééd. ${y})`;
  return String(oy || y || '');
}

/** Format audio badge (e.g. "FLAC / 96 kHz / 24-bit") */
export function formatAudioBadge(
  track: {
    format?: string | null;
    sample_rate?: number | null;
    bit_depth?: number | null;
  } | null | undefined,
): string {
  if (!track) return '';
  const parts: string[] = [];
  if (track.format) parts.push(String(track.format).toUpperCase());
  if (track.sample_rate) parts.push(`${(track.sample_rate / 1000).toFixed(track.sample_rate % 1000 === 0 ? 0 : 1)} kHz`);
  if (track.bit_depth) parts.push(`${track.bit_depth}-bit`);
  return parts.join(' / ');
}

// --- Streaming quality tier helpers ---

export type QualityTier = 'mqa' | 'hires' | 'cd' | 'lossy';

const LOSSLESS_FORMATS = new Set(['flac', 'wav', 'alac', 'aiff', 'dsd']);

/** Determine the quality tier for a track */
export function getQualityTier(
  track: {
    format?: string | null;
    sample_rate?: number | null;
    bit_depth?: number | null;
  } | null | undefined,
): QualityTier {
  if (!track) return 'lossy';
  const fmt = (track.format ?? '').toLowerCase();
  const sr = track.sample_rate ?? 0;
  const bd = track.bit_depth ?? 0;

  // MQA is identifiable by format string
  if (fmt === 'mqa' || fmt.includes('mqa')) return 'mqa';

  // DSD is always hi-res
  if (fmt === 'dsd') return 'hires';

  // Hi-Res: lossless format AND (sample rate > 44100 OR bit depth > 16)
  if (LOSSLESS_FORMATS.has(fmt) && (sr > 44100 || bd > 16)) return 'hires';

  // CD quality: lossless format at 44.1kHz/16-bit (or lower sample rate lossless)
  if (LOSSLESS_FORMATS.has(fmt)) return 'cd';

  // Everything else (MP3, AAC, OGG, Opus, WMA, unknown) is lossy
  return 'lossy';
}

/** Get tier display label */
export function getQualityTierLabel(tier: QualityTier): string {
  switch (tier) {
    case 'mqa': return 'MQA';
    case 'hires': return 'Hi-Res';
    case 'cd': return 'CD';
    case 'lossy': return 'Lossy';
  }
}

/** CSS color class suffix for quality tier */
export function getQualityTierColor(tier: QualityTier): string {
  switch (tier) {
    case 'mqa':
    case 'hires': return 'gold';
    case 'cd': return 'silver';
    case 'lossy': return 'gray';
  }
}

const SOURCE_LABELS: Record<string, string> = {
  tidal: 'Tidal',
  qobuz: 'Qobuz',
  spotify: 'Spotify',
  deezer: 'Deezer',
  amazon: 'Amazon',
  youtube: 'YouTube',
  local: 'Local',
  radio: 'Radio',
};

/** Build the source + quality label, e.g. "Tidal Hi-Res", "Qobuz 24/96", "Local FLAC" */
export function formatQualitySource(
  track: {
    format?: string | null;
    sample_rate?: number | null;
    bit_depth?: number | null;
    source?: string | null;
  } | null | undefined,
): string {
  if (!track) return '';
  const tier = getQualityTier(track);
  const source = SOURCE_LABELS[(track.source ?? '').toLowerCase()] ?? '';
  const fmt = (track.format ?? '').toUpperCase();
  const sr = track.sample_rate ?? 0;
  const bd = track.bit_depth ?? 0;

  // Build detail portion
  let detail = '';
  if (tier === 'mqa') {
    detail = 'MQA';
  } else if (tier === 'hires' && sr > 0 && bd > 0) {
    detail = `${bd}/${sr >= 1000 ? (sr / 1000).toFixed(sr % 1000 === 0 ? 0 : 1) : sr}`;
  } else if (tier === 'cd') {
    detail = fmt || 'CD';
  } else {
    detail = fmt || 'Lossy';
  }

  return source ? `${source} ${detail}` : detail;
}

/** Compact badge for mini player: "FLAC 96/24" */
export function formatCompactQuality(
  track: {
    format?: string | null;
    sample_rate?: number | null;
    bit_depth?: number | null;
  } | null | undefined,
): string {
  if (!track) return '';
  const fmt = (track.format ?? '').toUpperCase();
  const sr = track.sample_rate ?? 0;
  const bd = track.bit_depth ?? 0;

  if (!fmt && !sr && !bd) return '';

  if (sr > 0 && bd > 0) {
    const srK = sr >= 1000 ? (sr / 1000).toFixed(sr % 1000 === 0 ? 0 : 1) : String(sr);
    return `${fmt} ${srK}/${bd}`;
  }
  return fmt;
}

/** Full tooltip text for signal path detail */
export function formatQualityTooltip(
  track: {
    format?: string | null;
    sample_rate?: number | null;
    bit_depth?: number | null;
    source?: string | null;
  } | null | undefined,
): string {
  if (!track) return '';
  const tier = getQualityTier(track);
  const tierLabel = getQualityTierLabel(tier);
  const source = SOURCE_LABELS[(track.source ?? '').toLowerCase()] ?? 'Unknown';
  const fmt = (track.format ?? '').toUpperCase() || '?';
  const sr = track.sample_rate ?? 0;
  const bd = track.bit_depth ?? 0;

  const lines: string[] = [];
  lines.push(`Quality: ${tierLabel}`);
  lines.push(`Source: ${source}`);
  lines.push(`Format: ${fmt}`);
  if (sr > 0) lines.push(`Sample rate: ${(sr / 1000).toFixed(sr % 1000 === 0 ? 0 : 1)} kHz`);
  if (bd > 0) lines.push(`Bit depth: ${bd}-bit`);
  return lines.join('\n');
}

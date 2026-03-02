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

/** Format audio badge (e.g. "FLAC / 96 kHz / 24-bit") */
export function formatAudioBadge(track: { format?: string; sample_rate?: number; bit_depth?: number }): string {
  const parts: string[] = [];
  if (track.format) parts.push(track.format.toUpperCase());
  if (track.sample_rate) parts.push(`${(track.sample_rate / 1000).toFixed(track.sample_rate % 1000 === 0 ? 0 : 1)} kHz`);
  if (track.bit_depth) parts.push(`${track.bit_depth}-bit`);
  return parts.join(' / ');
}

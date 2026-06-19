<script lang="ts">
  import { formatTime } from '../lib/utils';
  import type { Track } from '../lib/types';

  interface Props {
    track: Track | Record<string, any>;
    fields: string[];
  }
  let { track, fields }: Props = $props();

  const FORMATTERS: Record<string, (track: Record<string, any>) => string | null> = {
    format: t => t.format ? String(t.format).toUpperCase() : null,
    sample_rate: t => t.sample_rate ? `${Math.round(t.sample_rate / 100) / 10}kHz` : null,
    bit_depth: t => t.bit_depth ? `${t.bit_depth}bit` : null,
    channels: t => t.channels ? `${t.channels}ch` : null,
    duration: t => t.duration_ms ? formatTime(t.duration_ms) : null,
    duration_ms: t => t.duration_ms ? formatTime(t.duration_ms) : null,
    file_size: t => t.file_size ? `${(t.file_size / 1048576).toFixed(1)} MB` : null,
    file_path: t => {
      if (!t.file_path) return null;
      const parts = String(t.file_path).split(/[\\/]/);
      return parts[parts.length - 1] ?? t.file_path;
    },
    disc_number: t => t.disc_number ? `Disc ${t.disc_number}` : null,
    track_number: t => t.track_number ? `#${t.track_number}` : null,
    bpm: t => t.bpm ? `${t.bpm} BPM` : null,
  };

  function buildChips(track: Record<string, any>, fields: string[]): string[] {
    const chips: string[] = [];
    const hasSampleRate = fields.includes('sample_rate') && track.sample_rate;
    const hasBitDepth = fields.includes('bit_depth') && track.bit_depth;

    for (const field of fields) {
      if (field === 'sample_rate' && hasBitDepth) continue;
      if (field === 'bit_depth' && hasSampleRate) continue;

      const formatter = FORMATTERS[field];
      if (formatter) {
        const val = formatter(track);
        if (val) chips.push(val);
      } else {
        const val = track[field];
        if (val != null && val !== '' && val !== 0) chips.push(String(val));
      }
    }

    if (hasSampleRate && hasBitDepth) {
      const khz = Math.round(track.sample_rate / 100) / 10;
      const combined = `${khz}kHz/${track.bit_depth}bit`;
      const fmtIdx = chips.findIndex(c => c === String(track.format).toUpperCase());
      if (fmtIdx >= 0) {
        chips.splice(fmtIdx + 1, 0, combined);
      } else {
        chips.unshift(combined);
      }
    }

    return chips;
  }

  let chips = $derived(buildChips(track as Record<string, any>, fields));
</script>

{#if chips.length > 0}
  <div class="metadata-chips">
    {#each chips as chip, i}
      {#if i > 0}<span class="sep">·</span>{/if}
      <span class="chip">{chip}</span>
    {/each}
  </div>
{/if}

<style>
  .metadata-chips {
    display: flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
    max-width: 100%;
  }

  .chip {
    flex-shrink: 0;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sep {
    flex-shrink: 0;
    opacity: 0.5;
  }
</style>

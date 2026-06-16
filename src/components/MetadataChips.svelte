<script lang="ts">
  import { formatTime } from '../lib/utils';
  import type { Track } from '../lib/types';

  interface Props {
    track: Track | Record<string, any>;
    fields: string[];
  }
  let { track, fields }: Props = $props();

  function buildChips(track: Record<string, any>, fields: string[]): string[] {
    const chips: string[] = [];
    const hasSampleRate = fields.includes('sample_rate') && track.sample_rate;
    const hasBitDepth = fields.includes('bit_depth') && track.bit_depth;

    for (const field of fields) {
      if (field === 'sample_rate' && hasBitDepth) continue; // merged below
      if (field === 'bit_depth' && hasSampleRate) continue; // merged below

      if (field === 'sample_rate' && !hasBitDepth && track.sample_rate) {
        const khz = Math.round(track.sample_rate / 100) / 10;
        chips.push(`${khz}kHz`);
      } else if (field === 'bit_depth' && !hasSampleRate && track.bit_depth) {
        chips.push(`${track.bit_depth}bit`);
      } else if (field === 'sample_rate' && hasBitDepth) {
        // combined — but this branch won't be reached due to continue above
      } else if (field === 'format' && track.format) {
        chips.push(String(track.format).toUpperCase());
      } else if (field === 'genre' && track.genre) {
        chips.push(String(track.genre));
      } else if (field === 'year' && track.year) {
        chips.push(String(track.year));
      } else if (field === 'label' && track.label) {
        chips.push(String(track.label));
      } else if (field === 'composer' && track.composer) {
        chips.push(String(track.composer));
      } else if (field === 'duration' && track.duration_ms) {
        chips.push(formatTime(track.duration_ms));
      } else if (field === 'source' && track.source) {
        chips.push(String(track.source));
      } else if (field === 'file_path' && track.file_path) {
        const parts = String(track.file_path).split(/[\\/]/);
        chips.push(parts[parts.length - 1] ?? track.file_path);
      }
    }

    // Insert combined sample_rate/bit_depth chip after format (or at start)
    if (hasSampleRate && hasBitDepth) {
      const khz = Math.round(track.sample_rate / 100) / 10;
      const combined = `${khz}kHz/${track.bit_depth}bit`;
      // Insert after format chip if present, else prepend
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

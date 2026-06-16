<script lang="ts">
  import { getQualityTier, getQualityTierLabel, getQualityTierColor, formatCompactQuality, formatQualityTooltip } from '../lib/utils';

  interface Props {
    format?: string | null;
    sampleRate?: number | null;
    bitDepth?: number | null;
    source?: string | null;
  }
  let { format = null, sampleRate = null, bitDepth = null, source = null }: Props = $props();

  let trackLike = $derived({ format, sample_rate: sampleRate, bit_depth: bitDepth, source });
  let tier = $derived(getQualityTier(trackLike));
  let label = $derived(formatCompactQuality(trackLike));
  let tooltip = $derived(formatQualityTooltip(trackLike));
  let colorClass = $derived(getQualityTierColor(tier));
  let tierLabel = $derived(getQualityTierLabel(tier));
  let hasData = $derived(!!(format || sampleRate || bitDepth));
</script>

{#if hasData && label}
  <span class="quality-badge tier-{colorClass}" title={tooltip}>
    <span class="qb-tier">{tierLabel}</span>
    {#if tier === 'hires_max'}
      <span class="qb-star">✦</span>
    {/if}
    <span class="qb-detail">{label}</span>
  </span>
{/if}

<style>
  .quality-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-label, system-ui);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.4px;
    padding: 2px 7px;
    border-radius: 3px;
    text-transform: uppercase;
    white-space: nowrap;
    flex-shrink: 0;
    line-height: 1.4;
  }

  .qb-tier {
    font-weight: 800;
    letter-spacing: 0.6px;
  }

  .qb-star {
    font-size: 8px;
    line-height: 1;
  }

  .qb-detail {
    font-weight: 500;
    opacity: 0.9;
  }

  /* Gold-Max tier (Hi-Res Max ≥ 176.4 kHz / MQA) */
  .quality-badge.tier-gold-max {
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.4);
  }
  .quality-badge.tier-gold-max .qb-tier {
    color: #fbbf24;
  }
  .quality-badge.tier-gold-max .qb-star {
    color: #fcd34d;
  }

  /* Gold tier (Hi-Res 88.2–96 kHz) */
  .quality-badge.tier-gold {
    color: #a78bfa;
    background: rgba(167, 139, 250, 0.12);
    border: 1px solid rgba(167, 139, 250, 0.3);
  }
  .quality-badge.tier-gold .qb-tier {
    color: #c4b5fd;
  }

  /* Blue tier (CD quality / lossless ≤ 48 kHz) */
  .quality-badge.tier-blue {
    color: #60a5fa;
    background: rgba(96, 165, 250, 0.1);
    border: 1px solid rgba(96, 165, 250, 0.25);
  }

  /* Green tier (DSD) */
  .quality-badge.tier-green {
    color: #34d399;
    background: rgba(52, 211, 153, 0.1);
    border: 1px solid rgba(52, 211, 153, 0.3);
  }
  .quality-badge.tier-green .qb-tier {
    color: #6ee7b7;
  }

  /* Gray tier (Lossy) */
  .quality-badge.tier-gray {
    color: #f87171;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.2);
  }
</style>

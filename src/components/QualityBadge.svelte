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
    {#if tier === 'hires' || tier === 'mqa'}
      <span class="qb-tier">{tierLabel}</span>
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

  .qb-detail {
    font-weight: 500;
    opacity: 0.9;
  }

  /* Gold tier (MQA / Hi-Res) */
  .quality-badge.tier-gold {
    color: #fbbf24;
    background: rgba(251, 191, 36, 0.12);
    border: 1px solid rgba(251, 191, 36, 0.3);
  }
  .quality-badge.tier-gold .qb-tier {
    color: #fcd34d;
  }

  /* Silver tier (CD quality) */
  .quality-badge.tier-silver {
    color: #93c5fd;
    background: rgba(147, 197, 253, 0.1);
    border: 1px solid rgba(147, 197, 253, 0.25);
  }

  /* Gray tier (Lossy) */
  .quality-badge.tier-gray {
    color: #9ca3af;
    background: rgba(156, 163, 175, 0.08);
    border: 1px solid rgba(156, 163, 175, 0.2);
  }
</style>

<script lang="ts">
  /**
   * Badge de qualité Nocturne : le PALIER (CD, Hi-Res, DSD…) tel que le
   * calcule `getQualityTier` — la même règle que partout dans Tune — suivi,
   * en mode `complet`, de la résolution (« 24/96 »).
   */
  import { getQualityTier, getQualityTierLabel } from '../../lib/utils';

  interface Props {
    format?: string | null;
    sample_rate?: number | null;
    bit_depth?: number | null;
    source?: string | null;
    /** Palier + résolution ; sinon la résolution seule, en petit (lignes de pistes). */
    complet?: boolean;
  }
  let { format = null, sample_rate = null, bit_depth = null, source = null, complet = false }: Props = $props();

  const palier = $derived(getQualityTier({ format, sample_rate, bit_depth, source }));
  const libelle = $derived(getQualityTierLabel(palier));
  const kHz = $derived(sample_rate ? sample_rate / 1000 : 0);
  /** Court (« 16/44 ») dans les lignes, long (« 16-bit / 44.1kHz ») en en-tête. */
  const resolution = $derived.by(() => {
    if (!sample_rate || !bit_depth) return (format ?? '').toUpperCase();
    return complet
      ? `${bit_depth}-bit / ${Number.isInteger(kHz) ? kHz : kHz.toFixed(1)}kHz`
      : `${bit_depth}/${Math.floor(kHz)}`;
  });
</script>

{#if complet}
  <span class="noc-qualite">
    {#if libelle}<span class="noc-qualite-palier" data-palier={palier}>{libelle}</span>{/if}
    {#if resolution}<span class="noc-qualite-reso">{resolution}</span>{/if}
  </span>
{:else if resolution}
  <span class="noc-qualite-palier noc-qualite-mini" data-palier={palier}>{resolution}</span>
{/if}

<style>
  .noc-qualite {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: var(--noc-taille-petit);
    color: var(--noc-texte-2);
  }
  .noc-qualite-palier {
    display: inline-block;
    padding: 2px 6px;
    border-radius: var(--noc-rayon-petit);
    border: 1px solid var(--noc-badge-bord);
    background: var(--noc-badge-fond);
    color: var(--noc-badge-texte);
    font-size: var(--noc-taille-badge);
    font-weight: var(--noc-graisse-forte);
    letter-spacing: 0.03em;
    line-height: 1.35;
    white-space: nowrap;
  }
  .noc-qualite-palier[data-palier='hires'],
  .noc-qualite-palier[data-palier='hires_max'],
  .noc-qualite-palier[data-palier='mqa'] {
    border-color: var(--noc-badge-hires);
    color: var(--noc-badge-hires);
  }
  .noc-qualite-palier[data-palier='dsd'] {
    border-color: var(--noc-badge-dsd);
    color: var(--noc-badge-dsd);
  }
  .noc-qualite-mini { font-size: var(--noc-taille-badge-mini); padding: 2px 6px; }
  .noc-qualite-reso { font-variant-numeric: tabular-nums; }
</style>

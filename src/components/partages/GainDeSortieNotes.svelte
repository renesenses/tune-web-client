<script lang="ts">
  /**
   * Ce que devient le gain en sortie (tune-server-rust#4384), sous les étapes
   * du chemin du signal : gain appliqué et rabot à l'unité sur une sortie
   * locale, piste sans gain ReplayGain (préampli non appliqué), gain cuit
   * dans le flux d'un rendu réseau.
   *
   * Chaque ligne se garde par la présence de son champ serveur : rien de
   * neuf face à un serveur qui ne les publie pas.
   */
  import { t } from '../../lib/i18n';
  import {
    gainDeSortieCourant,
    libelleGainApplique,
    libelleRabot,
    libelleSansGainTague,
    libelleGainDansLeFlux,
  } from '../../lib/gainDeSortie';
  import type { SignalPath } from '../../lib/types';

  let { signalPath }: { signalPath: SignalPath | null | undefined } = $props();

  let applique = $derived($gainDeSortieCourant ? libelleGainApplique($gainDeSortieCourant, $t as any) : null);
  let rabot = $derived(libelleRabot($gainDeSortieCourant, $t as any));
  let sansTag = $derived(libelleSansGainTague(signalPath, $t as any));
  let flux = $derived(libelleGainDansLeFlux(signalPath, $t as any));
</script>

{#if applique || sansTag || flux}
  <div class="gds" role="status">
    {#if applique}
      <p class="gds-ligne gds-applique">{applique}</p>
    {/if}
    {#if rabot}
      <p class="gds-ligne gds-rabot">{rabot}</p>
    {/if}
    {#if sansTag}
      <p class="gds-ligne gds-sans-tag">{sansTag}</p>
    {/if}
    {#if flux}
      <p class="gds-ligne gds-flux">{flux}</p>
    {/if}
  </div>
{/if}

<style>
  .gds {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--tune-border);
  }
  .gds-ligne {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--tune-text-secondary, var(--tune-text));
  }
  .gds-rabot { color: var(--tune-text); }
</style>

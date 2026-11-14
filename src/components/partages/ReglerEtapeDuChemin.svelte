<script lang="ts">
  /**
   * Chemin du signal → réglages (rc12) : sous une étape qui a un écran de
   * réglage, le bouton qui l'ouvre. Rien pour une étape sans réglage ou d'un
   * genre inconnu : elle reste du texte. La correspondance étape → écran vit
   * dans `lib/reglagesDuCheminDuSignal` ; ce composant ne fait que l'afficher.
   */
  import { t } from '../../lib/i18n';
  import {
    cibleDeLEtape,
    etapeInactive,
    ouvrirReglageDeLEtape,
    type OrigineChemin,
  } from '../../lib/reglagesDuCheminDuSignal';
  import type { SignalPathStep } from '../../lib/types';

  let {
    etape,
    zoneId,
    nom,
    origine,
    onouvrir,
  }: {
    etape: SignalPathStep;
    zoneId: number | null | undefined;
    /** Le nom affiché de l'étape, pour « Régler <traitement> ». */
    nom: string;
    origine: OrigineChemin;
    /** Ferme le panneau du chemin du signal avant la navigation. */
    onouvrir?: () => void;
  } = $props();

  const cible = $derived(cibleDeLEtape(etape as any, zoneId));
  const inactive = $derived(etapeInactive(etape as any));

  function ouvrir(e: Event) {
    e.stopPropagation();
    if (!cible) return;
    onouvrir?.();
    ouvrirReglageDeLEtape(cible, origine);
  }
</script>

{#if cible}
  <button
    type="button"
    class="sp-regler"
    aria-label={$t('signal.adjustStep' as any).replace('{name}', nom)}
    onclick={ouvrir}
  >
    <span>{inactive ? $t('signal.adjustDisabled' as any) : $t('signal.adjust' as any)}</span>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
  </button>
{/if}

<style>
  .sp-regler {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-top: 2px;
    padding: 2px 6px 2px 0;
    border: 0;
    background: none;
    color: var(--tune-accent);
    font: inherit;
    font-size: calc(12px * var(--v2-txt-echelle, 1));
    cursor: pointer;
    border-radius: 4px;
  }
  .sp-regler:hover { text-decoration: underline; }
  .sp-regler:focus-visible { outline: 2px solid var(--tune-accent); outline-offset: 2px; }
</style>

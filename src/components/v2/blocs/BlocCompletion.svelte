<script lang="ts">
  /**
   * LE TAUX D'ÉCOUTE COMPLÈTE — ce qu'on a écouté jusqu'au bout, et ce qu'on
   * a passé.
   *
   * « Les chiffres avant les axes » : le POURCENTAGE d'abord, en grand, parce
   * que c'est la question posée ; la barre et sa légende ensuite, pour le
   * détail.
   *
   * 🔴 SEULE HARMONISATION DE STYLE DE TOUT LE LOT, et elle est demandée.
   *
   * L'ancien rendu employait deux couleurs ÉCRITES EN DUR — `#10b981` vert et
   * `#f59e0b` ambre (`DashboardView.svelte:874-875`). C'était le seul endroit
   * multicolore du tableau de bord, et le seul qui ignorait les variables de
   * thème : la coquille v2 porte cinq thèmes dont un CLAIR, et deux hex figés
   * y sont faux dans quatre cas sur cinq. La consigne du 25/09 — « une seule
   * couleur d'accent porte l'information, l'intensité dit la valeur, la teinte
   * ne change pas » — tranche : c'est le même accent, plein pour ce qui est
   * allé au bout, effacé pour ce qui a été passé.
   *
   * Rien d'autre n'a été redessiné dans les onze blocs.
   */
  import { t } from '../../../lib/i18n';

  export interface MatiereCompletion {
    completes: number;
    passes: number;
  }

  let { donnees }: { donnees: MatiereCompletion | null } = $props();

  const total = $derived((donnees?.completes ?? 0) + (donnees?.passes ?? 0));
  const part = $derived(total ? Math.round(((donnees?.completes ?? 0) / total) * 100) : 0);
</script>

{#if !total}
  <p class="rien">{$t('dashboard.empty' as any)}</p>
{:else}
  <div class="tete">
    <div class="grand">{part}%</div>
    <span class="quoi">{$t('dashboard.completion.completed' as any)}</span>
  </div>
  <div class="barre">
    <span class="fini" style:width="{part}%"></span>
    <span class="passe" style:width="{100 - part}%"></span>
  </div>
  <div class="legende">
    <span><span class="pois plein"></span>{$t('dashboard.completion.completed' as any)} · {donnees?.completes ?? 0}</span>
    <span><span class="pois efface"></span>{$t('dashboard.completion.skipped' as any)} · {donnees?.passes ?? 0}</span>
  </div>
{/if}

<style>
  .rien { margin: 0; padding: 22px 30px; color: var(--v2-txt3); font: 400 14px var(--v2-sans); }

  .tete { display: flex; align-items: baseline; gap: 12px; padding: 0 30px 12px; }
  .grand {
    font: 700 36px/1 var(--v2-sans); letter-spacing: -1.2px;
    color: var(--v2-acc1); font-variant-numeric: tabular-nums;
  }
  .quoi { font: 600 13px var(--v2-sans); color: var(--v2-txt2); }

  .barre { display: flex; height: 13px; margin: 0 30px; border-radius: 7px; overflow: hidden; }
  .fini { background: var(--v2-acc1); }
  .passe { background: color-mix(in srgb, var(--v2-acc1) 18%, transparent); }

  .legende { display: flex; flex-wrap: wrap; gap: 20px; padding: 11px 30px 0;
    font: 400 12px var(--v2-sans); color: var(--v2-txt2); }
  .pois { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
  .pois.plein { background: var(--v2-acc1); }
  .pois.efface { background: color-mix(in srgb, var(--v2-acc1) 30%, transparent); }

  @media (max-width: 1024px) {
    .tete, .legende { padding-left: 22px; padding-right: 22px; }
    .barre { margin-left: 22px; margin-right: 22px; }
  }
  @media (max-width: 640px) {
    .tete, .legende { padding-left: 16px; padding-right: 16px; }
    .barre { margin-left: 16px; margin-right: 16px; }
    .grand { font-size: 28px; }
  }
</style>

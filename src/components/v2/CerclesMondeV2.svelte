<script lang="ts">
  // Tune Circle rc13 — tous les cercles du monde, en anneaux anonymes sur le
  // globe (décisions du 20/11/2026). Ici, la légende : l'interrupteur, ce que
  // montrent les anneaux, combien de lieux. Aucun nom, aucun identifiant.
  // Liste vide : une phrase le dit.
  import { t, locale } from '../../lib/i18n';
  import type { PointCercles } from '../../lib/cerclesMonde';
  let { points, afficher, onAfficher }: {
    points: PointCercles[]; afficher: boolean; onAfficher: (v: boolean) => void;
  } = $props();
  const compte = $derived($t('v2.circle.worldCircles.count' as any).replace('{n}', new Intl.NumberFormat($locale).format(points.length)));
</script>

<section class="cercles-monde" aria-label={$t('v2.circle.worldCircles.title' as any)}>
  <p class="titre">{$t('v2.circle.worldCircles.title' as any)}</p>
  {#if !points.length}
    <p class="note cercles-vide">{$t('v2.circle.worldCircles.empty' as any)}</p>
  {:else}
    <button type="button" class="lnk cercles-interrupteur" role="switch" aria-checked={afficher}
      onclick={() => onAfficher(!afficher)}>{$t('v2.circle.worldCircles.show' as any)}</button>
    <p class="note">{$t('v2.circle.worldCircles.legend' as any)}</p>
    <p class="note cercles-compte">{compte}</p>
  {/if}
</section>

<style>
  .cercles-monde{margin-top:8px;padding:12px;border:1px solid var(--v2-line);border-radius:var(--v2-r-md);background:var(--v2-surface2);color:var(--v2-txt);
    font-family:var(--v2-sans);font-size:calc(13px * var(--v2-txt-echelle, 1))}
  .titre{margin:0 0 4px;font-weight:600}
  .lnk{border:0;background:transparent;padding:4px 0;cursor:pointer;color:var(--v2-acc-tint);font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .note{margin:8px 0 4px;font-size:calc(11.5px * var(--v2-txt-echelle, 1));color:var(--v2-txt3)}
  .cercles-interrupteur[aria-checked='true']{color:var(--v2-acc2)}
  .cercles-interrupteur:focus-visible{outline:2px solid var(--v2-acc2);outline-offset:3px}
</style>

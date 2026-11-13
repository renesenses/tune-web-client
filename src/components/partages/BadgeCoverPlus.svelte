<script lang="ts">
  /**
   * « Cover+ » (tune-server-rust#8452, proposition de Rémi) : la pochette
   * affichée a été retrouvée par Tune d'après le titre en cours de la
   * webradio (ICY, puis iTunes), la station n'en publiant pas. Même forme que
   * le badge « Metadata+ », à côté duquel il se pose.
   */
  import { t } from '../../lib/i18n';
</script>

<span class="cvp" data-cover-plus title={$t('v2.radio.coverPlusTip' as any)}>{$t('v2.radio.coverPlus' as any)}</span>

<style>
  .cvp{display:inline-block; flex:none; padding:1px 6px; border-radius:var(--v2-r-pill, 999px);
    border:1px solid var(--v2-acc1, currentColor); color:var(--v2-acc1, currentColor);
    font:700 calc(9.5px * var(--v2-txt-echelle, 1))/1.5 var(--v2-mono, monospace); letter-spacing:.02em; white-space:nowrap; vertical-align:middle}
</style>

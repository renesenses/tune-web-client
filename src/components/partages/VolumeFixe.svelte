<script lang="ts">
  /**
   * web#2809 — ce qui remplace le curseur de volume d'une zone en VOLUME FIXE :
   * une mention discrète, non cliquable. Le volume se change dans les
   * réglages de la zone (bulle d'aide).
   */
  import { t } from '../../lib/i18n';
</script>

<span class="volume-fixe" data-testid="volume-fixe" title={$t('volume.fixedHint')}>{$t('volume.fixed')}</span>

<style>
  .volume-fixe {
    font-size: calc(11px * var(--v2-txt-echelle, 1));
    letter-spacing: 0.02em;
    color: var(--tune-text-muted);
    white-space: nowrap;
    user-select: none;
  }
</style>

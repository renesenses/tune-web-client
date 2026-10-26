<script lang="ts">
  /**
   * Le champ de recherche d'une station — LE MÊME sur « Mes radios » et sur
   * « Annuaire », au même endroit (rapport de Rémi, RC7, #2397).
   */
  import { t } from '../../lib/i18n';
  let { valeur = $bindable('') }: { valeur?: string } = $props();
</script>

<div class="v2-rech">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
  <input placeholder={$t('v2.radio.searchPlaceholder' as any)} bind:value={valeur} />
  {#if valeur}
    <button class="clr" onclick={() => (valeur = '')} aria-label={$t('v2.radio.dir.clear' as any)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  {/if}
</div>

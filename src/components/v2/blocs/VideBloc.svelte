<script lang="ts">
  /**
   * L'ÉTAT VIDE D'UN BLOC du Tableau de bord — maquette « My listening » de
   * Levente (rc12) : une icône en filigrane, centrée, et la phrase qui nomme
   * la période lue. Le texte vient de l'appelant (déjà traduit) ; l'icône est
   * le contenu d'un `<svg>` 24 × 24 à trait `currentColor`.
   */
  let { message, icone = '' }: { message: string; icone?: string } = $props();
</script>

<div class="vide">
  {#if icone}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html icone}</svg>
  {/if}
  <p class="rien">{message}</p>
</div>

<style>
  .vide {
    flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 12px; padding: 14px var(--bloc-marge, 30px) 6px; text-align: center; min-height: 0;
  }
  svg { width: 52px; height: 52px; color: var(--v2-txt3); opacity: 0.45; }
  .rien { margin: 0; max-width: 24ch; color: var(--v2-txt3); font: 400 calc(13.5px * var(--v2-txt-echelle, 1))/1.4 var(--v2-sans); }
</style>

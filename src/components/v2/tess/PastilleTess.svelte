<script lang="ts">
  /**
   * La pastille « TESS » de la barre de lecture (maquettes A1 et A5).
   * Absente tant que le serveur n'annonce pas TESS (`capaciteTess`).
   * Un geste : ouvrir l'écran TESS. Le chemin du signal détaillé depuis la
   * barre (maquette A4) est le lot W5.
   */
  import { t } from '../../../lib/i18n';
  import { capaciteTess } from '../../../lib/stores/tess';
  import { activeView } from '../../../lib/stores/navigation';
  import IconeTess from './IconeTess.svelte';
</script>

{#if $capaciteTess === 'oui'}
  <button
    class="pastille-tess"
    class:active={$activeView === 'tess'}
    data-pastille-tess
    onclick={() => activeView.set('tess')}
    title={$t('tess.open' as any)}
    aria-label={$t('tess.open' as any)}
  >
    <IconeTess taille={16} />
    <span>{$t('v2.nav.tess' as any)}</span>
  </button>
{/if}

<style>
  .pastille-tess{display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 12px;
    border-radius:var(--v2-r-pill, 999px); border:1px solid var(--v2-line2, rgba(255,255,255,.12));
    background:var(--v2-surface2, transparent); color:var(--v2-acc1, currentColor); cursor:pointer;
    font:700 12px var(--v2-sans, inherit); letter-spacing:.04em; flex:0 0 auto}
  .pastille-tess span{color:var(--v2-txt, currentColor)}
  .pastille-tess:hover, .pastille-tess.active{border-color:var(--v2-acc2, currentColor)}
</style>

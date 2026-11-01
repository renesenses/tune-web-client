<script lang="ts">
  /**
   * Le panneau qui monte du bas (maquette A2/A3) : la file d'attente ou les
   * zones, par-dessus l'écran courant. Un fond assombri, une poignée, un
   * titre ; Échap ou un clic sur le fond le referme.
   *
   * La FILE est `QueueV2`, l'écran de la coquille, monté tel quel : réordonner,
   * retirer, vider, enregistrer en playlist — rien n'est recopié.
   */
  import QueueV2 from '../QueueV2.svelte';
  import ZonesMini from './ZonesMini.svelte';
  import { feuilleMini } from '../../../lib/vueMini';
  import { t } from '../../../lib/i18n';

  function fermer() { feuilleMini.set(null); }
  function clavier(e: KeyboardEvent) {
    if (e.key === 'Escape' && $feuilleMini) { e.stopPropagation(); fermer(); }
  }
</script>

<svelte:window onkeydown={clavier} />

{#if $feuilleMini}
  <div class="fond" role="presentation" onclick={fermer} data-fond-feuille></div>
  <div class="feuille" role="dialog" aria-modal="true"
    aria-label={$feuilleMini === 'file' ? $t('nav.queue' as any) : $t('nav.zonemanager' as any)}
    data-feuille-mini={$feuilleMini}>
    <button class="poignee" onclick={fermer} aria-label={$t('common.close' as any)}><span></span></button>
    {#if $feuilleMini === 'file'}
      <div class="corps file"><QueueV2 /></div>
    {:else}
      <h3>{$t('nav.zonemanager' as any)}</h3>
      <div class="corps"><ZonesMini /></div>
    {/if}
  </div>
{/if}

<style>
  .fond{position:absolute; inset:0; z-index:90; background:var(--v2-scrim)}
  .feuille{position:absolute; left:0; right:0; bottom:0; z-index:91; max-height:86%; display:flex; flex-direction:column;
    background:var(--v2-surface2); border-top:1px solid var(--v2-line2); border-radius:16px 16px 0 0;
    box-shadow:var(--v2-sh-lg); font-family:var(--v2-sans); color:var(--v2-txt)}
  .poignee{flex:0 0 22px; display:grid; place-items:center; border:0; background:none; cursor:pointer}
  .poignee span{display:block; width:38px; height:4px; border-radius:2px; background:var(--v2-line2)}
  h3{font-size:15px; font-weight:700; padding:2px 14px 8px}
  .corps{flex:1; min-height:0; overflow:auto}
  /* `QueueV2` est un écran : il réserve la gouttière de la grappe et prend toute
     la hauteur. Dans le panneau, il prend la hauteur du panneau. */
  .corps.file{display:flex; flex-direction:column; height:70vh; --v2-grappe-w:0px}
</style>

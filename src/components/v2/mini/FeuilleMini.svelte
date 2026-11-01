<script lang="ts">
  /**
   * Le panneau qui monte du bas (maquette A2/A3) : la file d'attente ou les
   * zones, par-dessus l'écran courant. Un fond assombri, une poignée, un
   * titre ; Échap ou un clic sur le fond le referme.
   *
   * La FILE est `FileMini`, écrite pour 360 px. Le premier essai montait
   * `QueueV2`, l'écran de bureau, et ses colonnes se chevauchaient (Bertrand,
   * essai réel du 01/11/2026).
   */
  import FileMini from './FileMini.svelte';
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
      <div class="corps file"><FileMini /></div>
    {:else}
      <h3>{$t('nav.zonemanager' as any)}</h3>
      <div class="corps"><ZonesMini /></div>
    {/if}
  </div>
{/if}

<style>
  .fond{position:absolute; inset:0; z-index:90; background:var(--v2-scrim)}
  .feuille{position:absolute; left:0; right:0; bottom:0; z-index:91; max-height:86%; min-width:0; overflow-x:hidden; display:flex; flex-direction:column;
    background:var(--v2-surface2); border-top:1px solid var(--v2-line2); border-radius:16px 16px 0 0;
    box-shadow:var(--v2-sh-lg); font-family:var(--v2-sans); color:var(--v2-txt)}
  .poignee{flex:0 0 22px; display:grid; place-items:center; border:0; background:none; cursor:pointer}
  .poignee span{display:block; width:38px; height:4px; border-radius:2px; background:var(--v2-line2)}
  h3{font-size:15px; font-weight:700; padding:2px 14px 8px}
  .corps{flex:1; min-height:0; overflow:auto}
  /* La file a sa propre liste défilante (et virtualisée) : le panneau lui donne
     une hauteur, et rien ne déborde en largeur. */
  .corps.file{display:flex; flex-direction:column; height:72vh; min-width:0; overflow:hidden}
</style>

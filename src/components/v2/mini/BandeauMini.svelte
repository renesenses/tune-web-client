<script lang="ts">
  /**
   * Le bandeau du haut de la vue mini (maquette A) : la pastille de zone, qui
   * ouvre le panneau des zones, puis — dans le widget de bureau SEULEMENT —
   * l'épingle « premier plan », replier/déplier et la fenêtre complète.
   *
   * Ces trois boutons ne parlent pas au serveur : ils naviguent vers
   * `/__widget/<action>`, que la fenêtre Tauri intercepte (`decider_navigation`)
   * et n'ouvre jamais. Aucune API native n'est donc exposée à la page.
   * Masquer la fenêtre reste le bouton de fermeture du système.
   */
  import { currentZone } from '../../../lib/stores/zones';
  import { zoneDeviceName } from '../../../lib/zoneIdentity';
  import { feuilleMini, dansLeWidgetActif, actionWidget } from '../../../lib/vueMini';
  import { t } from '../../../lib/i18n';
  import { bulleTexte } from '../../../lib/infobulleTexte';
  import AvatarMenu from '../AvatarMenu.svelte';

  let { replie = false }: { replie?: boolean } = $props();
  const appareil = $derived(zoneDeviceName($currentZone));
  const dansLeWidget = dansLeWidgetActif();
</script>

<header class="bandeau" class:replie data-bandeau-mini>
  <button class="zone" onclick={() => feuilleMini.update((f) => (f === 'zones' ? null : 'zones'))}
    aria-label={$t('mini.choisirZone' as any)} data-pastille-zone>
    <span class="point" class:joue={$currentZone?.state === 'playing'}></span>
    <span class="nom" use:bulleTexte>{$currentZone?.name ?? $t('mini.choisirZone' as any)}</span>
    {#if appareil && !replie}<span class="app" use:bulleTexte>· {appareil}</span>{/if}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
  </button>
  <span class="esp"></span>
  {#if dansLeWidget}
    <button class="ic" onclick={() => actionWidget('epingle')} aria-label={$t('mini.epingle' as any)}
      title={$t('mini.epingle' as any)} data-action-widget="epingle">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5M5 17h14l-2-4V5h1V3H6v2h1v8z"/></svg>
    </button>
    <button class="ic" onclick={() => actionWidget(replie ? 'deplier' : 'replier')}
      aria-label={replie ? $t('mini.deplier' as any) : $t('mini.replier' as any)}
      title={replie ? $t('mini.deplier' as any) : $t('mini.replier' as any)} data-action-widget={replie ? 'deplier' : 'replier'}>
      {#if replie}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 15 6-6 6 6"/></svg>
      {/if}
    </button>
    <button class="ic" onclick={() => actionWidget('complet')} aria-label={$t('mini.complet' as any)}
      title={$t('mini.complet' as any)} data-action-widget="complet">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
    </button>
  {/if}
  {#if !replie}<AvatarMenu />{/if}
</header>

<style>
  .bandeau{flex:0 0 40px; display:flex; align-items:center; gap:4px; padding:0 8px 0 10px; position:relative; z-index:80;
    background:linear-gradient(var(--v2-bg2),var(--v2-bg)); border-bottom:1px solid var(--v2-line); font-family:var(--v2-sans)}
  .bandeau.replie{flex-basis:30px; border-bottom:0; background:none}
  .zone{display:inline-flex; align-items:center; gap:6px; min-width:0; height:26px; padding:0 10px 0 8px; border-radius:20px;
    background:var(--v2-surface2); border:1px solid var(--v2-line2); color:var(--v2-txt); cursor:pointer;
    font:600 12px var(--v2-sans)}
  .zone svg{width:12px; height:12px; color:var(--v2-txt2); flex:0 0 auto}
  .point{width:7px; height:7px; border-radius:50%; background:var(--v2-txt3); flex:0 0 auto}
  .point.joue{background:var(--v2-acc1)}
  .nom{white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .app{color:var(--v2-txt2); font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .esp{flex:1}
  .ic{width:28px; height:28px; display:grid; place-items:center; border:0; border-radius:6px; background:none;
    color:var(--v2-txt2); cursor:pointer; flex:0 0 auto}
  .ic:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .ic svg{width:15px; height:15px}
</style>

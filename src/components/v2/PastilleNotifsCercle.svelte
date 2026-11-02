<script lang="ts">
  /**
   * Tune Circle rc9 (web#2437) : la pastille des notifications non lues, à
   * côté de l'entrée « Tune Circle » de la barre latérale. Rien quand le
   * serveur ne connaît pas les notifications (404), sans session, ou à zéro.
   */
  import { t } from '../../lib/i18n';
  import { notifsCercle } from '../../lib/circleNotifications';

  const n = $derived($notifsCercle.relais === 'ok' ? $notifsCercle.nonLues : 0);
</script>

{#if n > 0}
  <span class="pastille-notifs" role="status" aria-label={$t('v2.circle.notif.unreadAria' as any).split('{n}').join(String(n))}>{n > 99 ? '99+' : n}</span>
{/if}

<style>
  .pastille-notifs{margin-left:auto; min-width:18px; height:18px; padding:0 5px; border-radius:9px; flex:none;
    display:inline-flex; align-items:center; justify-content:center; box-sizing:border-box;
    background:var(--v2-acc1); color:var(--v2-bg, #000); font:700 11px/1 var(--v2-sans)}
  :global(.v2-sidebar.collapsed) .pastille-notifs{position:absolute; top:3px; right:8px; margin:0}
</style>

<script lang="ts">
  /**
   * Lecture YouTube (outil `yt-dlp` géré par le serveur) — Réglages › Accès.
   *
   * Phase 5 (web#1257) : l'activation n'existait que dans l'onglet Services de
   * `SettingsView`. Le serveur télécharge l'outil en tâche de fond
   * (`POST /system/youtube/enable`) ; l'écran sonde `GET /system/youtube/status`
   * toutes les deux secondes tant que dure le téléchargement, et s'arrête dès
   * qu'il est fini ou en échec.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { get } from 'svelte/store';
  import { notifications } from '../../lib/stores/notifications';
  import { errText } from '../../lib/utils';

  let installe = $state(false);
  let version = $state<string | null>(null);
  let statut = $state('absent');
  let occupe = $state(false);
  let lu = $state(false);

  async function lire() {
    try {
      const s = await api.getYoutubeStatus();
      installe = !!s.installed;
      version = s.version ?? null;
      statut = s.status ?? (s.installed ? 'ready' : 'absent');
      occupe = statut === 'downloading';
      lu = true;
    } catch { /* serveur antérieur : le bloc se tait */ }
  }
  $effect(() => { void lire(); });

  // Sondage UNIQUEMENT pendant le téléchargement.
  $effect(() => {
    if (statut !== 'downloading') return;
    const h = setInterval(() => { void lire(); }, 2000);
    return () => clearInterval(h);
  });

  async function activer() {
    const tr = get(t);
    occupe = true;
    try {
      await api.enableYoutubePlayback();
      statut = 'downloading';
    } catch (e) {
      occupe = false;
      notifications.error(errText(e) ?? tr('common.error' as any));
    }
  }
</script>

{#if lu}
  <div class="yt">
    <p class="hint">{$t('settings.youtubePlaybackHelp' as any)}</p>
    {#if installe}
      <p class="okline">{$t('settings.youtubePlaybackReady' as any)}{version ? ` (${version})` : ''}</p>
    {:else}
      <div class="inline">
        <button class="lnk activer" disabled={occupe} onclick={activer}>
          {occupe ? $t('settings.youtubePlaybackDownloading' as any) : $t('settings.youtubePlaybackEnable' as any)}
        </button>
      </div>
    {/if}
    {#if statut.startsWith('failed')}<div class="errline">{statut}</div>{/if}
  </div>
{/if}

<style>
  .yt { display: flex; flex-direction: column; gap: 10px; }
  .inline { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .hint { margin: 0; font-size: 13px; color: var(--v2-txt3); }
  .okline { margin: 0; font-size: 13px; color: var(--v2-acc1); }
  .errline { font-size: 13px; color: var(--v2-danger); }
  .lnk {
    background: none; border: 1px solid var(--v2-line); border-radius: 6px;
    padding: 5px 10px; color: var(--v2-txt); font-size: 13px; cursor: pointer;
  }
  .lnk:hover:not(:disabled) { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .lnk:disabled { opacity: 0.45; cursor: default; }
</style>

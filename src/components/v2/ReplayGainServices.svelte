<script lang="ts">
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  let { value }: { value: boolean | null } = $props();
  let enabled = $state(false);
  let busy = $state(false);
  $effect(() => { enabled = value === true; });

  async function save(event: Event) {
    const previous = enabled;
    enabled = (event.currentTarget as HTMLInputElement).checked;
    busy = true;
    try {
      const result = await api.updateConfig({ replaygain_services_enabled: enabled });
      if (typeof result?.replaygain_services_enabled === 'boolean') {
        enabled = result.replaygain_services_enabled;
      }
    } catch {
      enabled = previous;
      notifications.error($t('common.saveFailed' as any));
    } finally {
      busy = false;
    }
  }
</script>

{#if value !== null}
  <label class="row" data-reglage="replaygain-services">
    <span class="lbl">
      <span>{$t('settings.replayGainServices' as any)}</span>
      <span class="hint">{$t('settings.replayGainServicesHint' as any)}</span>
    </span>
    <input type="checkbox" checked={enabled} disabled={busy} onchange={save} />
  </label>
{/if}

<style>
  .row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.75rem 0; }
  .lbl { display: flex; flex-direction: column; gap: 0.25rem; }
  .hint { font-size: 0.875em; opacity: 0.7; }
</style>

<script lang="ts">
  import type { Zone } from '../../lib/types';
  import { t } from '../../lib/i18n';
  import { volumeAppareilObserve } from '../../lib/volumeAppareilObserve';
  let { zone }: { zone: Partial<Zone> | null | undefined } = $props();
  const observation = $derived(volumeAppareilObserve(zone));
</script>

{#if observation}
  <span class="device-volume-observation" role="status">
    {$t('volume.deviceObserved').replace('{value}', observation.volume_db.toLocaleString(undefined, { maximumFractionDigits: 1 }))}
  </span>
{/if}

<style>
  .device-volume-observation {
    font-size: smaller;
    white-space: nowrap;
  }
</style>

<script lang="ts">
  /**
   * tune-server-rust#8445 — sous le curseur de volume, une mention discrète
   * dit que le curseur règle le volume de TOUT le groupe.
   */
  import { t } from '../../lib/i18n';
  import { tuneWS } from '../../lib/websocket';
  import { groupesDeZones, groupeDeLaZone, suivreGroupesDeZones } from '../../lib/volumeDeGroupe';

  let { zoneId }: { zoneId: number | null | undefined } = $props();

  $effect(() => {
    suivreGroupesDeZones((h) => tuneWS.onEvent(h));
  });

  let groupe = $derived(groupeDeLaZone(zoneId, $groupesDeZones));
</script>

{#if groupe}
  <span class="mention-groupe" title={$t('volume.groupMasterHint' as any)}>
    {$t('volume.groupMaster' as any).replace('{n}', String(groupe.zone_ids.length))}
  </span>
{/if}

<style>
  .mention-groupe {
    font-size: calc(0.7rem * var(--v2-txt-echelle, 1));
    color: var(--text-secondary, inherit);
    opacity: 0.8;
    white-space: nowrap;
  }
</style>

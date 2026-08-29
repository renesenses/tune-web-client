<script lang="ts">
  import * as api from '../lib/api';
  import type { Zone } from '../lib/types';
  import { zones } from '../lib/stores/zones';
  import { t } from '../lib/i18n';

  let cleanupRunning = $state(false);
  let cleanupResult = $state<string | null>(null);

  async function cleanupOfflineZones() {
    cleanupRunning = true;
    cleanupResult = null;
    try {
      const allZones: Zone[] = await api.getZones();
      const offlineZones = allZones.filter(z => z.online === false && z.output_type !== 'local');
      if (offlineZones.length === 0) {
        cleanupResult = $t('multiroom.noOfflineZones');
        return;
      }
      let deleted = 0;
      for (const z of offlineZones) {
        try {
          await api.deleteZone(z.id!);
          deleted++;
        } catch {}
      }
      cleanupResult = (deleted > 1 ? $t('multiroom.zonesDeletedPlural') : $t('multiroom.zonesDeleted')).replace('{count}', String(deleted));
    } catch (e) {
      cleanupResult = $t('multiroom.cleanupError');
    } finally {
      cleanupRunning = false;
    }
  }
</script>

<section class="settings-section zone-cleanup">
  <h2>{$t('multiroom.playbackZones')}</h2>
  <p class="hint">
    {$t('multiroom.cleanupHint')}
  </p>
  <div class="cleanup-row">
    <span class="zone-count">{$zones.length} {$zones.length !== 1 ? $t('multiroom.zonesActivePlural') : $t('multiroom.zoneActive')}</span>
    <button class="cleanup-btn" onclick={cleanupOfflineZones} disabled={cleanupRunning}>
      {cleanupRunning ? $t('multiroom.cleaning') : $t('multiroom.cleanupBtn')}
    </button>
  </div>
  {#if cleanupResult}
    <p class="cleanup-result">{cleanupResult}</p>
  {/if}
</section>

<section class="settings-section multiroom-settings">
  <h2>{$t('multiroom.title')}</h2>
  <p class="hint">
    {$t('multiroom.calibrationHint')}
  </p>
</section>

<style>
  .multiroom-settings { padding: 1rem 1.2rem; background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.04); border-radius: 12px; margin-bottom: 1rem; }
  .multiroom-settings h2 { font-size: 1rem; margin: 0 0 0.4rem 0; color: var(--tune-text); }
  .hint { font-size: 0.8rem; color: var(--tune-text-muted); margin: 0 0 0.8rem 0; }

  .zone-cleanup { padding: 1rem 1.2rem; background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.04); border-radius: 12px; margin-bottom: 1rem; }
  .zone-cleanup h2 { font-size: 1rem; margin: 0 0 0.4rem 0; color: var(--tune-text); }
  .cleanup-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .zone-count { font-size: 0.85rem; color: var(--tune-text-muted); }
  .cleanup-btn { font-size: 0.85rem; padding: 0.4rem 1rem; border-radius: 8px; border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.4); background: transparent; color: var(--tune-text); cursor: pointer; transition: all 0.15s; }
  .cleanup-btn:hover { background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.1); }
  .cleanup-btn:disabled { opacity: 0.5; cursor: default; }
  .cleanup-result { font-size: 0.8rem; color: #10b981; margin: 0.5rem 0 0 0; }

  @media (max-width: 700px) {
    .cleanup-row { flex-direction: column; align-items: flex-start; }
  }
</style>

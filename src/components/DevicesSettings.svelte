<script lang="ts">
  /** Onglet Réglages « Appareils » : une carte par zone reliée à un appareil.
   *  Regroupe ce qui était enterré à trois niveaux (Réseau → zone → Avancé) :
   *  identité de l'appareil (marque/modèle, ZoneDeviceEditor), trim de gain
   *  par renderer, et configuration du renderer (RendererConfig, DLNA/OpenHome). */
  import { zones } from '../lib/stores/zones';
  import * as api from '../lib/api';
  import { t } from '../lib/i18n';
  import { tip } from '../lib/tooltip';
  import ZoneDeviceEditor from './ZoneDeviceEditor.svelte';
  import RendererConfig from './RendererConfig.svelte';
  import type { Zone } from '../lib/types';

  // Zones avec un appareil de sortie — les zones « fantômes » sans device
  // n'ont rien à configurer ici.
  let deviceZones = $derived($zones.filter((z) => z.id != null && !!z.output_device_id));

  async function refreshZones() {
    try {
      zones.set(await api.getZones());
    } catch { /* hors ligne : on garde l'état courant */ }
  }

  // Trim optimiste par zone (slider fluide, PATCH au relâchement).
  let trims = $state<Record<number, number>>({});
  let trimSaving = $state<Record<number, boolean>>({});

  function trimOf(z: Zone): number {
    return trims[z.id ?? -1] ?? z.gain_trim_db ?? 0;
  }

  async function saveTrim(z: Zone) {
    if (z.id == null) return;
    const db = trims[z.id] ?? 0;
    trimSaving = { ...trimSaving, [z.id]: true };
    try {
      await api.updateZoneGainTrim(z.id, db);
      await refreshZones();
    } finally {
      trimSaving = { ...trimSaving, [z.id]: false };
    }
  }

  function transportLabel(z: Zone): string {
    return (z.output_type ?? '').toUpperCase();
  }
</script>

<div class="devices-settings">
  <p class="intro">{$t('devices.intro')}</p>

  {#if deviceZones.length === 0}
    <p class="empty">{$t('devices.none')}</p>
  {/if}

  {#each deviceZones as z (z.id)}
    <section class="device-card">
      <header class="card-head">
        <h3>{z.name}</h3>
        <span class="transport">{transportLabel(z)}</span>
      </header>

      <ZoneDeviceEditor zone={z} onSaved={() => refreshZones()} />

      <div class="trim-row">
        <label for={'trim-' + z.id} use:tip={'devices.gainTrimHint'}>
          {$t('devices.gainTrim')}
        </label>
        <input
          id={'trim-' + z.id}
          type="range"
          min="-12"
          max="12"
          step="0.5"
          value={trimOf(z)}
          disabled={z.fixed_volume || trimSaving[z.id ?? -1]}
          oninput={(e) => { trims = { ...trims, [z.id ?? -1]: Number((e.target as HTMLInputElement).value) }; }}
          onchange={() => saveTrim(z)}
        />
        <span class="trim-value" class:neutral={trimOf(z) === 0}>
          {trimOf(z) > 0 ? '+' : ''}{trimOf(z).toFixed(1)} dB
        </span>
        {#if z.fixed_volume}
          <span class="trim-fixed">{$t('devices.gainTrimFixedVolume')}</span>
        {/if}
      </div>

      {#if ['dlna', 'openhome'].includes(z.output_type ?? '')}
        <details class="renderer-adv">
          <summary>{$t('devices.rendererConfig')}</summary>
          <RendererConfig zone={z} />
        </details>
      {/if}
    </section>
  {/each}
</div>

<style>
  .devices-settings { display: flex; flex-direction: column; gap: 16px; }
  .intro { color: var(--tune-text-muted); font-size: 13px; margin: 0 0 4px; }
  .empty { color: var(--tune-text-muted); font-size: 13px; }
  .device-card {
    border: 1px solid var(--tune-border);
    border-radius: 12px;
    background: var(--tune-surface);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .card-head { display: flex; align-items: center; gap: 10px; }
  .card-head h3 { margin: 0; font-size: 15px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .transport {
    font-size: 10px; font-weight: 700; letter-spacing: .05em;
    padding: 2px 8px; border-radius: 999px;
    background: var(--tune-surface-hover); color: var(--tune-text-muted);
  }
  .trim-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .trim-row label { font-size: 13px; color: var(--tune-text); }
  .trim-row input[type='range'] { flex: 1; min-width: 140px; accent-color: var(--tune-accent); }
  .trim-value { font-variant-numeric: tabular-nums; font-size: 13px; min-width: 62px; text-align: right; }
  .trim-value.neutral { color: var(--tune-text-muted); }
  .trim-fixed { font-size: 12px; color: var(--tune-text-muted); }
  .renderer-adv summary { cursor: pointer; font-size: 13px; color: var(--tune-text-muted); }
  .renderer-adv[open] summary { margin-bottom: 8px; }
</style>

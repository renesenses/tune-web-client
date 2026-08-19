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

  // Opt-in MediaRenderer UPnP (#1750) : la zone devient pilotable par
  // JPlay/BubbleUPnP. Le serveur annonce (ou retire) immédiatement.
  let upnpSaving = $state<Record<number, boolean>>({});
  async function setUpnpRenderer(z: Zone, enabled: boolean) {
    if (z.id == null) return;
    upnpSaving = { ...upnpSaving, [z.id]: true };
    try {
      await api.updateZoneUpnpRenderer(z.id, enabled);
      await refreshZones();
    } finally {
      upnpSaving = { ...upnpSaving, [z.id]: false };
    }
  }

  // Préréglages communautaires (#1743) : proposés à l'affichage quand
  // l'appareil est identifié, que la zone n'a AUCUN réglage local et qu'au
  // moins 3 instances concordent. Jamais d'application automatique — un
  // bouton, un PATCH, c'est tout.
  import { onMount } from 'svelte';
  import type { DevicePreset } from '../lib/api';
  let proposals = $state<Record<number, DevicePreset | null>>({});
  let applying = $state<Record<number, boolean>>({});
  const MIN_OCCURRENCES = 3;

  function hasLocalRendererSettings(z: Zone): boolean {
    return !!(z.dlna_native_flac || z.alac_passthrough || z.aac_passthrough || z.dlna_lpcm
      || z.dlna_cap_16bit || z.dlna_wav24 || (z.dlna_play_delay_ms ?? 0) > 0
      || (z.gain_trim_db ?? 0) !== 0);
  }

  function presetSummary(p: DevicePreset): string {
    return Object.entries(p.settings)
      .map(([k, v]) => (v === true ? k : `${k}=${v}`))
      .join(' · ');
  }

  onMount(async () => {
    for (const z of deviceZones) {
      if (z.id == null) continue;
      const identified = !!(z.brand ?? z.detected_manufacturer) && !!(z.model ?? z.detected_model);
      if (!identified || hasLocalRendererSettings(z)) continue;
      try {
        const r = await api.getZoneDevicePresets(z.id);
        const best = r.presets?.[0];
        if (best && best.occurrences >= MIN_OCCURRENCES && Object.keys(best.settings ?? {}).length > 0) {
          proposals = { ...proposals, [z.id]: best };
        }
      } catch { /* site injoignable : pas de proposition, pas d'erreur */ }
    }
  });

  async function applyPreset(z: Zone) {
    const id = z.id;
    if (id == null) return;
    const p = proposals[id];
    if (!p) return;
    applying = { ...applying, [id]: true };
    try {
      await api.applyZoneDevicePreset(id, p.settings);
      proposals = { ...proposals, [id]: null };
      await refreshZones();
    } finally {
      applying = { ...applying, [id]: false };
    }
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

      {#if z.id != null && proposals[z.id]}
        {@const p = proposals[z.id]!}
        <div class="preset-proposal">
          <div class="preset-text">
            <strong>{$t('devices.presetTitle').replace('{count}', String(p.occurrences))}</strong>
            <span class="preset-summary">{presetSummary(p)}</span>
          </div>
          <button class="preset-apply" disabled={applying[z.id]} onclick={() => applyPreset(z)}>
            {$t('devices.presetApply')}
          </button>
          <button class="preset-dismiss" onclick={() => { proposals = { ...proposals, [z.id ?? -1]: null }; }} title={$t('devices.presetDismiss')} aria-label={$t('devices.presetDismiss')}>×</button>
        </div>
      {/if}

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

      <label class="upnp-renderer-row" use:tip={'devices.upnpRendererHint'}>
        <input
          type="checkbox"
          checked={z.upnp_renderer ?? false}
          disabled={z.id == null || upnpSaving[z.id ?? -1]}
          onchange={(e) => setUpnpRenderer(z, (e.target as HTMLInputElement).checked)}
        />
        {$t('devices.upnpRenderer')}
      </label>

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
  .upnp-renderer-row { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
  .upnp-renderer-row input { accent-color: var(--tune-accent); }
  .renderer-adv summary { cursor: pointer; font-size: 13px; color: var(--tune-text-muted); }
  .renderer-adv[open] summary { margin-bottom: 8px; }
  .preset-proposal {
    display: flex; align-items: center; gap: 10px;
    border: 1px solid var(--tune-accent, #6366f1);
    border-radius: 8px; padding: 8px 12px;
    background: color-mix(in srgb, var(--tune-accent, #6366f1) 8%, transparent);
  }
  .preset-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; font-size: 13px; }
  .preset-summary { color: var(--tune-text-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
  .preset-apply {
    background: var(--tune-accent, #6366f1); color: white; border: 0;
    border-radius: 6px; padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer;
  }
  .preset-apply:disabled { opacity: 0.5; }
  .preset-dismiss { background: none; border: 0; color: var(--tune-text-muted); font-size: 16px; cursor: pointer; padding: 2px 6px; }
</style>

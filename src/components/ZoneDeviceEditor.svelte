<script lang="ts">
  /** Éditeur « appareil » d'une zone : marque + modèle, via le catalogue
   *  serveur (avec saisie libre en repli). Extrait de ZoneConfigModal pour
   *  être réutilisé depuis la fiche système du volet Support. */
  import type { Zone, DeviceBrand } from '../lib/types';
  import * as api from '../lib/api';
  import { t } from '../lib/i18n';

  interface Props {
    zone: Zone;
    /** Notifie le parent après un enregistrement réussi (rafraîchissement). */
    onSaved?: (zone: Zone) => void;
  }

  let { zone, onSaved }: Props = $props();

  const CUSTOM = 'Autre';
  let catalog = $state<DeviceBrand[]>([]);
  // Valeurs initiales : override utilisateur, sinon détection UPnP.
  let selectedBrand = $state<string>(zone.brand ?? zone.detected_manufacturer ?? '');
  let selectedModel = $state<string>(zone.model ?? zone.detected_model ?? '');
  let deviceSaving = $state(false);
  let deviceSaved = $state(false);
  let error = $state('');

  // Modèles proposés pour la marque choisie (vide si marque libre/inconnue).
  let modelsForBrand = $derived(
    catalog.find((b) => b.name.toLowerCase() === selectedBrand.trim().toLowerCase())?.models ?? []
  );
  // Marque en saisie libre : « Autre », ou une marque hors catalogue.
  let brandIsCustom = $derived(
    selectedBrand === CUSTOM ||
      (selectedBrand.trim() !== '' &&
        !catalog.some((b) => b.name.toLowerCase() === selectedBrand.trim().toLowerCase()))
  );
  // Modèle en saisie libre : marque libre, ou modèle hors liste.
  let modelIsCustom = $derived(
    brandIsCustom ||
      selectedModel === CUSTOM ||
      (selectedModel.trim() !== '' &&
        !modelsForBrand.some((m) => m.name.toLowerCase() === selectedModel.trim().toLowerCase()))
  );

  let deviceDirty = $derived(
    (selectedBrand.trim() || '') !== (zone.brand ?? '') ||
      (selectedModel.trim() || '') !== (zone.model ?? '')
  );

  $effect(() => {
    api.getDeviceCatalog()
      .then((c) => { catalog = c.brands ?? []; })
      .catch(() => { catalog = []; });
  });

  function onBrandChange(v: string) {
    selectedBrand = v;
    // Changer de marque invalide le modèle (sauf saisie libre conservée).
    if (v !== CUSTOM) selectedModel = '';
    deviceSaved = false;
  }

  async function saveDevice() {
    if (zone.id === null) return;
    deviceSaving = true;
    error = '';
    try {
      const brand = selectedBrand.trim();
      const model = selectedModel.trim();
      const updated = await api.updateZoneDevice(zone.id, brand, model);
      // Reflète la valeur persistée pour recalculer deviceDirty.
      zone.brand = updated.brand ?? (brand || null);
      zone.model = updated.model ?? (model || null);
      deviceSaved = true;
      onSaved?.(zone);
    } catch (e: any) {
      error = e?.message || 'Failed to save device';
    }
    deviceSaving = false;
  }
</script>

<h3 class="section-title">{$t('zoneConfig.deviceTitle')}</h3>
<p class="section-desc">{$t('zoneConfig.deviceDesc')}</p>

{#if error}
  <div class="device-error">{error}</div>
{/if}

<div class="device-grid">
  <label class="device-field">
    <span class="device-label">{$t('zoneConfig.brand')}</span>
    {#if brandIsCustom}
      <input
        class="device-input"
        type="text"
        bind:value={selectedBrand}
        placeholder={$t('zoneConfig.brandCustomPlaceholder')}
        oninput={() => (deviceSaved = false)}
      />
    {:else}
      <select class="device-input" value={selectedBrand} onchange={(e) => onBrandChange(e.currentTarget.value)}>
        <option value="">{$t('zoneConfig.brandNone')}</option>
        {#each catalog as b}
          <option value={b.name}>{b.name}</option>
        {/each}
        <option value={CUSTOM}>{$t('zoneConfig.other')}</option>
      </select>
    {/if}
  </label>
  <label class="device-field">
    <span class="device-label">{$t('zoneConfig.model')}</span>
    {#if modelIsCustom}
      <input
        class="device-input"
        type="text"
        bind:value={selectedModel}
        placeholder={$t('zoneConfig.modelCustomPlaceholder')}
        oninput={() => (deviceSaved = false)}
      />
    {:else}
      <select class="device-input" bind:value={selectedModel} onchange={() => (deviceSaved = false)} disabled={!selectedBrand}>
        <option value="">{$t('zoneConfig.modelNone')}</option>
        {#each modelsForBrand as m}
          <option value={m.name}>{m.name}</option>
        {/each}
        <option value={CUSTOM}>{$t('zoneConfig.other')}</option>
      </select>
    {/if}
  </label>
</div>

{#if zone.detected_manufacturer || zone.detected_model}
  <p class="device-detected">
    {$t('zoneConfig.detected')}: {[zone.detected_manufacturer, zone.detected_model].filter(Boolean).join(' · ')}
  </p>
{/if}

<div class="device-actions">
  {#if deviceDirty}
    <button class="btn btn-primary btn-sm" onclick={saveDevice} disabled={deviceSaving}>
      {deviceSaving ? '...' : $t('common.apply')}
    </button>
  {:else if deviceSaved}
    <span class="device-saved">{$t('common.saved')}</span>
  {/if}
</div>

<style>
  .section-title {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--tune-text-muted);
    margin: 0 0 6px;
  }

  .section-desc {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    margin: 0 0 12px;
  }

  .device-error {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-error, #e5484d);
    margin: 0 0 10px;
  }

  .device-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  @media (max-width: 480px) {
    .device-grid {
      grid-template-columns: 1fr;
    }
  }
  .device-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .device-label {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }
  .device-input {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text);
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 6px 8px;
    width: 100%;
    outline: none;
  }
  .device-input:focus {
    border-color: var(--tune-accent);
  }
  .device-detected {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    margin: 8px 0 0;
  }
  .device-actions {
    margin-top: 10px;
    min-height: 26px;
    display: flex;
    align-items: center;
  }
  .device-saved {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-accent);
  }

  .btn {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 500;
    padding: 6px 14px;
    border-radius: var(--radius-sm);
    border: none;
    cursor: pointer;
    transition: all 0.12s ease-out;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-primary {
    background: var(--tune-accent);
    color: white;
  }
  .btn-primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }
  .btn-sm {
    padding: 3px 10px;
    font-size: 11px;
    flex-shrink: 0;
  }
</style>

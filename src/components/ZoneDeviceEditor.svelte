<script lang="ts">
  /** Éditeur « appareil » d'une zone : marque + modèle, via le catalogue
   *  serveur (avec saisie libre en repli). Extrait de ZoneConfigModal pour
   *  être réutilisé depuis la fiche système du volet Support. */
  import type { Zone, DeviceBrand } from '../lib/types';
  import * as api from '../lib/api';
  import { identiteModifiee } from '../lib/identiteAppareilZone';
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

  /**
   * #763 : la comparaison porte sur la valeur EFFECTIVE (override, sinon
   * détection), c'est-à-dire sur celle qui a été mise dans le champ. Comparer
   * au seul override rendait « Appliquer » permanent sur une zone détectée, et
   * le faisait disparaître dès qu'on vidait le champ pour retirer l'identité.
   *
   * La règle vit dans `lib/identiteAppareilZone.ts`, pour qu'un test l'APPELLE.
   */
  let deviceDirty = $derived(identiteModifiee(zone, selectedBrand, selectedModel));

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

  /**
   * #3660 — RÉCUSER la détection, et non l'override.
   *
   * `zone.identite_appareil_effacee` est publié par le serveur À CÔTÉ des
   * deux champs détectés, qu'il sert à `null` quand le drapeau est posé
   * (`inject_device_identity`, `routes/zones.rs:355`). D'où la règle
   * d'affichage : le bloc reste visible tant que le drapeau est posé, sinon
   * il disparaîtrait avec la détection qu'il vient d'effacer et l'utilisateur
   * n'aurait plus aucun moyen de revenir en arrière.
   *
   * L'état affiché est celui que la RÉPONSE porte — `patch_zone` rend la
   * fiche complète — et jamais l'inverse du booléen local.
   */
  let identiteSaving = $state(false);
  let identiteEffacee = $state(zone.identite_appareil_effacee === true);
  /**
   * 🔴 La détection AFFICHÉE vit ici, et non dans `zone`.
   *
   * `zone` est une prop, et écrire dans un objet reçu en prop ne redessine
   * rien : la ligne « Détecté : EVERSOLO · AV Renderer Device » serait restée
   * à l'écran après que le serveur l'a mise à `null` — on aurait continué
   * d'afficher l'identité qu'on venait de récuser. (`zone.brand = …` du
   * bloc marque/modèle vit avec ce défaut depuis toujours ; il ne se voit pas
   * là-bas, les deux champs de saisie portant déjà la valeur.)
   */
  let detectedMarque = $state<string | null>(zone.detected_manufacturer ?? null);
  let detectedModele = $state<string | null>(zone.detected_model ?? null);

  async function basculerIdentiteEffacee(ev: Event) {
    // Saisie AVANT tout `await` : `currentTarget` est remis à `null` dès que
    // le gestionnaire rend la main.
    const caseCochee = ev.currentTarget as HTMLInputElement | null;
    if (zone.id === null) return;
    identiteSaving = true;
    error = '';
    const souhait = !identiteEffacee;
    try {
      const maj = await api.setZoneIdentiteEffacee(zone.id, souhait);
      // L'état vient de la RÉPONSE — `patch_zone` rend la fiche complète via
      // `get_zone`. Un serveur antérieur à #3660 ne porte pas le drapeau : la
      // case revient alors d'elle-même à « pas récusé », plutôt que
      // d'affirmer un effacement qui n'a pas eu lieu.
      identiteEffacee = maj.identite_appareil_effacee === true;
      detectedMarque = maj.detected_manufacturer ?? null;
      detectedModele = maj.detected_model ?? null;
      zone.identite_appareil_effacee = identiteEffacee;
      zone.detected_manufacturer = detectedMarque;
      zone.detected_model = detectedModele;
      onSaved?.(zone);
    } catch (e: any) {
      error = e?.message || 'Failed to save device';
    }
    identiteSaving = false;
    // Le clic a déjà bougé le DOM ; quand l'état confirmé est celui qu'on
    // affichait déjà, Svelte n'a rien à re-rendre et la case resterait
    // cochée devant un serveur qui n'a rien effacé.
    if (caseCochee) caseCochee.checked = identiteEffacee;
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

{#if detectedMarque || detectedModele}
  <p class="device-detected">
    {$t('zoneConfig.detected')}: {[detectedMarque, detectedModele].filter(Boolean).join(' · ')}
  </p>
{/if}

<!-- #3660 — « cet appareil n'EST PAS un Eversolo ». Visible tant qu'il y a
     une détection À RÉCUSER, et tant que le drapeau est posé : sans ce
     second cas le bloc disparaîtrait avec la détection qu'il efface, et
     l'utilisateur n'aurait plus de chemin de retour. -->
{#if zone.id !== null && (detectedMarque || detectedModele || identiteEffacee)}
  <label class="device-reject">
    <input
      type="checkbox"
      checked={identiteEffacee}
      disabled={identiteSaving}
      onchange={(e) => basculerIdentiteEffacee(e)}
    />
    <span>
      <span class="device-reject-label">{$t('zoneConfig.identiteEffacee')}</span>
      <span class="device-reject-hint">{$t('zoneConfig.identiteEffaceeHint')}</span>
    </span>
  </label>
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
  .device-reject {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 8px 0 0;
    cursor: pointer;
  }
  .device-reject input {
    margin-top: 2px;
    flex-shrink: 0;
  }
  .device-reject-label {
    display: block;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }
  .device-reject-hint {
    display: block;
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
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

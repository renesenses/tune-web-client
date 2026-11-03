<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { getConfig, updateConfig } from '../../lib/api';
  import { locale, t } from '../../lib/i18n';
  import { optionsPaysRadios } from '../../lib/paysEcouteRadios';
  import { notifications } from '../../lib/stores/notifications';
  import { refusPaysRadioVu } from '../../lib/refusPaysRadio';
  import { activeView } from '../../lib/stores/navigation';
  import { v2SettingsTarget } from '../../lib/stores/v2SettingsNav';

  /**
   * #2533 : `complet` (Réglages) montre toujours le choix ; `radios` (onglet
   * Radios) ne le montre que tant qu'aucun pays n'est réglé. Une fois réglé il
   * disparaît, sauf un lien vers le réglage si une radio vient d'être refusée.
   */
  let { mode = 'complet' }: { mode?: 'complet' | 'radios' } = $props();

  let pays = $state('');
  let enregistre = $state('');
  let chargement = $state(true);
  let disponible = $state(false);
  let lu = $state(false);
  let sauvegarde = $state(false);
  let erreur = $state<string | null>(null);
  let vivant = true;
  const options = $derived(optionsPaysRadios($locale, pays));
  onDestroy(() => { vivant = false; });
  onMount(() => { void charger(); });

  async function charger() {
    chargement = true;
    erreur = null;
    try {
      const config = await getConfig();
      if (!vivant) return;
      const brut = config?.radios_country;
      const propre = typeof brut === 'string' ? brut.trim() : '';
      disponible = typeof brut === 'string' && (propre === '' || /^[A-Za-z]{2}$/.test(propre));
      pays = disponible ? propre.toUpperCase() : '';
      enregistre = pays;
      lu = true;
    } catch (cause) {
      if (vivant) erreur = cause instanceof Error ? cause.message : $t('common.error');
    } finally {
      if (vivant) chargement = false;
    }
  }

  const masque = $derived(mode === 'radios' && lu && disponible && enregistre !== '');
  function ouvrirReglage() {
    v2SettingsTarget.set({ tab: 'general', section: 'radiosCountry' });
    activeView.set('settings');
  }

  async function enregistrer() {
    if (!disponible || sauvegarde || pays === enregistre) return;
    const choisi = pays;
    sauvegarde = true;
    erreur = null;
    try {
      await updateConfig({ radios_country: choisi });
      if (!vivant) return;
      enregistre = choisi;
      notifications.success($t('common.saved'));
    } catch (cause) {
      if (vivant) erreur = cause instanceof Error ? cause.message : $t('common.error');
    } finally {
      if (vivant) sauvegarde = false;
    }
  }
</script>

{#if masque}
  {#if $refusPaysRadioVu}
    <div class="pays-ecoute" data-pays-ecoute-lien>
      <span class="aide">{$t('v2.radio.countryMoved' as any)}</span>
      <button class="v2-btn" onclick={ouvrirReglage}>{$t('v2.radio.countryGoSettings' as any)}</button>
    </div>
  {/if}
{:else}
<div class="pays-ecoute">
  <label>
    <span>{$t('v2.radio.listeningCountry' as any)}</span>
    <select bind:value={pays} disabled={chargement || !disponible || sauvegarde}>
      <option value="">{$t('v2.radio.countryUnset' as any)}</option>
      {#each options as option (option.code)}<option value={option.code}>{option.nom}</option>{/each}
    </select>
  </label>
  <button class="v2-btn" disabled={chargement || !disponible || sauvegarde || pays === enregistre} onclick={enregistrer}>
    {sauvegarde ? $t('common.applying') : $t('common.save')}
  </button>
  {#if chargement || lu}<p class="aide">{chargement ? $t('common.loading') : disponible ? $t('v2.radio.countryHint' as any) : $t('v2.radio.countryNeedsServer' as any)}</p>{/if}
  {#if erreur}
    <p class="erreur" role="alert">{erreur}</p>
    {#if !disponible}<button class="v2-btn" onclick={charger}>{$t('v2.radio.countryRetry' as any)}</button>{/if}
  {/if}
</div>
{/if}

<style>
  .pays-ecoute { display:flex; align-items:center; flex-wrap:wrap; gap:8px 12px; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  label { display:flex; align-items:center; flex-wrap:wrap; gap:8px; color:var(--v2-txt2); font-size:12px; }
  select { max-width:min(100%, 260px); min-height:32px; color:var(--v2-txt); background:var(--v2-surface2); border:1px solid var(--v2-line2); border-radius:8px; padding:4px 8px; }
  .aide { flex-basis:100%; margin:0; font-size:11px; color:var(--v2-txt3); }
  .erreur { margin:0; color:var(--v2-danger); font-size:12px; }
</style>

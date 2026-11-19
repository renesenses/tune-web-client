<script lang="ts">
  import { onMount } from 'svelte';
  import { getConfig, updateConfig } from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { notifierErreur } from '../../lib/notifierErreur';
  let { onSaved }: { onSaved: () => Promise<void> } = $props();
  let disponible = $state(false);
  let actuel = $state('');
  let saisie = $state('');
  let enCours = $state(false);
  onMount(() => {
    let actif = true;
    void getConfig().then(config => {
      if (!actif || typeof config?.alarms_timezone !== 'string') return;
      actuel = config.alarms_timezone;
      saisie = actuel || Intl.DateTimeFormat().resolvedOptions().timeZone;
      disponible = true;
    }).catch(e => { if (actif) notifierErreur($t('common.error'), e, { motifSeul: true }); });
    return () => { actif = false; };
  });
  async function enregistrer() {
    enCours = true;
    try {
      await updateConfig({ alarms_timezone: saisie.trim() });
      actuel = saisie.trim();
      await onSaved();
    } catch (e) {
      notifierErreur($t('common.error'), e, { motifSeul: true });
    } finally { enCours = false; }
  }
</script>

{#if disponible}
  <section class="carte fuseau-reveils" aria-label={$t('alarms.timezone')}>
    <p data-fuseau-actuel>{$t('alarms.timezoneCurrent')}: {actuel || $t('alarms.timezoneSystem')}</p>
    <label for="fuseau-reveils">{$t('alarms.timezone')}</label>
    <input id="fuseau-reveils" data-fuseau-saisie bind:value={saisie} disabled={enCours} aria-describedby="aide-fuseau-reveils" />
    <p id="aide-fuseau-reveils">{$t('alarms.timezoneHint')}</p>
    <button class="v2-btn" data-fuseau-enregistrer disabled={enCours || saisie.trim() === actuel} onclick={enregistrer}>{$t('common.save')}</button>
  </section>
{/if}
<style>
  .fuseau-reveils { padding: 16px; display: flex; flex-direction: column; gap: 8px; }
  p { margin: 0; }
  input { background: var(--v2-surface); color: var(--v2-txt); border: 1px solid var(--v2-line2); border-radius: var(--v2-r-input, 8px); padding: 8px; }
</style>

<script lang="ts">
  import * as api from '../../lib/api';
  import { t, locale } from '../../lib/i18n';
  let { zoneId, revision = 0, pur = false }: {zoneId:number|null; revision?:number; pur?:boolean} = $props();
  let mesure = $state<api.RetainedEqPreamp | null>(null);
  let envoi = $state(false);
  let erreur = $state(false);
  let generation = 0;
  $effect(() => {
    const zid = zoneId; void revision;
    const identite = ++generation;
    mesure = null; erreur = false; envoi = false;
    if (zid == null || pur) return;
    let termine = false;
    let lecture = false;
    let absent = false;
    async function relire() {
      if (lecture || absent) return;
      lecture = true;
      try {
        const actuelle = await api.getRetainedEqPreamp(zid!);
        if (!termine && identite === generation) mesure = actuelle;
      } catch (e) {
        if (e && typeof e === 'object' && 'status' in e && e.status === 404) {
          absent = true;
          clearInterval(minuterie);
        }
        // Serveur ancien ou mesure indisponible : aucun gain n'est inventé.
        if (!termine && identite === generation) mesure = null;
      } finally { lecture = false; }
    }
    const minuterie = setInterval(relire, 2000);
    void relire();
    return () => { termine = true; clearInterval(minuterie); };
  });
  const garde = $derived(mesure?.db != null && Number.isFinite(mesure.db) && mesure.db < -0.05);
  const decibels = $derived(new Intl.NumberFormat($locale, {minimumFractionDigits:1,maximumFractionDigits:1}).format(mesure?.db ?? 0));
  async function rendre() {
    if (zoneId == null || envoi || pur || !garde || mesure?.returning) return;
    const zid = zoneId, identite = generation;
    envoi = true; erreur = false;
    try {
      await api.releaseRetainedEqPreamp(zid);
      const actuelle = await api.getRetainedEqPreamp(zid);
      if (identite === generation) mesure = actuelle;
    } catch {
      if (identite === generation) erreur = true;
    } finally { if (identite === generation) envoi = false; }
  }
</script>

{#if garde && !pur}
  <div class="preampli-garde" role="status">
    <span>{$t('v2.eq.retainedPreamp').replace('{db}', decibels)}</span>
    <button class="v2-btn" disabled={envoi || mesure?.returning} onclick={rendre}>{$t('v2.eq.releasePreamp')}</button>
    {#if erreur}<span class="preampli-erreur" role="alert">{$t('v2.eq.releasePreampFailed')}</span>{/if}
  </div>
{/if}

<style>
  .preampli-garde { display:flex; align-items:center; flex-wrap:wrap; gap:12px; padding:12px 20px; color:var(--v2-txt2); background:var(--v2-bg2); }
  .preampli-erreur { color:var(--v2-danger); }
</style>

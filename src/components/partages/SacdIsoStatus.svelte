<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { sacdIsoAvailable } from '../../lib/api/sacd-iso';

  let status = $state<'loading' | 'available' | 'missing' | 'unknown'>('loading');
  let mounted = false;

  async function check() {
    status = 'loading';
    try {
      const available = await sacdIsoAvailable();
      if (mounted) status = available ? 'available' : 'missing';
    } catch {
      if (mounted) status = 'unknown';
    }
  }

  onMount(() => {
    mounted = true;
    void check();
    return () => { mounted = false; };
  });
</script>

<div class="sacd-status">
  <strong>{$t('sacdIso.title')}</strong>
  <p aria-live="polite">{$t('sacdIso.' + status)}</p>
  <button type="button" disabled={status === 'loading'} onclick={check}>
    {$t('sacdIso.check')}
  </button>
</div>

<style>
  .sacd-status { margin-block: 12px; }
  /* web#2324 — le titre et la phrase d'état prennent la taille des lignes
     voisines de Réglages › Bibliothèque (libellé 13,5 px, aide 11,5 px) :
     sans taille propre, la phrase héritait d'une police plus grande que
     toutes les aides de la page (Didier, fil 2390). */
  strong { font-size: 13.5px; font-weight: 500; }
  p { margin-block: 6px; font-size: 11.5px; line-height: 1.45; color: var(--v2-txt3); }
  button {
    border: 1px solid var(--v2-line2); background: transparent;
    color: var(--v2-txt2); cursor: pointer; border-radius: 999px;
    padding: 6px 13px; font: 600 11.5px var(--v2-sans);
  }
  button:hover:not(:disabled) { border-color: var(--v2-acc2); color: var(--v2-acc-tint); }
  button:disabled { opacity: 0.5; cursor: wait; }
</style>

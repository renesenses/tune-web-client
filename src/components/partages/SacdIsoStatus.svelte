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
  p { margin-block: 6px; color: var(--v2-txt2); }
  button {
    border: 1px solid var(--v2-line2); background: transparent;
    color: var(--v2-txt2); cursor: pointer; border-radius: 999px;
    padding: 6px 13px; font: 600 11.5px var(--v2-sans);
  }
  button:hover:not(:disabled) { border-color: var(--v2-acc2); color: var(--v2-acc-tint); }
  button:disabled { opacity: 0.5; cursor: wait; }
</style>

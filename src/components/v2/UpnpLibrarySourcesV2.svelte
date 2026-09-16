<script lang="ts">
  import { onMount } from 'svelte';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  let { server, container, name }: { server: { id: string; name: string } | null; container: string; name?: string } = $props();
  let sources = $state<api.UpnpLibrarySource[]>([]);
  let error = $state('');
  let busy = $state(false);
  let loaded = $state(false);
  let alive = true;
  const current = $derived(sources.find(s => s.udn === server?.id && s.container === container));
  const states: Record<string, string> = {
    pending: 'v2.health.stIdle', running: 'v2.health.stRunning', ready: 'v2.health.stDone',
    partial: 'upnp.sync.partial', unavailable: 'v2.health.unavailable',
    error: 'common.error', confirmation: 'upnp.sync.confirmation',
  };
  async function refresh() {
    try {
      const result = await api.getUpnpLibrarySources();
      if (alive) { sources = result.items; loaded = true; error = ''; }
    } catch (e) {
      if (alive) { error = e instanceof Error ? e.message : $t('v2.ms.indexFailed' as any); }
    }
  }
  onMount(() => {
    alive = true;
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => { alive = false; clearInterval(timer); };
  });
  async function add() {
    if (!server || busy) return;
    busy = true;
    try { await api.addUpnpLibrarySource(server.id, container, name); await refresh(); }
    catch (e) { error = e instanceof Error ? e.message : $t('v2.ms.indexFailed' as any); }
    finally { busy = false; }
  }
  async function act(source: api.UpnpLibrarySource, action: 'sync' | 'pause' | 'confirm') {
    busy = true;
    try { await api.actUpnpLibrarySource(source, action); await refresh(); }
    catch (e) { error = e instanceof Error ? e.message : $t('v2.ms.indexFailed' as any); }
    finally { busy = false; }
  }
</script>

<section aria-label={$t('upnp.sync.title' as any)}>
  <header>
    <strong>{$t('upnp.sync.title' as any)}</strong>
    {#if server && !current}
      <button disabled={busy || !loaded} onclick={add}>{$t('upnp.sync.add' as any)}</button>
    {/if}
  </header>
  <p>{$t('upnp.sync.hint' as any)}</p>
  {#if error}<p role="alert">{error}</p>{/if}
  {#each sources as source (source.key)}
    <article>
      <strong>{source.name}</strong>

      <span aria-live="polite">{$t((source.enabled ? states[source.status] ?? 'v2.health.stUnknown' : 'v2.health.stOff') as any)}</span>
      {#if source.last_success}
        <span>{$t('upnp.sync.last' as any)} {new Date(source.last_success * 1000).toLocaleString()}</span>
      {/if}
      {#if source.report.pistes}
        <p>{$t('v2.ms.indexDone' as any).replace('{tracks}', String(source.report.pistes.distinctes ?? 0)).replace('{albums}', String(source.report.albums_ajoutes ?? 0))}</p>
      {/if}
      {#if source.report.parcours?.plafond}<p>{source.report.parcours.plafond.message}</p>{/if}
      {#if source.report.error || source.report.detail}<p role="alert">{source.report.error ?? source.report.detail}</p>{/if}
      {#each source.report.erreurs ?? [] as message}<p role="alert">{message}</p>{/each}
      {#if source.report.reserves?.length}
        <details><summary>{$t('upnp.sync.limits' as any)}</summary>
          {#each source.report.reserves as message}<p>{message}</p>{/each}
        </details>
      {/if}
      <div>
        <button disabled={busy || source.status === 'running'} onclick={() => act(source, 'sync')}>{$t('upnp.sync.refresh' as any)}</button>
        {#if source.enabled}<button disabled={busy || source.status === 'running'} onclick={() => act(source, 'pause')}>{$t('upnp.sync.pause' as any)}</button>{/if}
      </div>
      {#if source.status === 'confirmation'}
        <p>{$t('upnp.sync.remove' as any).replace('{n}', String(source.pending_count))}</p>
        <button disabled={busy} onclick={() => act(source, 'confirm')}>{$t('settings.confirm' as any)}</button>
      {/if}
    </article>
  {/each}
</section>

<style>
  section { margin: 16px 24px; padding: 16px; border: 1px solid var(--v2-line2); border-radius: 12px; }
  header, article > div { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  article { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--v2-line2); }
  article > span { display: block; margin-top: 6px; }
  p { margin: 8px 0; }
  button { color: inherit; background: transparent; border: 1px solid var(--v2-line2); border-radius: 8px; padding: 8px 12px; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
</style>

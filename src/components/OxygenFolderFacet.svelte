<script lang="ts">
  import { t } from '../lib/i18n';
  import type { FolderChild, FolderCrumb } from '../lib/api';

  interface Props {
    crumbs: FolderCrumb[];          // library root → current folder (each drillable)
    folders: FolderChild[];         // immediate sub-folders of the current folder
    selected: string | null;        // active folder filter (= current path) or null
    loading?: boolean;
    // Drill into (and filter by) a folder; null = back to the library roots.
    onDrill: (path: string | null) => void;
  }
  let { crumbs, folders, selected, loading = false, onDrill }: Props = $props();

  const atRoots = $derived(!selected);
</script>

<div class="folder">
  <!-- Breadcrumb: ⌂ (roots) ▸ … ▸ current -->
  <div class="crumbs">
    <button class="crumb home" class:active={atRoots} onclick={() => onDrill(null)} title={$t('oxygen.folder.home')}>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10.5 12 4l9 6.5"/><path d="M5 9.5V20h14V9.5"/></svg>
    </button>
    {#each crumbs as c, i (c.path)}
      <svg class="sep" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m9 6 6 6-6 6"/></svg>
      <button class="crumb" class:active={i === crumbs.length - 1} title={c.path} onclick={() => onDrill(c.path)}>{c.name}</button>
    {/each}
  </div>

  {#if loading}
    <p class="fnote">{$t('oxygen.loading')}</p>
  {:else if folders.length}
    <div class="values">
      {#each folders as ch (ch.path)}
        <button class="val" onclick={() => onDrill(ch.path)}>
          <svg class="ficon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
          <span class="vl" title={ch.path}>{ch.name}</span>
          <span class="vc">{ch.count.toLocaleString('fr')}</span>
          {#if ch.has_children}
            <svg class="chev" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m9 6 6 6-6 6"/></svg>
          {/if}
        </button>
      {/each}
    </div>
  {:else}
    <p class="fnote">{$t('oxygen.folder.empty')}</p>
  {/if}
</div>

<style>
  .folder { display: flex; flex-direction: column; }
  .crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 1px; padding: 2px 6px 8px; }
  .crumb { background: none; border: 0; color: var(--tune-text-muted); font: inherit; font-size: 12px; padding: 2px 5px; border-radius: 5px; cursor: pointer; max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .crumb:hover { color: var(--tune-text); background: var(--tune-surface-hover); }
  .crumb.active { color: var(--tune-accent); font-weight: 600; }
  .crumb.home { display: inline-flex; align-items: center; padding: 3px 5px; }
  .sep { color: var(--tune-text-muted); flex: none; opacity: .6; }
  .values { display: flex; flex-direction: column; }
  .val { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: 0; color: var(--tune-text-secondary); font: inherit; text-align: left; padding: 5px 8px; border-radius: 7px; cursor: pointer; }
  .val:hover { background: var(--tune-surface-hover); color: var(--tune-text); }
  .ficon { flex: none; color: var(--tune-text-muted); }
  .val:hover .ficon { color: var(--tune-accent); }
  .vl { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; }
  .vc { font-size: 10.5px; color: var(--tune-text-muted); font-variant-numeric: tabular-nums; }
  .chev { flex: none; color: var(--tune-text-muted); }
  .fnote { font-size: 12px; color: var(--tune-text-muted); padding: 4px 8px 8px; }
</style>

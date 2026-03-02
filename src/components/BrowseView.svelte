<script lang="ts">
  import { currentZone } from '../lib/stores/zones';
  import * as api from '../lib/api';
  import { formatTime } from '../lib/utils';
  import AlbumArt from './AlbumArt.svelte';
  import type { BrowseRootEntry, BrowseDirectory, BrowseResult, Track } from '../lib/types';
  import { t as tr } from '../lib/i18n';

  let zone = $derived($currentZone);
  let loading = $state(false);
  let rescanning = $state(false);

  // Navigation state
  let roots = $state<BrowseRootEntry[]>([]);
  let browseResult = $state<BrowseResult | null>(null);
  let currentPath = $state<string | null>(null);

  // Breadcrumb segments
  let breadcrumbs = $derived.by(() => {
    if (!browseResult) return [];
    const segments: { name: string; path: string | null }[] = [];
    // Add "Roots" entry
    segments.push({ name: $tr('browse.roots'), path: null });
    // Build path segments between music_root and current path
    const root = browseResult.music_root;
    const current = browseResult.path;
    if (current === root) {
      const rootName = root.split('/').pop() || root;
      segments.push({ name: rootName, path: root });
    } else {
      const rootName = root.split('/').pop() || root;
      segments.push({ name: rootName, path: root });
      // relative path segments
      const rel = current.slice(root.length).replace(/^\//, '');
      const parts = rel.split('/');
      let accumulated = root;
      for (const part of parts) {
        accumulated += '/' + part;
        segments.push({ name: part, path: accumulated });
      }
    }
    return segments;
  });

  async function loadRoots() {
    loading = true;
    try {
      const res = await api.getBrowseRoots();
      roots = res.roots;
    } catch (e) {
      console.error('Browse roots error:', e);
    }
    loading = false;
  }

  async function navigateTo(path: string) {
    loading = true;
    currentPath = path;
    try {
      browseResult = await api.browseDirectory(path);
    } catch (e) {
      console.error('Browse directory error:', e);
    }
    loading = false;
  }

  function goToRoots() {
    browseResult = null;
    currentPath = null;
  }

  function goUp() {
    if (browseResult?.parent) {
      navigateTo(browseResult.parent);
    } else {
      goToRoots();
    }
  }

  async function playTrack(trackId: number) {
    if (!zone?.id) return;
    try {
      await api.play(zone.id, { track_id: trackId });
    } catch (e) {
      console.error('Play track error:', e);
    }
  }

  async function addTrackToQueue(trackId: number) {
    if (!zone?.id) return;
    try {
      await api.addToQueue(zone.id, { track_id: trackId });
    } catch (e) {
      console.error('Add to queue error:', e);
    }
  }

  async function playAllTracks() {
    if (!zone?.id || !browseResult?.tracks.length) return;
    const ids = browseResult.tracks.filter(t => t.id).map(t => t.id!);
    if (ids.length === 0) return;
    try {
      await api.play(zone.id, { track_ids: ids });
    } catch (e) {
      console.error('Play all error:', e);
    }
  }

  async function addAllToQueue() {
    if (!zone?.id || !browseResult?.tracks.length) return;
    const ids = browseResult.tracks.filter(t => t.id).map(t => t.id!);
    if (ids.length === 0) return;
    try {
      await api.addToQueue(zone.id, { track_ids: ids });
    } catch (e) {
      console.error('Add all to queue error:', e);
    }
  }

  async function rescanFolder() {
    if (!browseResult?.path || rescanning) return;
    rescanning = true;
    try {
      await api.triggerScan(browseResult.path);
    } catch (e) {
      console.error('Rescan error:', e);
    }
    rescanning = false;
  }

  // Load roots on mount
  loadRoots();
</script>

<div class="browse-view">
  {#if browseResult}
    <!-- Directory view -->
    <div class="browse-header">
      <button class="back-btn" onclick={goUp}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        {$tr('common.back')}
      </button>
      <nav class="breadcrumbs">
        {#each breadcrumbs as crumb, i}
          {#if i > 0}
            <span class="breadcrumb-sep">/</span>
          {/if}
          {#if i < breadcrumbs.length - 1}
            <button class="breadcrumb-link" onclick={() => crumb.path ? navigateTo(crumb.path) : goToRoots()}>
              {crumb.name}
            </button>
          {:else}
            <span class="breadcrumb-current">{crumb.name}</span>
          {/if}
        {/each}
      </nav>
      <button class="rescan-btn" onclick={rescanFolder} disabled={rescanning}>
        {#if rescanning}
          <div class="spinner small"></div>
          {$tr('browse.rescanning')}
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
          {$tr('browse.rescan')}
        {/if}
      </button>
    </div>

    {#if loading}
      <div class="loading">
        <div class="spinner"></div>
        {$tr('common.loading')}
      </div>
    {:else}
      <!-- Subdirectories -->
      {#if browseResult.directories.length > 0}
        <div class="dir-list">
          {#each browseResult.directories as dir}
            <button class="dir-item" onclick={() => navigateTo(dir.path)}>
              <svg class="dir-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              <span class="dir-name">{dir.name}</span>
              <span class="dir-count">{dir.track_count}</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          {/each}
        </div>
      {/if}

      <!-- Tracks -->
      {#if browseResult.tracks.length > 0}
        <div class="tracks-header">
          <span class="tracks-count">{browseResult.tracks.length} {$tr('common.tracks')}</span>
          <div class="tracks-actions">
            <button class="action-btn" onclick={playAllTracks}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z" /></svg>
              {$tr('browse.playAll')}
            </button>
            <button class="action-btn secondary" onclick={addAllToQueue}>+ {$tr('browse.addAll')}</button>
          </div>
        </div>
        <div class="track-list">
          {#each browseResult.tracks as t, index}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="track-item" onclick={() => t.id && playTrack(t.id)}>
              <span class="track-num">{t.track_number ?? index + 1}</span>
              <div class="track-info">
                <span class="track-title truncate">{t.title}</span>
                {#if t.artist_name}
                  <span class="track-artist truncate">{t.artist_name}</span>
                {/if}
              </div>
              <span class="track-duration">{formatTime(t.duration_ms)}</span>
              <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); t.id && addTrackToQueue(t.id); }} title={$tr('queue.addToQueue')}>+</button>
            </div>
          {/each}
        </div>
      {:else if browseResult.directories.length === 0}
        <div class="empty">{$tr('browse.noTracks')}</div>
      {/if}
    {/if}

  {:else}
    <!-- Roots view -->
    <div class="browse-header">
      <h2>{$tr('browse.title')}</h2>
    </div>

    {#if loading}
      <div class="loading">
        <div class="spinner"></div>
        {$tr('common.loading')}
      </div>
    {:else if roots.length === 0}
      <div class="empty">{$tr('browse.noRoots')}</div>
    {:else}
      <div class="roots-list">
        {#each roots as root}
          <button class="root-item" onclick={() => navigateTo(root.path)}>
            <svg class="root-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
              <path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </svg>
            <div class="root-info">
              <span class="root-name">{root.name}</span>
              <span class="root-path truncate">{root.path}</span>
            </div>
            <span class="root-count">{root.track_count} {$tr('common.tracks')}</span>
            <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .browse-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
  }

  .browse-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .browse-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s ease-out;
    flex-shrink: 0;
  }

  .back-btn:hover {
    border-color: var(--tune-text-muted);
    color: var(--tune-text);
  }

  .breadcrumbs {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-body);
    font-size: 13px;
    min-width: 0;
    overflow: hidden;
  }

  .breadcrumb-sep {
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  .breadcrumb-link {
    background: none;
    border: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    padding: 0;
    font-family: var(--font-body);
    font-size: 13px;
    white-space: nowrap;
    transition: color 0.12s;
  }

  .breadcrumb-link:hover {
    color: var(--tune-accent);
  }

  .breadcrumb-current {
    color: var(--tune-text);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rescan-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s ease-out;
    flex-shrink: 0;
    margin-left: auto;
  }

  .rescan-btn:hover:not(:disabled) {
    border-color: var(--tune-text-muted);
    color: var(--tune-text);
  }

  .rescan-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .spinner.small {
    width: 14px;
    height: 14px;
  }

  /* Roots list */
  .roots-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .root-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 14px 20px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    text-align: left;
    color: var(--tune-text);
    transition: all 0.12s ease-out;
    margin-bottom: var(--space-sm);
  }

  .root-item:hover {
    border-color: var(--tune-accent);
    background: var(--tune-surface-hover);
  }

  .root-icon {
    flex-shrink: 0;
    opacity: 0.6;
  }

  .root-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .root-name {
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
  }

  .root-path {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .root-count {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
    flex-shrink: 0;
  }

  /* Directory list */
  .dir-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-bottom: var(--space-lg);
  }

  .dir-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    font-family: var(--font-body);
    font-size: 14px;
    transition: background 0.12s ease-out;
    border-radius: var(--radius-sm);
  }

  .dir-item:hover {
    background: var(--tune-surface-hover);
  }

  .dir-icon {
    flex-shrink: 0;
    color: var(--tune-text-secondary);
    opacity: 0.7;
  }

  .dir-name {
    flex: 1;
    font-weight: 600;
  }

  .dir-count {
    font-size: 12px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .chevron {
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  /* Tracks section */
  .tracks-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) 0;
    margin-bottom: var(--space-sm);
    border-top: 1px solid var(--tune-border);
    padding-top: var(--space-md);
  }

  .tracks-count {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tracks-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-md);
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    transition: background 0.12s ease-out;
  }

  .action-btn:hover {
    background: var(--tune-accent-hover);
  }

  .action-btn.secondary {
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
  }

  .action-btn.secondary:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
    background: none;
  }

  /* Track list (reuses library styling pattern) */
  .track-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    overflow-y: auto;
  }

  .track-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 8px 20px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease-out;
  }

  .track-item:hover {
    background: var(--tune-surface-hover);
  }

  .track-num {
    width: 28px;
    text-align: center;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .track-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .track-title {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
  }

  .track-artist {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
  }

  .track-duration {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .add-queue-btn {
    width: 28px;
    height: 28px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s ease-out;
    opacity: 0;
  }

  .track-item:hover .add-queue-btn {
    opacity: 1;
  }

  .add-queue-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  /* Loading / Empty */
  .loading {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    padding: var(--space-xl);
    justify-content: center;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty {
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    text-align: center;
    padding: var(--space-2xl);
  }
</style>

<script lang="ts">
  import { currentZone } from '../lib/stores/zones';
  import * as api from '../lib/api';
  import { t as tr } from '../lib/i18n';
  import { formatTime } from '../lib/utils';
  import type { MediaServer, MediaServerBrowseResult, MediaServerItem } from '../lib/types';

  let zone = $derived($currentZone);
  let loading = $state(false);

  // Navigation state
  let servers = $state<MediaServer[]>([]);
  let selectedServer = $state<MediaServer | null>(null);
  let browseResult = $state<MediaServerBrowseResult | null>(null);
  let navigationStack = $state<Array<{ objectId: string; title: string }>>([]);

  // Breadcrumbs derived from navigation stack
  let breadcrumbs = $derived.by(() => {
    if (!selectedServer) return [];
    const crumbs: Array<{ title: string; objectId: string | null }> = [];
    crumbs.push({ title: $tr('mediaservers.title'), objectId: null });
    crumbs.push({ title: selectedServer.name, objectId: '0' });
    for (const entry of navigationStack) {
      crumbs.push({ title: entry.title, objectId: entry.objectId });
    }
    return crumbs;
  });

  async function loadServers() {
    loading = true;
    try {
      servers = await api.getMediaServers();
    } catch (e) {
      console.error('Media servers error:', e);
    }
    loading = false;
  }

  async function selectServer(server: MediaServer) {
    selectedServer = server;
    navigationStack = [];
    await browseTo('0', server.name);
  }

  async function browseTo(objectId: string, title?: string) {
    if (!selectedServer) return;
    loading = true;
    try {
      browseResult = await api.browseMediaServer(selectedServer.id, objectId);
      // Only push to stack if not root and not already at this level
      if (title && objectId !== '0') {
        navigationStack = [...navigationStack, { objectId, title }];
      }
    } catch (e) {
      console.error('Browse error:', e);
    }
    loading = false;
  }

  function navigateToBreadcrumb(objectId: string | null) {
    if (objectId === null) {
      goToServers();
      return;
    }
    if (objectId === '0' && selectedServer) {
      navigationStack = [];
      browseTo('0', selectedServer.name);
      return;
    }
    // Find the index and truncate stack
    const idx = navigationStack.findIndex(e => e.objectId === objectId);
    if (idx >= 0) {
      navigationStack = navigationStack.slice(0, idx + 1);
      if (selectedServer) {
        loading = true;
        api.browseMediaServer(selectedServer.id, objectId).then(res => {
          browseResult = res;
          loading = false;
        }).catch(() => { loading = false; });
      }
    }
  }

  function goBack() {
    if (navigationStack.length > 1) {
      // Go to parent container
      const newStack = navigationStack.slice(0, -1);
      const parent = newStack[newStack.length - 1];
      navigationStack = newStack;
      if (selectedServer) {
        loading = true;
        api.browseMediaServer(selectedServer.id, parent.objectId).then(res => {
          browseResult = res;
          loading = false;
        }).catch(() => { loading = false; });
      }
    } else if (navigationStack.length === 1) {
      // Go back to root
      navigationStack = [];
      if (selectedServer) {
        loading = true;
        api.browseMediaServer(selectedServer.id, '0').then(res => {
          browseResult = res;
          loading = false;
        }).catch(() => { loading = false; });
      }
    } else {
      goToServers();
    }
  }

  function goToServers() {
    selectedServer = null;
    browseResult = null;
    navigationStack = [];
  }

  async function playItem(item: MediaServerItem) {
    if (!zone?.id || !selectedServer) return;
    try {
      await api.playMediaServerItem(selectedServer.id, item.id, zone.id);
    } catch (e) {
      console.error('Play media server item error:', e);
    }
  }

  async function addItemToQueue(item: MediaServerItem) {
    if (!zone?.id || !item.res_url) return;
    try {
      await api.addToQueue(zone.id, { file_path: item.res_url });
    } catch (e) {
      console.error('Add to queue error:', e);
    }
  }

  function parseItemFormat(item: MediaServerItem): string {
    if (!item.res_url) return '';
    const url = item.res_url.toLowerCase();
    // Extract format from URL extension
    let fmt = '';
    if (url.includes('.flac')) fmt = 'FLAC';
    else if (url.includes('.wav')) fmt = 'WAV';
    else if (url.includes('.mp3')) fmt = 'MP3';
    else if (url.includes('.m4a') || url.includes('.aac')) fmt = 'AAC';
    else if (url.includes('.ogg')) fmt = 'OGG';
    else if (url.includes('.dsf') || url.includes('.dsd')) fmt = 'DSD';
    else if (url.includes('.aiff') || url.includes('.aif')) fmt = 'AIFF';

    // Try to parse Asset UPnP URL pattern: /content/c2/b16/f44100/
    const match = url.match(/\/c(\d+)\/b(\d+)\/f(\d+)\//);
    if (match) {
      const bits = parseInt(match[2]);
      const rate = parseInt(match[3]);
      const rateStr = rate >= 1000 ? `${rate / 1000}kHz` : `${rate}Hz`;
      return `${fmt} ${rateStr}/${bits}bit`.trim();
    }
    return fmt;
  }

  // Load servers on mount
  loadServers();
</script>

<div class="mediaservers-view">
  {#if selectedServer && browseResult}
    <!-- Browsing a server -->
    <div class="ms-header">
      <button class="back-btn" onclick={goBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        {$tr('common.back')}
      </button>
      <nav class="breadcrumbs">
        {#each breadcrumbs as crumb, i}
          {#if i > 0}
            <span class="breadcrumb-sep">/</span>
          {/if}
          {#if i < breadcrumbs.length - 1}
            <button class="breadcrumb-link" onclick={() => navigateToBreadcrumb(crumb.objectId)}>
              {crumb.title}
            </button>
          {:else}
            <span class="breadcrumb-current">{crumb.title}</span>
          {/if}
        {/each}
      </nav>
      <button class="refresh-btn" onclick={() => selectedServer && browseTo(browseResult?.object_id ?? '0')} disabled={loading}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
        {$tr('mediaservers.refresh')}
      </button>
    </div>

    {#if loading}
      <div class="loading">
        <div class="spinner"></div>
        {$tr('common.loading')}
      </div>
    {:else}
      <!-- Containers (folders) -->
      {#if browseResult.containers.length > 0}
        <div class="container-list">
          {#each browseResult.containers as container}
            <button class="container-item" onclick={() => browseTo(container.id, container.title)}>
              <svg class="container-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              <span class="container-name">{container.title}</span>
              {#if container.child_count > 0}
                <span class="container-count">{container.child_count}</span>
              {/if}
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          {/each}
        </div>
      {/if}

      <!-- Items (tracks) -->
      {#if browseResult.items.length > 0}
        <div class="items-header">
          <span class="items-count">{browseResult.items.length} {$tr('mediaservers.items')}</span>
        </div>
        <div class="item-list">
          {#each browseResult.items as item, index}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="item-row" class:clickable={!!item.res_url} onclick={() => item.res_url && playItem(item)}>
              <span class="item-num">{index + 1}</span>
              {#if item.album_art_uri}
                <img class="item-art" src={item.album_art_uri} alt="" />
              {/if}
              <div class="item-info">
                <span class="item-title truncate">{item.title}</span>
                {#if item.artist}
                  <span class="item-artist truncate">{item.artist}</span>
                {/if}
              </div>
              {#if item.album}
                <span class="item-album truncate">{item.album}</span>
              {/if}
              {@const fmt = parseItemFormat(item)}
              {#if fmt}
                <span class="item-format">{fmt}</span>
              {/if}
              {#if item.duration_ms}
                <span class="item-duration">{formatTime(item.duration_ms)}</span>
              {/if}
              {#if item.res_url}
                <button class="item-add-queue" onclick={(e) => { e.stopPropagation(); addItemToQueue(item); }} title={$tr('queue.addToQueue')}>+</button>
              {/if}
            </div>
          {/each}
        </div>
      {:else if browseResult.containers.length === 0}
        <div class="empty">{$tr('mediaservers.noContent')}</div>
      {/if}
    {/if}

  {:else}
    <!-- Server list -->
    <div class="ms-header">
      <h2>{$tr('mediaservers.title')}</h2>
      <button class="refresh-btn" onclick={loadServers} disabled={loading}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
        {$tr('mediaservers.refresh')}
      </button>
    </div>

    {#if loading}
      <div class="loading">
        <div class="spinner"></div>
        {$tr('mediaservers.searching')}
      </div>
    {:else if servers.length === 0}
      <div class="empty">{$tr('mediaservers.noServers')}</div>
    {:else}
      <div class="server-list">
        {#each servers as server}
          <button class="server-item" onclick={() => selectServer(server)}>
            <svg class="server-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
            <div class="server-info">
              <span class="server-name">{server.name}</span>
              <span class="server-detail truncate">{server.manufacturer} &middot; {server.host}:{server.port}</span>
            </div>
            <span class="server-status" class:available={server.available} class:unavailable={!server.available}>
              {server.available ? '' : $tr('mediaservers.unavailable')}
            </span>
            <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .mediaservers-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
  }

  .ms-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .ms-header h2 {
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

  .refresh-btn {
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

  .refresh-btn:hover:not(:disabled) {
    border-color: var(--tune-text-muted);
    color: var(--tune-text);
  }

  .refresh-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  /* Server list */
  .server-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .server-item {
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

  .server-item:hover {
    border-color: var(--tune-accent);
    background: var(--tune-surface-hover);
  }

  .server-icon {
    flex-shrink: 0;
    opacity: 0.6;
  }

  .server-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .server-name {
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
  }

  .server-detail {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .server-status {
    font-family: var(--font-body);
    font-size: 12px;
    flex-shrink: 0;
  }

  .server-status.available::before {
    content: '';
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22c55e;
  }

  .server-status.unavailable {
    color: var(--tune-text-muted);
  }

  /* Container list */
  .container-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-bottom: var(--space-lg);
  }

  .container-item {
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

  .container-item:hover {
    background: var(--tune-surface-hover);
  }

  .container-icon {
    flex-shrink: 0;
    color: var(--tune-text-secondary);
    opacity: 0.7;
  }

  .container-name {
    flex: 1;
    font-weight: 600;
  }

  .container-count {
    font-size: 12px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .chevron {
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  /* Items section */
  .items-header {
    display: flex;
    align-items: center;
    padding: var(--space-sm) 0;
    margin-bottom: var(--space-sm);
    border-top: 1px solid var(--tune-border);
    padding-top: var(--space-md);
  }

  .items-count {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .item-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    overflow-y: auto;
  }

  .item-row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 8px 20px;
    transition: background 0.12s ease-out;
  }

  .item-row.clickable {
    cursor: pointer;
  }

  .item-row:hover {
    background: var(--tune-surface-hover);
  }

  .item-art {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    object-fit: cover;
    flex-shrink: 0;
  }

  .item-format {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 500;
    color: var(--tune-accent);
    background: rgba(107, 110, 217, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .item-duration {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .item-add-queue {
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-muted);
    font-size: 14px;
    font-weight: 600;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.12s, color 0.12s, border-color 0.12s;
  }

  .item-row:hover .item-add-queue {
    opacity: 1;
  }

  .item-add-queue:hover {
    color: var(--tune-accent);
    border-color: var(--tune-accent);
  }

  .item-num {
    width: 28px;
    text-align: center;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .item-title {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
  }

  .item-artist {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
  }

  .item-album {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    max-width: 200px;
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

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>

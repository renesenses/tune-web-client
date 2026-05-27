<script lang="ts">
  import * as api from '../lib/api';
  import { t } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import AlbumArt from './AlbumArt.svelte';

  interface OfflineDownload {
    id: string;
    title: string;
    artist_name?: string;
    album_title?: string;
    album_id?: number | null;
    cover_path?: string | null;
    source: string;
    source_id: string;
    status: 'complete' | 'downloading' | 'pending' | 'error';
    progress_percent?: number;
    size_bytes?: number;
    duration_ms?: number;
  }

  interface OfflineStatus {
    total: number;
    size_bytes: number;
    pending: number;
  }

  let status: OfflineStatus | null = $state(null);
  let downloads: OfflineDownload[] = $state([]);
  let loading = $state(true);
  let syncing = $state(false);
  let clearing = $state(false);
  let removingId = $state<string | null>(null);

  // Group downloads by album
  let albumGroups = $derived.by(() => {
    const groups = new Map<string, { album_title: string; artist_name: string; cover_path: string | null; album_id: number | null; tracks: OfflineDownload[] }>();
    for (const dl of downloads) {
      const key = dl.album_title ?? dl.title;
      if (!groups.has(key)) {
        groups.set(key, {
          album_title: dl.album_title ?? dl.title,
          artist_name: dl.artist_name ?? '',
          cover_path: dl.cover_path ?? null,
          album_id: dl.album_id ?? null,
          tracks: [],
        });
      }
      groups.get(key)!.tracks.push(dl);
    }
    return Array.from(groups.values());
  });

  let completedCount = $derived(downloads.filter(d => d.status === 'complete').length);
  let pendingCount = $derived(downloads.filter(d => d.status === 'downloading' || d.status === 'pending').length);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  function formatDuration(ms: number): string {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  async function loadAll() {
    loading = true;
    try {
      const [s, d] = await Promise.all([
        api.getOfflineStatus(),
        api.getOfflineDownloads(),
      ]);
      status = s as OfflineStatus;
      downloads = (d as OfflineDownload[]) ?? [];
    } catch (e) {
      console.error('Load offline data error:', e);
    }
    loading = false;
  }

  async function handleSync() {
    syncing = true;
    try {
      await api.syncOffline();
      notifications.success('Synchronisation lancee');
      // Refresh after a short delay
      setTimeout(loadAll, 2000);
    } catch (e: any) {
      notifications.error(e?.message || 'Erreur de synchronisation');
    }
    syncing = false;
  }

  async function handleClear() {
    if (!confirm('Supprimer tous les telechargements hors-ligne ?')) return;
    clearing = true;
    try {
      await api.clearOffline();
      notifications.success('Tous les telechargements supprimes');
      await loadAll();
    } catch (e: any) {
      notifications.error(e?.message || 'Erreur');
    }
    clearing = false;
  }

  async function handleRemove(id: string) {
    removingId = id;
    try {
      await api.removeOfflineDownload(id);
      downloads = downloads.filter(d => d.id !== id);
      // Refresh status
      try {
        status = await api.getOfflineStatus() as OfflineStatus;
      } catch { /* ignore */ }
    } catch (e: any) {
      notifications.error(e?.message || 'Erreur');
    }
    removingId = null;
  }

  $effect(() => {
    loadAll();
  });
</script>

<div class="offline-view">
  <div class="offline-header">
    <h1 class="offline-title">Ecoute hors-ligne</h1>

    {#if status}
      <div class="offline-stats">
        <span class="stat-pill">{status.total} piste{status.total !== 1 ? 's' : ''}</span>
        <span class="stat-pill">{formatSize(status.size_bytes)}</span>
        {#if status.pending > 0}
          <span class="stat-pill pending">{status.pending} en attente</span>
        {/if}
      </div>
    {/if}

    <div class="offline-actions">
      <button class="btn-action" onclick={handleSync} disabled={syncing}>
        {#if syncing}
          <div class="spinner"></div>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        {/if}
        Synchroniser
      </button>
      <button class="btn-action danger" onclick={handleClear} disabled={clearing || downloads.length === 0}>
        {#if clearing}
          <div class="spinner"></div>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        {/if}
        Tout supprimer
      </button>
    </div>
  </div>

  {#if loading}
    <div class="loading-state">
      <div class="spinner spinner-lg"></div>
      <p>Chargement...</p>
    </div>

  {:else if downloads.length === 0}
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <h2>Aucun telechargement</h2>
      <p>Telechargez des pistes depuis les services de streaming pour les ecouter hors-ligne.</p>
    </div>

  {:else}
    <!-- Albums grouped -->
    {#if albumGroups.length > 0}
      <div class="section">
        <h2 class="section-title">Albums telecharges</h2>
        <div class="album-grid">
          {#each albumGroups as group}
            <div class="album-card">
              <div class="album-card-cover">
                <AlbumArt coverPath={group.cover_path} albumId={group.album_id} size={120} alt={group.album_title} />
              </div>
              <div class="album-card-info">
                <span class="album-card-title truncate">{group.album_title}</span>
                <span class="album-card-artist truncate">{group.artist_name}</span>
                <span class="album-card-count">
                  {group.tracks.filter(t => t.status === 'complete').length}/{group.tracks.length} pistes
                  {#if group.tracks.some(t => t.status === 'downloading' || t.status === 'pending')}
                    <span class="downloading-badge">...</span>
                  {:else}
                    <span class="complete-badge">OK</span>
                  {/if}
                </span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Track list -->
    <div class="section">
      <h2 class="section-title">Pistes ({downloads.length})</h2>
      <div class="tracks-list">
        {#each downloads as dl}
          <div class="track-row" class:downloading={dl.status === 'downloading'} class:error={dl.status === 'error'}>
            <div class="track-status">
              {#if dl.status === 'complete'}
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--tune-success)" stroke-width="2.5" width="16" height="16">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              {:else if dl.status === 'downloading'}
                <div class="spinner spinner-sm"></div>
              {:else if dl.status === 'pending'}
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--tune-text-muted)" stroke-width="2" width="16" height="16">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--tune-warning)" stroke-width="2" width="16" height="16">
                  <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              {/if}
            </div>
            <div class="track-cover">
              <AlbumArt coverPath={dl.cover_path} albumId={dl.album_id} size={40} alt={dl.title} />
            </div>
            <div class="track-info">
              <span class="track-title truncate">{dl.title}</span>
              <span class="track-meta truncate">{dl.artist_name ?? ''}{dl.album_title ? ` — ${dl.album_title}` : ''}</span>
              {#if dl.status === 'downloading' && dl.progress_percent != null}
                <div class="download-progress">
                  <div class="download-progress-bar" style="width: {dl.progress_percent}%"></div>
                </div>
              {/if}
            </div>
            <div class="track-right">
              {#if dl.duration_ms}
                <span class="track-duration">{formatDuration(dl.duration_ms)}</span>
              {/if}
              {#if dl.size_bytes}
                <span class="track-size">{formatSize(dl.size_bytes)}</span>
              {/if}
            </div>
            <button class="btn-remove" onclick={() => handleRemove(dl.id)} disabled={removingId === dl.id} title="Supprimer">
              {#if removingId === dl.id}
                <div class="spinner spinner-sm"></div>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              {/if}
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .offline-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-xl) 32px;
    overflow-y: auto;
    gap: var(--space-xl);
  }

  .offline-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .offline-title {
    font-family: var(--font-display);
    font-size: 36px;
    font-weight: 600;
    color: var(--tune-text);
    line-height: 1.1;
  }

  .offline-stats {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .stat-pill {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    padding: 4px 12px;
    border-radius: 20px;
  }

  .stat-pill.pending {
    color: var(--tune-accent);
    border-color: var(--tune-accent);
    background: rgba(99, 102, 241, 0.1);
  }

  .offline-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .btn-action {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-lg);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .btn-action:hover:not(:disabled) {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .btn-action:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .btn-action.danger:hover:not(:disabled) {
    border-color: var(--tune-warning);
    color: var(--tune-warning);
  }

  .btn-action svg {
    flex-shrink: 0;
  }

  /* Loading */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-xxl, 60px);
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 14px;
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-xxl, 60px);
    text-align: center;
    color: var(--tune-text-muted);
  }

  .empty-state h2 {
    font-family: var(--font-label);
    font-size: 20px;
    font-weight: 600;
    color: var(--tune-text);
    margin: 0;
  }

  .empty-state p {
    font-family: var(--font-body);
    font-size: 14px;
    max-width: 400px;
    line-height: 1.5;
    margin: 0;
  }

  /* Section */
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .section-title {
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text);
    margin: 0;
  }

  /* Album grid */
  .album-grid {
    display: flex;
    gap: var(--space-md);
    overflow-x: auto;
    padding: var(--space-xs) 0;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .album-grid::-webkit-scrollbar { display: none; }

  .album-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    flex-shrink: 0;
    width: 120px;
  }

  .album-card-cover {
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .album-card-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .album-card-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    color: var(--tune-text);
    max-width: 120px;
  }

  .album-card-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    max-width: 120px;
  }

  .album-card-count {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-text-muted);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .complete-badge {
    color: var(--tune-success);
    font-weight: 700;
  }

  .downloading-badge {
    color: var(--tune-accent);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  /* Track list */
  .tracks-list {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .track-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    transition: background 0.12s;
  }

  .track-row:hover {
    background: var(--tune-surface-hover);
  }

  .track-row + .track-row {
    border-top: 1px solid var(--tune-border);
  }

  .track-row.downloading {
    background: rgba(99, 102, 241, 0.05);
  }

  .track-row.error {
    background: rgba(201, 84, 75, 0.05);
  }

  .track-status {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    flex-shrink: 0;
  }

  .track-cover {
    flex-shrink: 0;
  }

  .track-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .track-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text);
  }

  .track-meta {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }

  .download-progress {
    width: 100%;
    height: 3px;
    background: var(--tune-border);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 2px;
  }

  .download-progress-bar {
    height: 100%;
    background: var(--tune-accent);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .track-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }

  .track-duration {
    font-family: var(--font-label);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .track-size {
    font-family: var(--font-label);
    font-size: 10px;
    color: var(--tune-text-muted);
  }

  .btn-remove {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: color 0.12s;
  }

  .btn-remove:hover:not(:disabled) {
    color: var(--tune-warning);
  }

  .btn-remove:disabled {
    opacity: 0.4;
  }

  /* Spinner */
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  .spinner-sm { width: 12px; height: 12px; }
  .spinner-lg { width: 24px; height: 24px; border-width: 3px; }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Utility */
  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 768px) {
    .offline-view {
      padding: var(--space-lg) var(--space-md);
    }

    .offline-title {
      font-size: 28px;
    }

    .offline-actions {
      flex-direction: column;
    }

    .track-right {
      display: none;
    }
  }
</style>

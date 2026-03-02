<script lang="ts">
  import * as api from '../lib/api';
  import { artworkUrl } from '../lib/api';
  import type { Album, CompletenessStats, BackupInfo } from '../lib/types';
  import { t } from '../lib/i18n';
  import AlbumArt from './AlbumArt.svelte';
  import AlbumEditModal from './AlbumEditModal.svelte';

  let stats = $state<CompletenessStats | null>(null);
  let albumsWithoutCover = $state<Album[]>([]);
  let allAlbums = $state<Album[]>([]);
  let loading = $state(true);
  let filter = $state<'all' | 'no_cover' | 'no_genre' | 'no_year'>('no_cover');

  let editAlbum = $state<Album | null>(null);
  let rescanningAll = $state(false);

  let backups = $state<BackupInfo[]>([]);
  let backupLoading = $state(false);
  let backupCreating = $state(false);
  let restoring = $state<string | null>(null);
  let backupMessage = $state<{ text: string; type: 'success' | 'error' } | null>(null);

  async function loadData() {
    loading = true;
    try {
      const [s, albums] = await Promise.all([
        api.getCompletenessStats(),
        api.getAlbums(500, 0),
      ]);
      stats = s;
      allAlbums = albums;
      albumsWithoutCover = albums.filter(a => !a.cover_path);
    } catch (e) {
      console.error('Load metadata error:', e);
    }
    loading = false;
  }

  let filteredAlbums = $derived.by(() => {
    switch (filter) {
      case 'no_cover':
        return allAlbums.filter(a => !a.cover_path);
      case 'no_genre':
        return allAlbums.filter(a => !a.genre);
      case 'no_year':
        return allAlbums.filter(a => !a.year);
      default:
        return allAlbums;
    }
  });

  function completionPercent(missing: number, total: number): number {
    if (total === 0) return 100;
    return Math.round(((total - missing) / total) * 100);
  }

  async function rescanAll() {
    rescanningAll = true;
    try {
      await api.rescanArtwork();
    } catch (e) {
      console.error('Rescan error:', e);
    }
    rescanningAll = false;
  }

  async function triggerScan() {
    try {
      await api.triggerScan();
    } catch (e) {
      console.error('Scan error:', e);
    }
  }

  function handleAlbumSaved(updated: Album) {
    allAlbums = allAlbums.map(a => a.id === updated.id ? updated : a);
    albumsWithoutCover = allAlbums.filter(a => !a.cover_path);
    // Refresh stats
    api.getCompletenessStats().then(s => stats = s);
  }

  async function loadBackups() {
    backupLoading = true;
    try {
      backups = await api.getBackups();
    } catch (e) {
      console.error('Load backups error:', e);
    }
    backupLoading = false;
  }

  async function createBackup() {
    backupCreating = true;
    backupMessage = null;
    try {
      await api.createBackup();
      await loadBackups();
      backupMessage = { text: $t('maintenance.backupCreated'), type: 'success' };
    } catch (e) {
      backupMessage = { text: $t('maintenance.backupError'), type: 'error' };
    }
    backupCreating = false;
  }

  async function restoreBackup(filename: string) {
    if (!confirm($t('maintenance.restoreConfirm'))) return;
    restoring = filename;
    backupMessage = null;
    try {
      await api.restoreBackup(filename);
      backupMessage = { text: $t('maintenance.restoreSuccess'), type: 'success' };
      await loadData();
    } catch (e) {
      backupMessage = { text: $t('maintenance.restoreError'), type: 'error' };
    }
    restoring = null;
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatBackupDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  $effect(() => {
    loadData();
    loadBackups();
  });
</script>

<div class="metadata-view">
  <div class="view-header">
    <h1>{$t('metadata.title')}</h1>
    <div class="header-actions">
      <button class="btn-action" onclick={triggerScan}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 12a9 9 0 1 1-9-9" /><polyline points="21 3 21 9 15 9" /></svg>
        {$t('settings.scanLibrary')}
      </button>
      <button class="btn-action" onclick={rescanAll} disabled={rescanningAll}>
        {#if rescanningAll}
          <div class="spinner small"></div>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
        {/if}
        {$t('metadata.rescanAll')}
      </button>
    </div>
  </div>

  {#if loading}
    <div class="loading"><div class="spinner"></div></div>
  {:else if stats}
    <!-- Stats dashboard -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">{$t('metadata.cover')}</span>
          <span class="stat-value">{completionPercent(stats.albums_without_cover, stats.total_albums)}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {completionPercent(stats.albums_without_cover, stats.total_albums)}%"></div>
        </div>
        <span class="stat-detail">{stats.albums_without_cover} / {stats.total_albums} {$t('metadata.missingCovers').toLowerCase()}</span>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">{$t('metadata.genre')}</span>
          <span class="stat-value">{completionPercent(stats.albums_without_genre, stats.total_albums)}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {completionPercent(stats.albums_without_genre, stats.total_albums)}%"></div>
        </div>
        <span class="stat-detail">{stats.albums_without_genre} / {stats.total_albums} {$t('metadata.missingGenre').toLowerCase()}</span>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">{$t('metadata.year')}</span>
          <span class="stat-value">{completionPercent(stats.albums_without_year, stats.total_albums)}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {completionPercent(stats.albums_without_year, stats.total_albums)}%"></div>
        </div>
        <span class="stat-detail">{stats.albums_without_year} / {stats.total_albums} {$t('metadata.missingYear').toLowerCase()}</span>
      </div>
    </div>

    <!-- Backup / Restore -->
    <div class="section-divider">
      <h2 class="section-title">{$t('maintenance.backupRestore')}</h2>
    </div>
    <div class="backup-section">
      <div class="backup-header">
        <button class="btn-action btn-primary" onclick={createBackup} disabled={backupCreating}>
          {#if backupCreating}
            <div class="spinner small"></div>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
          {/if}
          {$t('maintenance.createBackup')}
        </button>
        {#if backupMessage}
          <span class="backup-msg" class:success={backupMessage.type === 'success'} class:error={backupMessage.type === 'error'}>
            {backupMessage.text}
          </span>
        {/if}
      </div>
      {#if backupLoading}
        <div class="loading"><div class="spinner small"></div></div>
      {:else if backups.length === 0}
        <p class="backup-empty">{$t('maintenance.noBackups')}</p>
      {:else}
        <div class="backup-list">
          {#each backups as backup}
            <div class="backup-item">
              <div class="backup-info">
                <span class="backup-name">{backup.filename}</span>
                <span class="backup-meta">{formatBackupDate(backup.created_at)} &middot; {formatFileSize(backup.size)}</span>
              </div>
              <button class="btn-restore" onclick={() => restoreBackup(backup.filename)} disabled={restoring !== null}>
                {#if restoring === backup.filename}
                  <div class="spinner small"></div>
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                {/if}
                {$t('maintenance.restore')}
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <span class="filter-label">{$t('metadata.filter')}:</span>
      <button class="filter-btn" class:active={filter === 'all'} onclick={() => filter = 'all'}>{$t('metadata.all')}</button>
      <button class="filter-btn" class:active={filter === 'no_cover'} onclick={() => filter = 'no_cover'}>{$t('metadata.missingCovers')} ({stats.albums_without_cover})</button>
      <button class="filter-btn" class:active={filter === 'no_genre'} onclick={() => filter = 'no_genre'}>{$t('metadata.missingGenre')} ({stats.albums_without_genre})</button>
      <button class="filter-btn" class:active={filter === 'no_year'} onclick={() => filter = 'no_year'}>{$t('metadata.missingYear')} ({stats.albums_without_year})</button>
    </div>

    <!-- Albums grid -->
    {#if filteredAlbums.length === 0}
      <div class="empty">
        {#if filter === 'no_cover'}
          {$t('metadata.noMissingCovers')}
        {:else}
          {$t('common.noResult')}
        {/if}
      </div>
    {:else}
      <div class="albums-grid">
        {#each filteredAlbums as album (album.id)}
          <button class="album-card" onclick={() => editAlbum = album}>
            <div class="album-card-art">
              <AlbumArt coverPath={album.cover_path} size={140} />
              {#if !album.cover_path}
                <div class="no-cover-badge">{$t('metadata.noCover')}</div>
              {/if}
            </div>
            <span class="album-card-title">{album.title}</span>
            <span class="album-card-artist">{album.artist_name ?? ''}</span>
            <div class="album-card-tags">
              {#if !album.genre}
                <span class="tag missing">{$t('metadata.genre')}</span>
              {/if}
              {#if !album.year}
                <span class="tag missing">{$t('metadata.year')}</span>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

{#if editAlbum}
  <AlbumEditModal
    album={editAlbum}
    onClose={() => editAlbum = null}
    onSaved={handleAlbumSaved}
  />
{/if}

<style>
  .metadata-view {
    padding: 24px;
    max-width: 1200px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .view-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .view-header h1 {
    font-family: var(--font-display);
    font-size: 24px;
    font-weight: 700;
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .btn-action {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: var(--tune-grey2);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s;
  }

  .btn-action:hover:not(:disabled) {
    background: var(--tune-surface-hover);
    border-color: var(--tune-accent);
  }

  .btn-action:disabled { opacity: 0.5; cursor: default; }

  .btn-action.btn-primary {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
  }

  .btn-action.btn-primary:hover:not(:disabled) {
    background: var(--tune-accent-hover);
  }

  /* Section divider */
  .section-divider {
    margin-top: 8px;
  }

  .section-title {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--tune-text-muted);
  }

  /* Backup section */
  .backup-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .backup-header {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .backup-msg {
    font-family: var(--font-body);
    font-size: 13px;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
  }

  .backup-msg.success {
    color: var(--tune-success, #4ade80);
    background: rgba(74, 222, 128, 0.1);
  }

  .backup-msg.error {
    color: var(--tune-error, #ef4444);
    background: rgba(239, 68, 68, 0.1);
  }

  .backup-empty {
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 13px;
  }

  .backup-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--tune-border);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .backup-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--tune-surface);
  }

  .backup-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .backup-name {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
  }

  .backup-meta {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .btn-restore {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    background: var(--tune-grey2);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text-secondary);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 12px;
    transition: all 0.12s;
  }

  .btn-restore:hover:not(:disabled) {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .btn-restore:disabled { opacity: 0.5; cursor: default; }

  /* Stats grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }

  .stat-card {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .stat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stat-label {
    font-family: var(--font-label);
    font-size: 13px;
    color: var(--tune-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-value {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 700;
  }

  .progress-bar {
    height: 6px;
    background: var(--tune-grey2);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--tune-accent);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .stat-detail {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  /* Filter bar */
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .filter-label {
    font-family: var(--font-label);
    font-size: 12px;
    color: var(--tune-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .filter-btn {
    padding: 6px 12px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-full, 999px);
    color: var(--tune-text-muted);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 12px;
    transition: all 0.12s;
  }

  .filter-btn:hover { border-color: var(--tune-accent); color: var(--tune-text); }

  .filter-btn.active {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
  }

  /* Albums grid */
  .albums-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 16px;
  }

  .album-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    padding: 8px;
    border-radius: var(--radius-md);
    transition: background 0.12s;
  }

  .album-card:hover {
    background: var(--tune-surface-hover);
  }

  .album-card-art {
    position: relative;
  }

  .no-cover-badge {
    position: absolute;
    bottom: 6px;
    left: 6px;
    background: rgba(239, 68, 68, 0.85);
    color: white;
    font-family: var(--font-body);
    font-size: 10px;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .album-card-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .album-card-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .album-card-tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .tag {
    font-family: var(--font-body);
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
  }

  .tag.missing {
    background: rgba(251, 146, 60, 0.2);
    color: var(--tune-warning, #fb923c);
  }

  /* Empty & loading */
  .empty {
    text-align: center;
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 14px;
    padding: 40px;
  }

  .loading {
    display: flex;
    justify-content: center;
    padding: 40px;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner.small {
    width: 14px;
    height: 14px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>

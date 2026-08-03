<script lang="ts">
  import { get } from 'svelte/store';
  import * as api from '../lib/api';
  import type { Album, Track } from '../lib/types';
  import { t } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import { isPremium } from '../lib/stores/license';

  // --- Source selection (verbatim from the converter) ---
  type SourceTab = 'library' | 'directories';
  let sourceTab = $state<SourceTab>('library');

  // Library albums
  let albums = $state<Album[]>([]);
  let albumsLoading = $state(true);
  let selectedAlbumIds = $state<Set<number>>(new Set());

  // Track count for selected albums (fetched lazily)
  let selectedTrackCount = $state(0);
  let trackCountLoading = $state(false);

  // Directory browsing
  let browseRoots = $state<{ name: string; path: string; track_count: number }[]>([]);
  let currentBrowsePath = $state<string | null>(null);
  let browseDirectories = $state<{ name: string; path: string; track_count: number }[]>([]);
  let browseTracks = $state<Track[]>([]);
  let browseParent = $state<string | null>(null);
  let browseLoading = $state(false);
  let selectedDirPaths = $state<Set<string>>(new Set());

  // --- Dé-ploc options ---
  let thresholdDb = $state(-60); // -80..-30
  let trimLead = $state(true);
  let trimTail = $state(true);
  let zeroCross = $state(true);
  let outputFormat = $state<'flac' | 'wav'>('flac');

  // --- Job state ---
  type JobState = 'idle' | 'converting' | 'done' | 'error';
  let jobState = $state<JobState>('idle');
  let jobId = $state<string | null>(null);
  let progress = $state(0);
  let currentFile = $state('');
  let processedCount = $state(0);
  let totalCount = $state(0);
  let jobError = $state('');
  let pollTimer = $state<ReturnType<typeof setInterval> | null>(null);

  // --- Selection info ---
  let selectionCount = $derived(
    sourceTab === 'library'
      ? selectedAlbumIds.size
      : selectedDirPaths.size
  );

  let selectionLabel = $derived(
    sourceTab === 'library'
      ? `${selectedAlbumIds.size} album${selectedAlbumIds.size !== 1 ? 's' : ''} selectionne${selectedAlbumIds.size !== 1 ? 's' : ''}${trackCountLoading ? '' : ` (${selectedTrackCount} piste${selectedTrackCount !== 1 ? 's' : ''})`}`
      : `${selectedDirPaths.size} repertoire${selectedDirPaths.size !== 1 ? 's' : ''} selectionne${selectedDirPaths.size !== 1 ? 's' : ''}`
  );

  let hasSelection = $derived(selectionCount > 0);

  // --- Load albums ---
  async function loadAlbums() {
    albumsLoading = true;
    try {
      albums = await api.getAllAlbums(2000);
    } catch (e: any) {
      console.error('Failed to load albums:', e);
      notifications.error(get(t)('declick.loadAlbumsError'));
    }
    albumsLoading = false;
  }

  // Load on mount
  loadAlbums();

  // --- Load browse roots ---
  async function loadBrowseRoots() {
    browseLoading = true;
    try {
      const result = await api.getBrowseRoots();
      browseRoots = result.roots ?? [];
    } catch (e: any) {
      console.error('Failed to load browse roots:', e);
    }
    browseLoading = false;
  }

  async function browseTo(path: string) {
    browseLoading = true;
    try {
      const result = await api.browseDirectory(path);
      currentBrowsePath = result.path;
      browseDirectories = result.directories ?? [];
      browseTracks = result.tracks ?? [];
      browseParent = result.parent;
    } catch (e: any) {
      console.error('Failed to browse directory:', e);
      notifications.error(get(t)('declick.browseError'));
    }
    browseLoading = false;
  }

  function browseBack() {
    if (browseParent) {
      browseTo(browseParent);
    } else {
      currentBrowsePath = null;
    }
  }

  // Load browse roots when switching to directories tab
  $effect(() => {
    if (sourceTab === 'directories' && browseRoots.length === 0) {
      loadBrowseRoots();
    }
  });

  // --- Album selection ---
  function toggleAlbum(albumId: number | null) {
    if (albumId == null) return;
    const next = new Set(selectedAlbumIds);
    if (next.has(albumId)) {
      next.delete(albumId);
    } else {
      next.add(albumId);
    }
    selectedAlbumIds = next;
  }

  function selectAllAlbums() {
    selectedAlbumIds = new Set(albums.filter(a => a.id != null).map(a => a.id!));
  }

  function deselectAllAlbums() {
    selectedAlbumIds = new Set();
  }

  // Update track count when selection changes
  $effect(() => {
    const ids = selectedAlbumIds;
    if (ids.size === 0) {
      selectedTrackCount = 0;
      return;
    }
    let count = 0;
    for (const id of ids) {
      const album = albums.find(a => a.id === id);
      if (album?.track_count) count += album.track_count;
    }
    selectedTrackCount = count;
  });

  // --- Directory selection ---
  function toggleDir(path: string) {
    const next = new Set(selectedDirPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    selectedDirPaths = next;
  }

  // --- Cover URL helper ---
  function coverUrl(album: Album): string {
    return api.artworkUrl(album.cover_path, 200);
  }

  // --- Dé-ploc actions ---
  async function startDeclick() {
    if (!hasSelection) return;
    jobState = 'converting';
    jobError = '';
    progress = 0;
    processedCount = 0;
    currentFile = '';

    const sources = sourceTab === 'library'
      ? Array.from(selectedAlbumIds).map((id) => ({ album_id: id }))
      : Array.from(selectedDirPaths).map((path) => ({ path }));

    try {
      const result = await api.startDeclick(sources, {
        threshold_db: thresholdDb,
        trim_lead: trimLead,
        trim_tail: trimTail,
        zero_cross: zeroCross,
        output_format: outputFormat,
      });
      jobId = result.job_id;
      totalCount = result.total_tracks ?? 0;
      startPolling();
    } catch (e: any) {
      jobState = 'error';
      jobError = e?.message || get(t)('declick.startError');
      notifications.error(jobError);
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (!jobId) return;
      try {
        // Server contract: status in running|completed|failed|cancelled,
        // completed/total counts, current_file, errors[].
        const status = await api.getDeclickStatus(jobId);
        currentFile = status.current_file ?? '';
        processedCount = status.completed ?? 0;
        totalCount = status.total ?? totalCount;
        progress = totalCount > 0 ? (processedCount / totalCount) * 100 : 0;

        if (status.status === 'completed') {
          progress = 100;
          jobState = 'done';
          stopPolling();
        } else if (status.status === 'failed') {
          jobState = 'error';
          jobError = (status.errors && status.errors.length > 0 ? status.errors[0] : '') || get(t)('declick.processError');
          stopPolling();
        } else if (status.status === 'cancelled') {
          jobState = 'idle';
          stopPolling();
        }
      } catch (e: any) {
        console.error('Poll error:', e);
      }
    }, 1500);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function cancelDeclick() {
    if (!jobId) return;
    try {
      await api.cancelDeclick(jobId);
      jobState = 'idle';
      stopPolling();
      notifications.info(get(t)('declick.cancelled'));
    } catch (e: any) {
      console.error('Cancel error:', e);
    }
  }

  async function downloadResult() {
    if (!jobId) return;
    try {
      const blobUrl = await api.downloadDeclick(jobId);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `tune-declick-${jobId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      notifications.error(get(t)('declick.downloadError'));
    }
  }

  function resetJob() {
    jobState = 'idle';
    jobId = null;
    progress = 0;
    currentFile = '';
    processedCount = 0;
    totalCount = 0;
    jobError = '';
    stopPolling();
  }

  // Album search/filter
  let albumSearch = $state('');
  let filteredAlbums = $derived(
    albumSearch.trim()
      ? albums.filter(a => {
          const q = albumSearch.toLowerCase();
          return (a.title?.toLowerCase().includes(q)) ||
                 (a.artist_name?.toLowerCase().includes(q));
        })
      : albums
  );
</script>

<div class="converter-view">
  <header class="converter-header">
    <h2>{$t('declick.title')}</h2>
    <p class="converter-subtitle">{$t('declick.subtitle')}</p>
    <p class="converter-note">{$t('declick.exportNote')}</p>
  </header>

  <!-- Source selection -->
  <section class="source-section">
    <div class="section-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>
      {$t('declick.source')}
    </div>

    <div class="source-tabs">
      <button
        class="source-tab"
        class:active={sourceTab === 'library'}
        onclick={() => sourceTab = 'library'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        {$t('declick.library')}
      </button>
      <button
        class="source-tab"
        class:active={sourceTab === 'directories'}
        onclick={() => sourceTab = 'directories'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        {$t('declick.directories')}
      </button>
    </div>

    {#if sourceTab === 'library'}
      <!-- Library tab -->
      <div class="source-toolbar">
        <input
          type="text"
          class="album-search"
          placeholder={$t('declick.searchAlbum')}
          bind:value={albumSearch}
        />
        <div class="selection-actions">
          <button class="action-btn" onclick={selectAllAlbums}>{$t('declick.selectAll')}</button>
          <button class="action-btn" onclick={deselectAllAlbums}>{$t('declick.deselectAll')}</button>
        </div>
      </div>

      {#if albumsLoading}
        <div class="loading-state">
          <div class="spinner"></div>
          {$t('declick.loadingAlbums')}
        </div>
      {:else}
        <div class="albums-grid">
          {#each filteredAlbums as album (album.id)}
            <button
              class="album-card"
              class:selected={album.id != null && selectedAlbumIds.has(album.id)}
              onclick={() => toggleAlbum(album.id)}
            >
              <div class="album-cover">
                {#if album.cover_path}
                  <img src={coverUrl(album)} alt={album.title} loading="lazy" />
                {:else}
                  <div class="album-cover-placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24">
                      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                    </svg>
                  </div>
                {/if}
                {#if album.id != null && selectedAlbumIds.has(album.id)}
                  <div class="album-check">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="16" height="16">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                {/if}
              </div>
              <div class="album-title">{album.title}</div>
              <div class="album-artist">{album.artist_name ?? ''}</div>
            </button>
          {/each}
        </div>
      {/if}
    {:else}
      <!-- Directories tab -->
      {#if currentBrowsePath === null}
        <!-- Show roots -->
        {#if browseLoading}
          <div class="loading-state">
            <div class="spinner"></div>
            {$t('common.loading')}
          </div>
        {:else if browseRoots.length === 0}
          <div class="empty-state">{$t('declick.noMusicDir')}</div>
        {:else}
          <div class="dir-list">
            {#each browseRoots as root}
              <div class="dir-row">
                <button class="dir-checkbox" class:checked={selectedDirPaths.has(root.path)} onclick={() => toggleDir(root.path)}>
                  {#if selectedDirPaths.has(root.path)}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>
                  {/if}
                </button>
                <button class="dir-name" ondblclick={() => browseTo(root.path)} onclick={() => toggleDir(root.path)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span>{root.name}</span>
                  <span class="dir-count">{root.track_count} {$t('common.tracks')}</span>
                </button>
              </div>
            {/each}
          </div>
        {/if}
      {:else}
        <!-- Browsing a directory -->
        <div class="browse-breadcrumb">
          <button class="browse-back" onclick={browseBack}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            {$t('common.back')}
          </button>
          <span class="browse-path">{currentBrowsePath}</span>
        </div>

        {#if browseLoading}
          <div class="loading-state">
            <div class="spinner"></div>
            {$t('common.loading')}
          </div>
        {:else}
          <div class="dir-list">
            {#each browseDirectories as dir}
              <div class="dir-row">
                <button class="dir-checkbox" class:checked={selectedDirPaths.has(dir.path)} onclick={() => toggleDir(dir.path)}>
                  {#if selectedDirPaths.has(dir.path)}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>
                  {/if}
                </button>
                <button class="dir-name" ondblclick={() => browseTo(dir.path)} onclick={() => toggleDir(dir.path)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span>{dir.name}</span>
                  <span class="dir-count">{dir.track_count} {$t('common.tracks')}</span>
                </button>
              </div>
            {/each}
            {#if browseDirectories.length === 0 && browseTracks.length === 0}
              <div class="empty-state">{$t('declick.emptyDir')}</div>
            {/if}
          </div>
        {/if}
      {/if}
    {/if}

    <!-- Selection counter -->
    {#if hasSelection}
      <div class="selection-counter">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        {selectionLabel}
      </div>
    {/if}
  </section>

  <!-- Dé-ploc options -->
  <section class="settings-section">
    <div class="section-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
        <line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>
      </svg>
      {$t('declick.options')}
    </div>

    <div class="declick-settings">
      <!-- Threshold slider -->
      <div class="setting-block">
        <div class="setting-head">
          <label class="setting-label" for="declick-threshold">{$t('declick.thresholdDb')}</label>
          <span class="setting-value">{thresholdDb} dB</span>
        </div>
        <input
          id="declick-threshold"
          class="range-slider"
          type="range"
          min="-80"
          max="-30"
          step="1"
          bind:value={thresholdDb}
        />
      </div>

      <!-- Output format -->
      <div class="setting-block">
        <label class="setting-label" for="declick-outfmt">{$t('declick.outputFormat')}</label>
        <div class="segmented" role="group">
          <button
            id="declick-outfmt"
            class="segment"
            class:active={outputFormat === 'flac'}
            onclick={() => outputFormat = 'flac'}
          >FLAC</button>
          <button
            class="segment"
            class:active={outputFormat === 'wav'}
            onclick={() => outputFormat = 'wav'}
          >WAV</button>
        </div>
      </div>

      <!-- Toggles -->
      <button class="toggle-row" onclick={() => trimLead = !trimLead}>
        <span class="toggle-switch" class:on={trimLead}><span class="toggle-knob"></span></span>
        <span class="toggle-label">{$t('declick.trimLead')}</span>
      </button>

      <button class="toggle-row" onclick={() => trimTail = !trimTail}>
        <span class="toggle-switch" class:on={trimTail}><span class="toggle-knob"></span></span>
        <span class="toggle-label">{$t('declick.trimTail')}</span>
      </button>

      <button class="toggle-row" onclick={() => zeroCross = !zeroCross}>
        <span class="toggle-switch" class:on={zeroCross}><span class="toggle-knob"></span></span>
        <span class="toggle-label">{$t('declick.zeroCross')}</span>
      </button>
    </div>
  </section>

  <!-- Action bar -->
  <section class="action-section">
    {#if !$isPremium}
      <div class="premium-gate">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span>{$t('declick.premiumGatePrefix')} <strong>Tune Premium</strong>.</span>
      </div>
    {:else if jobState === 'idle'}
      <button
        class="convert-btn"
        disabled={!hasSelection}
        onclick={startDeclick}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
          <line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>
        </svg>
        {$t('declick.process')}
      </button>
    {:else if jobState === 'converting'}
      <div class="progress-section">
        <div class="progress-bar-container">
          <div class="progress-bar" style="width: {progress}%"></div>
        </div>
        <div class="progress-info">
          <span class="progress-pct">{Math.round(progress)}%</span>
          <span class="progress-file" title={currentFile}>{currentFile}</span>
          <span class="progress-count">{$t('declick.tracksProcessed').replace('{done}', String(processedCount)).replace('{total}', String(totalCount))}</span>
        </div>
        <button class="cancel-btn" onclick={cancelDeclick}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          {$t('common.cancel')}
        </button>
      </div>
    {:else if jobState === 'done'}
      <div class="done-section">
        <div class="done-message">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          {$t('declick.done').replace('{count}', String(processedCount))}
        </div>
        <div class="done-actions">
          <button class="download-btn" onclick={downloadResult}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {$t('declick.download')} (ZIP)
          </button>
          <button class="reset-btn" onclick={resetJob}>{$t('declick.newJob')}</button>
        </div>
      </div>
    {:else if jobState === 'error'}
      <div class="error-section">
        <div class="error-message">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          {jobError || $t('declick.processError')}
        </div>
        <button class="reset-btn" onclick={resetJob}>{$t('declick.retry')}</button>
      </div>
    {/if}
  </section>
</div>

<style>
  .converter-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
    gap: var(--space-lg);
  }

  .converter-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
    margin: 0;
  }

  .converter-subtitle {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
    margin: 4px 0 0;
  }

  .converter-note {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    margin: 6px 0 0;
    line-height: 1.4;
  }

  /* Section titles */
  .section-title {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-label);
    font-size: 15px;
    font-weight: 600;
    color: var(--tune-text);
    margin-bottom: var(--space-md);
  }

  .section-title svg {
    color: var(--tune-accent);
    flex-shrink: 0;
  }

  /* Source section */
  .source-section {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
  }

  .source-tabs {
    display: flex;
    gap: 2px;
    background: var(--tune-grey2, rgba(255,255,255,0.04));
    border-radius: var(--radius-md);
    padding: 2px;
    margin-bottom: var(--space-md);
  }

  .source-tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .source-tab.active {
    background: var(--tune-accent);
    color: #fff;
  }

  .source-tab:not(.active):hover {
    background: rgba(255,255,255,0.06);
    color: var(--tune-text);
  }

  /* Source toolbar */
  .source-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
    flex-wrap: wrap;
  }

  .album-search {
    flex: 1;
    min-width: 180px;
    padding: 8px 12px;
    background: var(--tune-grey2, rgba(255,255,255,0.04));
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }

  .album-search:focus {
    border-color: var(--tune-accent);
  }

  .album-search::placeholder {
    color: var(--tune-text-muted);
  }

  .selection-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .action-btn {
    padding: 6px 12px;
    background: transparent;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .action-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  /* Albums grid */
  .albums-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: var(--space-md);
    max-height: 360px;
    overflow-y: auto;
    padding: 4px;
  }

  .album-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0;
    background: transparent;
    border: 2px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    color: var(--tune-text);
    transition: all 0.12s;
    position: relative;
  }

  .album-card:hover {
    border-color: rgba(255,255,255,0.1);
  }

  .album-card.selected {
    border-color: var(--tune-accent);
    background: rgba(107, 110, 217, 0.08);
  }

  .album-cover {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--tune-grey2, rgba(255,255,255,0.04));
  }

  .album-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .album-cover-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--tune-text-muted);
  }

  .album-check {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--tune-accent);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .album-title {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    color: var(--tune-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 4px;
  }

  .album-artist {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 4px 4px;
  }

  /* Directory list */
  .dir-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 360px;
    overflow-y: auto;
  }

  .dir-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .dir-checkbox {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: 2px solid var(--tune-border);
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    color: #fff;
    transition: all 0.12s;
  }

  .dir-checkbox.checked {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
  }

  .dir-name {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 8px 10px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: background 0.12s;
  }

  .dir-name:hover {
    background: rgba(255,255,255,0.04);
  }

  .dir-name svg {
    color: var(--tune-accent);
    flex-shrink: 0;
  }

  .dir-count {
    margin-left: auto;
    font-size: 11px;
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  /* Browse breadcrumb */
  .browse-breadcrumb {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid var(--tune-border);
  }

  .browse-back {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--tune-grey2, rgba(255,255,255,0.04));
    color: var(--tune-accent);
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    flex-shrink: 0;
  }

  .browse-back:hover {
    background: rgba(255,255,255,0.08);
  }

  .browse-path {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Selection counter */
  .selection-counter {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: var(--space-md);
    padding: 8px 14px;
    background: rgba(107, 110, 217, 0.1);
    border: 1px solid rgba(107, 110, 217, 0.25);
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 500;
    color: var(--tune-accent);
  }

  /* Settings section */
  .settings-section {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
  }

  .declick-settings {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .setting-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .setting-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .setting-label {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 500;
    color: var(--tune-text-secondary);
  }

  .setting-value {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 700;
    color: var(--tune-accent);
  }

  .range-slider {
    width: 100%;
    accent-color: var(--tune-accent);
    cursor: pointer;
  }

  /* Segmented control (output format) */
  .segmented {
    display: inline-flex;
    gap: 2px;
    background: var(--tune-grey2, rgba(255,255,255,0.04));
    border-radius: var(--radius-md);
    padding: 2px;
    width: fit-content;
  }

  .segment {
    padding: 7px 20px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .segment.active {
    background: var(--tune-accent);
    color: #fff;
  }

  .segment:not(.active):hover {
    background: rgba(255,255,255,0.06);
    color: var(--tune-text);
  }

  /* Toggle rows */
  .toggle-row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 8px 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
  }

  .toggle-switch {
    position: relative;
    width: 40px;
    height: 22px;
    border-radius: 11px;
    background: var(--tune-grey2, rgba(255,255,255,0.12));
    flex-shrink: 0;
    transition: background 0.15s ease;
  }

  .toggle-switch.on {
    background: var(--tune-accent);
  }

  .toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.15s ease;
  }

  .toggle-switch.on .toggle-knob {
    transform: translateX(18px);
  }

  .toggle-label {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text);
  }

  /* Action section */
  .action-section {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
  }

  .premium-gate {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 20px;
    background: rgba(99, 102, 241, 0.08);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 10px;
    color: var(--tune-text-secondary, #aaa);
    font-size: 14px;
  }
  .premium-gate strong { color: var(--tune-accent, #6366f1); }

  .convert-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 12px 28px;
    background: var(--tune-accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-label);
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .convert-btn:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .convert-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Progress */
  .progress-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .progress-bar-container {
    width: 100%;
    height: 6px;
    background: var(--tune-grey2, rgba(255,255,255,0.08));
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: var(--tune-accent);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .progress-info {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .progress-pct {
    font-family: var(--font-label);
    font-size: 15px;
    font-weight: 700;
    color: var(--tune-accent);
    min-width: 45px;
  }

  .progress-file {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .progress-count {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  .cancel-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    align-self: flex-start;
    transition: all 0.12s;
  }

  .cancel-btn:hover {
    border-color: #ef4444;
    color: #ef4444;
  }

  /* Done section */
  .done-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .done-message {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-label);
    font-size: 15px;
    font-weight: 600;
    color: #4ade80;
  }

  .done-message svg {
    color: #4ade80;
  }

  .done-actions {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .download-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 10px 22px;
    background: var(--tune-accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: filter 0.15s;
  }

  .download-btn:hover {
    filter: brightness(1.1);
  }

  .reset-btn {
    padding: 10px 18px;
    background: transparent;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .reset-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  /* Error section */
  .error-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-body);
    font-size: 14px;
    color: #ef4444;
  }

  .error-message svg {
    color: #ef4444;
    flex-shrink: 0;
  }

  /* Loading / Empty states */
  .loading-state {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-lg);
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    padding: var(--space-lg);
    text-align: center;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .converter-view {
      padding: var(--space-md) var(--space-md);
    }

    .converter-header h2 {
      font-size: 22px;
    }

    .albums-grid {
      grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
      gap: var(--space-sm);
      max-height: 280px;
    }

    .source-toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .selection-actions {
      justify-content: flex-start;
    }
  }
</style>

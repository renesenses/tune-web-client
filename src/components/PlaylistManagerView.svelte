<script lang="ts">
  import { currentZone } from '../lib/stores/zones';
  import { playlists as playlistsStore } from '../lib/stores/playlists';
  import { streamingServices } from '../lib/stores/streaming';
  import * as api from '../lib/api';
  import { formatTime, formatAudioBadge } from '../lib/utils';
  import type { Playlist, Track, StreamingPlaylist, UnifiedPlaylistsResponse } from '../lib/types';
  import { t as tr } from '../lib/i18n';
  import AlbumArt from './AlbumArt.svelte';

  interface Props {
    onAddToPlaylist?: (track: Track) => void;
  }
  let { onAddToPlaylist }: Props = $props();

  let zone = $derived($currentZone);

  // Unified data
  let localPlaylists = $state<Playlist[]>([]);
  let streamingPlaylists = $state<Record<string, StreamingPlaylist[]>>({});
  let loading = $state(true);
  let searchQuery = $state('');
  let activeFilter = $state<string>('all');

  // Detail view
  let selectedPlaylist = $state<Playlist | null>(null);
  let selectedStreamingPl = $state<StreamingPlaylist | null>(null);
  let selectedService = $state('');
  let detailTracks = $state<Track[]>([]);
  let detailLoading = $state(false);

  // Import dialog
  let importTarget = $state<{ service: string; playlist: StreamingPlaylist } | null>(null);
  let importName = $state('');
  let importing = $state(false);
  let importResult = $state<{ name: string; count: number } | null>(null);

  // Create dialog
  let showCreate = $state(false);
  let newName = $state('');
  let newDescription = $state('');

  // Available filter chips
  let authenticatedServices = $derived(
    Object.entries($streamingServices)
      .filter(([, status]) => status.authenticated)
      .map(([name]) => name)
  );

  let filterChips = $derived([
    'all',
    'local',
    ...authenticatedServices,
  ]);

  async function loadAll() {
    loading = true;
    try {
      const data: UnifiedPlaylistsResponse = await api.getAllPlaylists();
      localPlaylists = data.local;
      streamingPlaylists = data.services;
    } catch (e) {
      console.error('Load all playlists error:', e);
    }
    loading = false;
  }

  // Load on mount
  loadAll();

  function serviceName(s: string): string {
    const labels: Record<string, string> = {
      tidal: 'TIDAL',
      qobuz: 'Qobuz',
      youtube: 'YouTube',
      amazon: 'Amazon',
      spotify: 'Spotify',
      deezer: 'Deezer',
    };
    return labels[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
  }

  function serviceColor(s: string): string {
    const colors: Record<string, string> = {
      tidal: '#00FFFF',
      qobuz: '#4285F4',
      spotify: '#1DB954',
      deezer: '#FF0092',
      youtube: '#FF0000',
      amazon: '#FF9900',
      local: 'var(--tune-accent)',
    };
    return colors[s] ?? 'var(--tune-text-muted)';
  }

  let filteredLocal = $derived(
    searchQuery.trim()
      ? localPlaylists.filter((pl) => pl.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      : localPlaylists
  );

  let filteredStreaming = $derived(
    Object.fromEntries(
      Object.entries(streamingPlaylists).map(([svc, pls]) => [
        svc,
        searchQuery.trim()
          ? pls.filter((pl) => pl.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
          : pls,
      ])
    )
  );

  // Combine all playlists for the unified list based on activeFilter
  interface DisplayPlaylist {
    type: 'local' | 'streaming';
    local?: Playlist;
    streaming?: StreamingPlaylist;
    service: string;
    name: string;
    trackCount: number;
    coverPath?: string | null;
  }

  let displayPlaylists = $derived.by(() => {
    const items: DisplayPlaylist[] = [];

    if (activeFilter === 'all' || activeFilter === 'local') {
      for (const pl of filteredLocal) {
        items.push({
          type: 'local',
          local: pl,
          service: 'local',
          name: pl.name,
          trackCount: pl.track_count ?? 0,
          coverPath: null,
        });
      }
    }

    for (const [svc, pls] of Object.entries(filteredStreaming)) {
      if (activeFilter !== 'all' && activeFilter !== svc) continue;
      for (const pl of pls) {
        items.push({
          type: 'streaming',
          streaming: pl,
          service: svc,
          name: pl.name,
          trackCount: pl.track_count,
          coverPath: pl.cover_path,
        });
      }
    }

    return items;
  });

  async function selectLocal(pl: Playlist) {
    if (!pl.id) return;
    selectedPlaylist = pl;
    selectedStreamingPl = null;
    selectedService = 'local';
    detailLoading = true;
    try {
      detailTracks = await api.getPlaylistTracks(pl.id);
    } catch (e) {
      console.error('Load playlist tracks error:', e);
    }
    detailLoading = false;
  }

  async function selectStreaming(service: string, pl: StreamingPlaylist) {
    selectedStreamingPl = pl;
    selectedPlaylist = null;
    selectedService = service;
    detailLoading = true;
    try {
      detailTracks = await api.getStreamingPlaylistTracks(service, pl.source_id);
    } catch (e) {
      console.error('Load streaming playlist tracks error:', e);
    }
    detailLoading = false;
  }

  function selectItem(item: DisplayPlaylist) {
    if (item.type === 'local' && item.local) {
      selectLocal(item.local);
    } else if (item.type === 'streaming' && item.streaming) {
      selectStreaming(item.service, item.streaming);
    }
  }

  function goBack() {
    selectedPlaylist = null;
    selectedStreamingPl = null;
    detailTracks = [];
    selectedService = '';
  }

  // Import flow
  function openImport(service: string, pl: StreamingPlaylist) {
    importTarget = { service, playlist: pl };
    importName = pl.name;
    importResult = null;
  }

  function closeImport() {
    importTarget = null;
    importing = false;
    importResult = null;
  }

  async function doImport() {
    if (!importTarget) return;
    importing = true;
    try {
      const result = await api.importPlaylist(importTarget.service, importTarget.playlist.source_id, importName || undefined);
      importResult = { name: result.name, count: result.tracks_imported };
      // Refresh playlists
      await loadAll();
      // Also refresh the global playlist store
      const list = await api.getPlaylists();
      playlistsStore.set(list);
    } catch (e) {
      console.error('Import playlist error:', e);
      importResult = { name: importName, count: -1 };
    }
    importing = false;
  }

  // Playback
  async function playPlaylist(playlistId: number) {
    if (!zone?.id) return;
    try {
      await api.play(zone.id, { playlist_id: playlistId });
    } catch (e) {
      console.error('Play playlist error:', e);
    }
  }

  async function playStreamingPlaylist(pl: StreamingPlaylist) {
    if (!zone?.id) return;
    try {
      await api.play(zone.id, { source: pl.source as any, streaming_playlist_id: pl.source_id });
    } catch (e) {
      console.error('Play streaming playlist error:', e);
    }
  }

  async function playTrack(t: Track) {
    if (!zone?.id) return;
    try {
      if (t.source && t.source !== 'local' && t.source_id) {
        await api.play(zone.id, { source: t.source as any, source_id: t.source_id });
      } else if (t.id) {
        await api.play(zone.id, { track_id: t.id });
      }
    } catch (e) {
      console.error('Play track error:', e);
    }
  }

  async function addTrackToQueue(t: Track) {
    if (!zone?.id) return;
    try {
      if (t.source && t.source !== 'local' && t.source_id) {
        await api.addToQueue(zone.id, { source: t.source as any, source_id: t.source_id });
      } else if (t.id) {
        await api.addToQueue(zone.id, { track_id: t.id });
      }
    } catch (e) {
      console.error('Add to queue error:', e);
    }
  }

  // CRUD
  async function createPlaylist() {
    if (!newName.trim()) return;
    try {
      await api.createPlaylist(newName.trim(), newDescription.trim() || undefined);
      showCreate = false;
      newName = '';
      newDescription = '';
      await loadAll();
      const list = await api.getPlaylists();
      playlistsStore.set(list);
    } catch (e) {
      console.error('Create playlist error:', e);
    }
  }

  async function deletePlaylist(id: number) {
    try {
      await api.deletePlaylist(id);
      if (selectedPlaylist?.id === id) goBack();
      await loadAll();
      const list = await api.getPlaylists();
      playlistsStore.set(list);
    } catch (e) {
      console.error('Delete playlist error:', e);
    }
  }

  async function removeTrack(trackId: number) {
    if (!selectedPlaylist?.id) return;
    try {
      await api.removePlaylistTrack(selectedPlaylist.id, trackId);
      detailTracks = detailTracks.filter((t) => t.id !== trackId);
    } catch (e) {
      console.error('Remove track error:', e);
    }
  }
</script>

<div class="pm-view">
  {#if selectedPlaylist || selectedStreamingPl}
    <!-- Detail View -->
    <div class="detail-header">
      <button class="back-btn" onclick={goBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        {$tr('common.back')}
      </button>
      <div class="playlist-detail-info">
        {#if selectedService && selectedService !== 'local'}
          <span class="source-chip" style="color: {serviceColor(selectedService)}">{serviceName(selectedService)}</span>
        {/if}
        <h2>{selectedPlaylist?.name ?? selectedStreamingPl?.name}</h2>
        {#if selectedPlaylist?.description}
          <p class="playlist-desc">{selectedPlaylist.description}</p>
        {/if}
        <span class="playlist-count">{detailTracks.length} {$tr('common.tracks')}</span>
      </div>
      <div class="detail-actions">
        {#if selectedStreamingPl}
          <button class="import-btn" onclick={() => openImport(selectedService, selectedStreamingPl!)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            {$tr('playlist.import')}
          </button>
        {/if}
        <button class="play-all-btn" onclick={() => {
          if (selectedPlaylist?.id) playPlaylist(selectedPlaylist.id);
          else if (selectedStreamingPl) playStreamingPlaylist(selectedStreamingPl);
        }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z" /></svg>
          {$tr('common.play')}
        </button>
      </div>
    </div>

    {#if selectedStreamingPl?.cover_path}
      <div class="streaming-pl-cover">
        <AlbumArt coverPath={selectedStreamingPl.cover_path} size={200} alt={selectedStreamingPl.name} />
      </div>
    {/if}

    {#if detailLoading}
      <div class="loading"><div class="spinner"></div>{$tr('common.loading')}</div>
    {:else}
      <div class="track-list">
        {#each detailTracks as t, index}
          <div class="track-item">
            <button class="track-play" onclick={() => playTrack(t)}>
              <span class="track-num">{index + 1}</span>
              <div class="track-info">
                <span class="track-title truncate">{t.title}</span>
                {#if t.artist_name}
                  <span class="track-artist truncate">{t.artist_name}</span>
                {/if}
              </div>
              {#if t.format}<span class="audio-format">{formatAudioBadge(t)}</span>{/if}
              <span class="track-duration">{formatTime(t.duration_ms)}</span>
            </button>
            <button class="add-queue-btn" onclick={() => addTrackToQueue(t)} title={$tr('queue.addToQueue')}>+</button>
            {#if onAddToPlaylist && (t.id || t.source_id)}
              <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={$tr('nowplaying.addToPlaylist')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 12H3m13 0h-2m0 0V8m0 4v4m6-8v8a2 2 0 01-2 2H5" /><line x1="3" y1="16" x2="11" y2="16" /><line x1="3" y1="8" x2="8" y2="8" /></svg>
              </button>
            {/if}
            {#if selectedPlaylist && t.id}
              <button class="remove-btn" onclick={() => t.id && removeTrack(t.id)} title={$tr('playlist.remove')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

  {:else}
    <!-- List View -->
    <div class="pm-header">
      <h2>{$tr('playlist.manager')}</h2>
      <div class="pm-header-right">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" placeholder={$tr('playlist.searchPlaceholder')} bind:value={searchQuery} />
          {#if searchQuery}
            <button class="search-clear" onclick={() => searchQuery = ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          {/if}
        </div>
        <button class="create-btn" onclick={() => showCreate = true}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          {$tr('playlist.new')}
        </button>
      </div>
    </div>

    <!-- Filter Chips -->
    <div class="filter-chips">
      {#each filterChips as chip}
        <button
          class="filter-chip"
          class:active={activeFilter === chip}
          style={activeFilter === chip ? `background: ${serviceColor(chip)}22; color: ${serviceColor(chip)}; border-color: ${serviceColor(chip)}44` : ''}
          onclick={() => activeFilter = chip}
        >
          {#if chip === 'all'}
            {$tr('playlist.filterAll')}
          {:else if chip === 'local'}
            {$tr('playlist.local')}
          {:else}
            {serviceName(chip)}
          {/if}
        </button>
      {/each}
    </div>

    {#if showCreate}
      <div class="create-form">
        <input type="text" placeholder={$tr('playlist.name')} bind:value={newName} />
        <input type="text" placeholder={$tr('playlist.description')} bind:value={newDescription} />
        <div class="form-actions">
          <button class="cancel-btn" onclick={() => showCreate = false}>{$tr('common.cancel')}</button>
          <button class="confirm-btn" onclick={createPlaylist}>{$tr('common.create')}</button>
        </div>
      </div>
    {/if}

    {#if loading}
      <div class="loading"><div class="spinner"></div>{$tr('common.loading')}</div>
    {:else if displayPlaylists.length === 0}
      <div class="empty">{$tr('playlist.noPlaylists')}</div>
    {:else}
      <div class="playlist-list">
        {#each displayPlaylists as item}
          <div class="playlist-item">
            <button class="playlist-btn" onclick={() => selectItem(item)}>
              <div class="playlist-icon" class:streaming-icon={item.type === 'streaming'}>
                {#if item.coverPath}
                  <AlbumArt coverPath={item.coverPath} size={48} alt={item.name} />
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13M9 18c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
                {/if}
              </div>
              <div class="playlist-info">
                <span class="playlist-name">{item.name}</span>
                <span class="playlist-meta">
                  <span class="source-dot" style="background: {serviceColor(item.service)}"></span>
                  {item.service === 'local' ? $tr('playlist.local') : serviceName(item.service)}
                  &middot;
                  {item.trackCount} {$tr('common.tracks')}
                </span>
              </div>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
            {#if item.type === 'streaming' && item.streaming}
              <button class="import-mini-btn" onclick={(e) => { e.stopPropagation(); openImport(item.service, item.streaming!); }} title={$tr('playlist.import')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              </button>
            {/if}
            {#if item.type === 'local' && item.local?.id}
              <button class="delete-btn" onclick={() => item.local?.id && deletePlaylist(item.local.id)} title={$tr('common.delete')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<!-- Import Dialog Overlay -->
{#if importTarget}
  <div class="modal-overlay" onclick={closeImport}>
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      {#if importResult}
        {#if importResult.count >= 0}
          <div class="import-done">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--tune-accent)" stroke-width="2" width="32" height="32"><path d="M20 6L9 17l-5-5" /></svg>
            <h3>{$tr('playlist.importSuccess')}</h3>
            <p>{$tr('playlist.imported').replace('{count}', String(importResult.count))}</p>
            <button class="confirm-btn" onclick={closeImport}>{$tr('common.ok')}</button>
          </div>
        {:else}
          <div class="import-done">
            <h3>{$tr('playlist.importError')}</h3>
            <button class="confirm-btn" onclick={closeImport}>{$tr('common.ok')}</button>
          </div>
        {/if}
      {:else}
        <h3>{$tr('playlist.import')}</h3>
        <p class="import-source">
          <span class="source-chip" style="color: {serviceColor(importTarget.service)}">{serviceName(importTarget.service)}</span>
          {importTarget.playlist.track_count} {$tr('common.tracks')}
        </p>
        <label class="import-label">{$tr('playlist.name')}</label>
        <input type="text" class="import-input" bind:value={importName} />
        <div class="form-actions">
          <button class="cancel-btn" onclick={closeImport}>{$tr('common.cancel')}</button>
          <button class="confirm-btn" onclick={doImport} disabled={importing}>
            {#if importing}
              <div class="spinner-small"></div>
              {$tr('playlist.importing')}
            {:else}
              {$tr('playlist.import')}
            {/if}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .pm-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
  }

  .pm-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-md);
  }

  .pm-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  .pm-header-right {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  /* Filter chips */
  .filter-chips {
    display: flex;
    gap: 8px;
    margin-bottom: var(--space-lg);
    flex-wrap: wrap;
  }

  .filter-chip {
    padding: 5px 14px;
    border: 1px solid var(--tune-border);
    border-radius: 20px;
    background: none;
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease-out;
    white-space: nowrap;
  }

  .filter-chip:hover {
    border-color: var(--tune-text-muted);
    color: var(--tune-text);
  }

  .filter-chip.active {
    font-weight: 700;
  }

  /* Search */
  .search-box {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--tune-grey2);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: 4px 10px;
    transition: border-color 0.12s;
  }

  .search-box:focus-within {
    border-color: var(--tune-accent);
  }

  .search-icon {
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  .search-box input {
    background: none;
    border: none;
    outline: none;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    width: 180px;
  }

  .search-box input::placeholder {
    color: var(--tune-text-muted);
  }

  .search-clear {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
  }

  .search-clear:hover {
    color: var(--tune-text);
  }

  /* Source badge */
  .source-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    vertical-align: middle;
    margin-right: 2px;
  }

  .source-chip {
    display: inline-block;
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  /* Buttons */
  .create-btn {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: background 0.12s ease-out;
  }

  .create-btn:hover {
    background: var(--tune-accent-hover);
  }

  .import-btn {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: none;
    border: 1px solid var(--tune-accent);
    color: var(--tune-accent);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s ease-out;
  }

  .import-btn:hover {
    background: var(--tune-accent);
    color: white;
  }

  .import-mini-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 8px;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all 0.12s ease-out;
  }

  .playlist-item:hover .import-mini-btn {
    opacity: 1;
  }

  .import-mini-btn:hover {
    color: var(--tune-accent);
  }

  /* Create form */
  .create-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-md);
    background: var(--tune-grey2);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-lg);
  }

  .create-form input {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
    outline: none;
  }

  .create-form input:focus {
    border-color: var(--tune-accent);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
  }

  .cancel-btn {
    padding: var(--space-xs) var(--space-md);
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
  }

  .confirm-btn {
    padding: var(--space-xs) var(--space-md);
    background: var(--tune-accent);
    border: none;
    color: white;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .confirm-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Detail header */
  .detail-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
    flex-wrap: wrap;
  }

  .detail-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
  }

  .playlist-detail-info {
    flex: 1;
  }

  .detail-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .playlist-desc {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
  }

  .playlist-count {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
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
  }

  .back-btn:hover {
    border-color: var(--tune-text-muted);
    color: var(--tune-text);
  }

  .play-all-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-lg);
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
  }

  .play-all-btn:hover {
    background: var(--tune-accent-hover);
  }

  .streaming-pl-cover {
    margin-bottom: var(--space-lg);
  }

  /* Playlist list */
  .playlist-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .playlist-item {
    display: flex;
    align-items: center;
  }

  .playlist-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 28px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease-out;
  }

  .playlist-btn:hover {
    background: var(--tune-surface-hover);
  }

  .playlist-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tune-grey2);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    overflow: hidden;
  }

  .playlist-icon svg {
    width: 24px;
    height: 24px;
    color: var(--tune-text-muted);
  }

  .playlist-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .playlist-name {
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 700;
  }

  .playlist-meta {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .chevron {
    color: var(--tune-text-muted);
  }

  .delete-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 8px;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all 0.12s ease-out;
  }

  .playlist-item:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    color: var(--tune-warning);
  }

  /* Track list */
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
    gap: 0;
  }

  .track-play {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 8px 28px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease-out;
  }

  .track-play:hover {
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

  .audio-format {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-text-muted);
    letter-spacing: 0.3px;
    flex-shrink: 0;
  }

  .remove-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 8px;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all 0.12s ease-out;
  }

  .track-item:hover .remove-btn {
    opacity: 1;
  }

  .remove-btn:hover {
    color: var(--tune-warning);
  }

  .add-queue-btn {
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-muted);
    cursor: pointer;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    font-size: 16px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: all 0.12s ease-out;
    margin-right: 8px;
  }

  .track-item:hover .add-queue-btn {
    opacity: 1;
  }

  .add-queue-btn:hover {
    color: var(--tune-accent);
    border-color: var(--tune-accent);
  }

  .add-playlist-btn {
    width: 28px;
    height: 28px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s ease-out;
    opacity: 0;
  }

  .track-item:hover .add-playlist-btn {
    opacity: 1;
  }

  .add-playlist-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
    animation: fadeIn 0.15s ease-out;
  }

  .modal-content {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg, 12px);
    padding: var(--space-xl);
    min-width: 360px;
    max-width: 480px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .modal-content h3 {
    font-family: var(--font-label);
    font-size: 18px;
    font-weight: 600;
    margin-bottom: var(--space-md);
  }

  .import-source {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
    margin-bottom: var(--space-md);
  }

  .import-label {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    margin-bottom: 4px;
    display: block;
  }

  .import-input {
    width: 100%;
    background: var(--tune-grey2);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
  }

  .import-input:focus {
    border-color: var(--tune-accent);
  }

  .import-done {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
  }

  .import-done h3 {
    margin-bottom: 0;
  }

  .import-done p {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
  }

  .spinner-small {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  /* Utility */
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

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
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

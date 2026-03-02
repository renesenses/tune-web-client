<script lang="ts">
  import { currentZone } from '../lib/stores/zones';
  import { playlists as playlistsStore, playlistsLoaded } from '../lib/stores/playlists';
  import { streamingServices } from '../lib/stores/streaming';
  import * as api from '../lib/api';
  import { formatTime, formatAudioBadge } from '../lib/utils';
  import type { Playlist, Track, StreamingPlaylist } from '../lib/types';
  import { t as tr } from '../lib/i18n';
  import AlbumArt from './AlbumArt.svelte';

  let zone = $derived($currentZone);

  let selectedPlaylist: Playlist | null = $state(null);
  let playlistTracks: Track[] = $state([]);
  let loading = $state(false);
  let searchQuery = $state('');

  // Streaming playlists state
  let streamingPlaylists = $state<Record<string, StreamingPlaylist[]>>({});
  let selectedStreamingPl = $state<StreamingPlaylist | null>(null);
  let streamingPlTracks = $state<Track[]>([]);
  let selectedService = $state('');

  let authenticatedServices = $derived(
    Object.entries($streamingServices)
      .filter(([, status]) => status.authenticated)
      .map(([name]) => name)
  );

  $effect(() => {
    const services = authenticatedServices;
    for (const svc of services) {
      loadStreamingPlaylists(svc);
    }
  });

  async function loadStreamingPlaylists(service: string) {
    try {
      const pls = await api.getStreamingPlaylists(service);
      streamingPlaylists = { ...streamingPlaylists, [service]: pls };
    } catch (e) {
      console.error(`Load ${service} playlists error:`, e);
    }
  }

  function serviceName(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  let filteredPlaylists = $derived(
    searchQuery.trim()
      ? $playlistsStore.filter((pl) => {
          const q = searchQuery.trim().toLowerCase();
          return pl.name.toLowerCase().includes(q) ||
            (pl.description?.toLowerCase().includes(q) ?? false);
        })
      : $playlistsStore
  );

  let filteredStreamingPlaylists = $derived(
    Object.fromEntries(
      Object.entries(streamingPlaylists).map(([svc, pls]) => [
        svc,
        searchQuery.trim()
          ? pls.filter((pl) => pl.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
          : pls,
      ])
    )
  );

  let hasAnyStreamingPlaylists = $derived(
    Object.values(filteredStreamingPlaylists).some((pls) => pls.length > 0)
  );

  // Create dialog
  let showCreate = $state(false);
  let newName = $state('');
  let newDescription = $state('');

  async function refreshPlaylists() {
    try {
      const list = await api.getPlaylists();
      playlistsStore.set(list);
    } catch (e) {
      console.error('Refresh playlists error:', e);
    }
  }

  async function selectPlaylist(pl: Playlist) {
    if (!pl.id) return;
    selectedPlaylist = pl;
    loading = true;
    try {
      playlistTracks = await api.getPlaylistTracks(pl.id);
    } catch (e) {
      console.error('Load playlist tracks error:', e);
    }
    loading = false;
  }

  async function selectStreamingPlaylist(service: string, pl: StreamingPlaylist) {
    selectedStreamingPl = pl;
    selectedService = service;
    loading = true;
    try {
      streamingPlTracks = await api.getStreamingPlaylistTracks(service, pl.source_id);
    } catch (e) {
      console.error('Load streaming playlist tracks error:', e);
    }
    loading = false;
  }

  function goBack() {
    selectedPlaylist = null;
    selectedStreamingPl = null;
    playlistTracks = [];
    streamingPlTracks = [];
    selectedService = '';
  }

  async function createPlaylist() {
    if (!newName.trim()) return;
    try {
      await api.createPlaylist(newName.trim(), newDescription.trim() || undefined);
      showCreate = false;
      newName = '';
      newDescription = '';
      await refreshPlaylists();
    } catch (e) {
      console.error('Create playlist error:', e);
    }
  }

  async function deletePlaylist(id: number) {
    try {
      await api.deletePlaylist(id);
      if (selectedPlaylist?.id === id) goBack();
      await refreshPlaylists();
    } catch (e) {
      console.error('Delete playlist error:', e);
    }
  }

  async function playPlaylist(playlistId: number) {
    if (!zone?.id) return;
    try {
      await api.play(zone.id, { playlist_id: playlistId });
    } catch (e) {
      console.error('Play playlist error:', e);
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

  async function playStreamingPlaylist(pl: StreamingPlaylist) {
    if (!zone?.id) return;
    try {
      await api.play(zone.id, { source: pl.source as any, streaming_playlist_id: pl.source_id });
    } catch (e) {
      console.error('Play streaming playlist error:', e);
    }
  }

  async function playStreamingTrack(t: Track) {
    if (!zone?.id || !t.source_id) return;
    try {
      await api.play(zone.id, { source: t.source as any, source_id: t.source_id });
    } catch (e) {
      console.error('Play streaming track error:', e);
    }
  }

  async function addStreamingTrackToQueue(t: Track) {
    if (!zone?.id || !t.source_id) return;
    try {
      await api.addToQueue(zone.id, { source: t.source as any, source_id: t.source_id });
    } catch (e) {
      console.error('Add streaming track to queue error:', e);
    }
  }

  async function removeTrack(trackId: number) {
    if (!selectedPlaylist?.id) return;
    try {
      await api.removePlaylistTrack(selectedPlaylist.id, trackId);
      playlistTracks = playlistTracks.filter((t) => t.id !== trackId);
    } catch (e) {
      console.error('Remove track error:', e);
    }
  }
</script>

<div class="playlists-view">
  {#if selectedPlaylist}
    <div class="detail-header">
      <button class="back-btn" onclick={goBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        {$tr('common.back')}
      </button>
      <div class="playlist-detail-info">
        <h2>{selectedPlaylist.name}</h2>
        {#if selectedPlaylist.description}
          <p class="playlist-desc">{selectedPlaylist.description}</p>
        {/if}
        <span class="playlist-count">{playlistTracks.length} {$tr('common.tracks')}</span>
      </div>
      <button class="play-all-btn" onclick={() => selectedPlaylist?.id && playPlaylist(selectedPlaylist.id)}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z" /></svg>
        {$tr('common.play')}
      </button>
    </div>

    {#if loading}
      <div class="loading"><div class="spinner"></div>{$tr('common.loading')}</div>
    {:else}
      <div class="track-list">
        {#each playlistTracks as t, index}
          <div class="track-item">
            <button class="track-play" onclick={() => t.id && playTrack(t.id)}>
              <span class="track-num">{index + 1}</span>
              <div class="track-info">
                <span class="track-title truncate">{t.title}</span>
                <span class="track-artist truncate">{t.artist_name ?? ''}</span>
              </div>
              {#if t.format}<span class="audio-format">{formatAudioBadge(t)}</span>{/if}
              <span class="track-duration">{formatTime(t.duration_ms)}</span>
            </button>
            <button class="remove-btn" onclick={() => t.id && removeTrack(t.id)} title={$tr('playlist.remove')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}

  {:else if selectedStreamingPl}
    <div class="detail-header">
      <button class="back-btn" onclick={goBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        {$tr('common.back')}
      </button>
      <div class="playlist-detail-info">
        <span class="source-badge">{serviceName(selectedService)}</span>
        <h2>{selectedStreamingPl.name}</h2>
        {#if selectedStreamingPl.description}
          <p class="playlist-desc">{selectedStreamingPl.description}</p>
        {/if}
        <span class="playlist-count">{selectedStreamingPl.track_count} {$tr('common.tracks')}</span>
      </div>
      <button class="play-all-btn" onclick={() => selectedStreamingPl && playStreamingPlaylist(selectedStreamingPl)}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z" /></svg>
        {$tr('common.play')}
      </button>
    </div>

    {#if selectedStreamingPl.cover_path}
      <div class="streaming-pl-cover">
        <AlbumArt coverPath={selectedStreamingPl.cover_path} size={200} alt={selectedStreamingPl.name} />
      </div>
    {/if}

    {#if loading}
      <div class="loading"><div class="spinner"></div>{$tr('common.loading')}</div>
    {:else}
      <div class="track-list">
        {#each streamingPlTracks as t, index}
          <div class="track-item">
            <button class="track-play" onclick={() => playStreamingTrack(t)}>
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
            <button class="add-queue-btn" onclick={() => addStreamingTrackToQueue(t)} title={$tr('queue.addToQueue')}>+</button>
          </div>
        {/each}
      </div>
    {/if}

  {:else}
    <div class="playlists-header">
      <h2>{$tr('playlist.title')}</h2>
      <div class="playlists-header-right">
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

    {#each authenticatedServices as svc}
      {#if (filteredStreamingPlaylists[svc] ?? []).length > 0}
        <div class="section-group">
          <h3 class="section-title">{serviceName(svc)}</h3>
          <div class="playlist-list">
            {#each filteredStreamingPlaylists[svc] as pl}
              <div class="playlist-item">
                <button class="playlist-btn" onclick={() => selectStreamingPlaylist(svc, pl)}>
                  <div class="playlist-icon streaming-icon">
                    {#if pl.cover_path}
                      <AlbumArt coverPath={pl.cover_path} size={48} alt={pl.name} />
                    {:else}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13M9 18c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
                    {/if}
                  </div>
                  <div class="playlist-info">
                    <span class="playlist-name">{pl.name}</span>
                    <span class="playlist-meta">{pl.track_count} {$tr('common.tracks')}</span>
                  </div>
                  <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/each}

    {#if !$playlistsLoaded}
      <div class="loading"><div class="spinner"></div>{$tr('common.loading')}</div>
    {:else if filteredPlaylists.length === 0 && !hasAnyStreamingPlaylists}
      <div class="empty">{$tr('playlist.noPlaylists')}</div>
    {:else}
      {#if hasAnyStreamingPlaylists && filteredPlaylists.length > 0}
        <div class="section-group">
          <h3 class="section-title">{$tr('playlist.localPlaylists')}</h3>
        </div>
      {/if}
      <div class="playlist-list">
        {#each filteredPlaylists as pl}
          <div class="playlist-item">
            <button class="playlist-btn" onclick={() => selectPlaylist(pl)}>
              <div class="playlist-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13M9 18c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
              </div>
              <div class="playlist-info">
                <span class="playlist-name">{pl.name}</span>
                <span class="playlist-meta">{pl.track_count ?? 0} {$tr('common.tracks')}</span>
              </div>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
            <button class="delete-btn" onclick={() => pl.id && deletePlaylist(pl.id)} title={$tr('common.delete')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .playlists-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
  }

  .playlists-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
  }

  .playlists-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  .playlists-header-right {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

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
  }

  .section-group {
    margin-bottom: var(--space-sm);
  }

  .section-title {
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    letter-spacing: -0.3px;
    padding: var(--space-sm) 0;
    margin-top: var(--space-md);
  }

  .source-badge {
    display: inline-block;
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--tune-accent);
    margin-bottom: 4px;
  }

  .streaming-pl-cover {
    margin-bottom: var(--space-lg);
  }

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

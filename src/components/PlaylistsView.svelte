<script lang="ts">
  import { currentZone } from '../lib/stores/zones';
  import { playlists as playlistsStore, playlistsLoaded, streamingPlaylistsCache, streamingPlaylistsLoaded } from '../lib/stores/playlists';
  import { streamingServices } from '../lib/stores/streaming';
  import * as api from '../lib/api';
  import { formatTime, formatAudioBadge } from '../lib/utils';
  import type { Playlist, Track, StreamingPlaylist } from '../lib/types';
  import { t as tr } from '../lib/i18n';
  import AlbumArt from './AlbumArt.svelte';

  interface Props {
    onAddToPlaylist?: (track: Track) => void;
  }
  let { onAddToPlaylist }: Props = $props();

  let zone = $derived($currentZone);

  let selectedPlaylist: Playlist | null = $state(null);
  let playlistTracks: Track[] = $state([]);
  let loading = $state(false);
  let searchQuery = $state('');

  // Source selection
  let selectedSource = $state<string>('local');

  // Streaming playlists state (backed by store cache)
  let streamingPlaylists = $state<Record<string, StreamingPlaylist[]>>($streamingPlaylistsCache);
  let selectedStreamingPl = $state<StreamingPlaylist | null>(null);
  let streamingPlTracks = $state<Track[]>([]);
  let selectedService = $state('');
  let streamingLoading = $state(!$streamingPlaylistsLoaded);
  let streamingLoadingStatus = $state('');

  let authenticatedServices = $derived(
    Object.entries($streamingServices)
      .filter(([, status]) => status.authenticated)
      .map(([name]) => name)
  );

  // Available sources for the icon bar
  let availableSources = $derived.by(() => {
    let sources = [{ key: 'local', name: 'Local', icon: '♫', count: $playlistsStore.length }];
    for (const svc of authenticatedServices) {
      const pls = streamingPlaylists[svc] ?? [];
      if (pls.length > 0) {
        sources.push({ key: svc, name: serviceName(svc), icon: serviceIcon(svc), count: pls.length });
      }
    }
    return sources;
  });

  $effect(() => {
    const services = authenticatedServices;
    if (!$streamingPlaylistsLoaded && services.length > 0) {
      loadAllStreamingPlaylists(services);
    } else if ($streamingPlaylistsLoaded) {
      streamingPlaylists = $streamingPlaylistsCache;
      streamingLoading = false;
    }
  });

  async function loadAllStreamingPlaylists(services: string[]) {
    streamingLoading = true;
    streamingLoadingStatus = 'Chargement...';
    for (const svc of services) {
      streamingLoadingStatus = `${serviceName(svc)}...`;
      try {
        const pls = await api.getStreamingPlaylists(svc);
        streamingPlaylists = { ...streamingPlaylists, [svc]: pls };
      } catch (e) {
        console.error(`Load ${svc} playlists error:`, e);
      }
    }
    streamingPlaylistsCache.set(streamingPlaylists);
    streamingPlaylistsLoaded.set(true);
    streamingLoading = false;
  }

  function serviceName(s: string): string {
    const names: Record<string, string> = {
      tidal: 'Tidal', qobuz: 'Qobuz', youtube: 'YouTube',
      spotify: 'Spotify', deezer: 'Deezer', amazon: 'Amazon',
      apple_music: 'Apple Music'
    };
    return names[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
  }

  function serviceIcon(_s: string): string { return ''; /* SVG icons used inline */ }

  let filteredPlaylists = $derived(
    searchQuery.trim()
      ? $playlistsStore.filter((pl) => pl.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      : $playlistsStore
  );

  let filteredStreamingForSource = $derived.by(() => {
    const pls = streamingPlaylists[selectedSource] ?? [];
    if (!searchQuery.trim()) return pls;
    return pls.filter((pl) => pl.name.toLowerCase().includes(searchQuery.trim().toLowerCase()));
  });

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
    <!-- Local playlist detail -->
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
            {#if onAddToPlaylist && (t.id || t.source_id)}
              <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={$tr('nowplaying.addToPlaylist')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 12H3m13 0h-2m0 0V8m0 4v4m6-8v8a2 2 0 01-2 2H5" /><line x1="3" y1="16" x2="11" y2="16" /><line x1="3" y1="8" x2="8" y2="8" /></svg>
              </button>
            {/if}
            <button class="remove-btn" onclick={() => t.id && removeTrack(t.id)} title={$tr('playlist.remove')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}

  {:else if selectedStreamingPl}
    <!-- Streaming playlist detail -->
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
                {#if t.artist_name}<span class="track-artist truncate">{t.artist_name}</span>{/if}
              </div>
              {#if t.format}<span class="audio-format">{formatAudioBadge(t)}</span>{/if}
              <span class="track-duration">{formatTime(t.duration_ms)}</span>
            </button>
            <button class="add-queue-btn" onclick={() => addStreamingTrackToQueue(t)} title={$tr('queue.addToQueue')}>+</button>
            {#if onAddToPlaylist && (t.id || t.source_id)}
              <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={$tr('nowplaying.addToPlaylist')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 12H3m13 0h-2m0 0V8m0 4v4m6-8v8a2 2 0 01-2 2H5" /><line x1="3" y1="16" x2="11" y2="16" /><line x1="3" y1="8" x2="8" y2="8" /></svg>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

  {:else}
    <!-- Source icons bar + playlist list -->
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

    <!-- Source icons bar -->
    <div class="source-bar">
      {#each availableSources as src}
        <button class="source-btn" class:active={selectedSource === src.key} onclick={() => selectedSource = src.key}>
          <div class="source-icon-wrap">
            {#if src.key === 'local'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="22" height="22"><path d="M9 18V5l12-2v13M9 18c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM21 16c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
            {:else if src.key === 'tidal'}
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 4l4 4-4 4-4-4 4-4zm-8 4l4 4-4 4-4-4 4-4zm16 0l-4 4 4 4 4-4-4-4zm-8 8l4 4-4 4-4-4 4-4z"/></svg>
            {:else if src.key === 'qobuz'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="22" height="22"><path d="M12 3a9 9 0 110 18 9 9 0 010-18z"/><path d="M12 8a4 4 0 110 8 4 4 0 010-8z"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>
            {:else if src.key === 'youtube'}
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 4-8 4z"/></svg>
            {:else if src.key === 'spotify'}
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
            {:else if src.key === 'deezer'}
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><rect x="0" y="18" width="4" height="4" rx="0.5"/><rect x="5" y="18" width="4" height="4" rx="0.5"/><rect x="5" y="13" width="4" height="4" rx="0.5"/><rect x="10" y="18" width="4" height="4" rx="0.5"/><rect x="10" y="13" width="4" height="4" rx="0.5"/><rect x="10" y="8" width="4" height="4" rx="0.5"/><rect x="15" y="18" width="4" height="4" rx="0.5"/><rect x="15" y="13" width="4" height="4" rx="0.5"/><rect x="15" y="8" width="4" height="4" rx="0.5"/><rect x="15" y="3" width="4" height="4" rx="0.5"/><rect x="20" y="18" width="4" height="4" rx="0.5"/><rect x="20" y="13" width="4" height="4" rx="0.5"/><rect x="20" y="8" width="4" height="4" rx="0.5"/></svg>
            {:else if src.key === 'amazon'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="22" height="22"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            {:else if src.key === 'apple_music'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="22" height="22"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="22" height="22"><path d="M9 18V5l12-2v13M9 18c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
            {/if}
          </div>
          <span class="source-name">{src.name}</span>
          <span class="source-count">{src.count}</span>
        </button>
      {/each}
      {#if streamingLoading}
        <div class="source-loading">
          <div class="spinner-sm"></div>
          <span>{streamingLoadingStatus}</span>
        </div>
      {/if}
    </div>

    <!-- Playlists for selected source -->
    {#if selectedSource === 'local'}
      {#if !$playlistsLoaded}
        <div class="loading"><div class="spinner"></div>{$tr('common.loading')}</div>
      {:else if filteredPlaylists.length === 0}
        <div class="empty">{$tr('playlist.noPlaylists')}</div>
      {:else}
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
    {:else}
      {#if filteredStreamingForSource.length === 0}
        <div class="empty">Aucune playlist {serviceName(selectedSource)}</div>
      {:else}
        <div class="playlist-list">
          {#each filteredStreamingForSource as pl}
            <div class="playlist-item">
              <button class="playlist-btn" onclick={() => selectStreamingPlaylist(selectedSource, pl)}>
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
      {/if}
    {/if}
  {/if}
</div>

<style>
  .playlists-view { height: 100%; display: flex; flex-direction: column; padding: var(--space-lg) 28px; overflow-y: auto; }
  .playlists-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-md); }
  .playlists-header h2 { font-family: var(--font-label); font-size: 28px; font-weight: 600; letter-spacing: -0.8px; }
  .playlists-header-right { display: flex; align-items: center; gap: var(--space-md); }

  /* Source icons bar */
  .source-bar { display: flex; align-items: stretch; gap: 10px; padding: 16px 0; margin-bottom: var(--space-lg); overflow-x: auto; }
  .source-btn { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 18px 28px; background: var(--tune-grey2); border: 2px solid transparent; border-radius: 16px; cursor: pointer; transition: all 0.18s ease-out; min-width: 100px; color: var(--tune-text-muted); }
  .source-btn:hover { background: var(--tune-surface-hover); color: var(--tune-text); transform: translateY(-1px); }
  .source-btn.active { background: var(--tune-accent); border-color: var(--tune-accent); color: white; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35); }
  .source-btn.active .source-icon-wrap { color: white; }
  .source-icon-wrap { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; }
  .source-icon-wrap :global(svg) { width: 32px !important; height: 32px !important; }
  .source-name { font-family: var(--font-label); font-size: 14px; font-weight: 600; letter-spacing: -0.2px; }
  .source-count { font-family: var(--font-label); font-size: 13px; font-weight: 700; opacity: 0.8; background: rgba(255,255,255,0.15); padding: 2px 10px; border-radius: 10px; }
  .source-btn:not(.active) .source-count { background: var(--tune-surface); }
  .source-loading { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--tune-text-muted); white-space: nowrap; padding: 0 8px; }
  .spinner-sm { width: 14px; height: 14px; border: 2px solid var(--tune-border); border-top-color: var(--tune-accent); border-radius: 50%; animation: spin 0.8s linear infinite; }

  .search-box { display: flex; align-items: center; gap: 6px; background: var(--tune-grey2); border: 1px solid var(--tune-border); border-radius: var(--radius-md); padding: 4px 10px; transition: border-color 0.12s; }
  .search-box:focus-within { border-color: var(--tune-accent); }
  .search-icon { color: var(--tune-text-muted); flex-shrink: 0; }
  .search-box input { background: none; border: none; outline: none; color: var(--tune-text); font-family: var(--font-body); font-size: 13px; width: 180px; }
  .search-box input::placeholder { color: var(--tune-text-muted); }
  .search-clear { background: none; border: none; color: var(--tune-text-muted); cursor: pointer; padding: 2px; display: flex; align-items: center; }
  .search-clear:hover { color: var(--tune-text); }

  .create-btn { display: flex; align-items: center; gap: var(--space-sm); padding: var(--space-sm) var(--space-md); background: var(--tune-accent); color: white; border: none; border-radius: var(--radius-md); cursor: pointer; font-family: var(--font-body); font-size: 13px; transition: background 0.12s ease-out; }
  .create-btn:hover { background: var(--tune-accent-hover); }
  .create-form { display: flex; flex-direction: column; gap: var(--space-sm); padding: var(--space-md); background: var(--tune-grey2); border-radius: var(--radius-md); margin-bottom: var(--space-lg); }
  .create-form input { background: var(--tune-surface); border: 1px solid var(--tune-border); border-radius: var(--radius-sm); padding: var(--space-sm) var(--space-md); color: var(--tune-text); font-family: var(--font-body); font-size: 14px; outline: none; }
  .create-form input:focus { border-color: var(--tune-accent); }
  .form-actions { display: flex; justify-content: flex-end; gap: var(--space-sm); }
  .cancel-btn { padding: var(--space-xs) var(--space-md); background: none; border: 1px solid var(--tune-border); color: var(--tune-text-secondary); border-radius: var(--radius-sm); cursor: pointer; font-family: var(--font-body); font-size: 13px; }
  .confirm-btn { padding: var(--space-xs) var(--space-md); background: var(--tune-accent); border: none; color: white; border-radius: var(--radius-sm); cursor: pointer; font-family: var(--font-body); font-size: 13px; }

  .source-badge { display: inline-block; font-family: var(--font-label); font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: var(--tune-accent); margin-bottom: 4px; }
  .streaming-pl-cover { margin-bottom: var(--space-lg); }
  .detail-header { display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-lg); flex-wrap: wrap; }
  .detail-header h2 { font-family: var(--font-label); font-size: 28px; font-weight: 600; }
  .playlist-detail-info { flex: 1; }
  .playlist-desc { font-family: var(--font-body); font-size: 14px; color: var(--tune-text-secondary); }
  .playlist-count { font-family: var(--font-body); font-size: 13px; color: var(--tune-text-muted); }
  .back-btn { display: flex; align-items: center; gap: 4px; background: none; border: 1px solid var(--tune-border); color: var(--tune-text-secondary); padding: var(--space-xs) var(--space-md); border-radius: var(--radius-md); cursor: pointer; font-family: var(--font-body); font-size: 13px; }
  .back-btn:hover { border-color: var(--tune-text-muted); color: var(--tune-text); }
  .play-all-btn { display: inline-flex; align-items: center; gap: var(--space-sm); padding: var(--space-sm) var(--space-lg); background: var(--tune-accent); color: white; border: none; border-radius: var(--radius-md); cursor: pointer; font-family: var(--font-body); font-size: 14px; font-weight: 700; }
  .play-all-btn:hover { background: var(--tune-accent-hover); }

  .playlist-list { display: flex; flex-direction: column; gap: 1px; }
  .playlist-item { display: flex; align-items: center; }
  .playlist-btn { flex: 1; display: flex; align-items: center; gap: 14px; padding: 12px 28px; background: none; border: none; color: var(--tune-text); cursor: pointer; text-align: left; transition: background 0.12s ease-out; }
  .playlist-btn:hover { background: var(--tune-surface-hover); }
  .playlist-icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: var(--tune-grey2); border-radius: var(--radius-sm); flex-shrink: 0; overflow: hidden; }
  .playlist-icon svg { width: 24px; height: 24px; color: var(--tune-text-muted); }
  .playlist-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .playlist-name { font-family: var(--font-body); font-size: 15px; font-weight: 700; }
  .playlist-meta { font-family: var(--font-body); font-size: 13px; color: var(--tune-text-secondary); }
  .chevron { color: var(--tune-text-muted); }
  .delete-btn { background: none; border: none; color: var(--tune-text-muted); cursor: pointer; padding: 8px; border-radius: var(--radius-sm); opacity: 0; transition: all 0.12s ease-out; }
  .playlist-item:hover .delete-btn { opacity: 1; }
  .delete-btn:hover { color: var(--tune-warning); }

  .track-list { display: flex; flex-direction: column; gap: 1px; flex: 1; overflow-y: auto; }
  .track-item { display: flex; align-items: center; gap: 0; }
  .track-play { flex: 1; display: flex; align-items: center; gap: var(--space-md); padding: 8px 28px; background: none; border: none; color: var(--tune-text); cursor: pointer; text-align: left; transition: background 0.12s ease-out; }
  .track-play:hover { background: var(--tune-surface-hover); }
  .track-num { width: 28px; text-align: center; font-family: var(--font-body); font-size: 13px; color: var(--tune-text-muted); font-variant-numeric: tabular-nums; }
  .track-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .track-title { font-family: var(--font-body); font-size: 14px; font-weight: 700; }
  .track-artist { font-family: var(--font-body); font-size: 13px; color: var(--tune-text-secondary); }
  .track-duration { font-family: var(--font-body); font-size: 12px; color: var(--tune-text-muted); font-variant-numeric: tabular-nums; }
  .audio-format { font-family: var(--font-label); font-size: 11px; color: var(--tune-text-muted); letter-spacing: 0.3px; flex-shrink: 0; }
  .remove-btn { background: none; border: none; color: var(--tune-text-muted); cursor: pointer; padding: 8px; border-radius: var(--radius-sm); opacity: 0; transition: all 0.12s ease-out; }
  .track-item:hover .remove-btn { opacity: 1; }
  .remove-btn:hover { color: var(--tune-warning); }
  .add-queue-btn { background: none; border: 1px solid var(--tune-border); color: var(--tune-text-muted); cursor: pointer; width: 28px; height: 28px; border-radius: var(--radius-sm); font-size: 16px; font-weight: 700; display: flex; align-items: center; justify-content: center; opacity: 0; transition: all 0.12s ease-out; margin-right: 8px; }
  .track-item:hover .add-queue-btn { opacity: 1; }
  .add-queue-btn:hover { color: var(--tune-accent); border-color: var(--tune-accent); }
  .add-playlist-btn { width: 28px; height: 28px; border: 1px solid var(--tune-border); border-radius: var(--radius-sm); background: none; color: var(--tune-text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.12s ease-out; opacity: 0; }
  .track-item:hover .add-playlist-btn { opacity: 1; }
  .add-playlist-btn:hover { border-color: var(--tune-accent); color: var(--tune-accent); }

  .loading { display: flex; align-items: center; gap: var(--space-md); color: var(--tune-text-muted); font-family: var(--font-body); padding: var(--space-xl); justify-content: center; }
  .spinner { width: 20px; height: 20px; border: 2px solid var(--tune-border); border-top-color: var(--tune-accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
  .empty { color: var(--tune-text-muted); font-family: var(--font-body); text-align: center; padding: var(--space-2xl); }
  .truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>

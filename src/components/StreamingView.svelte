<script lang="ts">
  import { activeStreamingService } from '../lib/stores/streaming';
  import { currentZone } from '../lib/stores/zones';
  import { queueTracks, queuePosition } from '../lib/stores/queue';
  import * as api from '../lib/api';
  import { formatTime, formatAudioBadge } from '../lib/utils';
  import AlbumArt from './AlbumArt.svelte';
  import type { Album, Artist, Track, SearchResult, FeaturedSection, StreamingPlaylist } from '../lib/types';
  import { t as tr } from '../lib/i18n';
  import { playVideo } from '../lib/stores/ytPlayer';

  interface Props {
    onAddToPlaylist?: (track: Track) => void;
  }
  let { onAddToPlaylist }: Props = $props();

  type StreamingTab = 'search' | 'albums' | 'artists' | 'tracks';

  let service = $derived($activeStreamingService);
  let zone = $derived($currentZone);
  let tab = $state<StreamingTab>('search');
  let searchQuery = $state('');
  let searching = $state(false);
  let results: SearchResult | null = $state(null);

  let selectedAlbum = $state<Album | null>(null);
  let albumTracks = $state<Track[]>([]);
  let selectedArtist = $state<Artist | null>(null);
  let artistAlbums = $state<Album[]>([]);
  let loading = $state(false);

  let featuredSections = $state<FeaturedSection[]>([]);
  let featuredData = $state<Record<string, Album[]>>({});
  let featuredLoading = $state(false);

  let userPlaylists = $state<StreamingPlaylist[]>([]);
  let selectedStreamingPlaylist = $state<StreamingPlaylist | null>(null);
  let playlistTracks = $state<Track[]>([]);

  $effect(() => {
    const s = service;
    if (s) {
      loadFeatured(s);
      loadUserPlaylists(s);
    } else {
      featuredSections = [];
      featuredData = {};
      userPlaylists = [];
    }
  });

  async function loadFeatured(s: string) {
    featuredLoading = true;
    try {
      const sections = await api.getStreamingFeaturedSections(s);
      featuredSections = sections;
      const data: Record<string, Album[]> = {};
      const promises = sections.map(async (sec) => {
        try {
          data[sec.id] = await api.getStreamingFeatured(s, sec.id);
        } catch {
          data[sec.id] = [];
        }
      });
      await Promise.all(promises);
      if (service === s) {
        featuredData = data;
      }
    } catch (e) {
      console.error('Load featured error:', e);
    }
    featuredLoading = false;
  }

  async function loadUserPlaylists(s: string) {
    try {
      const playlists = await api.getStreamingPlaylists(s);
      if (service === s) {
        userPlaylists = playlists;
      }
    } catch (e) {
      console.error('Load user playlists error:', e);
    }
  }

  let showFeatured = $derived(!searchQuery.trim() && !results);

  function serviceName(s: string): string {
    const names: Record<string, string> = {
      tidal: 'TIDAL',
      qobuz: 'Qobuz',
      youtube: 'YouTube Music',
      amazon: 'Amazon Music',
    };
    return names[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
  }

  async function search() {
    if (!service || !searchQuery.trim()) return;
    searching = true;
    results = null;
    try {
      results = await api.searchStreaming(service, searchQuery.trim());
    } catch (e) {
      console.error('Streaming search error:', e);
    }
    searching = false;
  }

  function handleSearchKey(e: KeyboardEvent) {
    if (e.key === 'Enter') search();
  }

  function clearSearch() {
    searchQuery = '';
    results = null;
  }

  async function selectAlbum(album: Album) {
    if (!service || !album.source_id) return;
    selectedAlbum = album;
    selectedArtist = null;
    loading = true;
    try {
      albumTracks = await api.getStreamingAlbumTracks(service, album.source_id);
    } catch (e) {
      console.error('Get streaming album tracks error:', e);
    }
    loading = false;
  }

  async function selectArtist(artist: Artist) {
    const artistId = artist.source_id ?? artist.musicbrainz_id ?? artist.discogs_id ?? '';
    if (!service || !artistId) return;
    selectedArtist = artist;
    selectedAlbum = null;
    loading = true;
    try {
      artistAlbums = await api.getStreamingArtistAlbums(service, artistId);
    } catch (e) {
      console.error('Get streaming artist albums error:', e);
    }
    loading = false;
  }

  async function selectStreamingPlaylist(playlist: StreamingPlaylist) {
    if (!service) return;
    selectedStreamingPlaylist = playlist;
    selectedAlbum = null;
    selectedArtist = null;
    loading = true;
    try {
      playlistTracks = await api.getStreamingPlaylistTracks(service, playlist.source_id);
    } catch (e) {
      console.error('Get streaming playlist tracks error:', e);
    }
    loading = false;
  }

  async function playStreamingPlaylist(playlist: StreamingPlaylist) {
    if (!zone?.id || !service) return;
    try {
      await api.play(zone.id, { source: playlist.source as any, streaming_playlist_id: playlist.source_id });
    } catch (e) {
      console.error('Play streaming playlist error:', e);
    }
  }

  async function addStreamingTrackToQueue(track: Track) {
    if (!zone?.id || !track.source || !track.source_id) return;
    try {
      await api.addToQueue(zone.id, { source: track.source as any, source_id: track.source_id });
      // Refresh queue after add
      const qs = await api.getQueue(zone.id);
      queueTracks.set(qs.tracks);
      queuePosition.set(qs.position);
    } catch (e) {
      console.error('Add streaming track to queue error:', e);
    }
  }

  function goBack() {
    selectedAlbum = null;
    selectedArtist = null;
    selectedStreamingPlaylist = null;
    albumTracks = [];
    artistAlbums = [];
    playlistTracks = [];
  }

  async function playStreamingTrack(track: Track) {
    if (!service || !track.source_id) return;
    if (track.source === 'youtube') {
      // Muted IFrame for legal compliance + visual context (Phase 6: eye button)
      playVideo(track.source_id, track);
      // Backend routes audio via yt-dlp → DLNA zone
      if (zone?.id) {
        try {
          await api.play(zone.id, { source: track.source as any, source_id: track.source_id });
        } catch (e) {
          console.error('Play YouTube track (DLNA) error:', e);
        }
      }
      return;
    }
    if (!zone?.id) return;
    try {
      await api.play(zone.id, { source: track.source as any, source_id: track.source_id });
    } catch (e) {
      console.error('Play streaming track error:', e);
    }
  }

  async function playStreamingAlbum(album: Album) {
    if (!zone?.id || !service || !album.source_id) return;
    try {
      await api.play(zone.id, { source: album.source as any, streaming_album_id: album.source_id });
    } catch (e) {
      console.error('Play streaming album error:', e);
    }
  }
</script>

<div class="streaming-view">
  {#if !service}
    <div class="empty-center">
      <p>{$tr('streaming.selectService')}</p>
    </div>
  {:else if selectedAlbum}
    <!-- Album detail -->
    <div class="detail-header">
      <button class="back-btn" onclick={goBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        {$tr('common.back')}
      </button>
    </div>
    <div class="album-detail-header">
      <AlbumArt coverPath={selectedAlbum.cover_path} size={280} alt={selectedAlbum.title} />
      <div class="album-detail-info">
        <span class="source-badge">{serviceName(service)}</span>
        <h2>{selectedAlbum.title}</h2>
        {#if selectedAlbum.artist_name}
          <p class="detail-artist">{selectedAlbum.artist_name}</p>
        {/if}
        {#if selectedAlbum.year}
          <p class="detail-meta">{selectedAlbum.year}</p>
        {/if}
        <button class="play-all-btn" onclick={() => selectedAlbum && playStreamingAlbum(selectedAlbum)}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z" /></svg>
          {$tr('common.play')}
        </button>
      </div>
    </div>
    {#if loading}
      <div class="loading"><div class="spinner"></div>{$tr('common.loading')}</div>
    {:else}
      <div class="track-list">
        {#each albumTracks as t, index}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="track-item" onclick={() => playStreamingTrack(t)}>
            <span class="track-num">{t.track_number ?? index + 1}</span>
            <div class="track-info">
              <span class="track-title truncate">{t.title}</span>
              {#if t.artist_name}
                <span class="track-artist truncate">{t.artist_name}</span>
              {/if}
            </div>
            {#if t.format}<span class="audio-format">{formatAudioBadge(t)}</span>{/if}
            <span class="track-duration">{formatTime(t.duration_ms)}</span>
            <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); addStreamingTrackToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
            {#if onAddToPlaylist && (t.id || t.source_id)}
              <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={$tr('nowplaying.addToPlaylist')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 12H3m13 0h-2m0 0V8m0 4v4m6-8v8a2 2 0 01-2 2H5" /><line x1="3" y1="16" x2="11" y2="16" /><line x1="3" y1="8" x2="8" y2="8" /></svg>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

  {:else if selectedStreamingPlaylist}
    <!-- Streaming playlist detail -->
    <div class="detail-header">
      <button class="back-btn" onclick={goBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        {$tr('common.back')}
      </button>
    </div>
    <div class="album-detail-header">
      <AlbumArt coverPath={selectedStreamingPlaylist.cover_path} size={280} alt={selectedStreamingPlaylist.name} />
      <div class="album-detail-info">
        <span class="source-badge">{serviceName(service)}</span>
        <h2>{selectedStreamingPlaylist.name}</h2>
        {#if selectedStreamingPlaylist.description}
          <p class="detail-artist">{selectedStreamingPlaylist.description}</p>
        {/if}
        <p class="detail-meta">{selectedStreamingPlaylist.track_count} {$tr('home.tracks').toLowerCase()}</p>
        <button class="play-all-btn" onclick={() => selectedStreamingPlaylist && playStreamingPlaylist(selectedStreamingPlaylist)}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z" /></svg>
          {$tr('common.play')}
        </button>
      </div>
    </div>
    {#if loading}
      <div class="loading"><div class="spinner"></div>{$tr('common.loading')}</div>
    {:else}
      <div class="track-list">
        {#each playlistTracks as t, index}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="track-item" onclick={() => playStreamingTrack(t)}>
            <span class="track-num">{index + 1}</span>
            <div class="track-info">
              <span class="track-title truncate">{t.title}</span>
              {#if t.artist_name}
                <span class="track-artist truncate">{t.artist_name}</span>
              {/if}
            </div>
            {#if t.format}<span class="audio-format">{formatAudioBadge(t)}</span>{/if}
            <span class="track-duration">{formatTime(t.duration_ms)}</span>
            <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); addStreamingTrackToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
            {#if onAddToPlaylist && (t.id || t.source_id)}
              <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={$tr('nowplaying.addToPlaylist')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 12H3m13 0h-2m0 0V8m0 4v4m6-8v8a2 2 0 01-2 2H5" /><line x1="3" y1="16" x2="11" y2="16" /><line x1="3" y1="8" x2="8" y2="8" /></svg>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

  {:else if selectedArtist}
    <!-- Artist detail -->
    <div class="detail-header">
      <button class="back-btn" onclick={goBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        {$tr('common.back')}
      </button>
      <h2>{selectedArtist.name}</h2>
      <span class="source-badge">{serviceName(service)}</span>
    </div>
    {#if loading}
      <div class="loading"><div class="spinner"></div>{$tr('common.loading')}</div>
    {:else}
      <div class="albums-grid">
        {#each artistAlbums as album}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="album-card" onclick={() => selectAlbum(album)}>
            <div class="album-card-art">
              <AlbumArt coverPath={album.cover_path} size={160} alt={album.title} />
              <div class="art-hover-overlay">
                <button class="art-play-btn" onclick={(e) => { e.stopPropagation(); selectAlbum(album); }} title={$tr('library.openAlbum')}>
                  <svg viewBox="0 0 24 24" fill="white" width="28" height="28"><path d="M8 5v14l11-7z" /></svg>
                </button>
              </div>
            </div>
            <span class="album-card-title truncate">{album.title}</span>
            {#if album.year}
              <span class="album-card-year">{album.year}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

  {:else}
    <!-- Main search/browse view -->
    <div class="streaming-header">
      <h2>{serviceName(service)}</h2>
    </div>

    <div class="search-row">
      <div class="search-box">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input
          type="text"
          placeholder={$tr('streaming.searchOn').replace('{service}', serviceName(service))}
          bind:value={searchQuery}
          onkeydown={handleSearchKey}
        />
        {#if searchQuery}
          <button class="search-clear" onclick={clearSearch}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        {/if}
      </div>
      <button class="search-btn" onclick={search} disabled={searching || !searchQuery.trim()}>
        {#if searching}
          <div class="spinner small"></div>
        {:else}
          {$tr('common.search')}
        {/if}
      </button>
    </div>

    {#if results}
      <div class="tab-bar">
        {#if results.albums.length > 0}
          <button class="tab" class:active={tab === 'albums'} onclick={() => tab = 'albums'}>{$tr('common.albums')} ({results.albums.length})</button>
        {/if}
        {#if results.artists.length > 0}
          <button class="tab" class:active={tab === 'artists'} onclick={() => tab = 'artists'}>{$tr('common.artists')} ({results.artists.length})</button>
        {/if}
        {#if results.tracks.length > 0}
          <button class="tab" class:active={tab === 'tracks'} onclick={() => tab = 'tracks'}>{$tr('home.tracks')} ({results.tracks.length})</button>
        {/if}
      </div>

      {#if tab === 'albums' && results.albums.length > 0}
        <div class="albums-grid">
          {#each results.albums as album}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="album-card" onclick={() => selectAlbum(album)}>
              <div class="album-card-art">
                <AlbumArt coverPath={album.cover_path} size={160} alt={album.title} />
                <div class="art-hover-overlay">
                  <button class="art-play-btn" onclick={(e) => { e.stopPropagation(); selectAlbum(album); }} title={$tr('library.openAlbum')}>
                    <svg viewBox="0 0 24 24" fill="white" width="28" height="28"><path d="M8 5v14l11-7z" /></svg>
                  </button>
                </div>
              </div>
              <span class="album-card-title truncate">{album.title}</span>
              {#if album.artist_name}
                <span class="album-card-artist truncate">{album.artist_name}</span>
              {/if}
            </div>
          {/each}
        </div>

      {:else if tab === 'artists' && results.artists.length > 0}
        <div class="artists-list">
          {#each results.artists as artist}
            <button class="artist-item" onclick={() => selectArtist(artist)}>
              <div class="artist-avatar">{artist.name.charAt(0).toUpperCase()}</div>
              <span class="artist-name">{artist.name}</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          {/each}
        </div>

      {:else if tab === 'tracks' && results.tracks.length > 0}
        <div class="track-list">
          {#each results.tracks as t, index}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="track-item" onclick={() => playStreamingTrack(t)}>
              <span class="track-num">{index + 1}</span>
              <div class="track-info">
                <span class="track-title truncate">{t.title}</span>
                <span class="track-artist truncate">{t.artist_name ?? ''} {t.album_title ? `- ${t.album_title}` : ''}</span>
              </div>
              {#if t.format}<span class="audio-format">{formatAudioBadge(t)}</span>{/if}
              <span class="track-duration">{formatTime(t.duration_ms)}</span>
              <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); addStreamingTrackToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
              {#if onAddToPlaylist && (t.id || t.source_id)}
                <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={$tr('nowplaying.addToPlaylist')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 12H3m13 0h-2m0 0V8m0 4v4m6-8v8a2 2 0 01-2 2H5" /><line x1="3" y1="16" x2="11" y2="16" /><line x1="3" y1="8" x2="8" y2="8" /></svg>
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      {#if results.albums.length === 0 && results.artists.length === 0 && results.tracks.length === 0}
        <div class="empty-center">{$tr('common.noResult')}</div>
      {/if}

    {:else if showFeatured}
      <!-- User playlists carousel -->
      {#if userPlaylists.length > 0}
        <div class="featured-section">
          <h3 class="featured-section-title">{$tr('streaming.myPlaylists')}</h3>
          <div class="carousel">
            {#each userPlaylists as playlist}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="carousel-card" onclick={() => selectStreamingPlaylist(playlist)}>
                <div class="album-card-art">
                  <AlbumArt coverPath={playlist.cover_path} size={160} alt={playlist.name} />
                  <div class="art-hover-overlay">
                    <button class="art-play-btn" onclick={(e) => { e.stopPropagation(); selectStreamingPlaylist(playlist); }} title={$tr('library.openAlbum')}>
                      <svg viewBox="0 0 24 24" fill="white" width="28" height="28"><path d="M8 5v14l11-7z" /></svg>
                    </button>
                  </div>
                </div>
                <span class="album-card-title truncate">{playlist.name}</span>
                <span class="album-card-artist truncate">{playlist.track_count} {$tr('home.tracks').toLowerCase()}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Featured sections with carousels -->
      {#if featuredLoading && featuredSections.length === 0}
        <div class="skeleton-sections">
          {#each [1, 2, 3] as _}
            <div class="skeleton-section">
              <div class="skeleton-title"></div>
              <div class="skeleton-carousel">
                {#each [1, 2, 3, 4, 5] as __}
                  <div class="skeleton-card">
                    <div class="skeleton-art"></div>
                    <div class="skeleton-text"></div>
                    <div class="skeleton-text short"></div>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {:else}
        {#each featuredSections as section}
          {#if featuredData[section.id]?.length}
            <div class="featured-section">
              <h3 class="featured-section-title">{section.name}</h3>
              <div class="carousel">
                {#each featuredData[section.id] as album}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="carousel-card" onclick={() => selectAlbum(album)}>
                    <div class="album-card-art">
                      <AlbumArt coverPath={album.cover_path} size={160} alt={album.title} />
                      <div class="art-hover-overlay">
                        <button class="art-play-btn" onclick={(e) => { e.stopPropagation(); selectAlbum(album); }} title={$tr('library.openAlbum')}>
                          <svg viewBox="0 0 24 24" fill="white" width="28" height="28"><path d="M8 5v14l11-7z" /></svg>
                        </button>
                      </div>
                    </div>
                    <span class="album-card-title truncate">{album.title}</span>
                    {#if album.artist_name}
                      <span class="album-card-artist truncate">{album.artist_name}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        {/each}
      {/if}

    {:else if searching}
      <div class="loading"><div class="spinner"></div>{$tr('common.searching')}</div>
    {/if}
  {/if}
</div>

<style>
  .streaming-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
  }

  .streaming-header {
    margin-bottom: var(--space-lg);
  }

  .streaming-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  .search-row {
    display: flex;
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
  }

  .search-box {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: 8px 14px;
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
    flex: 1;
    background: none;
    border: none;
    outline: none;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
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
    border-radius: var(--radius-sm);
  }

  .search-clear:hover {
    color: var(--tune-text);
  }

  .search-btn {
    padding: 8px 20px;
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    transition: background 0.12s;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .search-btn:hover:not(:disabled) {
    background: var(--tune-accent-hover);
  }

  .search-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Featured sections */

  .featured-section {
    margin-bottom: var(--space-xl);
  }

  .featured-section-title {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--tune-text-muted);
    margin-bottom: var(--space-md);
  }

  .carousel {
    display: flex;
    overflow-x: auto;
    gap: 16px;
    scroll-snap-type: x mandatory;
    padding-bottom: var(--space-sm);
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .carousel::-webkit-scrollbar {
    display: none;
  }

  .carousel-card {
    width: 160px;
    flex-shrink: 0;
    scroll-snap-align: start;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    cursor: pointer;
    color: var(--tune-text);
    transition: transform 0.15s ease-out;
  }

  .carousel-card:hover {
    transform: translateY(-2px);
  }

  /* Tab bar */

  .tab-bar {
    display: flex;
    gap: 2px;
    background: var(--tune-grey2);
    border-radius: var(--radius-md);
    padding: 2px;
    margin-bottom: var(--space-lg);
    width: fit-content;
  }

  .tab {
    padding: var(--space-xs) var(--space-md);
    background: none;
    border: none;
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.12s ease-out;
  }

  .tab:hover {
    color: var(--tune-text);
  }

  .tab.active {
    background: var(--tune-surface-selected);
    color: var(--tune-text);
  }

  .detail-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .detail-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
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
  }

  .back-btn:hover {
    border-color: var(--tune-text-muted);
    color: var(--tune-text);
  }

  .album-detail-header {
    display: flex;
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
    align-items: flex-start;
  }

  .album-detail-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .album-detail-info h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
  }

  .detail-artist {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--tune-text-secondary);
  }

  .detail-meta {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
  }

  .source-badge {
    display: inline-block;
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    background: rgba(87, 198, 185, 0.15);
    color: var(--tune-accent);
    width: fit-content;
  }

  .play-all-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    margin-top: var(--space-md);
    padding: var(--space-sm) var(--space-lg);
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    transition: background 0.12s ease-out;
  }

  .play-all-btn:hover {
    background: var(--tune-accent-hover);
  }

  .albums-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--space-lg);
    flex: 1;
    overflow-y: auto;
  }

  .album-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    padding: 0;
    color: var(--tune-text);
    transition: transform 0.15s ease-out;
  }

  .album-card:hover {
    transform: translateY(-2px);
  }

  .album-card-art {
    position: relative;
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  /* Visual overlay — never intercepts clicks, card onclick handles navigation */
  .art-hover-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease-out;
    border-radius: var(--radius-lg);
  }

  .album-card-art:hover .art-hover-overlay {
    opacity: 1;
  }

  /* Small centered play button — only interactive element */
  .art-play-btn {
    pointer-events: auto;
    background: rgba(255, 255, 255, 0.15);
    border: 2px solid rgba(255, 255, 255, 0.7);
    border-radius: 50%;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.12s, transform 0.12s;
  }

  .art-play-btn:hover {
    background: rgba(255, 255, 255, 0.25);
    transform: scale(1.08);
  }

  .album-card-title {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    max-width: 160px;
  }

  .album-card-artist, .album-card-year {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    max-width: 160px;
  }

  .artists-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    overflow-y: auto;
  }

  .artist-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 0;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease-out;
  }

  .artist-item:hover {
    background: var(--tune-surface-hover);
  }

  .artist-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--tune-grey2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    flex-shrink: 0;
  }

  .artist-name {
    flex: 1;
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 700;
  }

  .chevron {
    color: var(--tune-text-muted);
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
    gap: var(--space-md);
    padding: 8px 0;
    cursor: pointer;
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

  .audio-format {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-text-muted);
    letter-spacing: 0.3px;
    flex-shrink: 0;
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

  .spinner.small {
    width: 14px;
    height: 14px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-center {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 15px;
    text-align: center;
    padding: var(--space-2xl);
  }

  /* Skeleton loaders */
  .skeleton-sections {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .skeleton-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .skeleton-title {
    width: 140px;
    height: 14px;
    background: var(--tune-grey2);
    border-radius: var(--radius-sm);
    animation: shimmer 1.5s infinite;
  }

  .skeleton-carousel {
    display: flex;
    gap: 16px;
    overflow: hidden;
  }

  .skeleton-card {
    width: 160px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .skeleton-art {
    width: 160px;
    height: 160px;
    background: var(--tune-grey2);
    border-radius: var(--radius-lg);
    animation: shimmer 1.5s infinite;
  }

  .skeleton-text {
    width: 120px;
    height: 12px;
    background: var(--tune-grey2);
    border-radius: var(--radius-sm);
    animation: shimmer 1.5s infinite;
  }

  .skeleton-text.short {
    width: 80px;
  }

  @keyframes shimmer {
    0% { opacity: 0.4; }
    50% { opacity: 0.7; }
    100% { opacity: 0.4; }
  }
</style>

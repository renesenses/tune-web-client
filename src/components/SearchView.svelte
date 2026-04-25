<script lang="ts">
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import { activeView } from '../lib/stores/navigation';
  import { selectedArtist, artistAlbums, selectedAlbum, libraryTab, libraryLoading } from '../lib/stores/library';
  import { streamingServices } from '../lib/stores/streaming';
  import * as api from '../lib/api';
  import { formatTime, formatAudioBadge } from '../lib/utils';
  import AlbumArt from './AlbumArt.svelte';
  import type { FederatedSearchResult, Track, Album, Artist, Playlist, StreamingPlaylist, Source } from '../lib/types';
  import { t } from '../lib/i18n';

  interface Props {
    onAddToPlaylist?: (track: Track) => void;
  }
  let { onAddToPlaylist }: Props = $props();

  let zone = $derived($currentZone);
  let addToPlaylistLabel = $derived($t('nowplaying.addToPlaylist'));
  let searchQuery = $state('');
  let loading = $state(false);
  let results: FederatedSearchResult | null = $state(null);

  interface PlaylistMatch {
    name: string;
    trackCount: number;
    source: string;
    localId?: number;
    streamingId?: string;
    streamingSource?: Source;
  }
  let playlistMatches = $state<PlaylistMatch[]>([]);

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    loading = true;
    results = null;
    playlistMatches = [];
    try {
      const query = searchQuery.trim().toLowerCase();

      // Federated search + playlist search in parallel
      const [federated, localPlaylists] = await Promise.all([
        api.federatedSearch(searchQuery.trim()),
        api.getPlaylists().catch(() => [] as Playlist[]),
      ]);
      results = federated;

      // Filter local playlists by name
      const matches: PlaylistMatch[] = localPlaylists
        .filter((p) => p.name.toLowerCase().includes(query))
        .map((p) => ({
          name: p.name,
          trackCount: p.track_count ?? 0,
          source: 'Local',
          localId: p.id ?? undefined,
        }));

      // Search streaming playlists for each authenticated service
      const services = $streamingServices;
      const streamingPromises: Promise<void>[] = [];
      for (const [service, status] of Object.entries(services)) {
        if (status.authenticated) {
          streamingPromises.push(
            api.getStreamingPlaylists(service)
              .then((playlists: StreamingPlaylist[]) => {
                for (const p of playlists) {
                  if (p.name.toLowerCase().includes(query)) {
                    matches.push({
                      name: p.name,
                      trackCount: p.track_count,
                      source: service.charAt(0).toUpperCase() + service.slice(1),
                      streamingId: p.source_id,
                      streamingSource: p.source,
                    });
                  }
                }
              })
              .catch(() => {})
          );
        }
      }
      await Promise.all(streamingPromises);
      playlistMatches = matches;
    } catch (e) {
      console.error('Search error:', e);
    }
    loading = false;
  }

  async function playPlaylist(pl: PlaylistMatch) {
    if (!zone?.id) return;
    try {
      if (pl.localId != null) {
        await playAndSync(zone.id, { playlist_id: pl.localId });
      } else if (pl.streamingId && pl.streamingSource) {
        await playAndSync(zone.id, { streaming_playlist_id: pl.streamingId, source: pl.streamingSource });
      }
    } catch (e) {
      console.error('Play playlist error:', e);
    }
  }

  async function playTrack(track: Track) {
    if (!zone?.id) {
      console.warn('No zone selected, cannot play track:', track.title);
      return;
    }
    try {
      console.log('Playing track:', track.title, 'id:', track.id, 'source:', track.source, 'source_id:', track.source_id);
      if (track.id) {
        await playAndSync(zone.id, { track_id: track.id });
      } else if (track.source && track.source_id) {
        await playAndSync(zone.id, { source: track.source, source_id: track.source_id });
      } else {
        console.error('Track has no id and no source_id:', track);
      }
    } catch (e) {
      console.error('Play track error:', e);
    }
  }

  async function playAlbum(album: Album) {
    if (!zone?.id) return;
    try {
      if (album.id) {
        await playAndSync(zone.id, { album_id: album.id });
      } else if (album.source && album.source_id) {
        await playAndSync(zone.id, { source: album.source, source_id: album.source_id });
      }
    } catch (e) {
      console.error('Play album error:', e);
    }
  }

  async function selectArtist(artist: Artist) {
    if (!artist.id) return;
    selectedArtist.set(artist);
    selectedAlbum.set(null);
    libraryTab.set('artists');
    libraryLoading.set(true);
    activeView.set('library');
    try {
      const result = await api.getArtistAlbums(artist.id);
      artistAlbums.set(result);
    } catch (e) {
      console.error('Load artist albums error:', e);
    }
    libraryLoading.set(false);
  }

  function allSources(results: FederatedSearchResult): { name: string; data: { tracks: Track[]; albums: Album[]; artists: Artist[] } }[] {
    const sources: { name: string; data: { tracks: Track[]; albums: Album[]; artists: Artist[] } }[] = [];
    if (results.local && (results.local.tracks.length > 0 || results.local.albums.length > 0 || results.local.artists.length > 0)) {
      sources.push({ name: 'Local', data: results.local });
    }
    for (const [service, data] of Object.entries(results.services ?? {})) {
      if (data.tracks.length > 0 || data.albums.length > 0 || data.artists.length > 0) {
        sources.push({ name: service.charAt(0).toUpperCase() + service.slice(1), data });
      }
    }
    return sources;
  }
</script>

<div class="search-view">
  <div class="search-header">
    <h2>{$t('search.title')}</h2>
    <div class="search-bar">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      <input
        type="text"
        placeholder={$t('search.placeholder')}
        bind:value={searchQuery}
        onkeydown={(e) => e.key === 'Enter' && handleSearch()}
      />
      <button class="search-btn" onclick={handleSearch}>{$t('common.search')}</button>
    </div>
  </div>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      {$t('search.searching')}
    </div>
  {:else if results}
    {@const sources = allSources(results)}
    {#if playlistMatches.length > 0}
      <div class="source-section">
        <h3 class="source-title">{$t('nav.playlists')}</h3>
        <div class="playlist-results">
          {#each playlistMatches as pl}
            <button class="playlist-result-item" onclick={() => playPlaylist(pl)}>
              <span class="playlist-icon">&#127925;</span>
              <div class="playlist-result-info">
                <span class="playlist-result-name truncate">{pl.name}</span>
                <span class="playlist-result-meta">{pl.trackCount} {$t('settings.tracks').toLowerCase()}</span>
              </div>
              <span class="playlist-source-badge">{pl.source}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
    {#if sources.length === 0 && playlistMatches.length === 0}
      <div class="empty">{$t('search.noResults').replace('{query}', searchQuery)}</div>
    {:else}
      {#each sources as source}
        <div class="source-section">
          <h3 class="source-title">{source.name}</h3>

          {#if source.data.albums.length > 0}
            <h4 class="subsection-title">{$t('common.albums')}</h4>
            <div class="albums-row">
              {#each source.data.albums as album}
                <button class="album-card" onclick={() => playAlbum(album)}>
                  <AlbumArt coverPath={album.cover_path} size={120} alt={album.title} />
                  <span class="album-card-title truncate">{album.title}</span>
                  {#if album.artist_name}
                    <span class="album-card-artist truncate">{album.artist_name}</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}

          {#if source.data.tracks.length > 0}
            <h4 class="subsection-title">{$t('home.tracks')}</h4>
            <div class="track-list">
              {#each source.data.tracks as t}
                <div class="track-item">
                  <button class="track-play" onclick={() => playTrack(t)}>
                    <AlbumArt coverPath={t.cover_path} albumId={t.album_id} size={36} alt={t.title} />
                    <div class="track-info">
                      <span class="track-title truncate">{t.title}</span>
                      <span class="track-artist truncate">{t.artist_name ?? ''}{t.album_title ? ` - ${t.album_title}` : ''}</span>
                    </div>
                    {#if t.format}<span class="audio-format">{formatAudioBadge(t)}</span>{/if}
                    <span class="track-duration">{formatTime(t.duration_ms)}</span>
                  </button>
                  {#if onAddToPlaylist && (t.id || t.source_id)}
                    <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={addToPlaylistLabel}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 12H3m13 0h-2m0 0V8m0 4v4m6-8v8a2 2 0 01-2 2H5" /><line x1="3" y1="16" x2="11" y2="16" /><line x1="3" y1="8" x2="8" y2="8" /></svg>
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          {#if source.data.artists.length > 0}
            <h4 class="subsection-title">{$t('common.artists')}</h4>
            <div class="artist-list">
              {#each source.data.artists as artist}
                <button class="artist-chip" onclick={() => selectArtist(artist)}>
                  <div class="artist-avatar">{artist.name.charAt(0).toUpperCase()}</div>
                  <span>{artist.name}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  {:else}
    <div class="empty">{$t('search.hint')}</div>
  {/if}
</div>

<style>
  .search-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
  }

  .search-header {
    margin-bottom: var(--space-lg);
  }

  .search-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
    margin-bottom: var(--space-md);
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    background: rgba(60, 60, 63, 0.5);
    border-radius: var(--radius-md);
    padding: 0 var(--space-md);
  }

  .search-icon {
    width: 16px;
    height: 16px;
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  .search-bar input {
    flex: 1;
    background: none;
    border: none;
    padding: var(--space-sm) 0;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
    outline: none;
  }

  .search-bar input::placeholder {
    color: var(--tune-text-muted);
  }

  .search-btn {
    background: var(--tune-accent);
    color: white;
    border: none;
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: background 0.12s ease-out;
  }

  .search-btn:hover {
    background: var(--tune-accent-hover);
  }

  .source-section {
    margin-bottom: var(--space-xl);
  }

  .source-title {
    font-family: var(--font-label);
    font-size: 18px;
    font-weight: 600;
    color: var(--tune-accent);
    margin-bottom: var(--space-md);
    padding-bottom: var(--space-xs);
    border-bottom: 1px solid var(--tune-border);
  }

  .subsection-title {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--tune-text-muted);
    margin-bottom: var(--space-sm);
    margin-top: var(--space-md);
  }

  .albums-row {
    display: flex;
    gap: var(--space-md);
    overflow-x: auto;
    padding-bottom: var(--space-sm);
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
    flex-shrink: 0;
  }

  .album-card:hover {
    opacity: 0.85;
  }

  .album-card-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    max-width: 120px;
  }

  .album-card-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    max-width: 120px;
  }

  .track-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .track-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    transition: background 0.12s ease-out;
  }

  .track-item:hover {
    background: var(--tune-surface-hover);
  }

  .track-play {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 8px 0;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    min-width: 0;
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
    flex-shrink: 0;
  }

  .track-item:hover .add-playlist-btn {
    opacity: 1;
  }

  .add-playlist-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
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

  .artist-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .artist-chip {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-md);
    background: var(--tune-grey2);
    border: none;
    border-radius: var(--radius-xl);
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text);
    cursor: pointer;
    transition: background 0.12s ease-out;
  }

  .artist-chip:hover {
    background: var(--tune-surface-hover);
  }

  .artist-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--tune-surface-selected);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
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

  .playlist-results {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .playlist-result-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 8px 4px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease-out;
    border-radius: var(--radius-sm);
  }

  .playlist-result-item:hover {
    background: var(--tune-surface-hover);
  }

  .playlist-icon {
    font-size: 18px;
    flex-shrink: 0;
    width: 28px;
    text-align: center;
  }

  .playlist-result-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .playlist-result-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
  }

  .playlist-result-meta {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }

  .playlist-source-badge {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-text-muted);
    background: var(--tune-grey2);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    letter-spacing: 0.3px;
  }
</style>

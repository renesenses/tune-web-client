<script lang="ts">
  import { currentZone } from '../lib/stores/zones';
  import { activeView } from '../lib/stores/navigation';
  import { selectedArtist, artistAlbums, selectedAlbum, libraryTab, libraryLoading } from '../lib/stores/library';
  import * as api from '../lib/api';
  import { formatTime, formatAudioBadge } from '../lib/utils';
  import AlbumArt from './AlbumArt.svelte';
  import type { FederatedSearchResult, Track, Album, Artist } from '../lib/types';
  import { t } from '../lib/i18n';

  let zone = $derived($currentZone);
  let searchQuery = $state('');
  let loading = $state(false);
  let results: FederatedSearchResult | null = $state(null);

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    loading = true;
    results = null;
    try {
      results = await api.federatedSearch(searchQuery.trim());
    } catch (e) {
      console.error('Search error:', e);
    }
    loading = false;
  }

  async function playTrack(trackId: number) {
    if (!zone?.id) return;
    try {
      await api.play(zone.id, { track_id: trackId });
    } catch (e) {
      console.error('Play track error:', e);
    }
  }

  async function playAlbum(albumId: number) {
    if (!zone?.id) return;
    try {
      await api.play(zone.id, { album_id: albumId });
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
    {#if sources.length === 0}
      <div class="empty">{$t('search.noResults').replace('{query}', searchQuery)}</div>
    {:else}
      {#each sources as source}
        <div class="source-section">
          <h3 class="source-title">{source.name}</h3>

          {#if source.data.albums.length > 0}
            <h4 class="subsection-title">{$t('common.albums')}</h4>
            <div class="albums-row">
              {#each source.data.albums as album}
                <button class="album-card" onclick={() => album.id && playAlbum(album.id)}>
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
                <button class="track-item" onclick={() => t.id && playTrack(t.id)}>
                  <div class="track-info">
                    <span class="track-title truncate">{t.title}</span>
                    <span class="track-artist truncate">{t.artist_name ?? ''}{t.album_title ? ` - ${t.album_title}` : ''}</span>
                  </div>
                  {#if t.format}<span class="audio-format">{formatAudioBadge(t)}</span>{/if}
                  <span class="track-duration">{formatTime(t.duration_ms)}</span>
                </button>
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
    gap: var(--space-md);
    padding: 8px 0;
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
</style>

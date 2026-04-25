<script lang="ts">
  import { currentProfileId } from '../lib/stores/profile';
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import { queueTracks, queuePosition } from '../lib/stores/queue';
  import { selectedAlbum, albumTracks, selectedArtist, artistAlbums } from '../lib/stores/library';
  import { activeView } from '../lib/stores/navigation';
  import * as api from '../lib/api';
  import { t as tr } from '../lib/i18n';
  import { formatTime, formatAudioBadge } from '../lib/utils';
  import AlbumArt from './AlbumArt.svelte';
  import type { Track, Album, Artist } from '../lib/types';

  interface Props {
    onAddToPlaylist?: (track: Track) => void;
  }
  let { onAddToPlaylist }: Props = $props();

  type FavTab = 'tracks' | 'albums' | 'artists';
  let activeTab = $state<FavTab>('tracks');
  let loading = $state(false);
  let favTracks = $state<Track[]>([]);
  let favAlbums = $state<Album[]>([]);
  let favArtists = $state<Artist[]>([]);

  let zone = $derived($currentZone);

  async function loadFavorites() {
    const pid = $currentProfileId;
    if (!pid) return;
    loading = true;
    try {
      const result = await api.getFavorites(pid);
      favTracks = result.tracks ?? [];
      favAlbums = result.albums ?? [];
      favArtists = result.artists ?? [];
    } catch (e) {
      console.error('Load favorites error:', e);
    }
    loading = false;
  }

  $effect(() => {
    // Reload when profile changes
    const _pid = $currentProfileId;
    if (_pid) loadFavorites();
  });

  async function playTrack(track: Track) {
    if (!zone?.id || !track.id) return;
    try {
      await playAndSync(zone.id, { track_id: track.id });
    } catch (e) {
      console.error('Play track error:', e);
    }
  }

  async function addToQueue(track: Track) {
    if (!zone?.id) return;
    try {
      if (track.id) {
        await api.addToQueue(zone.id, { track_id: track.id });
      }
      const qs = await api.getQueue(zone.id);
      queueTracks.set(qs.tracks);
      queuePosition.set(qs.position);
    } catch (e) {
      console.error('Add to queue error:', e);
    }
  }

  async function removeFavTrack(track: Track) {
    const pid = $currentProfileId;
    if (!pid || !track.id) return;
    favTracks = favTracks.filter(t => t.id !== track.id);
    try {
      await api.removeFavorite(pid, { track_id: track.id });
    } catch (e) {
      console.error('Remove favorite error:', e);
      loadFavorites();
    }
  }

  async function removeFavAlbum(album: Album) {
    const pid = $currentProfileId;
    if (!pid || !album.id) return;
    favAlbums = favAlbums.filter(a => a.id !== album.id);
    try {
      await api.removeFavorite(pid, { album_id: album.id });
    } catch (e) {
      console.error('Remove favorite error:', e);
      loadFavorites();
    }
  }

  async function removeFavArtist(artist: Artist) {
    const pid = $currentProfileId;
    if (!pid || !artist.id) return;
    favArtists = favArtists.filter(a => a.id !== artist.id);
    try {
      await api.removeFavorite(pid, { artist_id: artist.id });
    } catch (e) {
      console.error('Remove favorite error:', e);
      loadFavorites();
    }
  }

  function navigateToAlbum(album: Album) {
    if (!album.id) return;
    selectedArtist.set(null);
    selectedAlbum.set(album);
    api.getAlbumTracks(album.id).then(tracks => albumTracks.set(tracks));
    activeView.set('library');
  }

  function navigateToArtist(artist: Artist) {
    if (!artist.id) return;
    selectedAlbum.set(null);
    selectedArtist.set(artist);
    api.getArtistAlbums(artist.id).then(albums => artistAlbums.set(albums));
    activeView.set('library');
  }

  async function playAlbum(album: Album) {
    if (!zone?.id || !album.id) return;
    try {
      await playAndSync(zone.id, { album_id: album.id });
    } catch (e) {
      console.error('Play album error:', e);
    }
  }

  function initials(name: string): string {
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.charAt(0).toUpperCase();
  }
</script>

<div class="favorites-view">
  <div class="favorites-header">
    <h2>{$tr('nav.favorites')}</h2>
    <div class="tab-bar">
      <button class="tab" class:active={activeTab === 'tracks'} onclick={() => activeTab = 'tracks'}>{$tr('favorites.tracks')} ({favTracks.length})</button>
      <button class="tab" class:active={activeTab === 'albums'} onclick={() => activeTab = 'albums'}>{$tr('favorites.albums')} ({favAlbums.length})</button>
      <button class="tab" class:active={activeTab === 'artists'} onclick={() => activeTab = 'artists'}>{$tr('favorites.artists')} ({favArtists.length})</button>
    </div>
  </div>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      {$tr('common.loading')}
    </div>
  {:else if activeTab === 'tracks'}
    {#if favTracks.length === 0}
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        <p>{$tr('favorites.empty')}</p>
      </div>
    {:else}
      <div class="track-list">
        {#each favTracks as t}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="track-item" onclick={() => playTrack(t)}>
            <span class="track-thumb"><AlbumArt coverPath={t.cover_path} albumId={t.album_id} size={36} alt={t.album_title ?? ''} /></span>
            <div class="track-info">
              <span class="track-title truncate">{t.title}</span>
              <span class="track-meta truncate">{t.artist_name ?? ''}{#if t.album_title} — {t.album_title}{/if}</span>
            </div>
            {#if t.format}<span class="audio-format">{formatAudioBadge(t)}</span>{/if}
            <span class="track-duration">{formatTime(t.duration_ms)}</span>
            <button class="action-btn" onclick={(e) => { e.stopPropagation(); addToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
            {#if onAddToPlaylist && (t.id || t.source_id)}
              <button class="action-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={$tr('nowplaying.addToPlaylist')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" /><line x1="16" y1="3" x2="16" y2="11" /><line x1="12" y1="7" x2="20" y2="7" /></svg>
              </button>
            {/if}
            <button class="remove-btn" onclick={(e) => { e.stopPropagation(); removeFavTrack(t); }} title={$tr('profile.delete')}>
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}

  {:else if activeTab === 'albums'}
    {#if favAlbums.length === 0}
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        <p>{$tr('favorites.empty')}</p>
      </div>
    {:else}
      <div class="albums-grid">
        {#each favAlbums as album}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="album-card" onclick={() => navigateToAlbum(album)}>
            <div class="album-card-art">
              <img class="album-cover-img" src={api.artworkUrl(album.cover_path)} alt={album.title} onerror={(e) => (e.target as HTMLImageElement).style.display='none'} />
              <button class="play-overlay" onclick={(e) => { e.stopPropagation(); playAlbum(album); }} title={$tr('library.playAlbum')}>
                <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><path d="M8 5v14l11-7z" /></svg>
              </button>
              <button class="remove-overlay" onclick={(e) => { e.stopPropagation(); removeFavAlbum(album); }}>
                <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
              </button>
            </div>
            <span class="album-card-title truncate">{album.title}</span>
            {#if album.artist_name}
              <span class="album-card-artist truncate">{album.artist_name}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

  {:else if activeTab === 'artists'}
    {#if favArtists.length === 0}
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        <p>{$tr('favorites.empty')}</p>
      </div>
    {:else}
      <div class="artists-grid">
        {#each favArtists as artist}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="artist-card" onclick={() => navigateToArtist(artist)}>
            <div class="artist-card-avatar">
              {#if artist.image_path}
                <AlbumArt coverPath={artist.image_path} size={100} alt={artist.name} round />
              {:else}
                {initials(artist.name)}
              {/if}
            </div>
            <span class="artist-card-name truncate">{artist.name}</span>
            <button class="artist-remove-btn" onclick={(e) => { e.stopPropagation(); removeFavArtist(artist); }}>
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="14" height="14"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .favorites-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
  }

  .favorites-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .favorites-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  .tab-bar {
    display: flex;
    gap: 2px;
    background: var(--tune-grey2);
    border-radius: var(--radius-md);
    padding: 2px;
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

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: var(--space-xl);
    color: var(--tune-text-muted);
    font-family: var(--font-body);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    padding: var(--space-xl) 0;
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 14px;
  }

  .empty-state svg {
    opacity: 0.3;
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Track list */
  .track-list {
    display: flex;
    flex-direction: column;
  }

  .track-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background 0.12s;
  }

  .track-item:hover {
    background: var(--tune-surface-hover);
  }

  .track-thumb {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    overflow: hidden;
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
    color: var(--tune-text);
  }

  .track-meta {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .audio-format {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    background: rgba(87, 198, 185, 0.1);
    color: var(--tune-accent);
    flex-shrink: 0;
  }

  .track-duration {
    font-family: var(--font-label);
    font-size: 12px;
    color: var(--tune-text-muted);
    flex-shrink: 0;
    min-width: 40px;
    text-align: right;
  }

  .action-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.12s, color 0.12s;
    font-family: var(--font-body);
    font-size: 16px;
    font-weight: 600;
  }

  .track-item:hover .action-btn {
    opacity: 0.7;
  }

  .action-btn:hover {
    opacity: 1 !important;
    color: var(--tune-text);
  }

  .remove-btn {
    background: none;
    border: none;
    color: #ef4444;
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.12s;
  }

  .track-item:hover .remove-btn {
    opacity: 0.6;
  }

  .remove-btn:hover {
    opacity: 1 !important;
  }

  /* Albums grid */
  .albums-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--space-lg);
  }

  .album-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    cursor: pointer;
    transition: transform 0.12s;
  }

  .album-card:hover {
    transform: translateY(-2px);
  }

  .album-card-art {
    aspect-ratio: 1;
    background: var(--tune-grey2);
    border-radius: var(--radius-md);
    overflow: hidden;
    position: relative;
  }

  .album-cover-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .play-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s;
    border: none;
    cursor: pointer;
    border-radius: var(--radius-md);
  }

  .album-card:hover .play-overlay {
    opacity: 1;
  }

  .remove-overlay {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 28px;
    height: 28px;
    background: rgba(0, 0, 0, 0.6);
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ef4444;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
    z-index: 2;
  }

  .album-card:hover .remove-overlay {
    opacity: 1;
  }

  .album-card-title {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text);
  }

  .album-card-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  /* Artists grid */
  .artists-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: var(--space-lg);
  }

  .artist-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    position: relative;
  }

  .artist-card-avatar {
    width: 100px;
    height: 100px;
    border-radius: 50%;
    background: var(--tune-grey2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    color: var(--tune-text-muted);
    overflow: hidden;
  }

  .artist-card-name {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text);
    text-align: center;
    max-width: 100%;
  }

  .artist-remove-btn {
    position: absolute;
    top: 0;
    right: 10px;
    width: 24px;
    height: 24px;
    background: rgba(0, 0, 0, 0.6);
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ef4444;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .artist-card:hover .artist-remove-btn {
    opacity: 1;
  }

  @media (max-width: 768px) {
    .favorites-view {
      padding: var(--space-md) 16px;
    }

    .favorites-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .favorites-header h2 {
      font-size: 22px;
    }

    .albums-grid {
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    }
  }
</style>

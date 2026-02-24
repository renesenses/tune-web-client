<script lang="ts">
  import { libraryTab, libraryLoading, albums, artists, tracks, selectedAlbum, albumTracks, selectedArtist, artistAlbums, type LibraryTab } from '../lib/stores/library';
  import { currentZone } from '../lib/stores/zones';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import type { Album, Artist } from '../lib/types';

  let zone = $derived($currentZone);

  function switchTab(tab: LibraryTab) {
    libraryTab.set(tab);
    selectedAlbum.set(null);
    selectedArtist.set(null);
  }

  async function loadAlbums() {
    libraryLoading.set(true);
    try {
      const result = await api.getAlbums(500);
      albums.set(result);
    } catch (e) {
      console.error('Load albums error:', e);
    }
    libraryLoading.set(false);
  }

  async function loadArtists() {
    libraryLoading.set(true);
    try {
      const result = await api.getArtists(500);
      artists.set(result);
    } catch (e) {
      console.error('Load artists error:', e);
    }
    libraryLoading.set(false);
  }

  async function loadTracks() {
    libraryLoading.set(true);
    try {
      const result = await api.getTracks(500);
      tracks.set(result);
    } catch (e) {
      console.error('Load tracks error:', e);
    }
    libraryLoading.set(false);
  }

  async function selectAlbumDetail(album: Album) {
    if (!album.id) return;
    selectedAlbum.set(album);
    selectedArtist.set(null);
    libraryLoading.set(true);
    try {
      const result = await api.getAlbumTracks(album.id);
      albumTracks.set(result);
    } catch (e) {
      console.error('Load album tracks error:', e);
    }
    libraryLoading.set(false);
  }

  async function selectArtistDetail(artist: Artist) {
    if (!artist.id) return;
    selectedArtist.set(artist);
    selectedAlbum.set(null);
    libraryLoading.set(true);
    try {
      const result = await api.getArtistAlbums(artist.id);
      artistAlbums.set(result);
    } catch (e) {
      console.error('Load artist albums error:', e);
    }
    libraryLoading.set(false);
  }

  function goBack() {
    selectedAlbum.set(null);
    selectedArtist.set(null);
    albumTracks.set([]);
    artistAlbums.set([]);
  }

  async function playAlbum(albumId: number) {
    if (!zone?.id) return;
    try {
      await api.play(zone.id, { album_id: albumId });
    } catch (e) {
      console.error('Play album error:', e);
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

  async function addTrackToQueue(trackId: number) {
    if (!zone?.id) return;
    try {
      await api.addToQueue(zone.id, { track_id: trackId });
    } catch (e) {
      console.error('Add to queue error:', e);
    }
  }

  function formatTime(ms: number | undefined): string {
    if (!ms || ms < 0) return '';
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // Auto-load on tab switch
  $effect(() => {
    const tab = $libraryTab;
    if (tab === 'albums' && $albums.length === 0) loadAlbums();
    if (tab === 'artists' && $artists.length === 0) loadArtists();
    if (tab === 'tracks' && $tracks.length === 0) loadTracks();
  });
</script>

<div class="library-view">
  {#if $selectedAlbum}
    <!-- Album detail -->
    <div class="detail-header">
      <button class="back-btn" onclick={goBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        Retour
      </button>
    </div>
    <div class="album-detail">
      <div class="album-detail-header">
        <AlbumArt coverPath={$selectedAlbum.cover_path} size={200} alt={$selectedAlbum.title} />
        <div class="album-detail-info">
          <h2>{$selectedAlbum.title}</h2>
          {#if $selectedAlbum.artist_name}
            <p class="detail-artist">{$selectedAlbum.artist_name}</p>
          {/if}
          {#if $selectedAlbum.year}
            <p class="detail-year">{$selectedAlbum.year}</p>
          {/if}
          {#if $selectedAlbum.genre}
            <p class="detail-genre">{$selectedAlbum.genre}</p>
          {/if}
          <button class="play-all-btn" onclick={() => $selectedAlbum?.id && playAlbum($selectedAlbum.id)}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z" /></svg>
            Lire l'album
          </button>
        </div>
      </div>
      <div class="track-list">
        {#each $albumTracks as t, index}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="track-item" onclick={() => t.id && playTrack(t.id)}>
            <span class="track-num">{t.track_number ?? index + 1}</span>
            <div class="track-info">
              <span class="track-title truncate">{t.title}</span>
              {#if t.artist_name}
                <span class="track-artist truncate">{t.artist_name}</span>
              {/if}
            </div>
            <span class="track-duration">{formatTime(t.duration_ms)}</span>
            <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); t.id && addTrackToQueue(t.id); }} title="Ajouter a la file">+</button>
          </div>
        {/each}
      </div>
    </div>

  {:else if $selectedArtist}
    <!-- Artist detail -->
    <div class="detail-header">
      <button class="back-btn" onclick={goBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        Retour
      </button>
      <h2>{$selectedArtist.name}</h2>
    </div>
    <div class="albums-grid">
      {#each $artistAlbums as album}
        <button class="album-card" onclick={() => selectAlbumDetail(album)}>
          <AlbumArt coverPath={album.cover_path} size={160} alt={album.title} />
          <span class="album-card-title truncate">{album.title}</span>
          {#if album.year}
            <span class="album-card-year">{album.year}</span>
          {/if}
        </button>
      {/each}
    </div>

  {:else}
    <!-- Main library view -->
    <div class="library-header">
      <h2>Bibliotheque</h2>
      <div class="tab-bar">
        <button class="tab" class:active={$libraryTab === 'albums'} onclick={() => switchTab('albums')}>Albums</button>
        <button class="tab" class:active={$libraryTab === 'artists'} onclick={() => switchTab('artists')}>Artistes</button>
        <button class="tab" class:active={$libraryTab === 'tracks'} onclick={() => switchTab('tracks')}>Pistes</button>
      </div>
    </div>

    {#if $libraryLoading}
      <div class="loading">
        <div class="spinner"></div>
        Chargement...
      </div>
    {:else if $libraryTab === 'albums'}
      <div class="albums-grid">
        {#each $albums as album}
          <button class="album-card" onclick={() => selectAlbumDetail(album)}>
            <AlbumArt coverPath={album.cover_path} size={160} alt={album.title} />
            <span class="album-card-title truncate">{album.title}</span>
            {#if album.artist_name}
              <span class="album-card-artist truncate">{album.artist_name}</span>
            {/if}
          </button>
        {/each}
        {#if $albums.length === 0}
          <div class="empty">Aucun album dans la bibliotheque</div>
        {/if}
      </div>

    {:else if $libraryTab === 'artists'}
      <div class="artists-list">
        {#each $artists as artist}
          <button class="artist-item" onclick={() => selectArtistDetail(artist)}>
            <div class="artist-avatar">
              {artist.name.charAt(0).toUpperCase()}
            </div>
            <span class="artist-name">{artist.name}</span>
            <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        {/each}
        {#if $artists.length === 0}
          <div class="empty">Aucun artiste dans la bibliotheque</div>
        {/if}
      </div>

    {:else if $libraryTab === 'tracks'}
      <div class="track-list">
        {#each $tracks as t, index}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="track-item" onclick={() => t.id && playTrack(t.id)}>
            <span class="track-num">{index + 1}</span>
            <div class="track-info">
              <span class="track-title truncate">{t.title}</span>
              <span class="track-artist truncate">{t.artist_name ?? ''} {t.album_title ? `- ${t.album_title}` : ''}</span>
            </div>
            <span class="track-duration">{formatTime(t.duration_ms)}</span>
            <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); t.id && addTrackToQueue(t.id); }} title="Ajouter a la file">+</button>
          </div>
        {/each}
        {#if $tracks.length === 0}
          <div class="empty">Aucune piste dans la bibliotheque</div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .library-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
  }

  .library-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .library-header h2 {
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
    letter-spacing: -0.8px;
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

  .detail-year, .detail-genre {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
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

  /* Albums grid */
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
    transition: opacity 0.12s ease-out;
  }

  .album-card:hover {
    opacity: 0.85;
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

  /* Artists list */
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
    padding: 10px 28px;
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
    gap: var(--space-md);
    padding: 8px 28px;
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
    grid-column: 1 / -1;
  }
</style>

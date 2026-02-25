<script lang="ts">
  import { libraryTab, libraryLoading, albums, artists, tracks, selectedAlbum, albumTracks, selectedArtist, artistAlbums, genres, type LibraryTab } from '../lib/stores/library';
  import { currentZone } from '../lib/stores/zones';
  import * as api from '../lib/api';
  import { formatTime, formatDuration } from '../lib/utils';
  import AlbumArt from './AlbumArt.svelte';
  import type { Album, Artist } from '../lib/types';

  interface Props {
    onAddToPlaylist?: (trackId: number) => void;
  }
  let { onAddToPlaylist }: Props = $props();

  let zone = $derived($currentZone);
  let searchQuery = $state('');
  let selectedGenre = $state<string | null>(null);

  let filteredAlbums = $derived(
    searchQuery.trim()
      ? $albums.filter(a => {
          const q = searchQuery.toLowerCase();
          return a.title.toLowerCase().includes(q) || (a.artist_name ?? '').toLowerCase().includes(q);
        })
      : $albums
  );

  let filteredArtists = $derived(
    searchQuery.trim()
      ? $artists.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : $artists
  );

  let filteredTracks = $derived(
    searchQuery.trim()
      ? $tracks.filter(t => {
          const q = searchQuery.toLowerCase();
          return t.title.toLowerCase().includes(q) || (t.artist_name ?? '').toLowerCase().includes(q) || (t.album_title ?? '').toLowerCase().includes(q);
        })
      : $tracks
  );

  let genreAlbums = $derived(
    selectedGenre ? $albums.filter(a => a.genre === selectedGenre) : []
  );

  let albumTotalDuration = $derived(
    $albumTracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0)
  );

  let tracksByDisc = $derived.by(() => {
    const map = new Map<number, typeof $albumTracks>();
    for (const t of $albumTracks) {
      const disc = t.disc_number ?? 1;
      if (!map.has(disc)) map.set(disc, []);
      map.get(disc)!.push(t);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  });

  let hasMultipleDiscs = $derived(tracksByDisc.length > 1);

  function switchTab(tab: LibraryTab) {
    libraryTab.set(tab);
    selectedAlbum.set(null);
    selectedArtist.set(null);
    selectedGenre = null;
    searchQuery = '';
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

  // Auto-load on tab switch
  $effect(() => {
    const tab = $libraryTab;
    if (tab === 'albums' && $albums.length === 0) loadAlbums();
    if (tab === 'artists' && $artists.length === 0) loadArtists();
    if (tab === 'tracks' && $tracks.length === 0) loadTracks();
    if (tab === 'genres' && $albums.length === 0) loadAlbums();
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
        <AlbumArt coverPath={$selectedAlbum.cover_path} size={320} alt={$selectedAlbum.title} />
        <div class="album-detail-info">
          <h2>{$selectedAlbum.title}</h2>
          {#if $selectedAlbum.artist_name}
            <p class="detail-artist">{$selectedAlbum.artist_name}</p>
          {/if}
          <div class="detail-meta">
            {#if $selectedAlbum.year}
              <span>{$selectedAlbum.year}</span>
            {/if}
            {#if $selectedAlbum.genre}
              <span>{$selectedAlbum.genre}</span>
            {/if}
            {#if $albumTracks.length > 0}
              <span>{$albumTracks.length} pistes</span>
            {/if}
            {#if albumTotalDuration > 0}
              <span>{formatDuration(albumTotalDuration)}</span>
            {/if}
          </div>
          {#if $selectedAlbum.source && $selectedAlbum.source !== 'local'}
            <span class="source-badge">{$selectedAlbum.source}</span>
          {/if}
          <button class="play-all-btn" onclick={() => $selectedAlbum?.id && playAlbum($selectedAlbum.id)}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z" /></svg>
            Lire l'album
          </button>
        </div>
      </div>
      {#if hasMultipleDiscs}
        {#each tracksByDisc as [discNum, discTracks]}
          <div class="disc-header">Disque {discNum}</div>
          <div class="track-list">
            {#each discTracks as t, index}
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
                {#if onAddToPlaylist && t.id}
                  <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t.id!); }} title="Ajouter a une playlist">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" /><line x1="16" y1="3" x2="16" y2="11" /><line x1="12" y1="7" x2="20" y2="7" /></svg>
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      {:else}
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
              {#if onAddToPlaylist && t.id}
                <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t.id!); }} title="Ajouter a une playlist">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" /><line x1="16" y1="3" x2="16" y2="11" /><line x1="12" y1="7" x2="20" y2="7" /></svg>
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
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
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="album-card" onclick={() => selectAlbumDetail(album)}>
          <div class="album-card-art">
            <AlbumArt coverPath={album.cover_path} size={160} alt={album.title} />
            <button class="play-overlay" onclick={(e) => { e.stopPropagation(); album.id && playAlbum(album.id); }} title="Lire l'album">
              <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><path d="M8 5v14l11-7z" /></svg>
            </button>
          </div>
          <span class="album-card-title truncate">{album.title}</span>
          {#if album.year}
            <span class="album-card-year">{album.year}</span>
          {/if}
        </div>
      {/each}
    </div>

  {:else}
    <!-- Main library view -->
    <div class="library-header">
      <h2>Bibliotheque</h2>
      <div class="library-header-right">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" placeholder="Rechercher..." bind:value={searchQuery} />
          {#if searchQuery}
            <button class="search-clear" onclick={() => searchQuery = ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          {/if}
        </div>
        <div class="tab-bar">
          <button class="tab" class:active={$libraryTab === 'albums'} onclick={() => switchTab('albums')}>Albums</button>
          <button class="tab" class:active={$libraryTab === 'artists'} onclick={() => switchTab('artists')}>Artistes</button>
          <button class="tab" class:active={$libraryTab === 'tracks'} onclick={() => switchTab('tracks')}>Pistes</button>
          <button class="tab" class:active={$libraryTab === 'genres'} onclick={() => switchTab('genres')}>Genres</button>
        </div>
      </div>
    </div>

    {#if $libraryLoading}
      <div class="loading">
        <div class="spinner"></div>
        Chargement...
      </div>
    {:else if $libraryTab === 'albums'}
      <div class="albums-grid">
        {#each filteredAlbums as album}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="album-card" onclick={() => selectAlbumDetail(album)}>
            <div class="album-card-art">
              <AlbumArt coverPath={album.cover_path} size={160} alt={album.title} />
              <button class="play-overlay" onclick={(e) => { e.stopPropagation(); album.id && playAlbum(album.id); }} title="Lire l'album">
                <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><path d="M8 5v14l11-7z" /></svg>
              </button>
            </div>
            <span class="album-card-title truncate">{album.title}</span>
            {#if album.artist_name}
              <span class="album-card-artist truncate">{album.artist_name}</span>
            {/if}
          </div>
        {/each}
        {#if filteredAlbums.length === 0}
          <div class="empty">{searchQuery ? 'Aucun resultat' : 'Aucun album dans la bibliotheque'}</div>
        {/if}
      </div>

    {:else if $libraryTab === 'artists'}
      <div class="artists-list">
        {#each filteredArtists as artist}
          <button class="artist-item" onclick={() => selectArtistDetail(artist)}>
            <div class="artist-avatar">
              {artist.name.charAt(0).toUpperCase()}
            </div>
            <span class="artist-name">{artist.name}</span>
            <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        {/each}
        {#if filteredArtists.length === 0}
          <div class="empty">{searchQuery ? 'Aucun resultat' : 'Aucun artiste dans la bibliotheque'}</div>
        {/if}
      </div>

    {:else if $libraryTab === 'tracks'}
      <div class="track-list">
        {#each filteredTracks as t, index}
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
            {#if onAddToPlaylist && t.id}
              <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t.id!); }} title="Ajouter a une playlist">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" /><line x1="16" y1="3" x2="16" y2="11" /><line x1="12" y1="7" x2="20" y2="7" /></svg>
              </button>
            {/if}
          </div>
        {/each}
        {#if filteredTracks.length === 0}
          <div class="empty">{searchQuery ? 'Aucun resultat' : 'Aucune piste dans la bibliotheque'}</div>
        {/if}
      </div>

    {:else if $libraryTab === 'genres'}
      {#if selectedGenre}
        <!-- Genre filtered albums -->
        <div class="genre-detail-header">
          <button class="back-btn" onclick={() => selectedGenre = null}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
            Genres
          </button>
          <h3 class="genre-detail-title">{selectedGenre}</h3>
          <span class="genre-detail-count">{genreAlbums.length} album{genreAlbums.length > 1 ? 's' : ''}</span>
        </div>
        <div class="albums-grid">
          {#each genreAlbums as album}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="album-card" onclick={() => selectAlbumDetail(album)}>
              <div class="album-card-art">
                <AlbumArt coverPath={album.cover_path} size={160} alt={album.title} />
                <button class="play-overlay" onclick={(e) => { e.stopPropagation(); album.id && playAlbum(album.id); }} title="Lire l'album">
                  <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><path d="M8 5v14l11-7z" /></svg>
                </button>
              </div>
              <span class="album-card-title truncate">{album.title}</span>
              {#if album.artist_name}
                <span class="album-card-artist truncate">{album.artist_name}</span>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <!-- Genre grid -->
        <div class="genres-grid">
          {#each $genres as g}
            <button class="genre-card" onclick={() => selectedGenre = g.name}>
              <span class="genre-card-name">{g.name}</span>
              <span class="genre-card-count">{g.count} album{g.count > 1 ? 's' : ''}</span>
            </button>
          {/each}
          {#if $genres.length === 0}
            <div class="empty">Aucun genre dans la bibliotheque</div>
          {/if}
        </div>
      {/if}
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

  .library-header-right {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: 5px 10px;
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
    border-radius: var(--radius-sm);
  }

  .search-clear:hover {
    color: var(--tune-text);
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

  .detail-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-md);
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
  }

  .detail-meta span:not(:last-child)::after {
    content: '·';
    margin-left: var(--space-md);
    color: var(--tune-text-muted);
    opacity: 0.5;
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
    margin-top: var(--space-xs);
    width: fit-content;
  }

  .disc-header {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    padding: var(--space-md) 28px var(--space-xs);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-top: 1px solid var(--tune-border);
    margin-top: var(--space-sm);
  }

  .disc-header:first-of-type {
    border-top: none;
    margin-top: 0;
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

  .play-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    opacity: 0;
    transition: opacity 0.15s ease-out;
    border: none;
    cursor: pointer;
    border-radius: var(--radius-lg);
  }

  .album-card-art:hover .play-overlay {
    opacity: 1;
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

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Genres grid */
  .genres-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-md);
    flex: 1;
    overflow-y: auto;
  }

  .genre-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-lg);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    text-align: left;
    transition: all 0.12s ease-out;
    color: var(--tune-text);
  }

  .genre-card:hover {
    border-color: var(--tune-accent);
    background: var(--tune-surface-hover);
  }

  .genre-card-name {
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
  }

  .genre-card-count {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
  }

  .genre-detail-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .genre-detail-title {
    font-family: var(--font-label);
    font-size: 22px;
    font-weight: 600;
  }

  .genre-detail-count {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
  }

  .empty {
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    text-align: center;
    padding: var(--space-2xl);
    grid-column: 1 / -1;
  }
</style>

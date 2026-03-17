<script lang="ts">
  import { activeView } from '../lib/stores/navigation';
  import { libraryTab, selectedAlbum, albumTracks, selectedArtist, artistAlbums, libraryLoading } from '../lib/stores/library';
  import { playbackHistory } from '../lib/stores/history';
  import { currentZone } from '../lib/stores/zones';
  import { formatNumber } from '../lib/utils';
  import { t } from '../lib/i18n';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import type { Album, Track, Source } from '../lib/types';

  let zone = $derived($currentZone);
  let currentTrack = $derived(zone?.current_track);
  let stats: { tracks: number; albums: number; artists: number } | null = $state(null);
  let recentAlbums: Album[] = $state([]);
  let recentTab = $state<'played' | 'added'>('played');
  let searchQuery = $state('');

  function greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return $t('home.morning');
    if (h < 18) return $t('home.afternoon');
    return $t('home.evening');
  }

  async function loadStats() {
    try {
      stats = await api.getLibraryStats();
    } catch (e) {
      console.error('Load stats error:', e);
    }
  }

  async function loadRecentAlbums() {
    try {
      const albums = await api.getAlbums(20);
      // API returns newest first (by ID desc), take first 20
      recentAlbums = albums;
    } catch (e) {
      console.error('Load recent albums error:', e);
    }
  }

  function goToLibrary(tab: 'albums' | 'artists' | 'tracks') {
    libraryTab.set(tab);
    activeView.set('library');
  }

  function handleSearch() {
    if (!searchQuery.trim()) return;
    activeView.set('search');
  }

  async function playAlbum(albumId: number) {
    if (!zone?.id) return;
    try {
      await api.play(zone.id, { album_id: albumId });
    } catch (e) {
      console.error('Play album error:', e);
    }
  }

  async function navigateToAlbum(albumId: number) {
    selectedArtist.set(null);
    libraryLoading.set(true);
    try {
      const [album, tracks] = await Promise.all([
        api.getAlbum(albumId),
        api.getAlbumTracks(albumId),
      ]);
      selectedAlbum.set(album);
      albumTracks.set(tracks);
      libraryTab.set('albums');
      activeView.set('library');
    } catch (e) {
      console.error('Navigate to album error:', e);
    }
    libraryLoading.set(false);
  }

  async function navigateToArtist(artistId: number) {
    selectedAlbum.set(null);
    libraryLoading.set(true);
    try {
      const [artist, albums] = await Promise.all([
        api.getArtist(artistId),
        api.getArtistAlbums(artistId),
      ]);
      selectedArtist.set(artist);
      artistAlbums.set(albums);
      libraryTab.set('artists');
      activeView.set('library');
    } catch (e) {
      console.error('Navigate to artist error:', e);
    }
    libraryLoading.set(false);
  }

  async function playTrack(trackId: number) {
    if (!zone?.id) return;
    try {
      await api.play(zone.id, { track_id: trackId });
    } catch (e) {
      console.error('Play track error:', e);
    }
  }

  interface RecentAlbumEntry {
    id: number | null;
    title: string;
    artist_id?: number | null;
    artist_name: string;
    cover_path?: string | null;
    source?: string | null;
    source_id?: string | null;
    firstTrack: Track;
  }

  async function playRecentEntry(album: RecentAlbumEntry) {
    if (!zone?.id) return;
    try {
      if (album.id) {
        await api.play(zone.id, { album_id: album.id });
      } else if (album.source === 'radio' && album.firstTrack.source_id) {
        await api.playRadio(parseInt(album.firstTrack.source_id), zone.id);
      } else if (album.source && album.firstTrack.source_id) {
        await api.play(zone.id, { source: album.source as Source, source_id: album.firstTrack.source_id });
      } else if (album.firstTrack.id) {
        await api.play(zone.id, { track_id: album.firstTrack.id });
      } else if (album.firstTrack.file_path) {
        await api.play(zone.id, { file_path: album.firstTrack.file_path });
      }
    } catch (e) {
      console.error('Play recent entry error:', e);
    }
  }

  function navigateRecentEntry(album: RecentAlbumEntry) {
    if (album.id) {
      navigateToAlbum(album.id);
    } else if (album.source === 'radio') {
      activeView.set('radios');
    } else if (album.source && album.source !== 'local') {
      activeView.set('streaming');
    }
  }

  function navigateArtist(album: RecentAlbumEntry) {
    if (album.artist_id) {
      navigateToArtist(album.artist_id);
    } else if (album.source && album.source !== 'local') {
      activeView.set('streaming');
    }
  }

  function isPlaying(album: RecentAlbumEntry): boolean {
    if (!currentTrack || !zone || zone.state !== 'playing') return false;
    if (album.id && currentTrack.album_id === album.id) return true;
    if (album.firstTrack.id && currentTrack.id === album.firstTrack.id) return true;
    if (album.firstTrack.source_id && currentTrack.source_id === album.firstTrack.source_id && currentTrack.source === album.source) return true;
    return false;
  }

  // Derive unique recently played albums from history
  // Use a string key to dedupe: "local:{album_id}" or "streaming:{source}:{source_id}"
  let recentlyPlayed = $derived.by(() => {
    const seen = new Set<string>();
    const albums: RecentAlbumEntry[] = [];
    for (const entry of $playbackHistory) {
      const t = entry.track;
      const albumId = t.album_id;
      // Build a dedup key — prefer album_id for local, fallback to source+album_title for streaming
      let key: string | null = null;
      if (albumId) {
        key = `local:${albumId}`;
      } else if (t.source && t.album_title) {
        key = `stream:${t.source}:${t.album_title}`;
      } else if (t.source && t.source_id) {
        key = `stream:${t.source}:${t.source_id}`;
      }
      if (!key || seen.has(key)) continue;
      seen.add(key);
      albums.push({
        id: albumId ?? null,
        title: t.album_title ?? t.title,
        artist_id: t.artist_id ?? null,
        artist_name: t.artist_name ?? '',
        cover_path: t.cover_path ?? null,
        source: t.source ?? null,
        source_id: t.source_id ?? null,
        firstTrack: t,
      });
      if (albums.length >= 20) break;
    }
    return albums;
  });

  // Scroll handling for carousel
  let playedCarousel: HTMLElement;
  let addedCarousel: HTMLElement;

  function scrollCarousel(el: HTMLElement, dir: number) {
    el.scrollBy({ left: dir * 600, behavior: 'smooth' });
  }

  $effect(() => {
    loadStats();
    loadRecentAlbums();
  });
</script>

<div class="home-view">
  <h1 class="greeting">{greeting()}</h1>

  <!-- Stats cards -->
  {#if stats}
    <div class="stats-cards">
      <button class="stat-card" onclick={() => goToLibrary('albums')}>
        <span class="stat-number">{formatNumber(stats.albums)}</span>
        <span class="stat-name">{$t('common.albums')}</span>
      </button>
      <button class="stat-card" onclick={() => goToLibrary('artists')}>
        <span class="stat-number">{formatNumber(stats.artists)}</span>
        <span class="stat-name">{$t('common.artists')}</span>
      </button>
      <button class="stat-card" onclick={() => goToLibrary('tracks')}>
        <span class="stat-number">{formatNumber(stats.tracks)}</span>
        <span class="stat-name">{$t('home.tracks')}</span>
      </button>
    </div>
  {/if}

  <!-- Search bar -->
  <div class="home-search">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
    <input
      type="text"
      placeholder={$t('home.searchPlaceholder')}
      bind:value={searchQuery}
      onkeydown={(e) => e.key === 'Enter' && handleSearch()}
    />
  </div>

  <!-- Recently section -->
  <div class="recent-section">
    <div class="recent-tabs">
      <button class="recent-tab" class:active={recentTab === 'played'} onclick={() => recentTab = 'played'}>
        {$t('home.recentlyPlayed')}
      </button>
      <button class="recent-tab" class:active={recentTab === 'added'} onclick={() => recentTab = 'added'}>
        {$t('home.recentlyAdded')}
      </button>
    </div>

    {#if recentTab === 'played'}
      {#if recentlyPlayed.length > 0}
        <div class="carousel-wrapper">
          <button class="carousel-arrow left" onclick={() => scrollCarousel(playedCarousel, -1)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div class="carousel" bind:this={playedCarousel}>
            {#each recentlyPlayed as album}
              <div class="carousel-card" class:now-playing={isPlaying(album)}>
                <button class="carousel-cover" onclick={() => playRecentEntry(album)}>
                  <AlbumArt coverPath={album.cover_path} albumId={album.id} size={160} alt={album.title} />
                  {#if isPlaying(album)}
                    <span class="play-overlay playing">
                      <span class="eq-bars"><span></span><span></span><span></span></span>
                    </span>
                  {:else}
                    <span class="play-overlay"><svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5v14l11-7z" /></svg></span>
                  {/if}
                </button>
                {#if album.id || (album.source && album.source !== 'local')}
                  <button class="carousel-title truncate" onclick={() => navigateRecentEntry(album)}>{album.title}</button>
                {:else}
                  <span class="carousel-title truncate">{album.title}</span>
                {/if}
                {#if album.artist_id || (album.artist_name && album.source && album.source !== 'local')}
                  <button class="carousel-artist truncate" onclick={() => navigateArtist(album)}>{album.artist_name}</button>
                {:else}
                  <span class="carousel-artist truncate">{album.artist_name}</span>
                {/if}
              </div>
            {/each}
          </div>
          <button class="carousel-arrow right" onclick={() => scrollCarousel(playedCarousel, 1)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      {:else}
        <p class="empty-recent">{$t('home.noHistory')}</p>
      {/if}

    {:else}
      {#if recentAlbums.length > 0}
        <div class="carousel-wrapper">
          <button class="carousel-arrow left" onclick={() => scrollCarousel(addedCarousel, -1)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div class="carousel" bind:this={addedCarousel}>
            {#each recentAlbums as album}
              <div class="carousel-card">
                <button class="carousel-cover" onclick={() => album.id && playAlbum(album.id)}>
                  <AlbumArt coverPath={album.cover_path} size={160} alt={album.title} />
                  <span class="play-overlay"><svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5v14l11-7z" /></svg></span>
                </button>
                {#if album.id}
                  <button class="carousel-title truncate" onclick={() => navigateToAlbum(album.id!)}>{album.title}</button>
                {:else}
                  <span class="carousel-title truncate">{album.title}</span>
                {/if}
                {#if album.artist_id}
                  <button class="carousel-artist truncate" onclick={() => navigateToArtist(album.artist_id!)}>{album.artist_name ?? ''}</button>
                {:else}
                  <span class="carousel-artist truncate">{album.artist_name ?? ''}</span>
                {/if}
              </div>
            {/each}
          </div>
          <button class="carousel-arrow right" onclick={() => scrollCarousel(addedCarousel, 1)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      {:else}
        <p class="empty-recent">{$t('home.noAlbums')}</p>
      {/if}
    {/if}
  </div>
</div>

<style>
  .home-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-xl) 32px;
    overflow-y: auto;
    gap: var(--space-xl);
  }

  .greeting {
    font-family: var(--font-display);
    font-size: 42px;
    font-weight: 600;
    color: var(--tune-text);
    line-height: 1.1;
  }

  .stats-cards {
    display: flex;
    gap: var(--space-md);
  }

  .stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-lg) var(--space-xl);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.15s ease-out;
    flex: 1;
    min-width: 120px;
    color: var(--tune-text);
  }

  .stat-card:hover {
    border-color: var(--tune-accent);
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .stat-number {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 700;
  }

  .stat-name {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
  }

  .home-search {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    padding: var(--space-sm) var(--space-md);
    transition: border-color 0.12s;
  }

  .home-search:focus-within {
    border-color: var(--tune-accent);
  }

  .home-search svg {
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  .home-search input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 15px;
    padding: var(--space-xs) 0;
  }

  .home-search input::placeholder {
    color: var(--tune-text-muted);
  }

  .recent-section {
    flex: 1;
  }

  .recent-tabs {
    display: flex;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }

  .recent-tab {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    padding: var(--space-xs) 0;
    border-bottom: 2px solid transparent;
    transition: all 0.12s;
  }

  .recent-tab.active {
    color: var(--tune-accent);
    border-bottom-color: var(--tune-accent);
  }

  .recent-tab:hover {
    color: var(--tune-text);
  }

  .carousel-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .carousel {
    display: flex;
    gap: var(--space-md);
    overflow-x: auto;
    scroll-behavior: smooth;
    padding: var(--space-sm) 0;
    flex: 1;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .carousel::-webkit-scrollbar {
    display: none;
  }

  .carousel-arrow {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--tune-text-secondary);
    flex-shrink: 0;
    transition: all 0.12s;
    z-index: 1;
  }

  .carousel-arrow:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .carousel-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    text-align: left;
    padding: 0;
    color: var(--tune-text);
    flex-shrink: 0;
    width: 160px;
  }

  .carousel-cover {
    position: relative;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .carousel-cover:hover .play-overlay {
    opacity: 1;
  }

  .play-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    color: white;
    opacity: 0;
    transition: opacity 0.15s;
    border-radius: var(--radius-sm);
  }

  .play-overlay.playing {
    opacity: 1;
    background: rgba(0, 0, 0, 0.5);
  }

  .now-playing .carousel-title {
    color: var(--tune-accent) !important;
  }

  .eq-bars {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 20px;
  }

  .eq-bars span {
    display: block;
    width: 4px;
    background: var(--tune-accent);
    border-radius: 1px;
    animation: eq-bounce 0.8s ease-in-out infinite alternate;
  }

  .eq-bars span:nth-child(1) { height: 60%; animation-delay: 0s; }
  .eq-bars span:nth-child(2) { height: 100%; animation-delay: 0.2s; }
  .eq-bars span:nth-child(3) { height: 40%; animation-delay: 0.4s; }

  @keyframes eq-bounce {
    0% { transform: scaleY(0.3); }
    100% { transform: scaleY(1); }
  }

  button.carousel-title,
  button.carousel-artist {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }

  button.carousel-title:hover {
    color: var(--tune-accent);
  }

  button.carousel-artist:hover {
    color: var(--tune-accent);
  }

  .carousel-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    max-width: 160px;
    color: var(--tune-text);
  }

  .carousel-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    max-width: 160px;
  }

  .empty-recent {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
    padding: var(--space-lg);
    text-align: center;
  }
</style>

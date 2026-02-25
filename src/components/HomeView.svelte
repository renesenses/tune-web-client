<script lang="ts">
  import { activeView } from '../lib/stores/navigation';
  import { libraryTab } from '../lib/stores/library';
  import { playbackHistory } from '../lib/stores/history';
  import { currentZone } from '../lib/stores/zones';
  import { formatNumber } from '../lib/utils';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import type { Album } from '../lib/types';

  let zone = $derived($currentZone);
  let stats: { tracks: number; albums: number; artists: number } | null = $state(null);
  let recentAlbums: Album[] = $state([]);
  let recentTab = $state<'played' | 'added'>('played');
  let searchQuery = $state('');

  function greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon apres-midi';
    return 'Bonsoir';
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

  async function playTrack(trackId: number) {
    if (!zone?.id) return;
    try {
      await api.play(zone.id, { track_id: trackId });
    } catch (e) {
      console.error('Play track error:', e);
    }
  }

  // Derive unique recently played albums from history
  let recentlyPlayed = $derived.by(() => {
    const seen = new Set<number>();
    const albums: { id: number; title: string; artist_name: string; cover_path?: string | null; album_id?: number | null }[] = [];
    for (const entry of $playbackHistory) {
      const albumId = entry.track.album_id;
      if (albumId && !seen.has(albumId)) {
        seen.add(albumId);
        albums.push({
          id: albumId,
          title: entry.track.album_title ?? entry.track.title,
          artist_name: entry.track.artist_name ?? '',
        });
      }
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
        <span class="stat-name">Albums</span>
      </button>
      <button class="stat-card" onclick={() => goToLibrary('artists')}>
        <span class="stat-number">{formatNumber(stats.artists)}</span>
        <span class="stat-name">Artistes</span>
      </button>
      <button class="stat-card" onclick={() => goToLibrary('tracks')}>
        <span class="stat-number">{formatNumber(stats.tracks)}</span>
        <span class="stat-name">Pistes</span>
      </button>
    </div>
  {/if}

  <!-- Search bar -->
  <div class="home-search">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
    <input
      type="text"
      placeholder="Rechercher dans la bibliotheque..."
      bind:value={searchQuery}
      onkeydown={(e) => e.key === 'Enter' && handleSearch()}
    />
  </div>

  <!-- Recently section -->
  <div class="recent-section">
    <div class="recent-tabs">
      <button class="recent-tab" class:active={recentTab === 'played'} onclick={() => recentTab = 'played'}>
        Recemment joue
      </button>
      <button class="recent-tab" class:active={recentTab === 'added'} onclick={() => recentTab = 'added'}>
        Recemment ajoute
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
              <button class="carousel-card" onclick={() => playAlbum(album.id)}>
                <AlbumArt albumId={album.id} size={160} alt={album.title} />
                <span class="carousel-title truncate">{album.title}</span>
                <span class="carousel-artist truncate">{album.artist_name}</span>
              </button>
            {/each}
          </div>
          <button class="carousel-arrow right" onclick={() => scrollCarousel(playedCarousel, 1)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      {:else}
        <p class="empty-recent">Aucun historique de lecture</p>
      {/if}

    {:else}
      {#if recentAlbums.length > 0}
        <div class="carousel-wrapper">
          <button class="carousel-arrow left" onclick={() => scrollCarousel(addedCarousel, -1)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div class="carousel" bind:this={addedCarousel}>
            {#each recentAlbums as album}
              <button class="carousel-card" onclick={() => album.id && playAlbum(album.id)}>
                <AlbumArt coverPath={album.cover_path} size={160} alt={album.title} />
                <span class="carousel-title truncate">{album.title}</span>
                <span class="carousel-artist truncate">{album.artist_name ?? ''}</span>
              </button>
            {/each}
          </div>
          <button class="carousel-arrow right" onclick={() => scrollCarousel(addedCarousel, 1)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      {:else}
        <p class="empty-recent">Aucun album</p>
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
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    padding: 0;
    color: var(--tune-text);
    flex-shrink: 0;
    width: 160px;
    transition: opacity 0.12s;
  }

  .carousel-card:hover {
    opacity: 0.85;
  }

  .carousel-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    max-width: 160px;
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

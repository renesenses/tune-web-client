<script lang="ts">
  import { activeView } from '../lib/stores/navigation';
  import { libraryTab, selectedAlbum, albumTracks, selectedArtist, artistAlbums, libraryLoading } from '../lib/stores/library';
  import { playbackHistory } from '../lib/stores/history';
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import { formatNumber } from '../lib/utils';
  import { t } from '../lib/i18n';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import type { Album, Track, Source, TopTrack, TopArtist } from '../lib/types';

  let zone = $derived($currentZone);
  let currentTrack = $derived(zone?.current_track);
  let stats: { tracks: number; albums: number; artists: number } | null = $state(null);
  let recentAlbums: Album[] = $state([]);
  let recentTab = $state<'played' | 'added'>('played');
  let searchQuery = $state('');
  let topArtists: TopArtist[] = $state([]);
  let topTracks: TopTrack[] = $state([]);
  let topArtistsLoaded = $state(false);
  let topTracksLoaded = $state(false);

  // Recommendations
  let recommendations: any[] = $state([]);
  let recsLoaded = $state(false);

  // Dashboard
  let dashboard: any = $state(null);
  let dashboardLoaded = $state(false);

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
      recentAlbums = await api.getRecentAlbums(20);
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
      await playAndSync(zone.id, { album_id: albumId });
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
      await playAndSync(zone.id, { track_id: trackId });
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
        await playAndSync(zone.id, { album_id: album.id });
      } else if (album.source === 'radio' && album.firstTrack.source_id) {
        await api.playRadio(parseInt(album.firstTrack.source_id), zone.id);
      } else if (album.source && album.source !== 'local' && album.firstTrack.source_id) {
        await playAndSync(zone.id, { source: album.source as Source, source_id: album.firstTrack.source_id });
      } else if (album.firstTrack.id) {
        await playAndSync(zone.id, { track_id: album.firstTrack.id });
      } else {
        // No DB id — try search by title first (more reliable than stale URLs)
        const searchTitle = album.firstTrack.album_title || album.title;
        if (searchTitle) {
          const results = await api.searchLibrary(searchTitle);
          if (results.tracks && results.tracks.length > 0) {
            const match = results.tracks.find((t: Track) => t.album_id);
            if (match?.album_id) {
              await playAndSync(zone.id, { album_id: match.album_id });
              return;
            }
            if (results.tracks[0].id) {
              await playAndSync(zone.id, { track_id: results.tracks[0].id });
              return;
            }
          }
        }
        // Last resort: direct file_path (may be stale for media server URLs)
        if (album.firstTrack.file_path) {
          await playAndSync(zone.id, { file_path: album.firstTrack.file_path });
        }
      }
    } catch (e) {
      console.error('Play recent entry error:', e);
    }
  }

  async function navigateRecentEntry(album: RecentAlbumEntry) {
    if (album.id) {
      navigateToAlbum(album.id);
    } else if (album.source === 'radio') {
      activeView.set('radios');
    } else if (album.source && album.source !== 'local') {
      activeView.set('streaming');
    } else {
      // Search local library to find the album — try album_title first, then album.title
      const candidates = [
        album.firstTrack?.album_title,
        album.title,
        album.firstTrack?.artist_name,
      ].filter(Boolean) as string[];

      for (const query of candidates) {
        try {
          const results = await api.searchLibrary(query);
          // Exact album title match
          const exactTitle = album.firstTrack?.album_title || album.title;
          const match = results.tracks?.find((t: Track) => t.album_id && t.album_title === exactTitle);
          if (match?.album_id) {
            navigateToAlbum(match.album_id);
            return;
          }
          // Album match from results
          const albumMatch = results.albums?.find((a: Album) => a.title === exactTitle);
          if (albumMatch?.id) {
            navigateToAlbum(albumMatch.id);
            return;
          }
          // Fallback: any track with album_id
          const fallback = results.tracks?.find((t: Track) => t.album_id);
          if (fallback?.album_id) {
            navigateToAlbum(fallback.album_id);
            return;
          }
        } catch (e) {
          console.error('Navigate recent entry error:', e);
        }
      }
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
      // Build a dedup key — prefer album_id for local, fallback to source+album_title, file_path, or title
      let key: string | null = null;
      if (albumId) {
        key = `local:${albumId}`;
      } else if (t.source && t.album_title) {
        key = `stream:${t.source}:${t.album_title}`;
      } else if (t.source && t.source_id) {
        key = `stream:${t.source}:${t.source_id}`;
      } else if (t.file_path) {
        key = `url:${t.file_path}`;
      } else if (t.title) {
        key = `title:${t.title}:${t.artist_name ?? ''}`;
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

  async function loadTopArtists() {
    try {
      topArtists = await api.getTopArtists(10);
      topArtistsLoaded = true;
    } catch (e) {
      console.error('Load top artists error:', e);
      topArtistsLoaded = true;
    }
  }

  async function loadTopTracks() {
    try {
      topTracks = await api.getTopTracks(10);
      topTracksLoaded = true;
    } catch (e) {
      console.error('Load top tracks error:', e);
      topTracksLoaded = true;
    }
  }

  async function navigateArtistByName(name: string) {
    try {
      const results = await api.searchLibrary(name, 5);
      const match = results.artists?.find((a: any) => a.name.toLowerCase() === name.toLowerCase());
      if (match?.id) {
        navigateToArtist(match.id);
      }
    } catch (e) {
      console.error('Navigate artist by name error:', e);
    }
  }

  async function playTopTrack(track: TopTrack) {
    if (!zone?.id) return;
    try {
      const results = await api.searchLibrary(`${track.track_title} ${track.artist_name ?? ''}`, 5);
      const match = results.tracks?.find((t: Track) => t.title === track.track_title);
      if (match?.id) {
        await playAndSync(zone.id, { track_id: match.id });
      }
    } catch (e) {
      console.error('Play top track error:', e);
    }
  }

  async function loadRecommendations() {
    try {
      const r = await api.getRecommendations(12);
      recommendations = Array.isArray(r) ? r : (r.albums ?? r.recommendations ?? []);
      recsLoaded = true;
    } catch (e) {
      console.error('Load recommendations error:', e);
      recsLoaded = true;
    }
  }

  async function loadDashboard() {
    try {
      const raw = await api.getHistoryDashboard();
      // Normalize API fields to UI fields
      dashboard = {
        ...raw,
        total_hours: raw.total_listening_ms ? Math.round(raw.total_listening_ms / 3600000 * 10) / 10 : 0,
        new_artists: raw.new_artists_discovered ?? 0,
        peak_hour: raw.hourly?.length ? raw.hourly.reduce((a: any, b: any) => a.plays > b.plays ? a : b).hour : null,
        daily: (raw.daily || []).map((d: any) => ({ ...d, date: d.day, count: d.plays })),
        genres: (raw.genres || []).map((g: any) => ({ ...g, name: g.genre, count: g.plays })),
      };
      dashboardLoaded = true;
    } catch (e) {
      console.error('Load dashboard error:', e);
      dashboardLoaded = true;
    }
  }

  $effect(() => {
    loadStats();
    loadRecentAlbums();
    loadTopArtists();
    loadTopTracks();
    loadRecommendations();
    loadDashboard();
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
                <button class="carousel-title truncate" onclick={() => navigateRecentEntry(album)}>{album.title}</button>
                <button class="carousel-artist truncate" onclick={() => navigateArtist(album)}>{album.artist_name}</button>
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

  <!-- Top Artists -->
  {#if topArtistsLoaded && topArtists.length > 0}
    <div class="top-section">
      <h2 class="section-title">{$t('home.topArtists')}</h2>
      <div class="top-artists-row">
        {#each topArtists as artist, i}
          <button class="artist-card" onclick={() => navigateArtistByName(artist.artist_name)}>
            <span class="artist-rank">#{i + 1}</span>
            <span class="artist-card-name">{artist.artist_name}</span>
            <span class="play-count-badge">{artist.play_count} {$t('home.plays')}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Top Tracks -->
  {#if topTracksLoaded && topTracks.length > 0}
    <div class="top-section">
      <h2 class="section-title">{$t('home.topTracks')}</h2>
      <div class="top-tracks-list">
        {#each topTracks as track, i}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="top-track-row" onclick={() => playTopTrack(track)}>
            <span class="track-rank">{i + 1}</span>
            <div class="top-track-art">
              <AlbumArt coverPath={track.cover_path} size={44} alt={track.track_title} />
            </div>
            <div class="top-track-info">
              <span class="top-track-title truncate">{track.track_title}</span>
              {#if track.artist_name}
                <span class="top-track-artist truncate">{track.artist_name}</span>
              {/if}
            </div>
            <span class="play-count-badge">{track.play_count}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Recommendations -->
  {#if recsLoaded && recommendations.length > 0}
    <div class="top-section">
      <h2 class="section-title">Recommandations</h2>
      <div class="recs-carousel">
        {#each recommendations as rec}
          <button class="rec-card" onclick={() => rec.id ? navigateToAlbum(rec.id) : (rec.album_id ? navigateToAlbum(rec.album_id) : null)}>
            <AlbumArt coverPath={rec.cover_path} albumId={rec.id ?? rec.album_id} size={140} alt={rec.title} />
            <span class="rec-title truncate">{rec.title}</span>
            <span class="rec-artist truncate">{rec.artist_name ?? ''}</span>
            {#if rec.reason}
              <span class="rec-reason">{rec.reason}</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Listening Dashboard -->
  {#if dashboardLoaded && dashboard}
    <div class="top-section">
      <h2 class="section-title">Statistiques</h2>
      <div class="dash-stats">
        {#if dashboard.total_plays != null}
          <div class="dash-big-stat">
            <span class="dash-big-number">{formatNumber(dashboard.total_plays)}</span>
            <span class="dash-big-label">lectures</span>
          </div>
        {/if}
        {#if dashboard.total_hours != null}
          <div class="dash-big-stat">
            <span class="dash-big-number">{Math.round(dashboard.total_hours)}</span>
            <span class="dash-big-label">heures</span>
          </div>
        {/if}
        {#if dashboard.new_artists != null}
          <div class="dash-big-stat">
            <span class="dash-big-number">{dashboard.new_artists}</span>
            <span class="dash-big-label">nouveaux artistes</span>
          </div>
        {/if}
        {#if dashboard.peak_hour != null}
          <div class="dash-big-stat">
            <span class="dash-big-number">{dashboard.peak_hour}h</span>
            <span class="dash-big-label">heure de pointe</span>
          </div>
        {/if}
      </div>

      {#if dashboard.daily && Array.isArray(dashboard.daily) && dashboard.daily.length > 0}
        {@const last7 = dashboard.daily.slice(-7)}
        {@const maxPlays = Math.max(...last7.map((d: any) => d.plays ?? d.count ?? 0), 1)}
        <div class="dash-chart">
          <span class="dash-chart-label">Ecoutes — 7 derniers jours</span>
          <div class="dash-bars">
            {#each last7 as day}
              {@const plays = day.plays ?? day.count ?? 0}
              {@const dayName = day.date ? new Date(day.date + 'T00:00').toLocaleDateString('fr', { weekday: 'short' }) : ''}
              <div class="dash-bar-col">
                <span class="dash-bar-count">{plays}</span>
                <div class="dash-bar" style="height: {Math.max(6, (plays / maxPlays) * 80)}px"></div>
                <span class="dash-bar-label">{dayName}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if dashboard.genres && Array.isArray(dashboard.genres) && dashboard.genres.length > 0}
        <div class="dash-genres">
          {#each dashboard.genres.slice(0, 8) as g}
            <span class="genre-pill">{g.genre ?? g.name ?? g} <span class="genre-count">{g.count ?? g.plays ?? ''}</span></span>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
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

  /* Top sections */
  .top-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .section-title {
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text);
    margin: 0;
  }

  /* Top Artists */
  .top-artists-row {
    display: flex;
    gap: var(--space-sm);
    overflow-x: auto;
    padding: var(--space-xs) 0;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .top-artists-row::-webkit-scrollbar { display: none; }

  .artist-card {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.12s ease-out;
    flex-shrink: 0;
    color: var(--tune-text);
  }

  .artist-card:hover {
    border-color: var(--tune-accent);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }

  .artist-rank {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 700;
    color: var(--tune-accent);
    min-width: 20px;
  }

  .artist-card-name {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }

  .play-count-badge {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    color: var(--tune-accent);
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.12);
    padding: 2px 8px;
    border-radius: 10px;
    white-space: nowrap;
  }

  /* Top Tracks */
  .top-tracks-list {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .top-track-row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    cursor: pointer;
    transition: background 0.12s;
  }

  .top-track-row:hover {
    background: var(--tune-surface-hover);
  }

  .top-track-row + .top-track-row {
    border-top: 1px solid var(--tune-border);
  }

  .track-rank {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 700;
    color: var(--tune-text-muted);
    min-width: 24px;
    text-align: right;
  }

  .top-track-art {
    flex-shrink: 0;
  }

  .top-track-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }

  .top-track-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text);
  }

  .top-track-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }

  @media (max-width: 768px) {
    .top-tracks-list { font-size: 12px; }
    .artist-card { padding: var(--space-xs) var(--space-sm); }
  }

  /* Recommendations carousel */
  .recs-carousel {
    display: flex;
    gap: var(--space-md);
    overflow-x: auto;
    padding: var(--space-xs) 0;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .recs-carousel::-webkit-scrollbar { display: none; }

  .rec-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    flex-shrink: 0;
    width: 140px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--tune-text);
  }

  .rec-card:hover .rec-title { color: var(--tune-accent); }

  .rec-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    max-width: 140px;
    transition: color 0.12s;
  }

  .rec-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    max-width: 140px;
  }

  .rec-reason {
    display: inline-block;
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    color: var(--tune-accent);
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.12);
    padding: 2px 8px;
    border-radius: 8px;
    white-space: nowrap;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Dashboard */
  .dash-stats {
    display: flex;
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .dash-big-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--space-md) var(--space-lg);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    min-width: 100px;
    flex: 1;
  }

  .dash-big-number {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 700;
    color: var(--tune-accent);
  }

  .dash-big-label {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .dash-chart {
    margin-top: var(--space-md);
  }

  .dash-chart-label {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .dash-bars {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    height: 100px;
    margin-top: var(--space-sm);
    justify-content: flex-start;
  }

  .dash-bar-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 48px;
  }

  .dash-bar {
    width: 100%;
    max-width: 40px;
    background: var(--tune-accent);
    border-radius: 4px 4px 0 0;
    min-height: 4px;
    transition: height 0.3s ease-out;
  }

  .dash-bar-count {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    color: var(--tune-accent);
  }

  .dash-bar-label {
    font-family: var(--font-label);
    font-size: 10px;
    color: var(--tune-text-muted);
    text-transform: capitalize;
  }

  .dash-genres {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin-top: var(--space-md);
  }

  .genre-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-body);
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 14px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    color: var(--tune-text);
  }

  .genre-count {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 700;
    color: var(--tune-accent);
  }
</style>

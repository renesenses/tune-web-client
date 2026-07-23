<script lang="ts">
  import { onMount } from 'svelte';
  import { activeView } from '../lib/stores/navigation';
  import { libraryTab, selectedAlbum, albumTracks, selectedArtist, artistAlbums, libraryLoading } from '../lib/stores/library';
  import { playbackHistory } from '../lib/stores/history';
  import { currentZone, currentZoneId, zones, playAndSync } from '../lib/stores/zones';
  import { playFromHere } from '../lib/playback';
  import { activeStreamingService, streamingServices as streamingServicesStore } from '../lib/stores/streaming';
  import { get } from 'svelte/store';
  import { formatNumber } from '../lib/utils';
  import { t } from '../lib/i18n';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import ServiceBadge from './ServiceBadge.svelte';
  import type { Album, Track, Source, TopTrack, TopArtist } from '../lib/types';

  let activeStreamingServices = $derived(
    Object.entries($streamingServicesStore)
      .filter(([, s]) => s.enabled && s.authenticated)
      .map(([name]) => name)
  );

  let zone = $derived($currentZone);
  let currentTrack = $derived(zone?.current_track);
  let stats: { tracks: number; albums: number; artists: number } | null = $state(null);

  // Now Listening across zones
  let nowListeningLoaded = $state(true);
  let nowListening = $derived(
    ($zones as any[])
      // Show paused zones too (state !== 'stopped'), so pausing doesn't make
      // the "En cours d'écoute" card vanish and shift the page below it.
      .filter((z: any) => z.state !== 'stopped' && (z.now_playing || z.current_track))
      .map((z: any) => {
        const np = z.now_playing ?? z.current_track ?? {};
        return {
          zone_id: z.id,
          zone_name: z.name,
          track_title: np.title ?? '',
          artist_name: np.artist_name ?? '',
          cover_path: np.cover_path ?? null,
          album_id: np.album_id ?? null,
          state: z.state ?? 'playing',
        };
      })
  );
  let recentAlbums: Album[] = $state([]);
  let recentTab = $state<'played' | 'added'>('played');
  let topArtists: TopArtist[] = $state([]);
  let topTracks: TopTrack[] = $state([]);
  let topArtistsLoaded = $state(false);
  let topTracksLoaded = $state(false);

  // Recommendations
  let recommendations: any[] = $state([]);
  let recsLoaded = $state(false);

  // Home API sections
  let continueListening: any[] = $state([]);
  let continueListeningLoaded = $state(false);
  let topMixes: any[] = $state([]);
  let topMixesLoaded = $state(false);
  let radioPicks: any[] = $state([]);
  let radioPicksLoaded = $state(false);
  let homeProfile: string = $state('');

  // Dashboard
  let dashboard: any = $state(null);
  let dashboardLoaded = $state(false);

  function goToZoneNowPlaying(zoneId: number) {
    currentZoneId.set(zoneId);
    activeView.set('nowplaying');
  }

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
      // Radio entries must be replayed as the STATION, never resolved by title:
      // a radio's now-playing carries live ICY metadata (the current song's
      // title/artist), so falling through to a local title search plays an
      // unrelated track (Bilou: clicking a radio history line played
      // "Mother Nature"/"Episode"). Detect radio at album OR firstTrack level.
      const isRadio = album.source === 'radio' || album.firstTrack?.source === 'radio';
      if (isRadio) {
        const radioId = album.firstTrack?.source_id ? parseInt(album.firstTrack.source_id) : NaN;
        if (!isNaN(radioId)) {
          await api.playRadio(radioId, zone.id);
        } else {
          // No station id captured (ICY metadata overwrote it) — send the user
          // to Radios rather than fabricating a wrong local record.
          activeView.set('radios');
          notifications.info($t('home.relaunchStation'));
        }
        return;
      }
      if (album.source && album.source !== 'local' && album.firstTrack.source_id) {
        await playAndSync(zone.id, { source: album.source as Source, source_id: album.firstTrack.source_id });
      } else if (album.source && album.source !== 'local') {
        const q = `${album.firstTrack.title ?? album.title} ${album.firstTrack.artist_name ?? album.artist_name ?? ''}`.trim();
        const results = await api.searchStreaming(album.source as Source, q, 5);
        const match = results.tracks?.find((t: any) =>
          t.title?.toLowerCase() === (album.firstTrack.title ?? album.title)?.toLowerCase()
        );
        if (match?.source_id) {
          await playAndSync(zone.id, { source: album.source as Source, source_id: match.source_id });
        } else {
          notifications.error(`${$t('home.trackNotFoundOn')} ${album.source}`);
        }
      } else if (album.id && (!album.source || album.source === 'local')) {
        await playAndSync(zone.id, { album_id: album.id });
      } else if (album.firstTrack.id) {
        await playAndSync(zone.id, { track_id: album.firstTrack.id });
      } else if (typeof album.firstTrack.file_path === 'string' && /^https?:\/\//.test(album.firstTrack.file_path)) {
        // Stream/URL-backed entry (radio-like) — replay the URL directly rather
        // than searching the local library by title, which matches unrelated tracks.
        await playAndSync(zone.id, { file_path: album.firstTrack.file_path });
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
      activeStreamingService.set(album.source);
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
  let continueCarousel: HTMLElement;

  function scrollCarousel(el: HTMLElement, dir: number) {
    el.scrollBy({ left: dir * 600, behavior: 'smooth' });
  }

  async function loadTopArtists() {
    try {
      const raw = await api.getTopArtists(12);
      topArtists = raw.filter((a: TopArtist) => a.name !== 'Live Radio' && a.name !== 'Various Artists' && a.name !== 'Artistes divers').slice(0, 10);
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
    if (!name) return;
    try {
      const results = await api.searchLibrary(name, 5);
      const match = results.artists?.find((a: any) => a.name.toLowerCase() === name.toLowerCase());
      if (match?.id) {
        navigateToArtist(match.id);
      } else {
        libraryTab.set('artists');
        activeView.set('library');
      }
    } catch (e) {
      console.error('Navigate artist by name error:', e);
    }
  }

  async function playTopTrack(track: TopTrack) {
    if (!zone?.id) return;
    try {
      if (track.track_id && (!track.source || track.source === 'local')) {
        await playAndSync(zone.id, { track_id: track.track_id });
      } else if (track.source && track.source !== 'local') {
        const results = await api.searchStreaming(track.source as Source, `${track.title} ${track.artist_name ?? ''}`, 5);
        const match = results.tracks?.find((t: any) => t.title === track.title);
        if (match?.source_id) {
          await playAndSync(zone.id, { source: track.source as Source, source_id: match.source_id });
        }
      } else {
        const results = await api.searchLibrary(`${track.title} ${track.artist_name ?? ''}`, 5);
        const match = results.tracks?.find((t: Track) => t.title === track.title);
        if (match?.id) {
          await playAndSync(zone.id, { track_id: match.id });
        }
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


  async function loadContinueListening() {
    try {
      continueListening = await api.getContinueListening();
      continueListeningLoaded = true;
    } catch (e) {
      console.error('Load continue listening error:', e);
      continueListeningLoaded = true;
    }
  }

  async function loadTopMixes() {
    try {
      topMixes = await api.getTopMixes();
      topMixesLoaded = true;
    } catch (e) {
      console.error('Load top mixes error:', e);
      topMixesLoaded = true;
    }
  }

  async function loadRadioPicks() {
    try {
      radioPicks = await api.getRadioPicks();
      radioPicksLoaded = true;
    } catch (e) {
      console.error('Load radio picks error:', e);
      radioPicksLoaded = true;
    }
  }

  async function loadHomeProfile() {
    try {
      const data = await api.getHomePage();
      if (data && (data as any).profile_name) {
        homeProfile = (data as any).profile_name;
      }
    } catch {
      // Home API may not be available yet, ignore
    }
  }

  async function playRadioEntry(radio: any) {
    if (!zone?.id) return;
    try {
      if (radio.id) {
        await api.playRadio(radio.id, zone.id);
      } else if (radio.url) {
        await api.apiPost(`/zones/${zone.id}/play`, { url: radio.url });
      }
    } catch (e) {
      console.error('Play radio error:', e);
    }
  }

  async function playMix(mix: any) {
    if (!zone?.id) return;
    try {
      if (mix.playlist_id) {
        await api.apiPost(`/zones/${zone.id}/play`, { playlist_id: mix.playlist_id });
      } else if (mix.tracks && mix.tracks.length > 0) {
        await playAndSync(zone.id, { track_id: mix.tracks[0].id });
      }
    } catch (e) {
      console.error('Play mix error:', e);
    }
  }

  async function loadDashboard() {
    try {
      // Use the bounded getDashboard endpoint with topN limit instead of
      // getHistoryDashboard which returns unbounded data for large libraries.
      const raw = await api.getDashboard('30d', { topN: 10 });
      // Normalize API fields to UI fields
      dashboard = {
        ...raw,
        total_hours: raw.totals?.listening_ms ? Math.round(raw.totals.listening_ms / 3600000 * 10) / 10 : 0,
        new_artists: raw.totals?.unique_artists ?? 0,
        peak_hour: raw.hourly?.length ? raw.hourly.reduce((a: any, b: any) => a.plays > b.plays ? a : b).hour : null,
        daily: ((raw as any).daily || raw.trend || []).map((d: any) => ({ ...d, date: d.day, count: d.plays })),
        genres: ((raw as any).genres || (raw as any).by_genre || []).map((g: any) => ({ ...g, name: g.genre, count: g.plays })),
      };
      dashboardLoaded = true;
    } catch (e) {
      console.error('Load dashboard error:', e);
      dashboardLoaded = true;
    }
  }

  // Use onMount (not $effect) to load data exactly once on component
  // creation.  $effect can re-trigger on batch flushes in certain
  // Svelte 5 runtime versions, flooding the server with API calls.
  onMount(() => {
    loadStats();
    loadRecentAlbums();
    loadTopArtists();
    loadTopTracks();
    loadRecommendations();
    loadDashboard();
    loadContinueListening();
    loadTopMixes();
    loadRadioPicks();
    loadHomeProfile();
  });
</script>

<div class="home-view">
  <div class="home-title-row">
    <h1 class="greeting">{greeting()}{#if homeProfile}, {homeProfile}{/if}</h1>
  </div>

  <!-- Now Listening across zones -->
  {#if nowListeningLoaded && nowListening.length > 0}
    <div class="now-listening-section">
      <h2 class="section-title">{$t('home.nowListening')}</h2>
      <div class="now-listening-row">
        {#each nowListening as item}
          <button class="nl-card" onclick={() => goToZoneNowPlaying(item.zone_id)}>
            <div class="nl-cover">
              <AlbumArt coverPath={item.cover_path} albumId={item.album_id} size={48} alt={item.track_title ?? ''} />
            </div>
            <div class="nl-info">
              <span class="nl-zone">{item.zone_name}</span>
              <span class="nl-track truncate">{item.track_title ?? item.title ?? ''}</span>
              <span class="nl-artist truncate">{item.artist_name ?? ''}</span>
            </div>
            <span class="nl-playing-indicator">
              <span class="eq-bars" class:paused={item.state === 'paused'}><span></span><span></span><span></span></span>
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Continue Listening (from home API) -->
  {#if continueListeningLoaded && continueListening.length > 0}
    <div class="top-section">
      <h2 class="section-title">{$t('home.continueListening')}</h2>
      <div class="carousel-wrapper">
        <button class="carousel-arrow left" onclick={() => scrollCarousel(continueCarousel, -1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div class="carousel carousel-scrollable" bind:this={continueCarousel}>
          {#each continueListening as item}
            <div class="carousel-card">
              <button class="carousel-cover" type="button" onclick={async () => {
                if (!zone?.id) return;
                const src = item.source;
                if (src && src !== 'local' && src !== 'radio') {
                  const q = `${item.title ?? item.album_title ?? ''} ${item.artist_name ?? ''}`.trim();
                  try {
                    const results = await api.searchStreaming(src as Source, q, 5);
                    const match = results.albums?.find((a: any) => a.title?.toLowerCase() === (item.title ?? item.album_title)?.toLowerCase())
                      ?? results.tracks?.[0];
                    if (match?.source_id) {
                      await playAndSync(zone.id, { source: src as Source, streaming_album_id: match.source_id });
                    }
                  } catch {}
                } else if (item.album_id) {
                  await playAndSync(zone.id, { album_id: item.album_id });
                } else {
                  const q = `${item.title ?? item.album_title ?? ''} ${item.artist_name ?? ''}`.trim();
                  if (q) {
                    const results = await api.searchLibrary(q, 5);
                    const match = results.tracks?.find((t: Track) => t.album_id);
                    if (match?.album_id) {
                      await playAndSync(zone.id, { album_id: match.album_id });
                    }
                  }
                }
              }}>
                <AlbumArt coverPath={item.cover_path} albumId={item.album_id ?? item.id} size={160} alt={item.title ?? item.album_title ?? ''} />
                <span class="play-overlay"><svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5v14l11-7z" /></svg></span>
              </button>
              <button class="carousel-title truncate" type="button" onclick={async () => {
                if (item.album_id) { navigateToAlbum(item.album_id); return; }
                const q = (item.title ?? item.album_title ?? '').trim();
                if (!q) return;
                const results = await api.searchLibrary(`${q} ${item.artist_name ?? ''}`, 5);
                const match = results.albums?.find((a: any) => a.title?.toLowerCase() === q.toLowerCase());
                if (match?.id) navigateToAlbum(match.id);
              }}>{item.title ?? item.album_title ?? ''}</button>
              <button class="carousel-artist truncate" type="button" onclick={() => {
                if (item.artist_name) navigateArtistByName(item.artist_name);
              }}>{item.artist_name ?? ''}</button>
              {#if item.progress_percent != null}
                <div class="continue-progress">
                  <div class="continue-progress-bar" style="width: {item.progress_percent}%"></div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
        <button class="carousel-arrow right" onclick={() => scrollCarousel(continueCarousel, 1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
    </div>
  {/if}

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
      {#if (stats as any).listens > 0}
        <button class="stat-card" onclick={() => activeView.set('dashboard')}>
          <span class="stat-number">{formatNumber((stats as any).listens)}</span>
          <span class="stat-name">{$t('home.listens')}</span>
        </button>
      {/if}
      {#if (stats as any).total_duration_ms > 0}
        <button class="stat-card" onclick={() => activeView.set('dashboard')}>
          <span class="stat-number">{Math.round((stats as any).total_duration_ms / 3600000)}h</span>
          <span class="stat-name">{$t('home.libraryDuration')}</span>
        </button>
      {/if}
    </div>
  {/if}

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
                <span class="carousel-artist-row"><button class="carousel-artist truncate" onclick={() => navigateArtist(album)}>{album.artist_name}</button><ServiceBadge source={album.source} compact /></span>
              </div>
            {/each}
          </div>
          <button class="carousel-arrow right" onclick={() => scrollCarousel(playedCarousel, 1)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      {:else}
        <div class="empty-state-card">
          <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
          <p class="empty-state-hint">{$t('home.emptyState.hint')}</p>
          <div class="empty-state-links">
            <button class="empty-state-btn" onclick={() => goToLibrary('albums')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              {$t('home.emptyState.browseLibrary')}
            </button>
            <button class="empty-state-btn" onclick={() => activeView.set('radios')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5"/></svg>
              {$t('home.emptyState.discoverRadios')}
            </button>
            {#each activeStreamingServices as svc}
              <button class="empty-state-btn" onclick={() => { activeStreamingService.set(svc); activeView.set('streaming'); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                {$t('home.explore')} {svc.charAt(0).toUpperCase() + svc.slice(1)}
              </button>
            {/each}
          </div>
          {#if stats}
            <div class="empty-state-stats">
              <span class="empty-stat"><strong>{formatNumber(stats.albums)}</strong> {$t('common.albums')}</span>
              <span class="empty-stat-sep">·</span>
              <span class="empty-stat"><strong>{formatNumber(stats.artists)}</strong> {$t('common.artists')}</span>
              <span class="empty-stat-sep">·</span>
              <span class="empty-stat"><strong>{formatNumber(stats.tracks)}</strong> {$t('home.tracks').toLowerCase()}</span>
            </div>
          {/if}
        </div>
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
          <button class="artist-card" onclick={() => artist.artist_id ? navigateToArtist(artist.artist_id) : navigateArtistByName(artist.name)}>
            <span class="artist-rank">#{i + 1}</span>
            <span class="artist-card-name">{artist.name}</span>
            <span class="play-count-badge">{artist.plays} {$t('home.plays')}</span>
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
          <div class="top-track-row">
            <span class="track-rank">{i + 1}</span>
            <button class="top-track-play-zone" type="button" onclick={() => playTopTrack(track)}>
              <div class="top-track-art">
                <AlbumArt coverPath={track.cover_path} albumId={track.track_id} size={44} alt={track.title} />
              </div>
              <span class="top-track-title truncate">{track.title}</span>
            </button>
            {#if track.artist_name}
              <button class="top-track-artist-btn truncate" type="button" onclick={() => navigateArtistByName(track.artist_name)}>{track.artist_name}</button>
            {/if}
            <ServiceBadge source={track.source} compact />
            <span class="play-count-badge">{track.plays}</span>
            {#if typeof track.track_id === 'number'}
              <button class="play-from-here-btn" type="button" onclick={(e) => { e.stopPropagation(); playFromHere(topTracks.map(t => ({ id: t.track_id })), i); }} title={$t('common.playFromHere')} aria-label={$t('common.playFromHere')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="3" y1="6" x2="14" y2="6" /><line x1="3" y1="12" x2="14" y2="12" /><line x1="3" y1="18" x2="10" y2="18" /><path d="M16 8v8l6-4z" fill="currentColor" stroke="none" /></svg>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Recommendations -->
  {#if recsLoaded && recommendations.length > 0}
    <div class="top-section">
      <h2 class="section-title">{$t('home.recommendations')}</h2>
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

  <!-- Top Mixes by Genre -->
  {#if topMixesLoaded && topMixes.length > 0}
    <div class="top-section">
      <h2 class="section-title">{$t('home.mixByGenre')}</h2>
      <div class="mixes-row">
        {#each topMixes as mix}
          <button class="mix-card" onclick={() => playMix(mix)}>
            <div class="mix-cover" style="background: linear-gradient(135deg, {mix.color ?? 'var(--tune-accent)'}, {mix.color_end ?? 'rgba(99, 102, 241, 0.4)'})">
              <span class="mix-genre">{mix.genre ?? mix.name ?? ''}</span>
              {#if mix.track_count}
                <span class="mix-count">{mix.track_count} {$t('home.tracks').toLowerCase()}</span>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Radio Picks -->
  {#if radioPicksLoaded && radioPicks.length > 0}
    <div class="top-section">
      <h2 class="section-title">{$t('home.favoriteRadios')}</h2>
      <div class="recs-carousel">
        {#each radioPicks as radio}
          <button class="rec-card radio-card" onclick={() => playRadioEntry(radio)}>
            {#if radio.logo_url || radio.cover_url}
              <img src={api.artworkUrl(radio.logo_url ?? radio.cover_url)} alt={radio.name ?? ''} class="radio-logo" loading="lazy" />
            {:else}
              <div class="radio-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5" />
                </svg>
              </div>
            {/if}
            <span class="rec-title truncate">{radio.name ?? ''}</span>
            {#if radio.genre}
              <span class="rec-artist truncate">{radio.genre}</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Listening Dashboard empty state: show library stats + quick links when no history -->
  {#if dashboardLoaded && !dashboard && stats}
    <div class="top-section">
      <h2 class="section-title">{$t('home.statistics')}</h2>
      <div class="dash-empty-state">
        <p class="dash-empty-hint">{$t('home.emptyState.hint')}</p>
        <div class="dash-empty-library">
          <span class="dash-empty-label">{$t('home.emptyState.libraryStats')}</span>
          <div class="dash-empty-stats">
            <button class="dash-big-stat clickable" onclick={() => goToLibrary('albums')}>
              <span class="dash-big-number">{formatNumber(stats.albums)}</span>
              <span class="dash-big-label">{$t('common.albums')}</span>
            </button>
            <button class="dash-big-stat clickable" onclick={() => goToLibrary('artists')}>
              <span class="dash-big-number">{formatNumber(stats.artists)}</span>
              <span class="dash-big-label">{$t('common.artists')}</span>
            </button>
            <button class="dash-big-stat clickable" onclick={() => goToLibrary('tracks')}>
              <span class="dash-big-number">{formatNumber(stats.tracks)}</span>
              <span class="dash-big-label">{$t('home.tracks').toLowerCase()}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Listening Dashboard -->
  {#if dashboardLoaded && dashboard}
    <div class="top-section">
      <h2 class="section-title">{$t('home.statistics')}</h2>
      <div class="dash-stats">
        {#if dashboard.total_plays != null}
          <button class="dash-big-stat clickable" onclick={() => activeView.set('history')}>
            <span class="dash-big-number">{formatNumber(dashboard.total_plays)}</span>
            <span class="dash-big-label">{$t('home.playbacks')}</span>
          </button>
        {/if}
        {#if dashboard.total_hours != null}
          <button class="dash-big-stat clickable" onclick={() => activeView.set('history')}>
            <span class="dash-big-number">{dashboard.total_hours < 1 ? dashboard.total_hours.toFixed(1) : Math.round(dashboard.total_hours)}</span>
            <span class="dash-big-label">{$t('home.hoursListened')}</span>
          </button>
        {/if}
        {#if dashboard.new_artists != null}
          <button class="dash-big-stat clickable" onclick={() => activeView.set('library')}>
            <span class="dash-big-number">{dashboard.new_artists}</span>
            <span class="dash-big-label">{$t('home.newArtists')}</span>
          </button>
        {/if}
        {#if dashboard.peak_hour != null}
          <button class="dash-big-stat clickable" onclick={() => activeView.set('history')}>
            <span class="dash-big-number">{dashboard.peak_hour}h</span>
            <span class="dash-big-label">{$t('home.peakHour')}</span>
          </button>
        {/if}
      </div>

      {#if dashboard.daily && Array.isArray(dashboard.daily) && dashboard.daily.length > 0}
        {@const last7 = dashboard.daily.slice(-7)}
        {@const maxPlays = Math.max(...last7.map((d: any) => d.plays ?? d.count ?? 0), 1)}
        <div class="dash-chart">
          <span class="dash-chart-label">{$t('home.listens7days')}</span>
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
    padding-bottom: calc(var(--space-xl) + 24px);
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

  .carousel-scrollable {
    scrollbar-width: thin;
    scrollbar-color: var(--tune-text-muted) transparent;
  }
  .carousel-scrollable::-webkit-scrollbar {
    display: block;
    height: 4px;
  }
  .carousel-scrollable::-webkit-scrollbar-thumb {
    background: var(--tune-text-muted);
    border-radius: 2px;
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

  /* Paused zone: bars stop bouncing and sit flat (Elie). */
  .eq-bars.paused span {
    animation: none;
    height: 30%;
    transform: none;
    opacity: 0.6;
  }

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

  .play-from-here-btn {
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

  .top-track-row:hover .play-from-here-btn {
    opacity: 1;
  }

  .play-from-here-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
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

  .top-track-play-zone {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    min-width: 0;
    flex: 1;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
    color: inherit;
  }

  .top-track-play-zone:hover .top-track-title {
    color: var(--tune-accent);
  }

  .top-track-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text);
    transition: color 0.12s;
  }

  .top-track-artist-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    transition: color 0.12s;
  }

  .top-track-artist-btn:hover {
    color: var(--tune-accent);
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
    min-height: 210px;
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
    margin-top: auto;
    white-space: nowrap;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Dashboard */
  .dash-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-md);
  }

  @media (max-width: 600px) {
    .dash-stats { grid-template-columns: repeat(2, 1fr); }
  }

  .dash-big-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 20px 16px;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(99, 102, 241, 0.04));
    border: 1px solid rgba(99, 102, 241, 0.15);
    border-radius: 16px;
    min-height: 90px;
  }

  .dash-big-number {
    font-family: var(--font-display);
    font-size: 36px;
    font-weight: 700;
    color: var(--tune-text);
    line-height: 1;
  }

  .dash-big-label {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    text-align: center;
  }

  .dash-big-stat.clickable {
    cursor: pointer;
    transition: all 0.15s ease-out;
  }

  .dash-big-stat.clickable:hover {
    transform: translateY(-2px);
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(99, 102, 241, 0.08));
    border-color: rgba(99, 102, 241, 0.3);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
  }

  .dash-chart {
    margin-top: var(--space-lg);
    padding: 20px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 16px;
  }

  .dash-chart-label {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    letter-spacing: 0.3px;
    margin-bottom: var(--space-sm);
    display: block;
  }

  .dash-bars {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    height: 120px;
    padding-top: var(--space-sm);
  }

  .dash-bar-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 36px;
  }

  .dash-bar {
    width: 100%;
    max-width: 36px;
    background: linear-gradient(to top, var(--tune-accent), rgba(99, 102, 241, 0.6));
    border-radius: 6px 6px 0 0;
    min-height: 6px;
    transition: height 0.4s ease-out;
  }

  .dash-bar-count {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 700;
    color: var(--tune-text);
  }

  .dash-bar-label {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
    text-transform: capitalize;
  }

  .dash-genres {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: var(--space-lg);
  }

  .genre-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-body);
    font-size: 13px;
    padding: 6px 14px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--tune-text);
    transition: all 0.12s;
  }

  .genre-pill:hover {
    background: rgba(99, 102, 241, 0.1);
    border-color: rgba(99, 102, 241, 0.2);
  }

  .genre-count {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 700;
    color: var(--tune-accent);
  }

  /* Continue Listening progress bar */
  .continue-progress {
    width: 100%;
    height: 3px;
    background: var(--tune-border);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 4px;
  }

  .continue-progress-bar {
    height: 100%;
    background: var(--tune-accent);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  /* Top Mixes */
  .mixes-row {
    display: flex;
    gap: var(--space-md);
    overflow-x: auto;
    padding: var(--space-xs) 0;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .mixes-row::-webkit-scrollbar { display: none; }

  .mix-card {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--tune-text);
  }

  .mix-cover {
    width: 160px;
    height: 100px;
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    transition: transform 0.15s ease-out, box-shadow 0.15s ease-out;
  }

  .mix-card:hover .mix-cover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .mix-genre {
    font-family: var(--font-label);
    font-size: 15px;
    font-weight: 700;
    color: white;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  }

  .mix-count {
    font-family: var(--font-body);
    font-size: 11px;
    color: rgba(255, 255, 255, 0.8);
  }

  /* Radio picks */
  .radio-card {
    width: 140px;
  }

  .radio-logo {
    width: 140px;
    height: 140px;
    object-fit: cover;
    border-radius: var(--radius-sm);
    background: var(--tune-surface);
  }

  .radio-placeholder {
    width: 140px;
    height: 140px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    color: var(--tune-text-muted);
  }

  /* Now Listening */
  .now-listening-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .now-listening-row {
    display: flex;
    gap: var(--space-md);
    overflow-x: auto;
    padding: var(--space-xs) 0;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .now-listening-row::-webkit-scrollbar { display: none; }

  .nl-card {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    flex-shrink: 0;
    min-width: 220px;
    max-width: 320px;
    cursor: pointer;
    transition: all 0.15s ease-out;
    color: var(--tune-text);
    text-align: left;
  }

  .nl-card:hover {
    border-color: var(--tune-accent);
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .nl-cover {
    flex-shrink: 0;
  }

  .nl-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }

  .nl-zone {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tune-accent);
  }

  .nl-track {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text);
  }

  .nl-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }

  .nl-playing-indicator {
    flex-shrink: 0;
  }

  /* Empty state card (no listening history) */
  .empty-state-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-xl) var(--space-lg);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    text-align: center;
    color: var(--tune-text-secondary);
  }

  .empty-state-icon {
    opacity: 0.3;
    color: var(--tune-text-muted);
  }

  .empty-state-hint {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
    margin: 0;
  }

  .empty-state-links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    justify-content: center;
  }

  .empty-state-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.12s ease-out;
  }

  .empty-state-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
    transform: translateY(-1px);
  }

  .empty-state-stats {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    margin-top: var(--space-sm);
  }

  .empty-stat strong {
    color: var(--tune-text);
    font-weight: 600;
  }

  .empty-stat-sep {
    opacity: 0.4;
  }

  /* Dashboard empty state */
  .dash-empty-state {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .dash-empty-hint {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
    margin: 0;
  }

  .dash-empty-library {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .dash-empty-label {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--tune-text-muted);
  }

  .dash-empty-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-md);
  }
</style>

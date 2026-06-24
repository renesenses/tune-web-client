<script lang="ts">
  import { activeStreamingService, pendingStreamingAlbum, pendingStreamingArtist } from '../lib/stores/streaming';
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import { queueTracks, queuePosition } from '../lib/stores/queue';
  import * as api from '../lib/api';
  import { formatTime, formatAlbumYear } from '../lib/utils';
  import AlbumArt from './AlbumArt.svelte';
  import QualityBadge from './QualityBadge.svelte';
  import ServiceBadge from './ServiceBadge.svelte';
  import type { Album, Artist, Track, SearchResult, FeaturedSection, StreamingPlaylist, StreamingGenre } from '../lib/types';
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

  let newReleases = $state<Album[]>([]);
  let featuredPlaylists = $state<StreamingPlaylist[]>([]);

  let favAlbums = $state<Album[]>([]);
  let favArtists = $state<Artist[]>([]);
  let favTracks = $state<Track[]>([]);
  let favAlbumIds = $derived(new Set(favAlbums.map(a => String(a.source_id ?? a.id))));
  let favArtistIds = $derived(new Set(favArtists.map(a => String(a.source_id ?? a.id))));
  let favTrackIds = $derived(new Set(favTracks.map(t => String(t.source_id ?? t.id))));

  // Genre browsing state
  let genres = $state<StreamingGenre[]>([]);
  let genreBreadcrumb = $state<{ id: string | null; name: string }[]>([]);
  let genreAlbums = $state<Album[]>([]);
  let genreLoading = $state(false);
  let browsingGenres = $state(false);

  // YouTube Music browse state
  type YtmBrowseTab = 'home' | 'charts' | 'moods' | null;
  let ytmBrowseTab = $state<YtmBrowseTab>(null);
  let ytmChartsData = $state<Record<string, any[]>>({});
  let ytmMoodCategories = $state<{ title: string; items: { title: string; params: string }[] }[]>([]);
  let ytmMoodPlaylists = $state<{ title: string; playlistId: string; description: string; cover_path: string | null }[]>([]);
  let ytmMoodTitle = $state<string>('');
  let ytmLoading = $state(false);

  $effect(() => {
    const s = service;
    // Reset all navigation state on service change to prevent UI freeze
    selectedAlbum = null;
    selectedArtist = null;
    selectedStreamingPlaylist = null;
    albumTracks = [];
    artistAlbums = [];
    playlistTracks = [];
    results = null;
    searchQuery = '';
    if (s) {
      loadFeatured(s);
      loadUserPlaylists(s);
      loadFavorites(s);
      loadNewReleases(s);
      loadFeaturedPlaylists(s);
    } else {
      featuredSections = [];
      featuredData = {};
      userPlaylists = [];
      newReleases = [];
      featuredPlaylists = [];
      favAlbums = [];
      favArtists = [];
      favTracks = [];
    }
    // Reset genre browsing on service change
    browsingGenres = false;
    genres = [];
    genreAlbums = [];
    genreBreadcrumb = [];
    // Reset YouTube browse on service change
    ytmBrowseTab = null;
    ytmMoodPlaylists = [];
    ytmMoodTitle = '';
  });

  $effect(() => {
    const album = $pendingStreamingAlbum;
    if (album && service) {
      pendingStreamingAlbum.set(null);
      selectAlbum(album);
    }
  });

  $effect(() => {
    const artist = $pendingStreamingArtist;
    if (artist && service) {
      pendingStreamingArtist.set(null);
      selectArtist(artist);
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

  async function toggleFavorite(type: 'tracks' | 'albums' | 'artists', itemId: string) {
    if (!service) return;
    const idSet = type === 'albums' ? favAlbumIds : type === 'artists' ? favArtistIds : favTrackIds;
    const isFav = idSet.has(itemId);
    try {
      if (isFav) {
        await api.removeStreamingFavorite(service, type, itemId);
      } else {
        await api.addStreamingFavorite(service, type, itemId);
      }
      await loadFavorites(service);
    } catch (e) {
      console.error('Toggle favorite error:', e);
    }
  }

  async function loadFavorites(s: string) {
    try {
      const [albums, artists, tracks] = await Promise.all([
        api.getStreamingFavorites(s, 'albums'),
        api.getStreamingFavorites(s, 'artists'),
        api.getStreamingFavorites(s, 'tracks'),
      ]);
      if (service === s) {
        favAlbums = albums?.albums ?? [];
        favArtists = artists?.artists ?? [];
        favTracks = tracks?.tracks ?? [];
      }
    } catch (e) {
      console.error('Load favorites error:', e);
    }
  }

  async function loadNewReleases(s: string) {
    try {
      const albums = await api.getStreamingNewReleases(s);
      if (service === s) newReleases = albums;
    } catch { newReleases = []; }
  }

  async function loadFeaturedPlaylists(s: string) {
    try {
      const playlists = await api.getStreamingFeaturedPlaylists(s);
      if (service === s) featuredPlaylists = playlists;
    } catch { featuredPlaylists = []; }
  }

  async function openGenreBrowser() {
    if (!service) return;
    browsingGenres = true;
    genreBreadcrumb = [{ id: null, name: $tr('common.genres') }];
    genreAlbums = [];
    genreLoading = true;
    try {
      genres = await api.getStreamingGenres(service);
    } catch (e) {
      console.error('Load genres error:', e);
      genres = [];
    }
    genreLoading = false;
  }

  async function selectGenre(genre: StreamingGenre) {
    if (!service) return;
    genreLoading = true;
    genreBreadcrumb = [...genreBreadcrumb, { id: genre.id, name: genre.name }];
    try {
      if (genre.has_children) {
        genres = await api.getStreamingGenres(service, genre.id);
        genreAlbums = [];
      } else {
        genres = [];
        genreAlbums = [];
      }
      // Always load albums for the selected genre
      const albums = await api.getStreamingGenreAlbums(service, genre.id);
      genreAlbums = albums;
    } catch (e) {
      console.error('Load genre detail error:', e);
    }
    genreLoading = false;
  }

  function genreGoBack() {
    if (genreBreadcrumb.length <= 1) {
      browsingGenres = false;
      genres = [];
      genreAlbums = [];
      genreBreadcrumb = [];
      return;
    }
    // Go up one level
    navigateToBreadcrumb(genreBreadcrumb.length - 2);
  }

  function navigateToBreadcrumb(targetIndex: number) {
    if (targetIndex < 0) {
      browsingGenres = false;
      genres = [];
      genreAlbums = [];
      genreBreadcrumb = [];
      return;
    }
    const newBreadcrumb = genreBreadcrumb.slice(0, targetIndex + 1);
    const targetEntry = newBreadcrumb[newBreadcrumb.length - 1];
    genreBreadcrumb = newBreadcrumb;
    genreLoading = true;
    if (service) {
      api.getStreamingGenres(service, targetEntry.id ?? undefined).then(g => {
        genres = g;
        genreAlbums = [];
        genreLoading = false;
      }).catch(() => {
        genreLoading = false;
      });
    }
  }

  // YouTube Music browse functions
  async function openYtmTab(tab: YtmBrowseTab) {
    ytmBrowseTab = tab;
    ytmMoodPlaylists = [];
    ytmMoodTitle = '';
    if (tab === 'charts') await loadYtmCharts();
    if (tab === 'moods') await loadYtmMoods();
  }

  function closeYtmBrowse() {
    ytmBrowseTab = null;
    ytmMoodPlaylists = [];
    ytmMoodTitle = '';
  }

  async function loadYtmCharts() {
    ytmLoading = true;
    try {
      ytmChartsData = await api.getYouTubeCharts('FR');
    } catch (e) {
      console.error('Load YouTube charts error:', e);
      ytmChartsData = {};
    }
    ytmLoading = false;
  }

  async function loadYtmMoods() {
    ytmLoading = true;
    try {
      ytmMoodCategories = await api.getYouTubeMoods();
    } catch (e) {
      console.error('Load YouTube moods error:', e);
      ytmMoodCategories = [];
    }
    ytmLoading = false;
  }

  async function selectYtmMood(item: { title: string; params: string }) {
    ytmLoading = true;
    ytmMoodTitle = item.title;
    try {
      ytmMoodPlaylists = await api.getYouTubeMoodPlaylists(item.params);
    } catch (e) {
      console.error('Load mood playlists error:', e);
      ytmMoodPlaylists = [];
    }
    ytmLoading = false;
  }

  function ytmMoodGoBack() {
    if (ytmMoodPlaylists.length > 0) {
      ytmMoodPlaylists = [];
      ytmMoodTitle = '';
    } else {
      closeYtmBrowse();
    }
  }

  async function selectYtmMoodPlaylist(item: { title: string; playlistId: string; description: string; cover_path: string | null }) {
    if (!service) return;
    selectedStreamingPlaylist = {
      source_id: item.playlistId,
      name: item.title,
      description: item.description || null,
      track_count: 0,
      duration_ms: 0,
      cover_path: item.cover_path || null,
      source: 'youtube' as any,
    };
    selectedAlbum = null;
    selectedArtist = null;
    loading = true;
    try {
      playlistTracks = await api.getStreamingPlaylistTracks(service, item.playlistId);
    } catch (e) {
      console.error('Get YouTube playlist tracks error:', e);
    }
    loading = false;
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
      if (results) {
        if (results.albums.length > 0) tab = 'albums';
        else if (results.artists.length > 0) tab = 'artists';
        else if (results.tracks.length > 0) tab = 'tracks';
      }
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
    const albumId = String(album.source_id ?? album.id ?? '');
    if (!service || !albumId) return;
    selectedAlbum = album;
    selectedArtist = null;
    loading = true;
    try {
      albumTracks = await api.getStreamingAlbumTracks(service, albumId);
    } catch (e) {
      console.error('Get streaming album tracks error:', e);
    }
    loading = false;
  }

  async function selectArtist(artist: Artist) {
    const artistId = String(artist.source_id ?? artist.id ?? artist.musicbrainz_id ?? artist.discogs_id ?? '');
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

  async function playStreamingPlaylist(playlist: StreamingPlaylist, startIndex?: number) {
    if (!zone?.id || !service) return;
    try {
      await playAndSync(zone.id, { source: (playlist.source || service) as any, streaming_playlist_id: playlist.source_id, start_index: startIndex });
    } catch (e) {
      console.error('Play streaming playlist error:', e);
    }
  }

  async function addStreamingTrackToQueue(track: Track) {
    if (!zone?.id || !track.source || !track.source_id) return;
    try {
      await api.addToQueue(zone.id, { source: (track.source || service) as any, source_id: track.source_id });
      const qs = await api.getQueue(zone.id);
      queueTracks.set(qs.tracks);
      queuePosition.set(qs.position);
    } catch (e) {
      console.error('Add streaming track to queue error:', e);
    }
  }

  async function playNextStreaming(track: Track) {
    if (!zone?.id || !track.source_id) return;
    try {
      const qs = await api.getQueue(zone.id);
      const nextPos = qs.position + 1;
      await api.addToQueue(zone.id, { source: (track.source || service) as any, source_id: track.source_id, position: nextPos });
      const updated = await api.getQueue(zone.id);
      queueTracks.set(updated.tracks);
      queuePosition.set(updated.position);
    } catch (e) {
      console.error('Play next streaming track error:', e);
    }
  }

  function goBack() {
    selectedAlbum = null;
    selectedArtist = null;
    selectedStreamingPlaylist = null;
    albumTracks = [];
    artistAlbums = [];
    playlistTracks = [];
    if (browsingGenres) {
      // Return to genres view when navigating back from an album opened via genre browsing
      browsingGenres = true;
    }
    // Keep YouTube browse tab open when navigating back from detail
    // ytmBrowseTab is preserved intentionally
  }

  async function playStreamingTrack(track: Track) {
    if (!service || !track.source_id) return;
    if (track.source === 'youtube') {
      // Muted IFrame for legal compliance + visual context (Phase 6: eye button)
      playVideo(track.source_id, track);
      // Backend routes audio via yt-dlp → DLNA zone
      if (zone?.id) {
        try {
          await playAndSync(zone.id, { source: (track.source || service) as any, source_id: track.source_id });
        } catch (e) {
          console.error('Play YouTube track (DLNA) error:', e);
        }
      }
      return;
    }
    if (!zone?.id) return;
    try {
      await playAndSync(zone.id, { source: (track.source || service) as any, source_id: track.source_id });
    } catch (e) {
      console.error('Play streaming track error:', e);
    }
  }

  async function playStreamingAlbum(album: Album) {
    if (!zone?.id || !service || !album.source_id) return;
    try {
      await playAndSync(zone.id, { source: (album.source || service) as any, streaming_album_id: album.source_id });
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
        {#if selectedAlbum.year || selectedAlbum.original_year}
          <p class="detail-meta">{formatAlbumYear(selectedAlbum)}</p>
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
            <ServiceBadge source={t.source} compact />
            <QualityBadge format={t.format} sampleRate={t.sample_rate} bitDepth={t.bit_depth} source={t.source} />
            <span class="track-duration">{formatTime(t.duration_ms)}</span>
            <button class="play-next-btn" onclick={(e) => { e.stopPropagation(); playNextStreaming(t); }} title="Lire ensuite">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
                </button>
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
          <div class="track-item" onclick={() => selectedStreamingPlaylist ? playStreamingPlaylist(selectedStreamingPlaylist, index) : playStreamingTrack(t)}>
            <span class="track-num">{index + 1}</span>
            <div class="track-info">
              <span class="track-title truncate">{t.title}</span>
              {#if t.artist_name}
                <span class="track-artist truncate">{t.artist_name}</span>
              {/if}
            </div>
            <ServiceBadge source={t.source} compact />
            <QualityBadge format={t.format} sampleRate={t.sample_rate} bitDepth={t.bit_depth} source={t.source} />
            <span class="track-duration">{formatTime(t.duration_ms)}</span>
            <button class="play-next-btn" onclick={(e) => { e.stopPropagation(); playNextStreaming(t); }} title="Lire ensuite">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
                </button>
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
            {#if album.year || album.original_year}
              <span class="album-card-year">{formatAlbumYear(album)}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

  {:else if browsingGenres}
    <!-- Genre browsing view -->
    <div class="detail-header">
      <button class="back-btn" onclick={genreGoBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        {$tr('common.back')}
      </button>
      {#each genreBreadcrumb as crumb, i}
        {#if i > 0}<span class="breadcrumb-sep">/</span>{/if}
        {#if i < genreBreadcrumb.length - 1}
          <button class="breadcrumb-item clickable" onclick={() => navigateToBreadcrumb(i)}>{crumb.name}</button>
        {:else}
          <span class="breadcrumb-item current">{crumb.name}</span>
        {/if}
      {/each}
    </div>

    {#if genreLoading}
      <div class="loading"><div class="spinner"></div>{$tr('common.loading')}</div>
    {:else}
      {#if genres.length > 0}
        <div class="genre-grid">
          {#each genres as genre}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="genre-chip" onclick={() => selectGenre(genre)}>
              <span class="genre-name">{genre.name}</span>
              {#if genre.has_children}
                <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="9 18 15 12 9 6" /></svg>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      {#if genreAlbums.length > 0}
        <div class="genre-albums-section">
          <h3 class="featured-section-title">{$tr('common.albums')}</h3>
          <div class="albums-grid">
            {#each genreAlbums as album}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="album-card" onclick={() => selectAlbum(album)}>
                <div class="album-card-art">
                  <AlbumArt coverPath={album.cover_path} size={160} alt={album.title} />
                  <div class="art-hover-overlay">
                    <button class="art-play-btn" onclick={(e) => { e.stopPropagation(); playStreamingAlbum(album); }} title={$tr('common.play')}>
                      <svg viewBox="0 0 24 24" fill="white" width="28" height="28"><path d="M8 5v14l11-7z" /></svg>
                    </button>
                  </div>
                </div>
                <div class="album-card-meta">
                  <span class="album-card-title truncate">{album.title}</span>
                  {#if album.artist_name}
                    <span class="album-card-artist truncate">{album.artist_name}</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if genres.length === 0 && genreAlbums.length === 0}
        <div class="empty-center">{$tr('common.noResult')}</div>
      {/if}
    {/if}

  {:else if ytmBrowseTab}
    <!-- YouTube Music browse view -->
    <div class="detail-header">
      <button class="back-btn" onclick={ytmMoodGoBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        {$tr('common.back')}
      </button>
      <h2>
        {#if ytmBrowseTab === 'charts'}{$tr('streaming.ytmCharts')}
        {:else if ytmBrowseTab === 'moods'}{ytmMoodTitle || $tr('streaming.ytmMoods')}
        {/if}
      </h2>
    </div>

    {#if ytmLoading}
      <div class="loading"><div class="spinner"></div>{$tr('common.loading')}</div>

    {:else if ytmBrowseTab === 'charts'}
      <!-- Charts: trending songs, top songs, top videos -->
      {#if ytmChartsData.trending?.length}
        <div class="featured-section">
          <h3 class="featured-section-title">{$tr('streaming.ytmTrending')}</h3>
          <div class="track-list">
            {#each ytmChartsData.trending as t, i}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="track-item" onclick={() => playStreamingTrack(t)}>
                <span class="track-num">{i + 1}</span>
                <div class="track-info">
                  <span class="track-title truncate">{t.title}</span>
                  <span class="track-artist truncate">{t.artist_name ?? ''}</span>
                </div>
                <span class="track-duration">{formatTime(t.duration_ms)}</span>
                <button class="play-next-btn" onclick={(e) => { e.stopPropagation(); playNextStreaming(t); }} title="Lire ensuite">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
                </button>
                <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); addStreamingTrackToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if ytmChartsData.songs?.length}
        <div class="featured-section">
          <h3 class="featured-section-title">{$tr('streaming.ytmTopSongs')}</h3>
          <div class="track-list">
            {#each ytmChartsData.songs as t, i}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="track-item" onclick={() => playStreamingTrack(t)}>
                <span class="track-num">{i + 1}</span>
                <div class="track-info">
                  <span class="track-title truncate">{t.title}</span>
                  <span class="track-artist truncate">{t.artist_name ?? ''}</span>
                </div>
                <span class="track-duration">{formatTime(t.duration_ms)}</span>
                <button class="play-next-btn" onclick={(e) => { e.stopPropagation(); playNextStreaming(t); }} title="Lire ensuite">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
                </button>
                <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); addStreamingTrackToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if ytmChartsData.videos?.length}
        <div class="featured-section">
          <h3 class="featured-section-title">{$tr('streaming.ytmTopVideos')}</h3>
          <div class="track-list">
            {#each ytmChartsData.videos as t, i}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="track-item" onclick={() => playStreamingTrack(t)}>
                <span class="track-num">{i + 1}</span>
                <div class="track-info">
                  <span class="track-title truncate">{t.title}</span>
                  <span class="track-artist truncate">{t.artist_name ?? ''}</span>
                </div>
                <span class="track-duration">{formatTime(t.duration_ms)}</span>
                <button class="play-next-btn" onclick={(e) => { e.stopPropagation(); playNextStreaming(t); }} title="Lire ensuite">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
                </button>
                <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); addStreamingTrackToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if !ytmChartsData.trending?.length && !ytmChartsData.songs?.length && !ytmChartsData.videos?.length}
        <div class="empty-center">{$tr('common.noResult')}</div>
      {/if}

    {:else if ytmBrowseTab === 'moods'}
      {#if ytmMoodPlaylists.length > 0}
        <!-- Mood playlists -->
        <div class="albums-grid">
          {#each ytmMoodPlaylists as item}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="album-card" onclick={() => selectYtmMoodPlaylist(item)}>
              <div class="album-card-art">
                <AlbumArt coverPath={item.cover_path} size={160} alt={item.title} />
                <div class="art-hover-overlay">
                  <button class="art-play-btn" onclick={(e) => { e.stopPropagation(); selectYtmMoodPlaylist(item); }} title={$tr('common.play')}>
                    <svg viewBox="0 0 24 24" fill="white" width="28" height="28"><path d="M8 5v14l11-7z" /></svg>
                  </button>
                </div>
              </div>
              <div class="album-card-meta">
                <span class="album-card-title truncate">{item.title}</span>
                {#if item.description}
                  <span class="album-card-artist truncate">{item.description}</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <!-- Mood categories -->
        {#each ytmMoodCategories as cat}
          <div class="featured-section">
            <h3 class="featured-section-title">{cat.title}</h3>
            <div class="genre-grid">
              {#each cat.items as item}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="genre-chip" onclick={() => selectYtmMood(item)}>
                  <span class="genre-name">{item.title}</span>
                  <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="9 18 15 12 9 6" /></svg>
                </div>
              {/each}
            </div>
          </div>
        {/each}
        {#if ytmMoodCategories.length === 0}
          <div class="empty-center">{$tr('common.noResult')}</div>
        {/if}
      {/if}
    {/if}

  {:else}
    <!-- Main search/browse view -->
    <div class="streaming-header">
      <h2>{serviceName(service)}</h2>
      {#if service === 'qobuz' || service === 'tidal' || service === 'deezer' || service === 'spotify'}
        <button class="genres-btn" onclick={openGenreBrowser}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
          {$tr('common.genres')}
        </button>
      {/if}
      {#if service === 'youtube'}
        <button class="genres-btn" class:active={ytmBrowseTab === 'charts'} onclick={() => openYtmTab('charts')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
          {$tr('streaming.ytmCharts')}
        </button>
        <button class="genres-btn" class:active={ytmBrowseTab === 'moods'} onclick={() => openYtmTab('moods')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
          {$tr('streaming.ytmMoods')}
        </button>
      {/if}
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
              <div class="album-card-meta">
                <span class="album-card-title truncate">{album.title}</span>
                {#if album.artist_name}
                  <span class="album-card-artist truncate">{album.artist_name}</span>
                {/if}
              </div>
              <button class="fav-btn" class:is-fav={favAlbumIds.has(String(album.source_id ?? album.id))} onclick={(e) => { e.stopPropagation(); toggleFavorite('albums', String(album.source_id ?? album.id)); }} title="Favori">♥</button>
            </div>
          {/each}
        </div>

      {:else if tab === 'artists' && results.artists.length > 0}
        <div class="artists-list">
          {#each results.artists as artist}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="artist-item" onclick={() => selectArtist(artist)}>
              <div class="artist-avatar">{artist.name.charAt(0).toUpperCase()}</div>
              <span class="artist-name">{artist.name}</span>
              <button class="fav-btn" class:is-fav={favArtistIds.has(String(artist.source_id ?? artist.id))} onclick={(e) => { e.stopPropagation(); toggleFavorite('artists', String(artist.source_id ?? artist.id)); }} title="Favori">♥</button>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
            </div>
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
              <ServiceBadge source={t.source} compact />
              <QualityBadge format={t.format} sampleRate={t.sample_rate} bitDepth={t.bit_depth} source={t.source} />
              <span class="track-duration">{formatTime(t.duration_ms)}</span>
              <button class="fav-btn small" class:is-fav={favTrackIds.has(String(t.source_id ?? t.id))} onclick={(e) => { e.stopPropagation(); toggleFavorite('tracks', String(t.source_id ?? t.id)); }} title="Favori">♥</button>
              <button class="play-next-btn" onclick={(e) => { e.stopPropagation(); playNextStreaming(t); }} title="Lire ensuite">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
                </button>
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
      <!-- Spotify dev-mode notice -->
      {#if service === 'spotify' && featuredSections.length === 0 && !featuredLoading}
        <div class="dev-mode-banner">
          <div class="dev-mode-icon">ℹ️</div>
          <div class="dev-mode-text">
            <strong>Spotify en mode développement</strong>
            <p>
              Spotify limite l'app à tes propres playlists. Les Nouveautés,
              catégories et top tracks nécessitent une demande
              <a href="https://developer.spotify.com/documentation/web-api/concepts/quota-modes" target="_blank" rel="noopener noreferrer">Extended Quota</a>
              dans le dashboard Spotify (review 5–7 jours).
            </p>
          </div>
        </div>
      {/if}

      <!-- Featured sections with carousels (top of page) -->
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

      <!-- New releases carousel -->
      {#if newReleases.length > 0}
        <div class="featured-section">
          <h3 class="featured-section-title">{$tr('streaming.newReleases')}</h3>
          <div class="carousel">
            {#each newReleases as album}
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

      <!-- Featured playlists carousel -->
      {#if featuredPlaylists.length > 0}
        <div class="featured-section">
          <h3 class="featured-section-title">{$tr('streaming.featuredPlaylists')}</h3>
          <div class="carousel">
            {#each featuredPlaylists as playlist}
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

      <!-- Favorite albums carousel -->
      {#if favAlbums.length > 0}
        <div class="featured-section">
          <h3 class="featured-section-title">♥ {$tr('streaming.favAlbums')}</h3>
          <div class="carousel">
            {#each favAlbums as album}
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
                <span class="album-card-artist truncate">{album.artist_name}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Favorite artists carousel -->
      {#if favArtists.length > 0}
        <div class="featured-section">
          <h3 class="featured-section-title">♥ {$tr('streaming.favArtists')}</h3>
          <div class="carousel">
            {#each favArtists as artist}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="carousel-card" onclick={() => selectArtist(artist)}>
                <div class="album-card-art">
                  <AlbumArt coverPath={artist.image_path} size={160} alt={artist.name} round />
                  <div class="art-hover-overlay">
                    <button class="art-play-btn" onclick={(e) => { e.stopPropagation(); selectArtist(artist); }} title={$tr('library.openAlbum')}>
                      <svg viewBox="0 0 24 24" fill="white" width="28" height="28"><path d="M8 5v14l11-7z" /></svg>
                    </button>
                  </div>
                </div>
                <span class="album-card-title truncate">{artist.name}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Favorite tracks -->
      {#if favTracks.length > 0}
        <div class="featured-section">
          <h3 class="featured-section-title">♥ {$tr('streaming.favTracks')}</h3>
          <div class="track-list">
            {#each favTracks.slice(0, 50) as track, i}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="track-item" ondblclick={() => playStreamingTrack(track)}>
                <span class="track-num">{i + 1}</span>
                <div class="track-art-small">
                  <AlbumArt coverPath={track.cover_path} size={36} alt={track.title} />
                </div>
                <div class="track-info">
                  <span class="track-title truncate">{track.title}</span>
                  <span class="track-artist truncate">{track.artist_name}{#if track.album} — {track.album}{/if}</span>
                </div>
                <ServiceBadge source={track.source} compact />
                <QualityBadge format={track.format} sampleRate={track.sample_rate} bitDepth={track.bit_depth} source={track.source} />
                <span class="track-duration">{formatTime(track.duration_ms)}</span>
                <button class="track-action-btn" onclick={() => playStreamingTrack(track)} title="Play">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M8 5v14l11-7z" /></svg>
                </button>
              </div>
            {/each}
          </div>
        </div>
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
    display: flex;
    align-items: center;
    gap: var(--space-md);
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
    scrollbar-width: auto;
    scrollbar-color: var(--tune-grey3, #555) transparent;
  }

  .carousel::-webkit-scrollbar {
    height: 10px;
  }

  .carousel::-webkit-scrollbar-track {
    background: transparent;
  }

  .carousel::-webkit-scrollbar-thumb {
    background: var(--tune-grey3, #555);
    border-radius: 5px;
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
    width: 160px;
    min-width: 0;
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

  .album-card-meta {
    overflow: hidden;
    width: 100%;
  }

  .album-card-title {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .album-card-artist, .album-card-year {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .track-item:hover .add-queue-btn,
  .track-item:hover .play-next-btn {
    opacity: 1;
  }

  .add-queue-btn:hover,
  .play-next-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .play-next-btn {
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

  .fav-btn {
    background: none;
    border: none;
    color: var(--tune-text-secondary);
    font-size: 18px;
    cursor: pointer;
    padding: 4px;
    opacity: 0.4;
    transition: all 0.2s;
  }
  .fav-btn:hover {
    opacity: 1;
    color: #e74c3c;
  }
  .fav-btn.is-fav {
    color: #e74c3c;
    opacity: 1;
  }
  .fav-btn.small {
    font-size: 14px;
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

  .dev-mode-banner {
    display: flex;
    gap: 0.85rem;
    padding: 1rem 1.2rem;
    background: rgba(99, 102, 241, 0.08);
    border: 1px solid rgba(99, 102, 241, 0.35);
    border-radius: 10px;
    margin: 0 1rem 1.25rem;
    align-items: flex-start;
  }
  .dev-mode-icon {
    font-size: 1.4rem;
    line-height: 1;
    margin-top: 0.1rem;
  }
  .dev-mode-text { flex: 1; min-width: 0; }
  .dev-mode-text strong {
    display: block;
    color: var(--tune-text, #f5f5f5);
    margin-bottom: 0.25rem;
  }
  .dev-mode-text p {
    margin: 0;
    font-size: 0.85rem;
    color: var(--tune-text-secondary, #aaa);
    line-height: 1.4;
  }
  .dev-mode-text a {
    color: var(--tune-accent, #6366f1);
    text-decoration: underline;
  }

  /* Genre browsing */

  .genres-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: var(--tune-grey2);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text-secondary);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    transition: all 0.12s ease-out;
  }

  .genres-btn:hover,
  .genres-btn.active {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
    background: rgba(87, 198, 185, 0.1);
  }

  .breadcrumb-sep {
    color: var(--tune-text-muted);
    font-size: 13px;
    margin: 0 2px;
  }

  .breadcrumb-item {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
    background: none;
    border: none;
    padding: 0;
    margin: 0;
  }

  .breadcrumb-item.clickable {
    cursor: pointer;
  }

  .breadcrumb-item.clickable:hover {
    color: var(--tune-accent);
  }

  .breadcrumb-item.current {
    color: var(--tune-text);
    font-weight: 600;
  }

  .genre-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: var(--space-xl);
  }

  .genre-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 18px;
    background: var(--tune-grey2);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    color: var(--tune-text);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    transition: all 0.15s ease-out;
  }

  .genre-chip:hover {
    border-color: var(--tune-accent);
    background: rgba(87, 198, 185, 0.1);
    transform: translateY(-1px);
  }

  .genre-name {
    white-space: nowrap;
  }

  .genre-albums-section {
    margin-top: var(--space-md);
  }
</style>

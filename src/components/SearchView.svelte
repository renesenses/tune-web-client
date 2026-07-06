<script lang="ts">
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import { notifications } from '../lib/stores/notifications';
  import { activeView, pendingSearchQuery } from '../lib/stores/navigation';
  import { selectedArtist, artistAlbums, selectedAlbum, libraryTab, libraryLoading, albums, artists, tracks as libraryTracks, genres as libraryGenres } from '../lib/stores/library';
  import { get } from 'svelte/store';
  import { activeStreamingService, pendingStreamingAlbum, pendingStreamingArtist, streamingServices } from '../lib/stores/streaming';
  import * as api from '../lib/api';
  import { formatTime } from '../lib/utils';
  import AlbumArt from './AlbumArt.svelte';
  import QualityBadge from './QualityBadge.svelte';
  import ServiceBadge from './ServiceBadge.svelte';
  import type { FederatedSearchResult, Track, Album, Artist, Playlist, StreamingPlaylist, Source } from '../lib/types';
  import { t } from '../lib/i18n';
  import MetadataChips from './MetadataChips.svelte';
  import { displayFields } from '../lib/stores/displayFields';

  // --- Search history (localStorage) ---
  const SEARCH_HISTORY_KEY = 'tune_search_history';
  const SEARCH_HISTORY_MAX = 10;

  interface SearchHistoryEntry {
    query: string;
    timestamp: number;
  }

  function loadSearchHistory(): SearchHistoryEntry[] {
    try {
      const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
      if (raw) return JSON.parse(raw) as SearchHistoryEntry[];
    } catch {}
    return [];
  }

  function saveSearchHistory(entries: SearchHistoryEntry[]) {
    try {
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(entries));
    } catch {}
  }

  function addToSearchHistory(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;
    let entries = loadSearchHistory();
    entries = entries.filter(e => e.query.toLowerCase() !== trimmed.toLowerCase());
    entries.unshift({ query: trimmed, timestamp: Date.now() });
    if (entries.length > SEARCH_HISTORY_MAX) entries = entries.slice(0, SEARCH_HISTORY_MAX);
    saveSearchHistory(entries);
    searchHistory = entries;
  }

  function removeFromSearchHistory(query: string) {
    let entries = loadSearchHistory();
    entries = entries.filter(e => e.query !== query);
    saveSearchHistory(entries);
    searchHistory = entries;
  }

  function clearSearchHistory() {
    saveSearchHistory([]);
    searchHistory = [];
  }

  let searchHistory = $state<SearchHistoryEntry[]>(loadSearchHistory());

  interface Props {
    onAddToPlaylist?: (track: Track) => void;
  }
  let { onAddToPlaylist }: Props = $props();

  let zone = $derived($currentZone);
  let addToPlaylistLabel = $derived($t('nowplaying.addToPlaylist'));
  let searchQuery = $state('');
  let loading = $state(false);
  let results: FederatedSearchResult | null = $state(null);

  // Type filters
  let showArtists = $state(true);
  let showAlbums = $state(true);
  let showTracks = $state(true);

  // Quality filters
  type QualityFilter = 'all' | 'hires' | 'cd' | 'lossy';
  let qualityFilter = $state<QualityFilter>('all');

  function matchesQuality(item: { sample_rate?: number | null; bit_depth?: number | null; format?: string | null }): boolean {
    if (qualityFilter === 'all') return true;
    const sr = item.sample_rate ?? 0;
    const bd = item.bit_depth ?? 0;
    const fmt = (item.format ?? '').toLowerCase();
    if (qualityFilter === 'hires') return sr > 48000 || bd > 16;
    if (qualityFilter === 'cd') return sr > 0 && sr <= 48000 && bd <= 16 && fmt !== 'mp3' && fmt !== 'aac' && fmt !== 'ogg';
    if (qualityFilter === 'lossy') return fmt === 'mp3' || fmt === 'aac' || fmt === 'ogg';
    return true;
  }

  // Filtered versions
  let filteredAlbums = $derived(qualityFilter === 'all' ? groupedAlbums : groupedAlbums.filter(a => matchesQuality(a)));
  let filteredTracks = $derived(qualityFilter === 'all' ? groupedTracks : groupedTracks.filter(t => matchesQuality(t)));

  // --- Discovery content ---
  let topArtists = $state<any[]>([]);
  let recentAlbums = $state<Album[]>([]);
  let discoveryLoading = $state(true);

  $effect(() => {
    if (topArtists.length > 0 || recentAlbums.length > 0) return;
    loadDiscoveryContent();
  });

  async function loadDiscoveryContent() {
    discoveryLoading = true;
    try {
      const [rawArtists, albs, libraryArtistList] = await Promise.all([
        api.getTopArtists(12).catch(() => []),
        api.getRecentAlbums(18).catch(() => []),
        api.getArtists(5000, 0).catch(() => []),
      ]);
      const libraryArtistMap = new Map<string, any>();
      for (const a of libraryArtistList) {
        if (a.name) libraryArtistMap.set(a.name.toLowerCase(), a);
      }
      topArtists = rawArtists.map((a: any) => {
        const name = (a.artist_name || a.name || '').toLowerCase();
        const lib = libraryArtistMap.get(name);
        if (lib?.image_path) {
          return { ...a, image_path: lib.image_path, artist_id: lib.id };
        }
        return a;
      });
      recentAlbums = albs;
    } catch {}
    discoveryLoading = false;
  }

  // --- Instant search with debounce ---
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const q = searchQuery.trim();
    if (debounceTimer) clearTimeout(debounceTimer);
    if (!q) {
      results = null;
      playlistMatches = [];
      loading = false;
      return;
    }
    loading = true;
    debounceTimer = setTimeout(() => {
      handleSearch();
    }, 300);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  });

  // Handle pending search from other views
  $effect(() => {
    const pending = $pendingSearchQuery;
    if (pending) {
      searchQuery = pending;
      pendingSearchQuery.set('');
    }
  });

  // Source filtering
  let selectedSources = $state<Set<string>>(new Set());
  let availableSources = $derived.by(() => {
    const sources: { key: string; label: string }[] = [{ key: 'local', label: 'Local' }];
    for (const [service, status] of Object.entries($streamingServices)) {
      if (status.authenticated) {
        sources.push({ key: service, label: service.charAt(0).toUpperCase() + service.slice(1) });
      }
    }
    return sources;
  });
  let allSelected = $derived(selectedSources.size === 0 || selectedSources.size === availableSources.length);

  function toggleSource(key: string) {
    const next = new Set(selectedSources);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    if (next.size === availableSources.length) {
      selectedSources = new Set();
    } else {
      selectedSources = next;
    }
    if (searchQuery.trim()) {
      handleSearch();
    }
  }

  function selectAllSources() {
    selectedSources = new Set();
    if (searchQuery.trim()) {
      handleSearch();
    }
  }

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
      const activeSources = selectedSources.size > 0 ? [...selectedSources] : undefined;
      const includeLocal = !activeSources || activeSources.includes('local');

      const [federated, localPlaylists] = await Promise.all([
        api.federatedSearch(searchQuery.trim(), activeSources, 30),
        includeLocal ? api.getPlaylists().catch(() => [] as Playlist[]) : Promise.resolve([] as Playlist[]),
      ]);
      results = federated;

      addToSearchHistory(searchQuery.trim());

      const matches: PlaylistMatch[] = localPlaylists
        .filter((p) => p.name.toLowerCase().includes(query))
        .map((p) => ({
          name: p.name,
          trackCount: p.track_count ?? 0,
          source: 'Local',
          localId: p.id ?? undefined,
        }));

      const services = $streamingServices;
      const streamingPromises: Promise<void>[] = [];
      for (const [service, status] of Object.entries(services)) {
        if (status.authenticated && (!activeSources || activeSources.includes(service))) {
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
      notifications.error('Aucune zone selectionnee');
      return;
    }
    const src = track.source ?? (track as any)._source;
    try {
      if (track.id && !src) {
        await playAndSync(zone.id, { track_id: track.id });
      } else if (src && track.source_id) {
        await playAndSync(zone.id, { source: src, source_id: track.source_id });
      } else if (track.id) {
        await playAndSync(zone.id, { track_id: track.id });
      }
    } catch (e) {
      console.error('Play track error:', e);
    }
  }

  async function addTrackToQueue(track: Track) {
    if (!zone?.id) {
      notifications.error('Aucune zone selectionnee');
      return;
    }
    const src = track.source ?? (track as any)._source;
    try {
      if (track.id && !src) {
        await api.addToQueue(zone.id, { track_id: track.id });
        notifications.success(`Ajout a la file : ${track.title}`);
      } else if (src && track.source_id) {
        await api.addToQueue(zone.id, { source: src, source_id: track.source_id });
        notifications.success(`Ajout a la file : ${track.title}`);
      } else if (track.id) {
        await api.addToQueue(zone.id, { track_id: track.id });
        notifications.success(`Ajout a la file : ${track.title}`);
      }
    } catch (e) {
      console.error('Add to queue error:', e);
    }
  }

  async function playAlbum(album: Album) {
    if (!zone?.id) {
      notifications.error('Aucune zone selectionnee');
      return;
    }
    const src = album.source ?? (album as any)._source;
    try {
      if (album.id && !src) {
        await playAndSync(zone.id, { album_id: album.id });
      } else if (src && album.source_id) {
        await playAndSync(zone.id, { source: src, streaming_album_id: album.source_id });
      } else if (album.id) {
        await playAndSync(zone.id, { album_id: album.id });
      }
    } catch (e) {
      console.error('Play album error:', e);
    }
  }

  function openAlbum(album: Album) {
    const src = (album as any)._source ?? album.source;
    if (src && src !== 'local') {
      activeStreamingService.set(src);
      pendingStreamingAlbum.set(album);
      activeView.set('streaming');
    } else if (album.id) {
      selectedAlbum.set(album);
      libraryTab.set('albums');
      activeView.set('library');
    }
  }

  async function selectArtist(artist: Artist) {
    const src = (artist as any)._source ?? (artist as any).source;
    if (src && src !== 'local') {
      activeStreamingService.set(src);
      pendingStreamingArtist.set(artist);
      activeView.set('streaming');
    } else if (artist.id) {
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
  }

  async function playAllTracks(trackList: Track[], shuffle = false) {
    if (!zone?.id || trackList.length === 0) return;
    try {
      if (shuffle) {
        await api.shuffleAll(zone.id, { search_query: searchQuery.trim() });
      } else {
        const localTracks = trackList.filter(t => t.id);
        if (localTracks.length === 0) return;
        await playAndSync(zone.id, { track_id: localTracks[0].id });
        if (localTracks.length > 1) {
          await api.addToQueue(zone.id, { track_ids: localTracks.slice(1).map(t => t.id!) });
        }
      }
    } catch (e) {
      console.error('Play all error:', e);
    }
  }

  interface MergedArtist extends Artist {
    _source?: string;
    _sources: { source: string; artist: Artist }[];
  }

  let groupedArtists = $derived.by(() => {
    if (!results) return [] as MergedArtist[];
    const all: (Artist & { _source?: string })[] = [];
    if (results.local?.artists) {
      for (const a of results.local.artists) all.push({ ...a, _source: 'local' });
    }
    if (results.services) {
      for (const [svc, data] of Object.entries(results.services)) {
        for (const a of data.artists) all.push({ ...a, _source: svc });
      }
    }

    // Infer local artists from local tracks (search may miss artist names that don't start with query)
    const localArtistNames = new Set<string>();
    if (results.local?.tracks) {
      for (const t of results.local.tracks) {
        if (t.artist_name) localArtistNames.add(t.artist_name.toLowerCase());
      }
    }
    if (results.local?.albums) {
      for (const a of results.local.albums) {
        if (a.artist_name) localArtistNames.add(a.artist_name.toLowerCase());
      }
    }

    const map = new Map<string, MergedArtist>();
    for (const a of all) {
      const key = a.name.toLowerCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...a, _sources: [{ source: (a as any)._source ?? 'local', artist: a }] });
      } else {
        const srcName = (a as any)._source ?? 'local';
        if (!existing._sources.some(s => s.source === srcName)) {
          existing._sources.push({ source: srcName, artist: a });
        }
        if (!existing.image_path && a.image_path) {
          existing.image_path = a.image_path;
        }
      }
    }

    // Add local badge to artists found in local tracks/albums
    for (const [key, merged] of map) {
      const hasLocal = merged._sources.some(s => s.source === 'local');
      if (!hasLocal && localArtistNames.has(key)) {
        const localTrack = results.local?.tracks?.find(t => t.artist_name?.toLowerCase() === key);
        merged._sources.unshift({
          source: 'local',
          artist: { id: localTrack?.artist_id ?? null, name: merged.name } as Artist,
        });
      }
    }

    return [...map.values()];
  });

  // Local artist lookup cache (enriched asynchronously)
  let localArtistCache = $state<Map<string, { id: number; name: string }>>(new Map());
  let localCacheLoaded = $state(false);

  $effect(() => {
    if (!results || localCacheLoaded) return;
    loadLocalArtistCache();
  });

  async function loadLocalArtistCache() {
    try {
      const allArtists = await api.getArtists(5000, 0);
      const cache = new Map<string, { id: number; name: string }>();
      for (const a of allArtists) {
        if (a.name && a.id) cache.set(a.name.toLowerCase(), { id: a.id, name: a.name });
      }
      localArtistCache = cache;
      localCacheLoaded = true;
    } catch {}
  }

  // Merged artists with local enrichment from cache
  let enrichedArtists = $derived.by(() => {
    if (!localCacheLoaded || localArtistCache.size === 0) return groupedArtists;
    return groupedArtists.map(a => {
      const hasLocal = a._sources.some(s => s.source === 'local');
      if (hasLocal) return a;
      const lib = localArtistCache.get(a.name.toLowerCase());
      if (lib) {
        return {
          ...a,
          _sources: [{ source: 'local', artist: { id: lib.id, name: lib.name } as Artist }, ...a._sources],
        };
      }
      return a;
    });
  });

  let groupedAlbums = $derived.by(() => {
    if (!results) return [];
    const all: (Album & { _source?: string })[] = [];
    if (results.local?.albums) {
      for (const a of results.local.albums) all.push({ ...a, _source: 'local' });
    }
    if (results.services) {
      for (const [svc, data] of Object.entries(results.services)) {
        for (const a of data.albums) all.push({ ...a, _source: svc });
      }
    }
    return all;
  });

  let groupedTracks = $derived.by(() => {
    if (!results) return [];
    const all: (Track & { _source?: string })[] = [];
    if (results.local?.tracks) {
      for (const t of results.local.tracks) all.push({ ...t, _source: 'local' });
    }
    if (results.services) {
      for (const [svc, data] of Object.entries(results.services)) {
        for (const t of data.tracks) all.push({ ...t, _source: svc });
      }
    }
    return all;
  });

  // Group tracks by album for cleaner display
  let tracksGroupedByAlbum = $derived.by(() => {
    const groups: { albumKey: string; albumTitle: string; artistName: string; coverPath: string | null | undefined; source?: string; tracks: (Track & { _source?: string })[] }[] = [];
    const map = new Map<string, typeof groups[0]>();
    for (const t of filteredTracks) {
      const key = `${t.album_title ?? ''}|||${t.artist_name ?? ''}|||${(t as any)._source ?? 'local'}`;
      let group = map.get(key);
      if (!group) {
        group = {
          albumKey: key,
          albumTitle: t.album_title ?? '',
          artistName: t.artist_name ?? '',
          coverPath: t.cover_path,
          source: (t as any)._source,
          tracks: [],
        };
        map.set(key, group);
        groups.push(group);
      }
      group.tracks.push(t);
    }
    return groups;
  });

  let hasResults = $derived(
    enrichedArtists.length > 0 ||
    groupedAlbums.length > 0 ||
    groupedTracks.length > 0 ||
    playlistMatches.length > 0
  );

  let showDiscovery = $derived(!searchQuery.trim());

  function searchFromHistory(query: string) {
    searchQuery = query;
  }

  // Smart top result: pick the best match based on query + relevance (image, exact match)
  let topResult = $derived.by(() => {
    if (!results) return null;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;

    function scoreArtist(a: Artist): number {
      const name = a.name.toLowerCase();
      let s = 0;
      if (name === q) s += 100;
      else if (name.startsWith(q)) s += 50;
      else if (name.includes(q)) s += 20;
      if (a.image_path) s += 30;
      return s;
    }
    function scoreAlbum(a: Album): number {
      const title = a.title.toLowerCase();
      let s = 0;
      if (title === q) s += 100;
      else if (title.startsWith(q)) s += 50;
      else if (title.includes(q)) s += 20;
      if (a.cover_path) s += 5;
      return s;
    }
    function scoreTrack(t: Track): number {
      const title = t.title.toLowerCase();
      let s = 0;
      if (title === q) s += 100;
      else if (title.startsWith(q)) s += 50;
      else if (title.includes(q)) s += 20;
      return s;
    }

    // Find best candidate per type
    let bestArtist: { artist: Artist; score: number } | null = null;
    for (const a of enrichedArtists) {
      const s = scoreArtist(a);
      if (s > 0 && (!bestArtist || s > bestArtist.score)) bestArtist = { artist: a, score: s };
    }
    let bestAlbum: { album: Album; score: number } | null = null;
    for (const a of groupedAlbums) {
      const s = scoreAlbum(a);
      if (s > 0 && (!bestAlbum || s > bestAlbum.score)) bestAlbum = { album: a, score: s };
    }
    let bestTrack: { track: Track; score: number } | null = null;
    for (const t of groupedTracks) {
      const s = scoreTrack(t);
      if (s > 0 && (!bestTrack || s > bestTrack.score)) bestTrack = { track: t, score: s };
    }

    // Pick overall best
    const candidates: { type: string; score: number; data: any }[] = [];
    if (bestArtist) candidates.push({ type: 'artist', score: bestArtist.score, data: bestArtist.artist });
    if (bestAlbum) candidates.push({ type: 'album', score: bestAlbum.score, data: bestAlbum.album });
    if (bestTrack) candidates.push({ type: 'track', score: bestTrack.score, data: bestTrack.track });
    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      const c = candidates[0];
      if (c.type === 'artist') return { type: 'artist' as const, artist: c.data as Artist };
      if (c.type === 'album') return { type: 'album' as const, album: c.data as Album };
      if (c.type === 'track') return { type: 'track' as const, track: c.data as Track };
    }

    // Fallback
    if (enrichedArtists.length > 0) return { type: 'artist' as const, artist: enrichedArtists[0] };
    if (groupedAlbums.length > 0) return { type: 'album' as const, album: groupedAlbums[0] };
    if (groupedTracks.length > 0) return { type: 'track' as const, track: groupedTracks[0] };
    return null;
  });

  // Section order: put the most relevant category first
  let sectionOrder = $derived.by(() => {
    if (!topResult) return ['artists', 'albums', 'tracks'] as const;
    if (topResult.type === 'album') return ['albums', 'artists', 'tracks'] as const;
    if (topResult.type === 'track') return ['tracks', 'albums', 'artists'] as const;
    return ['artists', 'albums', 'tracks'] as const;
  });
</script>

<div class="search-view">
  <!-- Search bar -->
  <div class="search-header">
    <div class="search-bar" class:focused={searchQuery.length > 0}>
      <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      <input
        type="text"
        placeholder={$t('search.placeholder')}
        bind:value={searchQuery}
        autofocus
      />
      {#if searchQuery}
        <button class="clear-btn" onclick={() => { searchQuery = ''; }} aria-label="Effacer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      {/if}
      {#if loading}
        <div class="search-spinner"></div>
      {/if}
    </div>

    {#if availableSources.length > 1}
      <div class="source-pills">
        <button class="pill" class:active={allSelected} onclick={selectAllSources}>Tous</button>
        {#each availableSources as src}
          <button
            class="pill"
            class:active={!allSelected && selectedSources.has(src.key)}
            onclick={() => toggleSource(src.key)}
          >{src.label}</button>
        {/each}
      </div>
    {/if}

    {#if searchQuery.trim() && results}
      <div class="filter-row-inline">
        <div class="type-filters">
          <button class="type-pill" class:active={showArtists} onclick={() => showArtists = !showArtists}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            Artistes
          </button>
          <button class="type-pill" class:active={showAlbums} onclick={() => showAlbums = !showAlbums}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="12" cy="12" r="3" /></svg>
            Albums
          </button>
          <button class="type-pill" class:active={showTracks} onclick={() => showTracks = !showTracks}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M9 18V5l12-3v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="15" r="3" /></svg>
            Pistes
          </button>
        </div>
        <div class="quality-filters">
          <button class="q-pill" class:active={qualityFilter === 'all'} onclick={() => qualityFilter = 'all'}>Tout</button>
          <button class="q-pill q-pill--hires" class:active={qualityFilter === 'hires'} onclick={() => qualityFilter = 'hires'}>Hi-Res</button>
          <button class="q-pill q-pill--cd" class:active={qualityFilter === 'cd'} onclick={() => qualityFilter = 'cd'}>CD</button>
          <button class="q-pill q-pill--lossy" class:active={qualityFilter === 'lossy'} onclick={() => qualityFilter = 'lossy'}>Lossy</button>
        </div>
      </div>
    {/if}
  </div>

  <!-- CONTENT -->
  <div class="content">

    {#if showDiscovery}
      <!-- =================== DISCOVERY =================== -->
      <div class="discovery">
        <!-- Search history -->
        {#if searchHistory.length > 0}
          <section class="section">
            <div class="section-head">
              <h3>Recherches recentes</h3>
              <button class="link-btn" onclick={clearSearchHistory}>Effacer</button>
            </div>
            <div class="history-chips">
              {#each searchHistory.slice(0, 8) as entry}
                <button class="history-chip" onclick={() => searchFromHistory(entry.query)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="1,4 1,10 7,10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                  {entry.query}
                  <span class="chip-x" onclick={(e) => { e.stopPropagation(); removeFromSearchHistory(entry.query); }}>&times;</span>
                </button>
              {/each}
            </div>
          </section>
        {/if}

        <!-- Top artists -->
        {#if topArtists.length > 0}
          <section class="section">
            <h3>Artistes les plus ecoutes</h3>
            <div class="artist-row">
              {#each topArtists as artist}
                <button class="artist-pill" onclick={() => { searchQuery = artist.artist_name || artist.name; }}>
                  {#if artist.image_path}
                    <div class="artist-pill-avatar artist-pill-avatar--img">
                      <AlbumArt coverPath={artist.image_path} size={48} alt={artist.artist_name || artist.name} round />
                    </div>
                  {:else}
                    <div class="artist-pill-avatar">
                      <span>{(artist.artist_name || artist.name || '?').charAt(0).toUpperCase()}</span>
                    </div>
                  {/if}
                  <div class="artist-pill-text">
                    <span class="artist-pill-name">{artist.artist_name || artist.name}</span>
                    <span class="artist-pill-plays">{artist.plays ?? artist.play_count ?? 0} ecoutes</span>
                  </div>
                </button>
              {/each}
            </div>
          </section>
        {/if}

        <!-- Recent albums -->
        {#if recentAlbums.length > 0}
          <section class="section">
            <h3>Ajouts recents</h3>
            <div class="album-grid discovery-grid">
              {#each recentAlbums as album}
                <button class="album-card" onclick={() => playAlbum(album)}>
                  <div class="album-card-cover">
                    <AlbumArt coverPath={album.cover_path} size={0} alt={album.title} />
                    <div class="cover-overlay">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><polygon points="6,3 20,12 6,21" /></svg>
                    </div>
                  </div>
                  <span class="album-card-title">{album.title}</span>
                  {#if album.artist_name}
                    <span class="album-card-artist">{album.artist_name}</span>
                  {/if}
                </button>
              {/each}
            </div>
          </section>
        {/if}

        {#if !discoveryLoading && topArtists.length === 0 && recentAlbums.length === 0 && searchHistory.length === 0}
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="56" height="56" opacity="0.3"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <p>{$t('search.hint')}</p>
          </div>
        {/if}
      </div>

    {:else if searchQuery.trim()}
      <!-- =================== SEARCH RESULTS =================== -->
      {#if loading && !results}
        <div class="loading-state">
          <div class="spinner"></div>
          <span>{$t('search.searching')}</span>
        </div>
      {:else if results && !hasResults}
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="56" height="56" opacity="0.3"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="8" x2="14" y2="14" /><line x1="14" y1="8" x2="8" y2="14" /></svg>
          <p>{$t('search.noResults').replace('{query}', searchQuery)}</p>
        </div>
      {:else if results}
        <div class="results">

          <!-- TOP RESULT row -->
          {#if topResult && ((topResult.type === 'artist' && showArtists) || (topResult.type === 'album' && showAlbums) || (topResult.type === 'track' && showTracks))}
            <div class="top-row">
              <section class="top-result-section">
                <h3 class="section-title">Meilleur resultat</h3>
                {#if topResult.type === 'artist'}
                  {@const topSources = (topResult.artist as MergedArtist)._sources ?? []}
                  {@const topLocalSource = topSources.find(s => s.source === 'local')}
                  <div class="top-result-card">
                    <button class="top-result-main" onclick={() => {
                      if (topLocalSource) {
                        selectArtist({ ...topLocalSource.artist, _source: 'local' } as any);
                      } else {
                        selectArtist(topResult!.artist);
                      }
                    }}>
                      {#if topResult.artist.image_path}
                        <div class="top-result-avatar">
                          <AlbumArt coverPath={topResult.artist.image_path} size={72} alt={topResult.artist.name} round />
                        </div>
                      {:else}
                        <div class="top-result-avatar top-result-avatar--letter">
                          <span>{topResult.artist.name.charAt(0).toUpperCase()}</span>
                        </div>
                      {/if}
                      <span class="top-result-name">{topResult.artist.name}</span>
                    </button>
                    <div class="source-badges">
                      {#each (topResult.artist as MergedArtist)._sources ?? [{ source: (topResult.artist as any)._source ?? 'local', artist: topResult.artist }] as s}
                        <button class="source-badge-btn" onclick={() => {
                          if (s.source === 'local') {
                            selectArtist({ ...s.artist, _source: 'local' } as any);
                          } else {
                            selectArtist({ ...s.artist, _source: s.source } as any);
                          }
                        }}>
                          {#if s.source === 'local'}
                            <span class="source-local-badge">LOCAL</span>
                          {:else}
                            <ServiceBadge source={s.source} compact />
                          {/if}
                        </button>
                      {/each}
                    </div>
                  </div>
                {:else if topResult.type === 'album'}
                  <button class="top-result-card top-result-card--album" onclick={() => playAlbum(topResult!.album)}>
                    <div class="top-result-cover top-result-cover--large">
                      <AlbumArt coverPath={topResult.album.cover_path} size={120} alt={topResult.album.title} />
                    </div>
                    <div class="top-result-details">
                      <span class="top-result-name">{topResult.album.title}</span>
                      <span class="top-result-type">{topResult.album.artist_name ?? 'Album'}</span>
                      <div class="top-result-meta">
                        {#if topResult.album.year}<span class="top-result-year">{topResult.album.year}</span>{/if}
                        {#if topResult.album.track_count}<span class="top-result-count">{topResult.album.track_count} pistes</span>{/if}
                        <QualityBadge format={topResult.album.format} sampleRate={topResult.album.sample_rate} bitDepth={topResult.album.bit_depth} source={topResult.album.source} />
                      </div>
                      <div class="top-result-play-btn">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="6,3 20,12 6,21" /></svg>
                        Lire l'album
                      </div>
                    </div>
                    {#if (topResult.album as any)._source && (topResult.album as any)._source !== 'local'}
                      <div class="top-result-badge"><ServiceBadge source={(topResult.album as any)._source} compact /></div>
                    {/if}
                  </button>
                {:else if topResult.type === 'track'}
                  <button class="top-result-card top-result-card--track" onclick={() => playTrack(topResult!.track)}>
                    <div class="top-result-cover top-result-cover--large">
                      <AlbumArt coverPath={topResult.track.cover_path} albumId={topResult.track.album_id} size={120} alt={topResult.track.title} />
                    </div>
                    <div class="top-result-details">
                      <span class="top-result-name">{topResult.track.title}</span>
                      <span class="top-result-type">{topResult.track.artist_name ?? ''}</span>
                      {#if topResult.track.album_title}
                        <span class="top-result-album">{topResult.track.album_title}</span>
                      {/if}
                      <div class="top-result-meta">
                        <QualityBadge format={topResult.track.format} sampleRate={topResult.track.sample_rate} bitDepth={topResult.track.bit_depth} source={topResult.track.source} />
                        {#if topResult.track.duration_ms}<span class="top-result-dur">{formatTime(topResult.track.duration_ms)}</span>{/if}
                      </div>
                      <div class="top-result-play-btn">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="6,3 20,12 6,21" /></svg>
                        Lire
                      </div>
                    </div>
                    {#if (topResult.track as any)._source && (topResult.track as any)._source !== 'local'}
                      <div class="top-result-badge"><ServiceBadge source={(topResult.track as any)._source} compact /></div>
                    {/if}
                  </button>
                {/if}
              </section>

              <!-- Secondary: artists scroll if top is artist, or first non-top section -->
              {#if topResult.type === 'artist' && showArtists && enrichedArtists.length > 1}
                <section class="artists-section">
                  <h3 class="section-title">Artistes</h3>
                  <div class="artists-scroll">
                    {#each enrichedArtists.filter(a => a.name !== topResult?.artist?.name).slice(0, 12) as artist}
                      <div class="artist-card">
                        <button class="artist-card-main" onclick={() => selectArtist(artist)}>
                          {#if artist.image_path}
                            <div class="artist-avatar">
                              <AlbumArt coverPath={artist.image_path} size={64} alt={artist.name} round />
                            </div>
                          {:else}
                            <div class="artist-avatar artist-avatar--letter">
                              <span>{artist.name.charAt(0).toUpperCase()}</span>
                            </div>
                          {/if}
                          <span class="artist-name">{artist.name}</span>
                        </button>
                        <div class="artist-source-badges">
                          {#each (artist as MergedArtist)._sources ?? [] as s}
                            <button class="source-badge-btn source-badge-btn--sm" onclick={() => selectArtist({ ...s.artist, _source: s.source } as any)}>
                              {#if s.source === 'local'}
                                <span class="source-local-badge source-local-badge--sm">LOC</span>
                              {:else}
                                <ServiceBadge source={s.source} compact />
                              {/if}
                            </button>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  </div>
                </section>
              {:else if topResult.type !== 'artist' && showArtists && enrichedArtists.length > 0}
                <section class="artists-section">
                  <h3 class="section-title">Artistes</h3>
                  <div class="artists-scroll">
                    {#each enrichedArtists.slice(0, 12) as artist}
                      <div class="artist-card">
                        <button class="artist-card-main" onclick={() => selectArtist(artist)}>
                          {#if artist.image_path}
                            <div class="artist-avatar">
                              <AlbumArt coverPath={artist.image_path} size={64} alt={artist.name} round />
                            </div>
                          {:else}
                            <div class="artist-avatar artist-avatar--letter">
                              <span>{artist.name.charAt(0).toUpperCase()}</span>
                            </div>
                          {/if}
                          <span class="artist-name">{artist.name}</span>
                        </button>
                        <div class="artist-source-badges">
                          {#each (artist as MergedArtist)._sources ?? [] as s}
                            <button class="source-badge-btn source-badge-btn--sm" onclick={() => selectArtist({ ...s.artist, _source: s.source } as any)}>
                              {#if s.source === 'local'}
                                <span class="source-local-badge source-local-badge--sm">LOC</span>
                              {:else}
                                <ServiceBadge source={s.source} compact />
                              {/if}
                            </button>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  </div>
                </section>
              {/if}
            </div>
          {/if}

          <!-- Dynamic sections ordered by relevance -->
          {#each sectionOrder as sec}
            {#if sec === 'albums' && showAlbums && filteredAlbums.length > 0}
              <section class="section">
                <h3 class="section-title">Albums <span class="count">{filteredAlbums.length}</span></h3>
                <div class="album-grid">
                  {#each filteredAlbums as album}
                    <div class="album-card" role="group">
                      <button class="album-card-cover" onclick={() => playAlbum(album)}>
                        <AlbumArt coverPath={album.cover_path} size={0} alt={album.title} />
                        <div class="cover-overlay">
                          <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><polygon points="6,3 20,12 6,21" /></svg>
                        </div>
                        {#if (album as any)._source && (album as any)._source !== 'local'}
                          <div class="cover-badge"><ServiceBadge source={(album as any)._source} compact /></div>
                        {/if}
                      </button>
                      <button class="album-card-info" onclick={() => openAlbum(album)}>
                        <span class="album-card-title">{album.title}</span>
                        {#if album.artist_name}
                          <span class="album-card-artist">{album.artist_name}</span>
                        {/if}
                        <div class="album-card-meta">
                          {#if album.year}<span class="year">{album.year}</span>{/if}
                          <QualityBadge format={album.format} sampleRate={album.sample_rate} bitDepth={album.bit_depth} source={album.source} />
                        </div>
                      </button>
                    </div>
                  {/each}
                </div>
              </section>
            {:else if sec === 'tracks' && showTracks && filteredTracks.length > 0}
              <section class="section">
                <div class="section-head">
                  <h3 class="section-title">Pistes <span class="count">{filteredTracks.length}</span></h3>
                  {#if filteredTracks.filter(t => t.id).length > 1}
                    <div class="track-actions-bar">
                      <button class="action-pill" onclick={() => playAllTracks(groupedTracks)}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><polygon points="5,3 19,12 5,21" /></svg>
                        Tout lire
                      </button>
                      <button class="action-pill" onclick={() => playAllTracks(groupedTracks, true)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="16,3 21,3 21,8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21,16 21,21 16,21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>
                        Aleatoire
                      </button>
                    </div>
                  {/if}
                </div>

                {#each tracksGroupedByAlbum as group}
                  <div class="track-album-group">
                    {#if group.albumTitle}
                      <div class="track-album-header">
                        <div class="track-album-cover">
                          <AlbumArt coverPath={group.coverPath} size={48} alt={group.albumTitle} />
                        </div>
                        <div class="track-album-info">
                          <span class="track-album-title">{group.albumTitle}</span>
                          <span class="track-album-artist">
                            {group.artistName}
                            {#if group.source && group.source !== 'local'}
                              <ServiceBadge source={group.source} compact />
                            {/if}
                          </span>
                        </div>
                      </div>
                    {/if}
                    <div class="track-list">
                      {#each group.tracks as track, i}
                        <div class="track-row">
                          <span class="track-num">{i + 1}</span>
                          <button class="track-main" onclick={() => playTrack(track)}>
                            {#if !group.albumTitle}
                              <div class="track-art">
                                <AlbumArt coverPath={track.cover_path} albumId={track.album_id} size={40} alt={track.title} />
                                <div class="track-art-play">
                                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><polygon points="6,3 20,12 6,21" /></svg>
                                </div>
                              </div>
                            {/if}
                            <div class="track-info">
                              <span class="track-title">{track.title}</span>
                              {#if !group.albumTitle}
                                <span class="track-sub">
                                  {track.artist_name ?? ''}
                                  {#if track.album_title} &middot; {track.album_title}{/if}
                                </span>
                              {/if}
                              <MetadataChips track={track} fields={$displayFields} />
                            </div>
                          </button>
                          <div class="track-right">
                            {#if !group.albumTitle && (track as any)._source && (track as any)._source !== 'local'}
                              <ServiceBadge source={(track as any)._source} compact />
                            {/if}
                            <QualityBadge format={track.format} sampleRate={track.sample_rate} bitDepth={track.bit_depth} source={track.source} />
                            <span class="track-dur">{formatTime(track.duration_ms)}</span>
                            <div class="track-hover-actions">
                              <button class="icon-btn" onclick={(e) => { e.stopPropagation(); addTrackToQueue(track); }} title="Ajouter a la file">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                              </button>
                              {#if onAddToPlaylist && (track.id || track.source_id)}
                                <button class="icon-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(track); }} title={addToPlaylistLabel}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M11 12H3m13 0h-2m0 0V8m0 4v4m6-8v8a2 2 0 01-2 2H5" /><line x1="3" y1="16" x2="11" y2="16" /><line x1="3" y1="8" x2="8" y2="8" /></svg>
                                </button>
                              {/if}
                            </div>
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/each}
              </section>
            {/if}
          {/each}

          <!-- PLAYLISTS (always last) -->
          {#if playlistMatches.length > 0}
            <section class="section">
              <h3 class="section-title">Playlists <span class="count">{playlistMatches.length}</span></h3>
              <div class="playlist-list">
                {#each playlistMatches as pl}
                  <button class="playlist-row" onclick={() => playPlaylist(pl)}>
                    <div class="playlist-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 18V5l12-3v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="15" r="3" /></svg>
                    </div>
                    <div class="playlist-info">
                      <span class="playlist-name">{pl.name}</span>
                      <span class="playlist-meta">{pl.trackCount} pistes</span>
                    </div>
                    <span class="playlist-source">{pl.source}</span>
                  </button>
                {/each}
              </div>
            </section>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  /* ====================== LAYOUT ====================== */
  .search-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .search-header {
    flex-shrink: 0;
    padding: 20px 28px 0;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 20px 28px 40px;
  }

  /* ====================== SEARCH BAR ====================== */
  .search-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 0 18px;
    transition: all 0.2s ease-out;
  }
  .search-bar:focus-within, .search-bar.focused {
    background: rgba(255, 255, 255, 0.09);
    border-color: var(--tune-accent);
    box-shadow: 0 0 0 3px rgba(107, 110, 217, 0.15);
  }

  .search-icon {
    width: 18px;
    height: 18px;
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  .search-bar input {
    flex: 1;
    background: none;
    border: none;
    padding: 14px 0;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 16px;
    font-weight: 500;
    outline: none;
  }
  .search-bar input::placeholder { color: var(--tune-text-muted); }

  .clear-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    border-radius: 50%;
    transition: all 0.15s;
  }
  .clear-btn:hover { color: var(--tune-text); background: rgba(255, 255, 255, 0.15); }

  .search-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255,255,255,0.15);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  /* ====================== TYPE + QUALITY FILTERS ====================== */
  .filter-row-inline {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 10px;
    flex-wrap: wrap;
  }
  .type-filters, .quality-filters {
    display: flex;
    gap: 6px;
  }
  .type-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    padding: 5px 12px;
    border-radius: 16px;
    border: 1.5px solid rgba(255, 255, 255, 0.12);
    background: transparent;
    color: var(--tune-text-muted);
    cursor: pointer;
    transition: all 0.15s;
  }
  .type-pill:hover { border-color: var(--tune-accent); color: var(--tune-text); }
  .type-pill.active {
    background: rgba(255, 255, 255, 0.1);
    border-color: var(--tune-accent);
    color: var(--tune-text);
  }
  .q-pill {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 12px;
    border: 1.5px solid rgba(255, 255, 255, 0.1);
    background: transparent;
    color: var(--tune-text-muted);
    cursor: pointer;
    transition: all 0.15s;
    letter-spacing: 0.3px;
  }
  .q-pill:hover { border-color: var(--tune-accent); color: var(--tune-text); }
  .q-pill.active { background: rgba(255,255,255,0.1); border-color: var(--tune-accent); color: var(--tune-text); }
  .q-pill--hires.active { background: #7030b8; border-color: #7030b8; color: white; }
  .q-pill--cd.active { background: #2060b8; border-color: #2060b8; color: white; }
  .q-pill--lossy.active { background: #806020; border-color: #806020; color: white; }

  /* ====================== SOURCE PILLS ====================== */
  .source-pills {
    display: flex;
    gap: 8px;
    margin-top: 14px;
    flex-wrap: wrap;
  }

  .pill {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 600;
    padding: 6px 16px;
    border-radius: 20px;
    border: 1.5px solid rgba(255, 255, 255, 0.12);
    background: transparent;
    color: var(--tune-text-secondary);
    cursor: pointer;
    transition: all 0.15s ease-out;
    letter-spacing: 0.2px;
  }
  .pill:hover {
    border-color: var(--tune-accent);
    color: var(--tune-text);
  }
  .pill.active {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
  }

  /* ====================== SECTIONS ====================== */
  .section {
    margin-bottom: 36px;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .section-title {
    font-family: var(--font-label);
    font-size: 20px;
    font-weight: 700;
    color: var(--tune-text);
    letter-spacing: -0.3px;
    margin-bottom: 16px;
  }
  .section-head .section-title { margin-bottom: 0; }

  .section h3 {
    font-family: var(--font-label);
    font-size: 20px;
    font-weight: 700;
    color: var(--tune-text);
    letter-spacing: -0.3px;
    margin-bottom: 16px;
  }

  .count {
    font-weight: 400;
    color: var(--tune-text-muted);
    font-size: 16px;
  }

  .link-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.15s;
  }
  .link-btn:hover { color: var(--tune-accent); }

  /* ====================== DISCOVERY ====================== */
  .discovery {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Search history chips */
  .history-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .history-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .history-chip:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: var(--tune-accent);
  }
  .history-chip svg { color: var(--tune-text-muted); }
  .chip-x {
    font-size: 16px;
    line-height: 1;
    color: var(--tune-text-muted);
    margin-left: 2px;
  }
  .chip-x:hover { color: var(--tune-accent); }

  /* Discovery artist row */
  .artist-row {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
  }

  .artist-pill {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.04);
    border: none;
    border-radius: 10px;
    color: var(--tune-text);
    cursor: pointer;
    transition: background 0.15s;
    text-align: left;
  }
  .artist-pill:hover { background: rgba(255, 255, 255, 0.08); }

  .artist-pill-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--tune-accent), #9b59b6);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-label);
    font-size: 18px;
    font-weight: 700;
    color: white;
    flex-shrink: 0;
    overflow: hidden;
  }
  .artist-pill-avatar--img {
    background: none;
  }

  .artist-pill-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .artist-pill-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .artist-pill-plays {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
  }

  /* ====================== RESULTS ====================== */
  .results {
    display: flex;
    flex-direction: column;
  }

  /* TOP ROW: best result + artists */
  .top-row {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 24px;
    margin-bottom: 36px;
    align-items: start;
  }

  .top-result-section { min-width: 0; }
  .top-result-section .section-title { margin-bottom: 12px; }
  .artists-section { min-width: 0; overflow: hidden; }
  .artists-section .section-title { margin-bottom: 12px; }

  .top-result-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding: 20px;
    background: rgba(255, 255, 255, 0.04);
    border: none;
    border-radius: 12px;
    cursor: pointer;
    color: var(--tune-text);
    transition: background 0.2s;
    width: 100%;
    text-align: left;
    position: relative;
  }
  .top-result-card:hover { background: rgba(255, 255, 255, 0.08); }

  .top-result-avatar {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
  }
  .top-result-avatar--letter {
    background: linear-gradient(135deg, var(--tune-accent), #9b59b6);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-label);
    font-size: 36px;
    font-weight: 700;
    color: white;
  }

  .top-result-cover {
    width: 92px;
    height: 92px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .top-result-cover--large {
    width: 110px;
    height: 110px;
  }

  .top-result-card--album, .top-result-card--track {
    flex-direction: row;
    align-items: center;
    gap: 16px;
  }
  .top-result-details {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .top-result-name {
    font-family: var(--font-label);
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.5px;
    line-height: 1.2;
  }
  .top-result-type {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
  }
  .top-result-card:not(.top-result-card--album):not(.top-result-card--track) .top-result-type {
    background: rgba(255, 255, 255, 0.08);
    padding: 3px 10px;
    border-radius: 12px;
    align-self: flex-start;
  }
  .top-result-album {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }
  .top-result-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
  }
  .top-result-year, .top-result-count, .top-result-dur {
    font-family: var(--font-label);
    font-size: 12px;
    color: var(--tune-text-muted);
  }
  .top-result-play-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    color: white;
    background: var(--tune-accent);
    padding: 5px 14px;
    border-radius: 16px;
    margin-top: 4px;
    align-self: flex-start;
  }
  .top-result-badge { position: absolute; top: 16px; right: 16px; }

  /* Track album grouping */
  .track-album-group {
    margin-bottom: 20px;
  }
  .track-album-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 4px;
    margin-bottom: 4px;
  }
  .track-album-cover {
    width: 48px;
    height: 48px;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .track-album-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .track-album-title {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .track-album-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* Artists scroll in results */
  .artists-scroll {
    display: flex;
    gap: 16px;
    overflow-x: auto;
    padding-bottom: 8px;
    scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch;
  }
  .artists-scroll { scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.2) transparent; }
  .artists-scroll::-webkit-scrollbar { height: 3px; }
  .artists-scroll::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 2px; }

  .artist-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    color: var(--tune-text);
    flex-shrink: 0;
    width: 100px;
    scroll-snap-align: start;
    padding: 4px;
    border-radius: 10px;
  }
  .artist-card-main {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--tune-text);
    padding: 4px;
    border-radius: 8px;
    transition: background 0.15s;
    width: 100%;
  }
  .artist-card-main:hover { background: rgba(255, 255, 255, 0.06); }
  .artist-source-badges {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
    justify-content: center;
  }

  /* Source badge buttons */
  .source-badges {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 4px;
  }
  .source-badge-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: transform 0.12s, opacity 0.12s;
    opacity: 0.85;
  }
  .source-badge-btn:hover { transform: scale(1.1); opacity: 1; }
  .source-badge-btn--sm { transform: scale(0.85); }
  .source-badge-btn--sm:hover { transform: scale(0.95); }
  .source-local-badge {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 700;
    color: var(--tune-text);
    background: rgba(255, 255, 255, 0.12);
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.5px;
  }
  .source-local-badge--sm { font-size: 9px; padding: 1px 4px; }

  .top-result-main {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--tune-text);
    text-align: left;
    padding: 0;
  }

  .artist-avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    overflow: hidden;
  }
  .artist-avatar--letter {
    background: var(--tune-surface-selected);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 700;
    color: var(--tune-text-muted);
  }
  .artist-name {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    max-width: 100px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ====================== ALBUM GRID ====================== */
  .album-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 14px;
  }
  .discovery-grid {
    grid-template-columns: repeat(8, 1fr);
  }

  .album-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: none;
    border: none;
    text-align: left;
    padding: 0;
    color: var(--tune-text);
    cursor: pointer;
    min-width: 0;
  }

  .album-card-cover {
    position: relative;
    border-radius: 6px;
    overflow: hidden;
    aspect-ratio: 1;
    background: rgba(255, 255, 255, 0.04);
    width: 100%;
    cursor: pointer;
    border: none;
    padding: 0;
  }
  .album-card-cover :global(img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
    color: white;
  }
  .album-card-cover:hover .cover-overlay { opacity: 1; }

  .cover-badge {
    position: absolute;
    bottom: 6px;
    left: 6px;
    z-index: 1;
  }

  .album-card-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--tune-text);
    text-align: left;
  }

  .album-card-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
  }
  .album-card-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .album-card-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }
  .year {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-text-muted);
  }

  /* ====================== PLAYLISTS ====================== */
  .playlist-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .playlist-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 12px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    border-radius: 8px;
    transition: background 0.15s;
  }
  .playlist-row:hover { background: rgba(255, 255, 255, 0.06); }

  .playlist-icon {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }
  .playlist-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .playlist-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
  }
  .playlist-meta {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }
  .playlist-source {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-text-muted);
    background: rgba(255, 255, 255, 0.06);
    padding: 3px 10px;
    border-radius: 8px;
    flex-shrink: 0;
  }

  /* ====================== TRACKS ====================== */
  .track-actions-bar {
    display: flex;
    gap: 8px;
  }
  .action-pill {
    display: flex;
    align-items: center;
    gap: 5px;
    background: rgba(255, 255, 255, 0.08);
    border: none;
    border-radius: 8px;
    color: var(--tune-text);
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    padding: 6px 14px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .action-pill:hover { background: var(--tune-accent); color: white; }

  .track-list {
    display: flex;
    flex-direction: column;
  }

  .track-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 8px;
    transition: background 0.12s;
  }
  .track-row:hover { background: rgba(255, 255, 255, 0.05); }

  .track-num {
    font-family: var(--font-label);
    font-size: 12px;
    color: var(--tune-text-muted);
    width: 28px;
    text-align: right;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .track-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--tune-text);
    text-align: left;
    padding: 6px 4px;
    min-width: 0;
  }

  .track-art {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
    position: relative;
  }
  .track-art-play {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s;
    color: white;
  }
  .track-row:hover .track-art-play { opacity: 1; }

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
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .track-sub {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .track-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  .track-dur {
    font-family: var(--font-label);
    font-size: 12px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
    width: 42px;
    text-align: right;
  }

  .track-hover-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .track-row:hover .track-hover-actions { opacity: 1; }

  .icon-btn {
    width: 30px;
    height: 30px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    background: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }
  .icon-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
    background: rgba(107, 110, 217, 0.1);
  }

  /* ====================== STATES ====================== */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 60px 20px;
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 14px;
  }
  .spinner {
    width: 24px;
    height: 24px;
    border: 2.5px solid rgba(255, 255, 255, 0.1);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 80px 20px;
    color: var(--tune-text-muted);
    text-align: center;
  }
  .empty-state p {
    font-family: var(--font-body);
    font-size: 15px;
    max-width: 360px;
    line-height: 1.5;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ====================== RESPONSIVE ====================== */
  @media (max-width: 1200px) {
    .album-grid { grid-template-columns: repeat(5, 1fr); }
    .discovery-grid { grid-template-columns: repeat(6, 1fr); }
  }

  @media (max-width: 1024px) {
    .album-grid { grid-template-columns: repeat(4, 1fr); }
    .discovery-grid { grid-template-columns: repeat(5, 1fr); }
    .top-row {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .search-header { padding: 14px 16px 0; }
    .content { padding: 14px 16px 40px; }
    .album-grid, .discovery-grid { grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .artist-row { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); }
    .top-row { grid-template-columns: 1fr; }
    .artist-avatar { width: 64px; height: 64px; }
    .artist-card { width: 84px; }
    .section-title, .section h3 { font-size: 17px; }
  }

  @media (max-width: 480px) {
    .album-grid, .discovery-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .source-pills { gap: 6px; }
    .pill { padding: 5px 12px; font-size: 12px; }
    .search-bar { border-radius: 10px; padding: 0 14px; }
    .search-bar input { padding: 12px 0; font-size: 15px; }
  }
</style>

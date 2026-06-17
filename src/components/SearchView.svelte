<script lang="ts">
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import { notifications } from '../lib/stores/notifications';
  import { activeView, pendingSearchQuery } from '../lib/stores/navigation';
  import { selectedArtist, artistAlbums, selectedAlbum, libraryTab, libraryLoading, albums, tracks as libraryTracks, genres as libraryGenres } from '../lib/stores/library';
  import { activeStreamingService, pendingStreamingAlbum, pendingStreamingArtist, streamingServices } from '../lib/stores/streaming';
  import * as api from '../lib/api';
  import { formatTime } from '../lib/utils';
  import AlbumArt from './AlbumArt.svelte';
  import QualityBadge from './QualityBadge.svelte';
  import ServiceBadge from './ServiceBadge.svelte';
  import type { FederatedSearchResult, Track, Album, Artist, Playlist, StreamingPlaylist, Source } from '../lib/types';
  import { t } from '../lib/i18n';
  import MetadataChips from './MetadataChips.svelte';

  const DISPLAY_FIELDS_KEY = 'tune_metadata_fields';
  const DISPLAY_FIELDS_DEFAULT = ['format', 'genre', 'year'];
  function getDisplayFields(): string[] {
    try {
      const raw = localStorage.getItem(DISPLAY_FIELDS_KEY);
      if (raw) return JSON.parse(raw) as string[];
    } catch {}
    return DISPLAY_FIELDS_DEFAULT;
  }
  let displayFields = $state<string[]>(getDisplayFields());

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
    // Deduplicate
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

  // --- Metadata filter panel ---

  // Active filter selections
  let filterGenre = $state<string | null>(null);
  let filterYear = $state<number | null>(null);
  let filterFormat = $state<string | null>(null);
  let filterSampleRate = $state<number | null>(null);
  let filterBitDepth = $state<number | null>(null);
  let filterSource = $state<string | null>(null);
  let filterDuration = $state<string | null>(null);
  let filterLabel = $state<string>('');
  let filterComposer = $state<string>('');

  // Filtered tracks result
  let filterResults = $state<Track[]>([]);
  let filterTotal = $state<number>(0);
  let filterLoading = $state(false);

  // Whether ANY metadata filter is active
  let hasActiveFilters = $derived(
    filterGenre !== null ||
    filterYear !== null ||
    filterFormat !== null ||
    filterSampleRate !== null ||
    filterBitDepth !== null ||
    filterSource !== null ||
    filterDuration !== null ||
    filterLabel.trim().length > 0 ||
    filterComposer.trim().length > 0
  );

  // Derive genre list from library store
  let availableGenres = $derived(
    $libraryGenres.slice(0, 30).map((g) => g.name)
  );

  // Derive year list from albums store
  let availableYears = $derived.by(() => {
    const yearSet = new Set<number>();
    for (const a of $albums) {
      if (a.year) yearSet.add(a.year);
    }
    return [...yearSet].sort((a, b) => b - a).slice(0, 25);
  });

  // Derive format list from tracks store
  let availableFormats = $derived.by(() => {
    const fmtSet = new Set<string>();
    for (const t of $libraryTracks) {
      if (t.format) fmtSet.add(t.format.toUpperCase());
    }
    const base = ['FLAC', 'WAV', 'MP3', 'AAC', 'DSD', 'ALAC', 'AIFF', 'OGG'];
    for (const b of base) fmtSet.add(b);
    return [...fmtSet].sort();
  });

  // Derive label list from albums store
  let availableLabels = $derived.by(() => {
    const labelSet = new Set<string>();
    for (const a of $albums) {
      if (a.label) labelSet.add(a.label);
    }
    return [...labelSet].sort((a, b) => a.localeCompare(b)).slice(0, 30);
  });

  // Derive composer list from tracks store
  let availableComposers = $derived.by(() => {
    const cSet = new Set<string>();
    for (const t of $libraryTracks) {
      if ((t as any).composer) cSet.add((t as any).composer as string);
    }
    return [...cSet].sort((a, b) => a.localeCompare(b)).slice(0, 30);
  });

  let labelSuggestions = $derived(
    filterLabel.trim().length >= 1
      ? availableLabels.filter((l) => l.toLowerCase().includes(filterLabel.toLowerCase())).slice(0, 8)
      : []
  );
  let composerSuggestions = $derived(
    filterComposer.trim().length >= 1
      ? availableComposers.filter((c) => c.toLowerCase().includes(filterComposer.toLowerCase())).slice(0, 8)
      : []
  );

  // Fixed sample rate options
  const SAMPLE_RATE_OPTIONS: { label: string; value: number }[] = [
    { label: '44.1 kHz', value: 44100 },
    { label: '48 kHz', value: 48000 },
    { label: '88.2 kHz', value: 88200 },
    { label: '96 kHz', value: 96000 },
    { label: '176.4 kHz', value: 176400 },
    { label: '192 kHz', value: 192000 },
    { label: '352.8 kHz', value: 352800 },
    { label: '384 kHz', value: 384000 },
  ];

  const BIT_DEPTH_OPTIONS: { label: string; value: number }[] = [
    { label: '16 bits', value: 16 },
    { label: '24 bits', value: 24 },
    { label: '32 bits', value: 32 },
  ];

  const DURATION_OPTIONS: { label: string; key: string; minMs: number; maxMs: number }[] = [
    { label: '< 3 min', key: 'lt3', minMs: 0, maxMs: 3 * 60 * 1000 },
    { label: '3 - 5 min', key: '3-5', minMs: 3 * 60 * 1000, maxMs: 5 * 60 * 1000 },
    { label: '5 - 10 min', key: '5-10', minMs: 5 * 60 * 1000, maxMs: 10 * 60 * 1000 },
    { label: '10 - 30 min', key: '10-30', minMs: 10 * 60 * 1000, maxMs: 30 * 60 * 1000 },
    { label: '> 30 min', key: 'gt30', minMs: 30 * 60 * 1000, maxMs: Infinity },
  ];

  const SOURCE_OPTIONS = [
    { label: 'Local', key: 'local' },
    { label: 'Tidal', key: 'tidal' },
    { label: 'Qobuz', key: 'qobuz' },
    { label: 'Deezer', key: 'deezer' },
    { label: 'YouTube', key: 'youtube' },
  ];

  let shownFilterFields = $derived.by(() => {
    const fields = displayFields;
    const rows: string[] = [];
    if (fields.includes('genre')) rows.push('genre');
    if (fields.includes('year')) rows.push('year');
    if (fields.includes('format')) rows.push('format');
    rows.push('sample_rate');
    if (fields.includes('bit_depth')) rows.push('bit_depth');
    if (fields.includes('source')) rows.push('source');
    if (fields.includes('duration')) rows.push('duration');
    if (fields.includes('label')) rows.push('label');
    if (fields.includes('composer')) rows.push('composer');
    return rows;
  });

  function applyDurationFilter(tracks: Track[], durationKey: string | null): Track[] {
    if (!durationKey) return tracks;
    const opt = DURATION_OPTIONS.find((o) => o.key === durationKey);
    if (!opt) return tracks;
    return tracks.filter((t) => {
      const ms = t.duration_ms ?? 0;
      return ms >= opt.minMs && (opt.maxMs === Infinity ? true : ms < opt.maxMs);
    });
  }

  // Run filter query when filters change and no search query
  $effect(() => {
    const g = filterGenre;
    const y = filterYear;
    const f = filterFormat;
    const sr = filterSampleRate;
    const bd = filterBitDepth;
    const src = filterSource;
    const dur = filterDuration;
    const lbl = filterLabel.trim();
    const cmp = filterComposer.trim();
    const q = searchQuery.trim();
    if (!g && !y && !f && !sr && !bd && !src && !dur && !lbl && !cmp && !q) {
      filterResults = [];
      filterTotal = 0;
      return;
    }
    if (q) return;
    runFilterSearch(g, y, f, sr, bd, src, dur, lbl, cmp);
  });

  async function runFilterSearch(
    genre: string | null,
    year: number | null,
    format: string | null,
    sampleRate: number | null,
    bitDepth: number | null,
    source: string | null,
    duration: string | null,
    label: string,
    composer: string,
  ) {
    filterLoading = true;
    try {
      const res = await api.getFilteredTracks({
        genre: genre ?? undefined,
        year: year ?? undefined,
        format: format?.toLowerCase() ?? undefined,
        sample_rate: sampleRate ?? undefined,
        bit_depth: bitDepth ?? undefined,
        source: source ?? undefined,
        label: label || undefined,
        composer: composer || undefined,
        limit: 500,
      });
      const durationFiltered = applyDurationFilter(res.items, duration);
      filterResults = durationFiltered;
      filterTotal = duration ? durationFiltered.length : res.total;
    } catch (e) {
      console.error('Filter search error:', e);
      filterResults = [];
      filterTotal = 0;
    }
    filterLoading = false;
  }

  function toggleFilterGenre(g: string) { filterGenre = filterGenre === g ? null : g; }
  function toggleFilterYear(y: number) { filterYear = filterYear === y ? null : y; }
  function toggleFilterFormat(f: string) { filterFormat = filterFormat === f ? null : f; }
  function toggleFilterSampleRate(sr: number) { filterSampleRate = filterSampleRate === sr ? null : sr; }
  function toggleFilterBitDepth(bd: number) { filterBitDepth = filterBitDepth === bd ? null : bd; }
  function toggleFilterSource(src: string) { filterSource = filterSource === src ? null : src; }
  function toggleFilterDuration(key: string) { filterDuration = filterDuration === key ? null : key; }
  function clearAllFilters() {
    filterGenre = null;
    filterYear = null;
    filterFormat = null;
    filterSampleRate = null;
    filterBitDepth = null;
    filterSource = null;
    filterDuration = null;
    filterLabel = '';
    filterComposer = '';
  }

  interface Props {
    onAddToPlaylist?: (track: Track) => void;
  }
  let { onAddToPlaylist }: Props = $props();

  let zone = $derived($currentZone);
  let addToPlaylistLabel = $derived($t('nowplaying.addToPlaylist'));
  let searchQuery = $state('');
  let loading = $state(false);
  let results: FederatedSearchResult | null = $state(null);

  // --- Collapsible filters ---
  let filtersExpanded = $state(false);

  // --- Discovery content ---
  let topArtists = $state<any[]>([]);
  let recentAlbums = $state<Album[]>([]);
  let discoveryLoading = $state(true);

  // Load discovery content on mount
  $effect(() => {
    // Only load once
    if (topArtists.length > 0 || recentAlbums.length > 0) return;
    loadDiscoveryContent();
  });

  async function loadDiscoveryContent() {
    discoveryLoading = true;
    try {
      const [artists, albums] = await Promise.all([
        api.getTopArtists(8).catch(() => []),
        api.getRecentAlbums(12).catch(() => []),
      ]);
      topArtists = artists;
      recentAlbums = albums;
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
        api.federatedSearch(searchQuery.trim(), activeSources),
        includeLocal ? api.getPlaylists().catch(() => [] as Playlist[]) : Promise.resolve([] as Playlist[]),
      ]);
      results = federated;

      // Save to history
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
    try {
      if (track.id) {
        await playAndSync(zone.id, { track_id: track.id });
      } else if (track.source && track.source_id) {
        await playAndSync(zone.id, { source: track.source, source_id: track.source_id });
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
    try {
      if (track.id) {
        await api.addToQueue(zone.id, { track_id: track.id });
        notifications.success(`Ajout a la file : ${track.title}`);
      } else if (track.source && track.source_id) {
        await api.addToQueue(zone.id, { source: track.source, source_id: track.source_id });
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
    try {
      if (album.id) {
        await playAndSync(zone.id, { album_id: album.id });
      } else if (album.source && album.source_id) {
        await playAndSync(zone.id, { source: album.source, streaming_album_id: album.source_id });
      }
    } catch (e) {
      console.error('Play album error:', e);
    }
  }

  function openAlbum(album: Album) {
    if (album.id) {
      selectedAlbum.set(album);
      libraryTab.set('albums');
      activeView.set('library');
    } else if (album.source && album.source_id) {
      activeStreamingService.set(album.source);
      pendingStreamingAlbum.set(album);
      activeView.set('streaming');
    }
  }

  async function selectArtist(artist: Artist) {
    if (artist.id) {
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
    } else if (artist.source_id) {
      const source = (artist as any).source ?? Object.keys($streamingServices).find(s => $streamingServices[s]?.authenticated);
      if (source) {
        activeStreamingService.set(source);
        pendingStreamingArtist.set(artist);
        activeView.set('streaming');
      }
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

  // Compute grouped results from federated search
  let groupedArtists = $derived.by(() => {
    if (!results) return [];
    const all: (Artist & { _source?: string })[] = [];
    if (results.local?.artists) {
      for (const a of results.local.artists) all.push({ ...a, _source: 'local' });
    }
    if (results.services) {
      for (const [svc, data] of Object.entries(results.services)) {
        for (const a of data.artists) all.push({ ...a, _source: svc });
      }
    }
    // Deduplicate by name (case-insensitive)
    const seen = new Set<string>();
    return all.filter(a => {
      const key = a.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
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

  // Streaming-only results (not local)
  let streamingOnlyAlbums = $derived.by(() => {
    if (!results?.services) return [];
    const localTitles = new Set(
      (results.local?.albums ?? []).map(a => `${a.title}|||${a.artist_name}`.toLowerCase())
    );
    const streaming: (Album & { _source?: string })[] = [];
    for (const [svc, data] of Object.entries(results.services)) {
      for (const a of data.albums) {
        const key = `${a.title}|||${a.artist_name}`.toLowerCase();
        if (!localTitles.has(key)) {
          streaming.push({ ...a, _source: svc });
        }
      }
    }
    return streaming;
  });

  let hasResults = $derived(
    groupedArtists.length > 0 ||
    groupedAlbums.length > 0 ||
    groupedTracks.length > 0 ||
    playlistMatches.length > 0
  );

  let showDiscovery = $derived(!searchQuery.trim() && !hasActiveFilters);

  function searchFromHistory(query: string) {
    searchQuery = query;
  }
</script>

<div class="search-view">
  <!-- Search header -->
  <div class="search-header">
    <h2>{$t('search.title')}</h2>
    <div class="search-bar-row">
      <div class="search-bar">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input
          type="text"
          placeholder={$t('search.placeholder')}
          bind:value={searchQuery}
        />
        {#if searchQuery}
          <button class="clear-input-btn" onclick={() => { searchQuery = ''; }} title="Effacer" aria-label="Effacer la recherche">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        {/if}
        {#if loading}
          <div class="search-spinner"></div>
        {/if}
      </div>
      <button
        class="filter-toggle-btn"
        class:active={filtersExpanded}
        onclick={() => { filtersExpanded = !filtersExpanded; }}
        title="Filtres"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="6" y1="12" x2="18" y2="12" />
          <line x1="8" y1="18" x2="16" y2="18" />
        </svg>
        Filtres
        {#if hasActiveFilters}
          <span class="filter-count-badge"></span>
        {/if}
      </button>
    </div>

    {#if availableSources.length > 1}
      <div class="source-filters">
        <button
          class="source-chip"
          class:active={allSelected}
          onclick={selectAllSources}
        >{$t('common.all')}</button>
        {#each availableSources as src}
          <button
            class="source-chip"
            class:active={!allSelected && selectedSources.has(src.key)}
            onclick={() => toggleSource(src.key)}
          >{src.label}</button>
        {/each}
      </div>
    {/if}

    <!-- Collapsible filters -->
    {#if filtersExpanded}
      <div class="filter-panel" class:visible={filtersExpanded}>
        {#if shownFilterFields.includes('genre') && availableGenres.length > 0}
          <div class="filter-row">
            <span class="filter-label">GENRE</span>
            <div class="filter-chips">
              {#each availableGenres as g}
                <button class="filter-chip" class:active={filterGenre === g} onclick={() => toggleFilterGenre(g)}>{g}{filterGenre === g ? ' x' : ''}</button>
              {/each}
            </div>
          </div>
        {/if}
        {#if shownFilterFields.includes('year') && availableYears.length > 0}
          <div class="filter-row">
            <span class="filter-label">ANNEE</span>
            <div class="filter-chips">
              {#each availableYears as y}
                <button class="filter-chip" class:active={filterYear === y} onclick={() => toggleFilterYear(y)}>{y}{filterYear === y ? ' x' : ''}</button>
              {/each}
            </div>
          </div>
        {/if}
        {#if shownFilterFields.includes('format')}
          <div class="filter-row">
            <span class="filter-label">FORMAT</span>
            <div class="filter-chips">
              {#each availableFormats as f}
                <button class="filter-chip filter-chip--format" class:active={filterFormat === f} onclick={() => toggleFilterFormat(f)}>{f}{filterFormat === f ? ' x' : ''}</button>
              {/each}
            </div>
          </div>
        {/if}
        {#if shownFilterFields.includes('sample_rate')}
          <div class="filter-row">
            <span class="filter-label">SAMPLE RATE</span>
            <div class="filter-chips">
              {#each SAMPLE_RATE_OPTIONS as opt}
                <button class="filter-chip filter-chip--rate" class:active={filterSampleRate === opt.value} onclick={() => toggleFilterSampleRate(opt.value)}>{opt.label}{filterSampleRate === opt.value ? ' x' : ''}</button>
              {/each}
            </div>
          </div>
        {/if}
        {#if shownFilterFields.includes('bit_depth')}
          <div class="filter-row">
            <span class="filter-label">BIT DEPTH</span>
            <div class="filter-chips">
              {#each BIT_DEPTH_OPTIONS as opt}
                <button class="filter-chip filter-chip--depth" class:active={filterBitDepth === opt.value} onclick={() => toggleFilterBitDepth(opt.value)}>{opt.label}{filterBitDepth === opt.value ? ' x' : ''}</button>
              {/each}
            </div>
          </div>
        {/if}
        {#if shownFilterFields.includes('source')}
          <div class="filter-row">
            <span class="filter-label">SOURCE</span>
            <div class="filter-chips">
              {#each SOURCE_OPTIONS as opt}
                <button class="filter-chip filter-chip--source" class:active={filterSource === opt.key} onclick={() => toggleFilterSource(opt.key)}>{opt.label}{filterSource === opt.key ? ' x' : ''}</button>
              {/each}
            </div>
          </div>
        {/if}
        {#if shownFilterFields.includes('duration')}
          <div class="filter-row">
            <span class="filter-label">DUREE</span>
            <div class="filter-chips">
              {#each DURATION_OPTIONS as opt}
                <button class="filter-chip filter-chip--dur" class:active={filterDuration === opt.key} onclick={() => toggleFilterDuration(opt.key)}>{opt.label}{filterDuration === opt.key ? ' x' : ''}</button>
              {/each}
            </div>
          </div>
        {/if}
        {#if shownFilterFields.includes('label')}
          <div class="filter-row">
            <span class="filter-label">LABEL</span>
            <div class="filter-autocomplete">
              <input class="filter-text-input" type="text" placeholder="Rechercher un label..." bind:value={filterLabel} />
              {#if labelSuggestions.length > 0}
                <div class="filter-suggestions">
                  {#each labelSuggestions as s}
                    <button class="filter-suggestion" onclick={() => { filterLabel = s; }}>{s}</button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/if}
        {#if shownFilterFields.includes('composer')}
          <div class="filter-row">
            <span class="filter-label">COMPOSITEUR</span>
            <div class="filter-autocomplete">
              <input class="filter-text-input" type="text" placeholder="Rechercher un compositeur..." bind:value={filterComposer} />
              {#if composerSuggestions.length > 0}
                <div class="filter-suggestions">
                  {#each composerSuggestions as s}
                    <button class="filter-suggestion" onclick={() => { filterComposer = s; }}>{s}</button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/if}
        {#if hasActiveFilters}
          <div class="filter-actions">
            <button class="clear-filters-btn" onclick={clearAllFilters}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              Effacer les filtres
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- CONTENT AREA -->

  {#if showDiscovery}
    <!-- Discovery content when no search query -->
    <div class="discovery">
      <!-- Recent searches -->
      {#if searchHistory.length > 0}
        <section class="discovery-section">
          <div class="section-header">
            <h3>Recherches recentes</h3>
            <button class="section-action" onclick={clearSearchHistory}>Effacer</button>
          </div>
          <div class="recent-searches">
            {#each searchHistory.slice(0, 5) as entry}
              <div class="recent-search-item">
                <button class="recent-search-btn" onclick={() => searchFromHistory(entry.query)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="1,4 1,10 7,10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                  <span>{entry.query}</span>
                </button>
                <button class="recent-search-remove" onclick={() => removeFromSearchHistory(entry.query)} title="Supprimer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Top artists -->
      {#if topArtists.length > 0}
        <section class="discovery-section">
          <h3>Artistes populaires</h3>
          <div class="artists-scroll">
            {#each topArtists as artist}
              <button class="discovery-artist-card" onclick={() => {
                // TopArtist has name/artist_name, try to find in library
                const name = artist.artist_name || artist.name;
                searchQuery = name;
              }}>
                <div class="discovery-artist-avatar">
                  <span>{(artist.artist_name || artist.name || '?').charAt(0).toUpperCase()}</span>
                </div>
                <span class="discovery-artist-name truncate">{artist.artist_name || artist.name}</span>
                <span class="discovery-artist-plays">{artist.plays ?? artist.play_count ?? 0} lectures</span>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Recent albums -->
      {#if recentAlbums.length > 0}
        <section class="discovery-section">
          <h3>Albums recents</h3>
          <div class="albums-grid">
            {#each recentAlbums as album}
              <button class="discovery-album-card" onclick={() => openAlbum(album)}>
                <div class="discovery-album-cover">
                  <AlbumArt coverPath={album.cover_path} size={0} alt={album.title} />
                  <div class="album-play-overlay">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><polygon points="5,3 19,12 5,21" /></svg>
                  </div>
                </div>
                <span class="discovery-album-title truncate">{album.title}</span>
                {#if album.artist_name}
                  <span class="discovery-album-artist truncate">{album.artist_name}</span>
                {/if}
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if !discoveryLoading && topArtists.length === 0 && recentAlbums.length === 0 && searchHistory.length === 0}
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <p>{$t('search.hint')}</p>
        </div>
      {/if}
    </div>

  {:else if hasActiveFilters && !searchQuery.trim()}
    <!-- Filter results (no text query) -->
    {#if filterLoading}
      <div class="loading">
        <div class="spinner"></div>
        {$t('search.searching')}
      </div>
    {:else}
      <div class="filter-results">
        <div class="filter-results-count">
          {filterTotal} {$t('common.tracks')}
          {#if filterTotal !== filterResults.length && filterResults.length > 0}
            <span class="filter-count-note">(affichage des {filterResults.length} premiers)</span>
          {/if}
        </div>
        {#if filterResults.length === 0}
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <p>{$t('common.noResult')}</p>
          </div>
        {:else}
          <div class="track-list">
            {#each filterResults as trk}
              <div class="track-item">
                <button class="track-play" onclick={() => playTrack(trk)}>
                  <AlbumArt coverPath={trk.cover_path} albumId={trk.album_id} size={40} alt={trk.title} />
                  <div class="track-info">
                    <span class="track-title truncate">{trk.title}</span>
                    <span class="track-artist truncate">{trk.artist_name ?? ''}{trk.album_title ? ` - ${trk.album_title}` : ''}</span>
                    <MetadataChips track={trk} fields={displayFields} />
                  </div>
                  <QualityBadge format={trk.format} sampleRate={trk.sample_rate} bitDepth={trk.bit_depth} source={trk.source} />
                  <span class="track-duration">{formatTime(trk.duration_ms)}</span>
                </button>
                <div class="track-actions">
                  <button class="track-action-btn" onclick={(e) => { e.stopPropagation(); addTrackToQueue(trk); }} title="Ajouter a la file">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  </button>
                  {#if onAddToPlaylist && (trk.id || trk.source_id)}
                    <button class="track-action-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(trk); }} title={addToPlaylistLabel}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 12H3m13 0h-2m0 0V8m0 4v4m6-8v8a2 2 0 01-2 2H5" /><line x1="3" y1="16" x2="11" y2="16" /><line x1="3" y1="8" x2="8" y2="8" /></svg>
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

  {:else if searchQuery.trim()}
    <!-- Search results -->
    {#if loading && !results}
      <div class="loading">
        <div class="spinner"></div>
        {$t('search.searching')}
      </div>
    {:else if results && !hasResults}
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="8" x2="14" y2="14" /><line x1="14" y1="8" x2="8" y2="14" /></svg>
        <p>{$t('search.noResults').replace('{query}', searchQuery)}</p>
      </div>
    {:else if results}
      <div class="results">
        <!-- Playlists -->
        {#if playlistMatches.length > 0}
          <section class="result-section">
            <h3 class="result-section-title">{$t('nav.playlists')} ({playlistMatches.length})</h3>
            <div class="playlist-results">
              {#each playlistMatches as pl}
                <button class="playlist-result-item" onclick={() => playPlaylist(pl)}>
                  <span class="playlist-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M9 18V5l12-3v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="15" r="3" /></svg>
                  </span>
                  <div class="playlist-result-info">
                    <span class="playlist-result-name truncate">{pl.name}</span>
                    <span class="playlist-result-meta">{pl.trackCount} {$t('common.tracks')}</span>
                  </div>
                  <span class="playlist-source-badge">{pl.source}</span>
                </button>
              {/each}
            </div>
          </section>
        {/if}

        <!-- Artists -->
        {#if groupedArtists.length > 0}
          <section class="result-section">
            <h3 class="result-section-title">{$t('common.artists')} ({groupedArtists.length})</h3>
            <div class="artists-scroll">
              {#each groupedArtists as artist}
                <button class="artist-card" onclick={() => selectArtist(artist)}>
                  {#if artist.image_path}
                    <div class="artist-card-avatar">
                      <AlbumArt coverPath={artist.image_path} size={72} alt={artist.name} round />
                    </div>
                  {:else}
                    <div class="artist-card-avatar artist-card-avatar--placeholder">
                      <span>{artist.name.charAt(0).toUpperCase()}</span>
                    </div>
                  {/if}
                  <span class="artist-card-name truncate">{artist.name}</span>
                  {#if (artist as any)._source && (artist as any)._source !== 'local'}
                    <ServiceBadge source={(artist as any)._source} compact />
                  {/if}
                </button>
              {/each}
            </div>
          </section>
        {/if}

        <!-- Albums -->
        {#if groupedAlbums.length > 0}
          <section class="result-section">
            <h3 class="result-section-title">{$t('common.albums')} ({groupedAlbums.length})</h3>
            <div class="albums-grid">
              {#each groupedAlbums as album}
                <div class="album-card" role="group">
                  <button class="album-card-cover" onclick={() => openAlbum(album)} title={album.title}>
                    <AlbumArt coverPath={album.cover_path} size={0} alt={album.title} />
                    <span class="album-play-overlay" onclick={(e) => { e.stopPropagation(); playAlbum(album); }} role="button" tabindex="-1">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><polygon points="5,3 19,12 5,21" /></svg>
                    </span>
                  </button>
                  <button class="album-card-info" onclick={() => openAlbum(album)}>
                    <span class="album-card-title truncate">{album.title}</span>
                    {#if album.artist_name}
                      <span class="album-card-artist truncate">{album.artist_name}</span>
                    {/if}
                    <div class="album-card-meta">
                      {#if album.year}
                        <span class="album-card-year">{album.year}</span>
                      {/if}
                      <QualityBadge format={album.format} sampleRate={album.sample_rate} bitDepth={album.bit_depth} source={album.source} />
                    </div>
                  </button>
                </div>
              {/each}
            </div>
          </section>
        {/if}

        <!-- Tracks -->
        {#if groupedTracks.length > 0}
          <section class="result-section">
            <div class="tracks-header">
              <h3 class="result-section-title">Pistes ({groupedTracks.length})</h3>
              {#if groupedTracks.filter(t => t.id).length > 1}
                <div class="tracks-actions">
                  <button class="action-btn" onclick={() => playAllTracks(groupedTracks)} title="Tout lire">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5,3 19,12 5,21" /></svg>
                    Tout lire
                  </button>
                  <button class="action-btn" onclick={() => playAllTracks(groupedTracks, true)} title="Lecture aleatoire">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="16,3 21,3 21,8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21,16 21,21 16,21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>
                    Aleatoire
                  </button>
                </div>
              {/if}
            </div>
            <div class="track-list">
              {#each groupedTracks as track}
                <div class="track-item">
                  <button class="track-play" onclick={() => playTrack(track)}>
                    <AlbumArt coverPath={track.cover_path} albumId={track.album_id} size={40} alt={track.title} />
                    <div class="track-info">
                      <span class="track-title truncate">{track.title}</span>
                      <span class="track-artist truncate">
                        {track.artist_name ?? ''}
                        {track.album_title ? ` - ${track.album_title}` : ''}
                      </span>
                      {#if track.composer}
                        <span class="track-matched-field">Compositeur: {track.composer}</span>
                      {/if}
                      <MetadataChips track={track} fields={displayFields} />
                    </div>
                    {#if (track as any)._source && (track as any)._source !== 'local'}
                      <ServiceBadge source={(track as any)._source} compact />
                    {/if}
                    <QualityBadge format={track.format} sampleRate={track.sample_rate} bitDepth={track.bit_depth} source={track.source} />
                    <span class="track-duration">{formatTime(track.duration_ms)}</span>
                  </button>
                  <div class="track-actions">
                    <button class="track-action-btn" onclick={(e) => { e.stopPropagation(); addTrackToQueue(track); }} title="Ajouter a la file">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>
                    {#if onAddToPlaylist && (track.id || track.source_id)}
                      <button class="track-action-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(track); }} title={addToPlaylistLabel}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 12H3m13 0h-2m0 0V8m0 4v4m6-8v8a2 2 0 01-2 2H5" /><line x1="3" y1="16" x2="11" y2="16" /><line x1="3" y1="8" x2="8" y2="8" /></svg>
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </section>
        {/if}

        <!-- Streaming-only albums -->
        {#if streamingOnlyAlbums.length > 0}
          <section class="result-section streaming-section">
            <h3 class="result-section-title">Aussi en streaming ({streamingOnlyAlbums.length})</h3>
            <div class="albums-grid">
              {#each streamingOnlyAlbums as album}
                <div class="album-card" role="group">
                  <button class="album-card-cover" onclick={() => openAlbum(album)} title={album.title}>
                    <AlbumArt coverPath={album.cover_path} size={0} alt={album.title} />
                    <span class="album-play-overlay" onclick={(e) => { e.stopPropagation(); playAlbum(album); }} role="button" tabindex="-1">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><polygon points="5,3 19,12 5,21" /></svg>
                    </span>
                    {#if (album as any)._source}
                      <div class="album-service-badge"><ServiceBadge source={(album as any)._source} compact /></div>
                    {/if}
                  </button>
                  <button class="album-card-info" onclick={() => openAlbum(album)}>
                    <span class="album-card-title truncate">{album.title}</span>
                    {#if album.artist_name}
                      <span class="album-card-artist truncate">{album.artist_name}</span>
                    {/if}
                  </button>
                </div>
              {/each}
            </div>
          </section>
        {/if}
      </div>
    {/if}
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
    flex-shrink: 0;
  }

  .search-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
    margin-bottom: var(--space-md);
  }

  .search-bar-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .search-bar {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    background: rgba(60, 60, 63, 0.5);
    border-radius: var(--radius-md);
    padding: 0 var(--space-md);
    transition: border-color 0.15s ease-out;
    border: 1px solid transparent;
  }

  .search-bar:focus-within {
    border-color: var(--tune-accent);
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
    padding: 10px 0;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 15px;
    outline: none;
  }

  .search-bar input::placeholder {
    color: var(--tune-text-muted);
  }

  .clear-input-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    border-radius: 50%;
    transition: color 0.12s;
  }
  .clear-input-btn:hover { color: var(--tune-text); }

  .search-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  .filter-toggle-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(60, 60, 63, 0.5);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text-secondary);
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.3px;
    padding: 8px 14px;
    cursor: pointer;
    transition: all 0.12s ease-out;
    position: relative;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .filter-toggle-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-text);
  }
  .filter-toggle-btn.active {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
  }
  .filter-count-badge {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 8px;
    height: 8px;
    background: var(--tune-accent);
    border-radius: 50%;
  }
  .filter-toggle-btn.active .filter-count-badge {
    background: white;
  }

  .source-filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin-top: var(--space-sm);
  }

  .source-chip {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.3px;
    padding: 4px 12px;
    border-radius: var(--radius-xl);
    border: 1px solid var(--tune-border);
    background: transparent;
    color: var(--tune-text-secondary);
    cursor: pointer;
    transition: all 0.12s ease-out;
  }
  .source-chip:hover {
    border-color: var(--tune-accent);
    color: var(--tune-text);
  }
  .source-chip.active {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
  }

  /* --- Filter panel (collapsible) --- */
  .filter-panel {
    background: var(--tune-grey2);
    border-radius: var(--radius-md);
    padding: var(--space-md) var(--space-lg);
    margin-top: var(--space-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    animation: slideDown 0.2s ease-out;
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .filter-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    min-height: 28px;
  }

  .filter-label {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--tune-text-muted);
    flex-shrink: 0;
    width: 80px;
    padding-top: 5px;
  }

  .filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    flex: 1;
    overflow: hidden;
  }

  .filter-chip {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.2px;
    padding: 3px 10px;
    border-radius: var(--radius-xl);
    border: 1px solid var(--tune-border);
    background: transparent;
    color: var(--tune-text-secondary);
    cursor: pointer;
    transition: all 0.12s ease-out;
    white-space: nowrap;
  }
  .filter-chip:hover {
    border-color: var(--tune-accent);
    color: var(--tune-text);
  }
  .filter-chip.active {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
    font-weight: 600;
  }
  .filter-chip--format.active { background: #2060b8; border-color: #2060b8; }
  .filter-chip--rate.active { background: #7030b8; border-color: #7030b8; }
  .filter-chip--depth.active { background: #186090; border-color: #186090; }
  .filter-chip--source.active { background: #20806a; border-color: #20806a; }
  .filter-chip--dur.active { background: #804820; border-color: #804820; }

  .filter-autocomplete {
    position: relative;
    flex: 1;
  }
  .filter-text-input {
    width: 100%;
    max-width: 320px;
    background: rgba(60, 60, 63, 0.5);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    padding: 4px 10px;
    outline: none;
    transition: border-color 0.12s ease-out;
  }
  .filter-text-input:focus { border-color: var(--tune-accent); }
  .filter-text-input::placeholder { color: var(--tune-text-muted); }

  .filter-suggestions {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 200px;
    max-width: 320px;
    background: var(--tune-surface, #1e1e20);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    z-index: 100;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .filter-suggestion {
    text-align: left;
    background: none;
    border: none;
    padding: 6px 12px;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text);
    cursor: pointer;
    transition: background 0.1s;
  }
  .filter-suggestion:hover { background: var(--tune-surface-hover); }

  .filter-actions {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--space-xs);
  }
  .clear-filters-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    color: var(--tune-text-muted);
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.3px;
    padding: 3px 10px;
    cursor: pointer;
    transition: all 0.12s ease-out;
  }
  .clear-filters-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  /* --- Discovery content --- */
  .discovery {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .discovery-section h3 {
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
    color: var(--tune-text);
    margin-bottom: var(--space-md);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-md);
  }
  .section-header h3 { margin-bottom: 0; }
  .section-action {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.3px;
    cursor: pointer;
    transition: color 0.12s;
  }
  .section-action:hover { color: var(--tune-accent); }

  /* Recent searches */
  .recent-searches {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .recent-search-item {
    display: flex;
    align-items: center;
    gap: 4px;
    border-radius: var(--radius-sm);
    transition: background 0.12s;
  }
  .recent-search-item:hover { background: var(--tune-surface-hover); }
  .recent-search-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 8px 10px;
    background: none;
    border: none;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
    cursor: pointer;
    text-align: left;
  }
  .recent-search-btn svg { color: var(--tune-text-muted); flex-shrink: 0; }
  .recent-search-remove {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 6px;
    display: flex;
    align-items: center;
    border-radius: 50%;
    opacity: 0;
    transition: opacity 0.12s, color 0.12s;
  }
  .recent-search-item:hover .recent-search-remove { opacity: 1; }
  .recent-search-remove:hover { color: var(--tune-accent); }

  /* Discovery artist cards (horizontal scroll) */
  .artists-scroll {
    display: flex;
    gap: var(--space-md);
    overflow-x: auto;
    padding-bottom: var(--space-sm);
    scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch;
  }
  .artists-scroll::-webkit-scrollbar { height: 4px; }
  .artists-scroll::-webkit-scrollbar-thumb { background: var(--tune-border); border-radius: 2px; }

  .discovery-artist-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: var(--space-sm);
    background: none;
    border: none;
    cursor: pointer;
    color: var(--tune-text);
    flex-shrink: 0;
    width: 90px;
    scroll-snap-align: start;
    transition: transform 0.15s;
  }
  .discovery-artist-card:hover { transform: translateY(-2px); }
  .discovery-artist-avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--tune-accent), rgba(var(--tune-accent-rgb, 99, 102, 241), 0.6));
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-label);
    font-size: 22px;
    font-weight: 700;
    color: white;
  }
  .discovery-artist-name {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    max-width: 90px;
  }
  .discovery-artist-plays {
    font-family: var(--font-body);
    font-size: 10px;
    color: var(--tune-text-muted);
  }

  /* Albums grid */
  .albums-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-md);
  }

  .discovery-album-card,
  .album-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: none;
    border: none;
    text-align: left;
    padding: 0;
    color: var(--tune-text);
  }
  .discovery-album-card { cursor: pointer; }

  .discovery-album-cover,
  .album-card-cover {
    position: relative;
    border-radius: var(--radius-lg);
    overflow: hidden;
    aspect-ratio: 1;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    width: 100%;
  }

  .album-play-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s ease-out;
    color: white;
    cursor: pointer;
  }
  .discovery-album-cover:hover .album-play-overlay,
  .album-card-cover:hover .album-play-overlay {
    opacity: 1;
  }

  .album-service-badge {
    position: absolute;
    bottom: 6px;
    left: 6px;
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

  .discovery-album-title,
  .album-card-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
  }

  .discovery-album-artist,
  .album-card-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }

  .album-card-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }
  .album-card-year {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-text-muted);
  }

  /* --- Result sections --- */
  .results {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .result-section {
    display: flex;
    flex-direction: column;
  }

  .result-section-title {
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text);
    margin-bottom: var(--space-md);
    padding-bottom: var(--space-xs);
    border-bottom: 1px solid var(--tune-border);
  }

  .streaming-section .result-section-title {
    color: var(--tune-accent);
  }

  /* Artist cards in results */
  .artist-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: var(--space-sm);
    background: none;
    border: none;
    cursor: pointer;
    color: var(--tune-text);
    flex-shrink: 0;
    width: 90px;
    scroll-snap-align: start;
    transition: transform 0.15s;
  }
  .artist-card:hover { transform: translateY(-2px); }
  .artist-card-avatar {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
  }
  .artist-card-avatar--placeholder {
    background: var(--tune-surface-selected);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-label);
    font-size: 24px;
    font-weight: 700;
    color: var(--tune-text-muted);
  }
  .artist-card-name {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    max-width: 90px;
  }

  /* Tracks */
  .tracks-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .tracks-header .result-section-title { flex: 1; }
  .tracks-actions {
    display: flex;
    gap: var(--space-sm);
  }
  .action-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(255,255,255,0.08);
    border: none;
    border-radius: var(--radius-sm);
    color: var(--tune-text);
    font-size: 11px;
    font-weight: 500;
    padding: 4px 10px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .action-btn:hover { background: var(--tune-accent); color: #fff; }

  .track-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .track-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border-radius: var(--radius-sm);
    transition: background 0.12s ease-out;
  }
  .track-item:hover { background: var(--tune-surface-hover); }

  .track-play {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 6px 4px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    min-width: 0;
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
  .track-matched-field {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-accent);
    font-style: italic;
  }
  .track-duration {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .track-actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.12s;
    flex-shrink: 0;
  }
  .track-item:hover .track-actions { opacity: 1; }

  .track-action-btn {
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
  }
  .track-action-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  /* Playlist results */
  .playlist-results {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .playlist-result-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 8px 4px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease-out;
    border-radius: var(--radius-sm);
  }
  .playlist-result-item:hover { background: var(--tune-surface-hover); }
  .playlist-icon {
    flex-shrink: 0;
    width: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--tune-text-muted);
  }
  .playlist-result-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .playlist-result-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
  }
  .playlist-result-meta {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }
  .playlist-source-badge {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-text-muted);
    background: var(--tune-grey2);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    letter-spacing: 0.3px;
  }

  /* Filter results count */
  .filter-results {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .filter-results-count {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    color: var(--tune-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    padding-bottom: var(--space-xs);
    border-bottom: 1px solid var(--tune-border);
  }
  .filter-count-note {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    margin-left: var(--space-sm);
  }

  /* Loading and empty states */
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

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    padding: var(--space-2xl);
    color: var(--tune-text-muted);
    text-align: center;
  }
  .empty-state p {
    font-family: var(--font-body);
    font-size: 14px;
    max-width: 320px;
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* --- Responsive --- */
  @media (max-width: 1024px) {
    .albums-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (max-width: 768px) {
    .search-view {
      padding: var(--space-md) var(--space-md);
    }
    .search-header h2 {
      font-size: 22px;
    }
    .albums-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .artists-scroll {
      gap: var(--space-sm);
    }
    .discovery-artist-card {
      width: 76px;
    }
    .discovery-artist-avatar {
      width: 52px;
      height: 52px;
      font-size: 18px;
    }
    .artist-card {
      width: 76px;
    }
    .artist-card-avatar {
      width: 60px;
      height: 60px;
    }
    .filter-row {
      flex-direction: column;
      gap: 4px;
    }
    .filter-label {
      width: auto;
      padding-top: 0;
    }
  }

  @media (max-width: 480px) {
    .search-bar-row {
      flex-direction: column;
      gap: 8px;
    }
    .filter-toggle-btn {
      align-self: flex-start;
    }
    .albums-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-sm);
    }
  }
</style>

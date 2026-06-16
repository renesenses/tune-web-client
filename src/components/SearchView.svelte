<script lang="ts">
  import { currentZone, playAndSync } from '../lib/stores/zones';
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

  // --- Metadata filter panel (shown when no search query) ---

  // Active filter selections
  let filterGenre = $state<string | null>(null);
  let filterYear = $state<number | null>(null);
  let filterFormat = $state<string | null>(null);
  let filterSampleRate = $state<number | null>(null);

  // Filtered tracks result (when metadata filters are active)
  let filterResults = $state<Track[]>([]);
  let filterTotal = $state<number>(0);
  let filterLoading = $state(false);

  // Whether ANY metadata filter is active
  let hasActiveFilters = $derived(
    filterGenre !== null || filterYear !== null || filterFormat !== null || filterSampleRate !== null
  );

  // Derive genre list from library store
  let availableGenres = $derived(
    $libraryGenres.slice(0, 30).map((g) => g.name)
  );

  // Derive year list from albums store (sorted desc, top 20)
  let availableYears = $derived.by(() => {
    const yearSet = new Set<number>();
    for (const a of $albums) {
      if (a.year) yearSet.add(a.year);
    }
    return [...yearSet].sort((a, b) => b - a).slice(0, 20);
  });

  // Derive format list from tracks store
  let availableFormats = $derived.by(() => {
    const fmtSet = new Set<string>();
    for (const t of $libraryTracks) {
      if (t.format) fmtSet.add(t.format.toUpperCase());
    }
    // Also include static common formats; merge with what library has
    const base = ['FLAC', 'WAV', 'MP3', 'AAC', 'DSD', 'ALAC', 'AIFF', 'OGG'];
    for (const b of base) fmtSet.add(b);
    return [...fmtSet].sort();
  });

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

  // Which filter rows to show (from localStorage)
  let shownFilterFields = $derived.by(() => {
    const fields = displayFields;
    const rows: string[] = [];
    if (fields.includes('genre')) rows.push('genre');
    if (fields.includes('year')) rows.push('year');
    if (fields.includes('format')) rows.push('format');
    // Always show sample_rate if format is shown (they go together)
    rows.push('sample_rate');
    return rows;
  });

  // Run filter query whenever any filter changes
  $effect(() => {
    const g = filterGenre;
    const y = filterYear;
    const f = filterFormat;
    const sr = filterSampleRate;
    const q = searchQuery.trim();
    if (!g && !y && !f && !sr && !q) {
      filterResults = [];
      filterTotal = 0;
      return;
    }
    // Don't run if there's a text query (text search handles it)
    if (q) return;
    runFilterSearch(g, y, f, sr);
  });

  async function runFilterSearch(genre: string | null, year: number | null, format: string | null, sampleRate: number | null) {
    filterLoading = true;
    try {
      const res = await api.getFilteredTracks({
        genre: genre ?? undefined,
        year: year ?? undefined,
        format: format?.toLowerCase() ?? undefined,
        sample_rate: sampleRate ?? undefined,
        limit: 200,
      });
      filterResults = res.items;
      filterTotal = res.total;
    } catch (e) {
      console.error('Filter search error:', e);
      filterResults = [];
      filterTotal = 0;
    }
    filterLoading = false;
  }

  function toggleFilterGenre(g: string) {
    filterGenre = filterGenre === g ? null : g;
  }
  function toggleFilterYear(y: number) {
    filterYear = filterYear === y ? null : y;
  }
  function toggleFilterFormat(f: string) {
    filterFormat = filterFormat === f ? null : f;
  }
  function toggleFilterSampleRate(sr: number) {
    filterSampleRate = filterSampleRate === sr ? null : sr;
  }
  function clearAllFilters() {
    filterGenre = null;
    filterYear = null;
    filterFormat = null;
    filterSampleRate = null;
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

  $effect(() => {
    const pending = $pendingSearchQuery;
    if (pending) {
      searchQuery = pending;
      pendingSearchQuery.set('');
      handleSearch();
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
    // If all are now selected, clear the set (meaning "all")
    if (next.size === availableSources.length) {
      selectedSources = new Set();
    } else {
      selectedSources = next;
    }
    // Re-run search if we already have results
    if (results || playlistMatches.length > 0) {
      handleSearch();
    }
  }

  function selectAllSources() {
    selectedSources = new Set();
    if (results || playlistMatches.length > 0) {
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

      // Federated search + playlist search in parallel
      const [federated, localPlaylists] = await Promise.all([
        api.federatedSearch(searchQuery.trim(), activeSources),
        includeLocal ? api.getPlaylists().catch(() => [] as Playlist[]) : Promise.resolve([] as Playlist[]),
      ]);
      results = federated;

      // Filter local playlists by name
      const matches: PlaylistMatch[] = localPlaylists
        .filter((p) => p.name.toLowerCase().includes(query))
        .map((p) => ({
          name: p.name,
          trackCount: p.track_count ?? 0,
          source: 'Local',
          localId: p.id ?? undefined,
        }));

      // Search streaming playlists for each authenticated service
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
      console.warn('No zone selected, cannot play track:', track.title);
      return;
    }
    try {
      console.log('Playing track:', track.title, 'id:', track.id, 'source:', track.source, 'source_id:', track.source_id);
      if (track.id) {
        await playAndSync(zone.id, { track_id: track.id });
      } else if (track.source && track.source_id) {
        await playAndSync(zone.id, { source: track.source, source_id: track.source_id });
      } else {
        console.error('Track has no id and no source_id:', track);
      }
    } catch (e) {
      console.error('Play track error:', e);
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

  function allSources(results: FederatedSearchResult): { name: string; data: { tracks: Track[]; albums: Album[]; artists: Artist[] } }[] {
    const sources: { name: string; data: { tracks: Track[]; albums: Album[]; artists: Artist[] } }[] = [];
    if (results.local && (results.local.tracks.length > 0 || results.local.albums.length > 0 || results.local.artists.length > 0)) {
      sources.push({ name: 'Local', data: results.local });
    }
    for (const [service, data] of Object.entries(results.services ?? {})) {
      if (data.tracks.length > 0 || data.albums.length > 0 || data.artists.length > 0) {
        sources.push({ name: service.charAt(0).toUpperCase() + service.slice(1), data });
      }
    }
    return sources;
  }
</script>

<div class="search-view">
  <div class="search-header">
    <h2>{$t('search.title')}</h2>
    <div class="search-bar">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      <input
        type="text"
        placeholder={$t('search.placeholder')}
        bind:value={searchQuery}
        onkeydown={(e) => e.key === 'Enter' && handleSearch()}
      />
      <button class="search-btn" onclick={handleSearch}>{$t('common.search')}</button>
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
  </div>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      {$t('search.searching')}
    </div>
  {:else if results}
    {@const sources = allSources(results)}
    {#if playlistMatches.length > 0}
      <div class="source-section">
        <h3 class="source-title">{$t('nav.playlists')}</h3>
        <div class="playlist-results">
          {#each playlistMatches as pl}
            <button class="playlist-result-item" onclick={() => playPlaylist(pl)}>
              <span class="playlist-icon">&#127925;</span>
              <div class="playlist-result-info">
                <span class="playlist-result-name truncate">{pl.name}</span>
                <span class="playlist-result-meta">{pl.trackCount} {$t('settings.tracks').toLowerCase()}</span>
              </div>
              <span class="playlist-source-badge">{pl.source}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
    {#if sources.length === 0 && playlistMatches.length === 0}
      <div class="empty">{$t('search.noResults').replace('{query}', searchQuery)}</div>
    {:else}
      {#each sources as source}
        <div class="source-section">
          <h3 class="source-title">{source.name}</h3>

          {#if source.data.albums.length > 0}
            <h4 class="subsection-title">{$t('common.albums')}</h4>
            <div class="albums-row">
              {#each source.data.albums as album}
                <button class="album-card" onclick={() => openAlbum(album)}>
                  <AlbumArt coverPath={album.cover_path} size={120} alt={album.title} />
                  <span class="album-card-title truncate">{album.title}</span>
                  {#if album.artist_name}
                    <span class="album-card-artist truncate">{album.artist_name}</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}

          {#if source.data.tracks.length > 0}
            <div class="tracks-header">
              <h4 class="subsection-title">{$t('home.tracks')}</h4>
              {#if source.name === 'Local' && source.data.tracks.length > 1}
                <div class="tracks-actions">
                  <button class="action-btn" onclick={() => playAllTracks(source.data.tracks)} title="Tout lire">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5,3 19,12 5,21" /></svg>
                    Tout lire
                  </button>
                  <button class="action-btn" onclick={() => playAllTracks(source.data.tracks, true)} title="Lecture aléatoire">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="16,3 21,3 21,8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21,16 21,21 16,21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>
                    Aléatoire
                  </button>
                </div>
              {/if}
            </div>
            <div class="track-list">
              {#each source.data.tracks as t}
                <div class="track-item">
                  <button class="track-play" onclick={() => playTrack(t)}>
                    <AlbumArt coverPath={t.cover_path} albumId={t.album_id} size={36} alt={t.title} />
                    <div class="track-info">
                      <span class="track-title truncate">{t.title}</span>
                      <span class="track-artist truncate">{t.artist_name ?? ''}{t.album_title ? ` - ${t.album_title}` : ''}</span>
                      <MetadataChips track={t} fields={displayFields} />
                    </div>
                    <ServiceBadge source={t.source} compact />
                    <QualityBadge format={t.format} sampleRate={t.sample_rate} bitDepth={t.bit_depth} source={t.source} />
                    <span class="track-duration">{formatTime(t.duration_ms)}</span>
                  </button>
                  {#if onAddToPlaylist && (t.id || t.source_id)}
                    <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={addToPlaylistLabel}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 12H3m13 0h-2m0 0V8m0 4v4m6-8v8a2 2 0 01-2 2H5" /><line x1="3" y1="16" x2="11" y2="16" /><line x1="3" y1="8" x2="8" y2="8" /></svg>
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          {#if source.data.artists.length > 0}
            <h4 class="subsection-title">{$t('common.artists')}</h4>
            <div class="artist-list">
              {#each source.data.artists as artist}
                <button class="artist-chip" onclick={() => selectArtist(artist)}>
                  <div class="artist-avatar">{artist.name.charAt(0).toUpperCase()}</div>
                  <span>{artist.name}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  {:else}
    <!-- Metadata filter panel — shown when no text query is entered -->
    <div class="filter-panel">

      {#if shownFilterFields.includes('genre') && availableGenres.length > 0}
        <div class="filter-row">
          <span class="filter-label">{$t('common.genres')}</span>
          <div class="filter-chips">
            {#each availableGenres as g}
              <button
                class="filter-chip"
                class:active={filterGenre === g}
                onclick={() => toggleFilterGenre(g)}
              >{g}{filterGenre === g ? ' ×' : ''}</button>
            {/each}
          </div>
        </div>
      {/if}

      {#if shownFilterFields.includes('year') && availableYears.length > 0}
        <div class="filter-row">
          <span class="filter-label">{$t('common.years')}</span>
          <div class="filter-chips">
            {#each availableYears as y}
              <button
                class="filter-chip"
                class:active={filterYear === y}
                onclick={() => toggleFilterYear(y)}
              >{y}{filterYear === y ? ' ×' : ''}</button>
            {/each}
          </div>
        </div>
      {/if}

      {#if shownFilterFields.includes('format')}
        <div class="filter-row">
          <span class="filter-label">Format</span>
          <div class="filter-chips">
            {#each availableFormats as f}
              <button
                class="filter-chip filter-chip--format"
                class:active={filterFormat === f}
                onclick={() => toggleFilterFormat(f)}
              >{f}{filterFormat === f ? ' ×' : ''}</button>
            {/each}
          </div>
        </div>
      {/if}

      <div class="filter-row">
        <span class="filter-label">Sample Rate</span>
        <div class="filter-chips">
          {#each SAMPLE_RATE_OPTIONS as opt}
            <button
              class="filter-chip filter-chip--rate"
              class:active={filterSampleRate === opt.value}
              onclick={() => toggleFilterSampleRate(opt.value)}
            >{opt.label}{filterSampleRate === opt.value ? ' ×' : ''}</button>
          {/each}
        </div>
      </div>

      {#if hasActiveFilters}
        <div class="filter-actions">
          <button class="clear-filters-btn" onclick={clearAllFilters}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            Effacer les filtres
          </button>
        </div>
      {/if}
    </div>

    {#if filterLoading}
      <div class="loading">
        <div class="spinner"></div>
        {$t('search.searching')}
      </div>
    {:else if hasActiveFilters}
      <div class="filter-results">
        <div class="filter-count">
          {filterTotal} {$t('common.tracks')}
          {#if filterTotal !== filterResults.length && filterResults.length > 0}
            <span class="filter-count-note">(affichage des {filterResults.length} premiers)</span>
          {/if}
        </div>
        {#if filterResults.length === 0}
          <div class="empty">{$t('common.noResult')}</div>
        {:else}
          <div class="track-list">
            {#each filterResults as trk}
              <div class="track-item">
                <button class="track-play" onclick={() => playTrack(trk)}>
                  <AlbumArt coverPath={trk.cover_path} albumId={trk.album_id} size={36} alt={trk.title} />
                  <div class="track-info">
                    <span class="track-title truncate">{trk.title}</span>
                    <span class="track-artist truncate">{trk.artist_name ?? ''}{trk.album_title ? ` - ${trk.album_title}` : ''}</span>
                    <MetadataChips track={trk} fields={displayFields} />
                  </div>
                  <QualityBadge format={trk.format} sampleRate={trk.sample_rate} bitDepth={trk.bit_depth} source={trk.source} />
                  <span class="track-duration">{formatTime(trk.duration_ms)}</span>
                </button>
                {#if onAddToPlaylist && (trk.id || trk.source_id)}
                  <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(trk); }} title={addToPlaylistLabel}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 12H3m13 0h-2m0 0V8m0 4v4m6-8v8a2 2 0 01-2 2H5" /><line x1="3" y1="16" x2="11" y2="16" /><line x1="3" y1="8" x2="8" y2="8" /></svg>
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <div class="empty">{$t('search.hint')}</div>
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
  }

  .search-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
    margin-bottom: var(--space-md);
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    background: rgba(60, 60, 63, 0.5);
    border-radius: var(--radius-md);
    padding: 0 var(--space-md);
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
    padding: var(--space-sm) 0;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
    outline: none;
  }

  .search-bar input::placeholder {
    color: var(--tune-text-muted);
  }

  .search-btn {
    background: var(--tune-accent);
    color: white;
    border: none;
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: background 0.12s ease-out;
  }

  .search-btn:hover {
    background: var(--tune-accent-hover);
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

  .source-section {
    margin-bottom: var(--space-xl);
  }

  .source-title {
    font-family: var(--font-label);
    font-size: 18px;
    font-weight: 600;
    color: var(--tune-accent);
    margin-bottom: var(--space-md);
    padding-bottom: var(--space-xs);
    border-bottom: 1px solid var(--tune-border);
  }

  .subsection-title {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--tune-text-muted);
    margin-bottom: var(--space-sm);
    margin-top: var(--space-md);
  }

  .tracks-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .tracks-header .subsection-title { margin-bottom: 0; }
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

  .albums-row {
    display: flex;
    gap: var(--space-md);
    overflow-x: auto;
    padding-bottom: var(--space-sm);
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
    flex-shrink: 0;
  }

  .album-card:hover {
    opacity: 0.85;
  }

  .album-card-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    max-width: 120px;
  }

  .album-card-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    max-width: 120px;
  }

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
    transition: background 0.12s ease-out;
  }

  .track-item:hover {
    background: var(--tune-surface-hover);
  }

  .track-play {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 8px 0;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    min-width: 0;
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
    flex-shrink: 0;
  }

  .track-item:hover .add-playlist-btn {
    opacity: 1;
  }

  .add-playlist-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
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

  .audio-format {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-text-muted);
    letter-spacing: 0.3px;
    flex-shrink: 0;
  }

  .artist-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .artist-chip {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-md);
    background: var(--tune-grey2);
    border: none;
    border-radius: var(--radius-xl);
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text);
    cursor: pointer;
    transition: background 0.12s ease-out;
  }

  .artist-chip:hover {
    background: var(--tune-surface-hover);
  }

  .artist-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--tune-surface-selected);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
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
  }

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

  .playlist-result-item:hover {
    background: var(--tune-surface-hover);
  }

  .playlist-icon {
    font-size: 18px;
    flex-shrink: 0;
    width: 28px;
    text-align: center;
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

  /* --- Metadata filter panel --- */
  .filter-panel {
    background: var(--tune-grey2);
    border-radius: var(--radius-md);
    padding: var(--space-md) var(--space-lg);
    margin-bottom: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
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

  .filter-chip--format.active {
    background: #2060b8;
    border-color: #2060b8;
  }

  .filter-chip--rate.active {
    background: #7030b8;
    border-color: #7030b8;
  }

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

  /* --- Filter results --- */
  .filter-results {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .filter-count {
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
</style>

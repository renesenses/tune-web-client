<script lang="ts">
  import { libraryTab, libraryLoading, albums, artists, tracks, selectedAlbum, albumTracks, selectedArtist, artistAlbums, genres, type LibraryTab } from '../lib/stores/library';
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import { queueTracks, queuePosition } from '../lib/stores/queue';
  import { currentProfileId } from '../lib/stores/profile';
  import * as api from '../lib/api';
  import { notifications } from '../lib/stores/notifications';
  import { formatTime, formatDuration, formatAudioBadge } from '../lib/utils';
  import AlbumArt from './AlbumArt.svelte';
  import AlbumEditModal from './AlbumEditModal.svelte';
  import TrackEditModal from './TrackEditModal.svelte';
  import HeartButton from './HeartButton.svelte';
  import type { Album, Artist, Track, TrackCredit } from '../lib/types';
  import { t as tr, locale } from '../lib/i18n';
  import type { ArtistMetadata } from '../lib/types';

  function observeHeight(node: HTMLElement, callback: (h: number) => void) {
    const ro = new ResizeObserver(entries => {
      for (const e of entries) callback(e.contentRect.height);
    });
    ro.observe(node);
    callback(node.clientHeight);
    return { destroy() { ro.disconnect(); } };
  }

  interface Props {
    onAddToPlaylist?: (track: Track) => void;
  }
  let { onAddToPlaylist }: Props = $props();

  let editingAlbum = $state<Album | null>(null);
  let editingTrack = $state<Track | null>(null);
  let writingAlbumTags = $state(false);
  let writeTagsMessage = $state<string | null>(null);

  // Artist metadata
  let artistMetadata = $state<ArtistMetadata | null>(null);
  let artistMetadataLoading = $state(false);
  let artistMetadataError = $state(false);
  let openSections = $state<Record<string, boolean>>({});

  // Album bio
  let albumBio = $state<string | null>(null);
  let albumBioLoading = $state(false);
  let albumBioAlbumId = $state<number | null>(null);
  let showAlbumBio = $state(false);

  // Album rating
  let albumRating = $state(0);
  let albumRatingNote = $state('');
  let albumRatingLoaded = $state(false);
  let albumRatingAlbumId = $state<number | null>(null);
  let ratingSubmitting = $state(false);

  async function loadAlbumRating(albumId: number) {
    if (albumId === albumRatingAlbumId && albumRatingLoaded) return;
    albumRatingAlbumId = albumId;
    albumRatingLoaded = false;
    try {
      const r = await api.getAlbumRating(albumId);
      albumRating = r.rating ?? 0;
      albumRatingNote = r.note ?? '';
      albumRatingLoaded = true;
    } catch {
      albumRating = 0;
      albumRatingNote = '';
      albumRatingLoaded = true;
    }
  }

  async function submitRating(albumId: number, star: number) {
    ratingSubmitting = true;
    try {
      const newRating = star === albumRating ? 0 : star;
      await api.rateAlbum(albumId, newRating, albumRatingNote);
      albumRating = newRating;
      notifications.success(newRating > 0 ? `Note: ${newRating}/5` : 'Note retirée');
    } catch (e) {
      console.error('Rate album error:', e);
      notifications.error('Erreur notation');
    }
    ratingSubmitting = false;
  }

  async function submitRatingNote(albumId: number) {
    ratingSubmitting = true;
    try {
      await api.rateAlbum(albumId, albumRating, albumRatingNote);
      notifications.success('Note enregistrée');
    } catch (e) {
      console.error('Rate album note error:', e);
    }
    ratingSubmitting = false;
  }

  async function loadAlbumBio(albumId: number) {
    if (albumId === albumBioAlbumId && albumBio !== null) return;
    albumBioAlbumId = albumId;
    albumBioLoading = true;
    try {
      const r = await api.getAlbumBio(albumId);
      albumBio = r.bio;
    } catch {
      albumBio = null;
    }
    albumBioLoading = false;
  }

  // Track credits
  let expandedTrackCredits = $state<number | null>(null);
  let trackCreditsMap = $state<Record<number, TrackCredit[]>>({});
  let trackCreditsLoading = $state<number | null>(null);

  // Artist credits
  let artistCredits = $state<TrackCredit[] | null>(null);
  let artistCreditsLoading = $state(false);

  async function toggleTrackCredits(trackId: number) {
    if (expandedTrackCredits === trackId) {
      expandedTrackCredits = null;
      return;
    }
    expandedTrackCredits = trackId;
    if (trackCreditsMap[trackId]) return;
    trackCreditsLoading = trackId;
    try {
      const credits = await api.getTrackCredits(trackId);
      trackCreditsMap = { ...trackCreditsMap, [trackId]: credits };
    } catch (e) {
      console.error('Load track credits error:', e);
      trackCreditsMap = { ...trackCreditsMap, [trackId]: [] };
    }
    trackCreditsLoading = null;
  }

  async function loadArtistCredits(artistId: number) {
    artistCreditsLoading = true;
    try {
      artistCredits = await api.getArtistCredits(artistId);
    } catch (e) {
      console.error('Load artist credits error:', e);
      artistCredits = [];
    }
    artistCreditsLoading = false;
  }

  function formatRole(role: string): string {
    const key = `credits.${role}`;
    const translated = $tr(key);
    return translated !== key ? translated : role.charAt(0).toUpperCase() + role.slice(1);
  }

  function groupCreditsByRole(credits: TrackCredit[]): Record<string, TrackCredit[]> {
    const groups: Record<string, TrackCredit[]> = {};
    for (const c of credits) {
      const role = c.role || 'performer';
      if (!groups[role]) groups[role] = [];
      groups[role].push(c);
    }
    return groups;
  }

  function uniqueInstruments(credits: TrackCredit[]): string[] {
    const set = new Set<string>();
    for (const c of credits) {
      if (c.instrument) set.add(c.instrument);
    }
    return [...set].sort();
  }

  async function handleWriteAlbumTags(albumId: number) {
    writingAlbumTags = true;
    writeTagsMessage = null;
    try {
      const result = await api.writeAlbumTags(albumId);
      writeTagsMessage = `Tags gravés : ${result.success}/${result.tracks_processed} pistes`;
      setTimeout(() => writeTagsMessage = null, 5000);
    } catch (e: any) {
      writeTagsMessage = `Erreur : ${e?.message || e}`;
    }
    writingAlbumTags = false;
  }

  function openAlbumEdit(e: MouseEvent, album: Album) {
    e.stopPropagation();
    editingAlbum = album;
  }

  function openTrackEdit(e: MouseEvent, track: Track) {
    e.stopPropagation();
    editingTrack = track;
  }

  function handleAlbumSaved(updated: Album) {
    albums.update(list => list.map(a => a.id === updated.id ? updated : a));
    if ($selectedAlbum?.id === updated.id) selectedAlbum.set(updated);
  }

  function handleTrackSaved(updated: Track) {
    tracks.update(list => list.map(t => t.id === updated.id ? updated : t));
    albumTracks.update(list => list.map(t => t.id === updated.id ? updated : t));
  }

  let zone = $derived($currentZone);
  let searchQuery = $state('');
  let selectedGenre = $state<string | null>(null);
  let formatFilter = $state<string | null>(null);
  let qualityFilter = $state<string | null>(null);
  let albumQualityFilter = $state<string | null>(null);
  let albumFormatFilter = $state<string | null>(null);
  let albumSampleRateFilter = $state<number | null>(null);

  // Favorites filter
  let albumFavoritesFilter = $state(false);
  let trackFavoritesFilter = $state(false);
  let favAlbumIds = $state<Set<number>>(new Set());
  let favTrackIds = $state<Set<number>>(new Set());
  let favoritesLoaded = $state(false);

  async function loadFavoriteIds() {
    const pid = $currentProfileId;
    if (!pid) return;
    try {
      const result = await api.getFavorites(pid);
      favAlbumIds = new Set((result.albums ?? []).map((a: Album) => a.id).filter(Boolean) as number[]);
      favTrackIds = new Set((result.tracks ?? []).map((t: Track) => t.id).filter(Boolean) as number[]);
      favoritesLoaded = true;
    } catch (e) {
      console.error('Load favorite IDs error:', e);
    }
  }

  $effect(() => {
    const _pid = $currentProfileId;
    if (_pid) loadFavoriteIds();
  });

  // Virtual scroll state
  const TRACK_ROW_HEIGHT = 52;
  const OVERSCAN = 10;
  let trackListEl = $state<HTMLDivElement | null>(null);
  let scrollTop = $state(0);
  let containerHeight = $state(600);
  let visibleTracks = $derived.by(() => {
    const total = filteredTracks.length;
    const startIdx = Math.max(0, Math.floor(scrollTop / TRACK_ROW_HEIGHT) - OVERSCAN);
    const endIdx = Math.min(total, Math.ceil((scrollTop + containerHeight) / TRACK_ROW_HEIGHT) + OVERSCAN);
    return { startIdx, endIdx, totalHeight: total * TRACK_ROW_HEIGHT };
  });

  type QualityBucket = { key: string; label: string; match: (t: Track) => boolean };
  const qualityBuckets: QualityBucket[] = [
    { key: 'dsd', label: 'DSD', match: t => t.format === 'dsd' || t.format === 'dsf' || t.format === 'dff' || (t.file_path ?? '').toLowerCase().endsWith('.dsf') || (t.file_path ?? '').toLowerCase().endsWith('.dff') },
    { key: 'hires', label: 'Hi-Res', match: t => t.format !== 'dsd' && ((t.sample_rate ?? 0) > 48000 || (t.bit_depth ?? 0) > 16) },
    { key: 'cd', label: 'CD', match: t => t.format !== 'dsd' && (t.sample_rate ?? 0) <= 48000 && (t.bit_depth ?? 0) <= 16 && !['mp3', 'aac', 'ogg', 'opus', 'wma'].includes(t.format ?? '') },
    { key: 'lossy', label: 'Lossy', match: t => ['mp3', 'aac', 'ogg', 'opus', 'wma'].includes(t.format ?? '') },
  ];

  // Albums filtered by search only (for quality chip counts)
  let searchFilteredAlbums = $derived.by(() => {
    if (!searchQuery.trim()) return $albums;
    const terms = searchQuery.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    return $albums.filter(a => terms.every(q =>
      a.title.toLowerCase().includes(q)
      || (a.artist_name ?? '').toLowerCase().includes(q)
      || (a.genre ?? '').toLowerCase().includes(q)
      || String(a.year ?? '').includes(q)
    ));
  });

  // Albums filtered by search + quality + format + sample rate + favorites (final display)
  let filteredAlbums = $derived.by(() => {
    let result = searchFilteredAlbums;
    if (albumQualityFilter) result = result.filter(a => a.quality === albumQualityFilter);
    if (albumFormatFilter) result = result.filter(a => a.format === albumFormatFilter);
    if (albumSampleRateFilter) result = result.filter(a => (a.sample_rate ?? 0) >= albumSampleRateFilter);
    if (albumFavoritesFilter) result = result.filter(a => a.id !== null && favAlbumIds.has(a.id!));
    return result;
  });

  let albumFormats = $derived(
    [...new Set(searchFilteredAlbums.map(a => a.format).filter(Boolean))].sort() as string[]
  );

  let albumSampleRates = $derived(
    [...new Set(searchFilteredAlbums.map(a => a.sample_rate).filter(Boolean))].sort((a, b) => (a ?? 0) - (b ?? 0)) as number[]
  );

  let filteredArtists = $derived(
    searchQuery.trim()
      ? $artists.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : $artists
  );

  let availableFormats = $derived(
    [...new Set($tracks.map(t => t.format).filter(Boolean))].sort() as string[]
  );

  let qualityCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const b of qualityBuckets) {
      counts[b.key] = $tracks.filter(b.match).length;
    }
    return counts;
  });

  let filteredTracks = $derived.by(() => {
    let result = $tracks;
    if (formatFilter) {
      result = result.filter(t => t.format === formatFilter);
    }
    if (qualityFilter) {
      const bucket = qualityBuckets.find(b => b.key === qualityFilter);
      if (bucket) result = result.filter(bucket.match);
    }
    if (trackFavoritesFilter) {
      result = result.filter(t => t.id !== null && favTrackIds.has(t.id!));
    }
    if (searchQuery.trim()) {
      const terms = searchQuery.toLowerCase().split(/\s+/).filter(t => t.length > 0);
      result = result.filter(t => terms.every(q =>
        t.title.toLowerCase().includes(q)
        || (t.artist_name ?? '').toLowerCase().includes(q)
        || (t.album_title ?? '').toLowerCase().includes(q)
      ));
    }
    return result;
  });

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

  function initials(name: string): string {
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.charAt(0).toUpperCase();
  }

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
      const result = await api.getAllAlbums();
      albums.set(result);
    } catch (e) {
      console.error('Load albums error:', e);
    }
    libraryLoading.set(false);
  }

  async function loadArtists() {
    libraryLoading.set(true);
    try {
      const result = await api.getAllArtists();
      artists.set(result);
    } catch (e) {
      console.error('Load artists error:', e);
    }
    libraryLoading.set(false);
  }

  async function loadTracks() {
    libraryLoading.set(true);
    try {
      const result = await api.getAllTracks();
      tracks.set(result);
    } catch (e) {
      console.error('Load tracks error:', e);
    }
    libraryLoading.set(false);
  }

  async function selectAlbumDetail(album: Album) {
    if (!album.id) return;
    selectedArtist.set(null);
    expandedTrackCredits = null;
    trackCreditsMap = {};
    albumBio = null;
    albumBioAlbumId = null;
    showAlbumBio = false;
    albumRating = 0;
    albumRatingNote = '';
    albumRatingLoaded = false;
    albumRatingAlbumId = null;
    libraryLoading.set(true);
    try {
      // Fetch full album if cover_path is missing (e.g. navigating from tracks view)
      const full = album.cover_path !== undefined ? album : await api.getAlbum(album.id);
      selectedAlbum.set(full);
      const result = await api.getAlbumTracks(album.id);
      albumTracks.set(result);
    } catch (e) {
      console.error('Load album tracks error:', e);
      selectedAlbum.set(album);
    }
    libraryLoading.set(false);
  }

  async function selectArtistDetail(artist: Artist) {
    if (!artist.id) return;
    selectedArtist.set(artist);
    selectedAlbum.set(null);
    artistMetadata = null;
    artistMetadataError = false;
    artistCredits = null;
    openSections = {};
    libraryLoading.set(true);
    try {
      const result = await api.getArtistAlbums(artist.id);
      artistAlbums.set(result);
    } catch (e) {
      console.error('Load artist albums error:', e);
    }
    libraryLoading.set(false);
    // Lazy-load metadata + credits (non-blocking)
    loadArtistMetadata(artist.id);
    loadArtistCredits(artist.id);
  }

  async function loadArtistMetadata(artistId: number) {
    artistMetadataLoading = true;
    try {
      const result = await api.getArtistMetadata(artistId);
      // API returns {data: {...}, enrichment_status: "..."}
      const raw = (result as any)?.data ?? result;
      if (raw.bio_fr) raw.bio = raw.bio_fr;
      if (!raw.enrichment_status && (result as any)?.enrichment_status) {
        raw.enrichment_status = (result as any).enrichment_status;
      }
      artistMetadata = raw;
    } catch (e) {
      console.error('Load artist metadata error:', e);
      artistMetadataError = true;
    }
    artistMetadataLoading = false;
  }

  function toggleSection(key: string) {
    openSections = { ...openSections, [key]: !openSections[key] };
  }

  async function navigateToSimilarArtist(name: string) {
    try {
      const allArtists = await api.getArtists(5000);
      const match = allArtists.find((a: Artist) => a.name.toLowerCase() === name.toLowerCase());
      if (match) {
        selectArtistDetail(match);
      } else {
        notifications.info(`${name} n'est pas dans votre bibliothèque`);
      }
    } catch (e) {
      console.error('Navigate to similar artist error:', e);
    }
  }

  let artistBio = $derived.by(() => {
    if (!artistMetadata) return null;
    if ($locale === 'en' && artistMetadata.bio_en) return artistMetadata.bio_en;
    return artistMetadata.bio ?? artistMetadata.bio_en ?? null;
  });

  function goBack() {
    selectedAlbum.set(null);
    selectedArtist.set(null);
    albumTracks.set([]);
    artistAlbums.set([]);
    artistMetadata = null;
    artistMetadataError = false;
    artistMetadataLoading = false;
  }

  async function playAlbum(albumId: number) {
    if (!zone?.id) {
      notifications.error('Aucune zone sélectionnée — sélectionnez une zone pour lancer la lecture');
      return;
    }
    try {
      await playAndSync(zone.id, { album_id: albumId });
    } catch (e) {
      console.error('Play album error:', e);
      notifications.error('Erreur de lecture : ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function playTrack(trackId: number) {
    if (!zone?.id) {
      notifications.error('Aucune zone sélectionnée — sélectionnez une zone pour lancer la lecture');
      return;
    }
    try {
      const idx = $albumTracks.findIndex(t => t.id === trackId);
      if (idx >= 0) {
        const ids = $albumTracks.slice(idx).map(t => t.id).filter(Boolean) as number[];
        await playAndSync(zone.id, { track_ids: ids });
      } else {
        await playAndSync(zone.id, { track_id: trackId });
      }
    } catch (e) {
      console.error('Play track error:', e);
      notifications.error('Erreur de lecture : ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function playNext(track: Track) {
    if (!zone?.id) {
      notifications.error('Aucune zone sélectionnée');
      return;
    }
    try {
      const qs = await api.getQueue(zone.id);
      const nextPos = qs.position + 1;
      if (track.id) {
        await api.addToQueue(zone.id, { track_id: track.id, position: nextPos });
      } else if (track.source && track.source_id) {
        await api.addToQueue(zone.id, { source: track.source, source_id: track.source_id, position: nextPos });
      }
      const updated = await api.getQueue(zone.id);
      queueTracks.set(updated.tracks);
      queuePosition.set(updated.position);
      notifications.success(`"${track.title}" — lire ensuite`);
    } catch (e: any) {
      notifications.error(e?.message || 'Erreur');
    }
  }

  async function addTrackToQueue(track: Track) {
    if (!zone?.id) {
      notifications.error('Aucune zone sélectionnée — sélectionnez une zone');
      return;
    }
    try {
      if (track.id) {
        await api.addToQueue(zone.id, { track_id: track.id });
      } else if (track.source && track.source_id) {
        await api.addToQueue(zone.id, { source: track.source, source_id: track.source_id });
      }
      // Refresh queue after add
      const qs = await api.getQueue(zone.id);
      queueTracks.set(qs.tracks);
      queuePosition.set(qs.position);
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
        {$tr('common.back')}
      </button>
    </div>
    <div class="album-detail">
      <div class="album-detail-header">
        <AlbumArt coverPath={$selectedAlbum.cover_path} albumId={$selectedAlbum.id} size={320} alt={$selectedAlbum.title} />
        <div class="album-detail-info">
          <h2>{$selectedAlbum.title}</h2>
          {#if $selectedAlbum.artist_name}
            <button class="detail-artist-link" onclick={() => { if ($selectedAlbum?.artist_id) selectArtistDetail({ id: $selectedAlbum.artist_id, name: $selectedAlbum.artist_name! }); }}>{$selectedAlbum.artist_name}</button>
          {/if}
          <div class="detail-meta">
            {#if $selectedAlbum.year}
              <span>{$selectedAlbum.year}</span>
            {/if}
            {#if $selectedAlbum.genre}
              <span>{$selectedAlbum.genre}</span>
            {/if}
            {#if $albumTracks.length > 0}
              <span>{$albumTracks.length} {$tr('common.tracks')}</span>
            {/if}
            {#if albumTotalDuration > 0}
              <span>{formatDuration(albumTotalDuration)}</span>
            {/if}
          </div>
          {#if $selectedAlbum.source && $selectedAlbum.source !== 'local'}
            <span class="source-badge">{$selectedAlbum.source}</span>
          {/if}
          <div class="detail-actions">
            <button class="play-all-btn" onclick={() => $selectedAlbum?.id && playAlbum($selectedAlbum.id)}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z" /></svg>
              {$tr('library.playAlbum')}
            </button>
            <button class="edit-btn" onclick={(e) => $selectedAlbum && openAlbumEdit(e, $selectedAlbum)} title={$tr('metadata.editAlbum')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              {$tr('metadata.editAlbum')}
            </button>
            {#if !$selectedAlbum.source || $selectedAlbum.source === 'local'}
              <button class="write-tags-btn" onclick={() => $selectedAlbum?.id && handleWriteAlbumTags($selectedAlbum.id)} disabled={writingAlbumTags}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /></svg>
                {writingAlbumTags ? 'Gravure...' : 'Graver tags'}
              </button>
            {/if}
          </div>
          {#if writeTagsMessage}
            <div class="write-tags-message">{writeTagsMessage}</div>
          {/if}
          <button class="bio-toggle-btn" onclick={() => { showAlbumBio = !showAlbumBio; if (showAlbumBio && $selectedAlbum?.id) loadAlbumBio($selectedAlbum.id); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            {showAlbumBio ? 'Masquer notes' : 'Notes / Bio'}
          </button>
          {#if showAlbumBio}
            <div class="album-bio-section">
              {#if albumBioLoading}
                <div class="spinner-sm"></div>
              {:else if albumBio}
                <p class="album-bio-text">{albumBio}</p>
              {:else}
                <p class="album-bio-empty">Aucune note disponible pour cet album</p>
              {/if}
            </div>
          {/if}
          <!-- Album Rating -->
          {#if $selectedAlbum?.id}
            {@const ratingAlbumId = $selectedAlbum.id}
            {#if !albumRatingLoaded && albumRatingAlbumId !== ratingAlbumId}
              {(() => { loadAlbumRating(ratingAlbumId); return ''; })()}
            {/if}
            <div class="album-rating-section">
              <div class="album-stars">
                {#each [1, 2, 3, 4, 5] as star}
                  <button
                    class="star-btn"
                    class:filled={star <= albumRating}
                    disabled={ratingSubmitting}
                    onclick={() => submitRating(ratingAlbumId, star)}
                  >
                    <svg viewBox="0 0 24 24" fill={star <= albumRating ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" width="18" height="18">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </button>
                {/each}
              </div>
              <div class="album-rating-note">
                <input
                  type="text"
                  class="rating-note-input"
                  placeholder="Note personnelle..."
                  bind:value={albumRatingNote}
                  onkeydown={(e) => e.key === 'Enter' && submitRatingNote(ratingAlbumId)}
                  onblur={() => { if (albumRatingNote !== '' || albumRating > 0) submitRatingNote(ratingAlbumId); }}
                />
              </div>
            </div>
          {/if}
        </div>
      </div>
      {#if hasMultipleDiscs}
        {#each tracksByDisc as [discNum, discTracks]}
          <div class="disc-header">{$tr('library.disc').replace('{num}', String(discNum))}</div>
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
                {#if t.format}<span class="audio-format">{formatAudioBadge(t)}</span>{/if}
                <span class="track-duration">{formatTime(t.duration_ms)}</span>
                <span class="track-heart" onclick={(e) => e.stopPropagation()}><HeartButton trackId={t.id} size={14} /></span>
                <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); addTrackToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
              <button class="play-next-btn" onclick={(e) => { e.stopPropagation(); playNext(t); }} title="Lire ensuite">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
              </button>
                {#if onAddToPlaylist && (t.id || t.source_id)}
                  <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={$tr('nowplaying.addToPlaylist')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" /><line x1="16" y1="3" x2="16" y2="11" /><line x1="12" y1="7" x2="20" y2="7" /></svg>
                  </button>
                {/if}
                <button class="credits-btn" class:active={expandedTrackCredits === t.id} onclick={(e) => { e.stopPropagation(); t.id && toggleTrackCredits(t.id); }} title={$tr('artist.credits')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                </button>
                <button class="edit-track-btn" onclick={(e) => { e.stopPropagation(); openTrackEdit(e, t); }} title={$tr('metadata.editTrack')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </button>
              </div>
              {#if expandedTrackCredits === t.id}
                <div class="track-credits-row">
                  {#if trackCreditsLoading === t.id}
                    <div class="spinner-sm"></div>
                  {:else if trackCreditsMap[t.id!] && trackCreditsMap[t.id!].length > 0}
                    {#each Object.entries(groupCreditsByRole(trackCreditsMap[t.id!])) as [role, credits]}
                      <div class="credits-role-group">
                        <span class="credits-role-label">{formatRole(role)}</span>
                        <div class="credits-names">
                          {#each credits as c}
                            <span class="credit-chip" onclick={(e) => { e.stopPropagation(); if (c.artist_id) selectArtistDetail({ id: c.artist_id, name: c.artist_name }); }}>
                              {c.artist_name}{#if c.instrument}<span class="credit-instrument">{c.instrument}</span>{/if}
                            </span>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  {:else}
                    <span class="credits-empty">{$tr('artist.noMetadata')}</span>
                  {/if}
                </div>
              {/if}
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
              <div class="track-info" title={t.file_path ?? ''}>
                <span class="track-title truncate">{t.title}</span>
                {#if t.artist_name}
                  <span class="track-artist truncate">{t.artist_name}</span>
                {/if}
              </div>
              {#if t.format}<span class="audio-format">{formatAudioBadge(t)}</span>{/if}
              <span class="track-duration">{formatTime(t.duration_ms)}</span>
              <span class="track-heart" onclick={(e) => e.stopPropagation()}><HeartButton trackId={t.id} size={14} /></span>
              <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); addTrackToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
              <button class="play-next-btn" onclick={(e) => { e.stopPropagation(); playNext(t); }} title="Lire ensuite">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
              </button>
              {#if onAddToPlaylist && (t.id || t.source_id)}
                <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={$tr('nowplaying.addToPlaylist')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" /><line x1="16" y1="3" x2="16" y2="11" /><line x1="12" y1="7" x2="20" y2="7" /></svg>
                </button>
              {/if}
              <button class="credits-btn" class:active={expandedTrackCredits === t.id} onclick={(e) => { e.stopPropagation(); t.id && toggleTrackCredits(t.id); }} title={$tr('artist.credits')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              </button>
              <button class="edit-track-btn" onclick={(e) => { e.stopPropagation(); openTrackEdit(e, t); }} title={$tr('metadata.editTrack')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </button>
            </div>
            {#if expandedTrackCredits === t.id}
              <div class="track-credits-row">
                {#if trackCreditsLoading === t.id}
                  <div class="spinner-sm"></div>
                {:else if trackCreditsMap[t.id!] && trackCreditsMap[t.id!].length > 0}
                  {#each Object.entries(groupCreditsByRole(trackCreditsMap[t.id!])) as [role, credits]}
                    <div class="credits-role-group">
                      <span class="credits-role-label">{formatRole(role)}</span>
                      <div class="credits-names">
                        {#each credits as c}
                          <span class="credit-chip" onclick={(e) => { e.stopPropagation(); if (c.artist_id) selectArtistDetail({ id: c.artist_id, name: c.artist_name }); }}>
                            {c.artist_name}{#if c.instrument}<span class="credit-instrument">{c.instrument}</span>{/if}
                          </span>
                        {/each}
                      </div>
                    </div>
                  {/each}
                {:else}
                  <span class="credits-empty">{$tr('artist.noMetadata')}</span>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

  {:else if $selectedArtist}
    <!-- Artist detail -->
    <div class="detail-header">
      <button class="back-btn" onclick={goBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        {$tr('common.back')}
      </button>
    </div>

    <div class="artist-detail">
      <!-- Artist header -->
      <div class="artist-detail-header">
        <div class="artist-detail-avatar">
          {#if artistMetadata?.image_url}
            <img class="artist-detail-img" src={artistMetadata.image_url} alt={$selectedArtist.name} onerror={(e) => (e.target as HTMLImageElement).style.display='none'} />
          {:else if $selectedArtist.image_path}
            <AlbumArt coverPath={$selectedArtist.image_path} size={160} alt={$selectedArtist.name} round />
          {:else}
            <span class="artist-detail-initials">{initials($selectedArtist.name)}</span>
          {/if}
        </div>
        <div class="artist-detail-info">
          <h2 class="artist-detail-name">{$selectedArtist.name}</h2>
          {#if $artistAlbums.length > 0}
            <span class="artist-detail-count">{$artistAlbums.length} {$artistAlbums.length > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
          {/if}
          {#if artistMetadataLoading}
            <div class="artist-meta-loading">
              <div class="spinner-sm"></div>
              {$tr('common.loading')}
            </div>
          {:else if artistMetadata?.enrichment_status === 'pending'}
            <div class="artist-enriching">
              <div class="spinner-sm"></div>
              {$tr('artist.enriching')}
            </div>
          {/if}
        </div>
      </div>

      <!-- Bio -->
      {#if artistBio}
        <blockquote class="artist-bio">{artistBio}</blockquote>
      {/if}

      <!-- Collapsible sections -->
      {#if artistMetadata && !artistMetadataLoading}
        {#if artistMetadata.anecdotes && artistMetadata.anecdotes.length > 0}
          <div class="artist-section">
            <button class="artist-section-header" onclick={() => toggleSection('anecdotes')}>
              <span class="artist-section-title">{$tr('artist.anecdotes')}</span>
              <svg class="artist-section-chevron" class:open={openSections['anecdotes']} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {#if openSections['anecdotes']}
              <ul class="artist-anecdotes">
                {#each artistMetadata.anecdotes as anecdote}
                  <li>{anecdote}</li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}

        {#if artistMetadata.similar_artists && artistMetadata.similar_artists.length > 0}
          <div class="artist-section">
            <button class="artist-section-header" onclick={() => toggleSection('similar')}>
              <span class="artist-section-title">{$tr('artist.similarArtists')}</span>
              <svg class="artist-section-chevron" class:open={openSections['similar']} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {#if openSections['similar']}
              <div class="artist-similar-list">
                {#each artistMetadata.similar_artists as sa}
                  <button class="artist-similar-chip clickable" title={sa.reason} onclick={() => navigateToSimilarArtist(sa.name)}>{sa.name}</button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        {#if artistMetadata.members && artistMetadata.members.length > 0}
          <div class="artist-section">
            <button class="artist-section-header" onclick={() => toggleSection('members')}>
              <span class="artist-section-title">{$tr('artist.members')}</span>
              <svg class="artist-section-chevron" class:open={openSections['members']} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {#if openSections['members']}
              <div class="artist-members-list">
                {#each artistMetadata.members as member}
                  <div class="artist-member">
                    <span class="artist-member-name">{member.name}</span>
                    <span class="artist-member-role">{member.role}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        {#if artistMetadata.discography_highlights && artistMetadata.discography_highlights.length > 0}
          <div class="artist-section">
            <button class="artist-section-header" onclick={() => toggleSection('discography')}>
              <span class="artist-section-title">{$tr('artist.discography')}</span>
              <svg class="artist-section-chevron" class:open={openSections['discography']} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {#if openSections['discography']}
              <div class="artist-discography-list">
                {#each artistMetadata.discography_highlights as disc}
                  <div class="artist-disc-item">
                    <span class="artist-disc-year">{disc.year}</span>
                    <div class="artist-disc-info">
                      <span class="artist-disc-title">{disc.title}</span>
                      <span class="artist-disc-desc">{disc.description}</span>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {/if}

      <!-- Credits (instruments played) -->
      {#if artistCredits && artistCredits.length > 0}
        <div class="artist-section">
          <button class="artist-section-header" onclick={() => toggleSection('credits')}>
            <span class="artist-section-title">{$tr('artist.credits')}</span>
            <svg class="artist-section-chevron" class:open={openSections['credits']} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          {#if openSections['credits']}
            {@const instruments = uniqueInstruments(artistCredits)}
            <div class="artist-credits-list">
              {#if instruments.length > 0}
                <div class="credits-instruments">
                  {#each instruments as instr}
                    <span class="credit-chip-static">{instr}</span>
                  {/each}
                </div>
              {/if}
              <div class="credits-track-count">{artistCredits.length} {artistCredits.length > 1 ? $tr('common.tracks') : 'track'}</div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Albums in library -->
      <div class="artist-section">
        <div class="artist-section-header-static">
          <span class="artist-section-title">{$tr('artist.albumsInLibrary')}</span>
        </div>
        <div class="albums-grid">
          {#each $artistAlbums as album}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="album-card" onclick={() => selectAlbumDetail(album)}>
              <div class="album-card-art">
                <img class="album-cover-img" src={api.artworkUrl(album.cover_path, 200)} alt={album.title} loading="lazy" onerror={(e) => (e.target as HTMLImageElement).style.display='none'} />
                <button class="play-overlay" onclick={(e) => { e.stopPropagation(); album.id && playAlbum(album.id); }} title={$tr('library.playAlbum')}>
                  <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><path d="M8 5v14l11-7z" /></svg>
                </button>
                <span class="heart-overlay"><HeartButton albumId={album.id} size={14} /></span>
              </div>
              <span class="album-card-title truncate">{album.title}</span>
              {#if album.year}
                <span class="album-card-year">{album.year}</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>

  {:else}
    <!-- Main library view -->
    <div class="library-header">
      <h2>{$tr('library.title')}</h2>
      <div class="library-header-right">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" placeholder={$tr('library.searchPlaceholder')} bind:value={searchQuery} />
          {#if searchQuery}
            <button class="search-clear" onclick={() => searchQuery = ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          {/if}
        </div>
        <div class="tab-bar">
          <button class="tab" class:active={$libraryTab === 'albums'} onclick={() => switchTab('albums')}>{$tr('common.albums')}</button>
          <button class="tab" class:active={$libraryTab === 'artists'} onclick={() => switchTab('artists')}>{$tr('common.artists')}</button>
          <button class="tab" class:active={$libraryTab === 'tracks'} onclick={() => switchTab('tracks')}>{$tr('home.tracks')}</button>
          <button class="tab" class:active={$libraryTab === 'genres'} onclick={() => switchTab('genres')}>{$tr('common.genres')}</button>
        </div>
      </div>
    </div>

    {#if $libraryLoading}
      <div class="loading">
        <div class="spinner"></div>
        {$tr('common.loading')}
      </div>
    {:else if $libraryTab === 'albums'}
      <div class="quality-filters">
        <button class="quality-chip" class:active={!albumQualityFilter} onclick={() => albumQualityFilter = null}>Tous ({searchFilteredAlbums.length})</button>
        {#each [
          { key: 'dsd', label: 'DSD' },
          { key: 'hi-res', label: 'Hi-Res' },
          { key: 'cd', label: 'CD' },
          { key: 'lossy', label: 'Lossy' },
        ] as tier}
          {@const count = searchFilteredAlbums.filter(a => a.quality === tier.key).length}
          {#if count > 0}
            <button class="quality-chip {tier.key}" class:active={albumQualityFilter === tier.key} onclick={() => albumQualityFilter = albumQualityFilter === tier.key ? null : tier.key}>
              {tier.label} ({count})
            </button>
          {/if}
        {/each}
        {#if albumFormats.length > 1}
          <span class="filter-sep">|</span>
          {#each albumFormats as fmt}
            {@const count = searchFilteredAlbums.filter(a => a.format === fmt).length}
            {#if count > 0}
              <button class="quality-chip format" class:active={albumFormatFilter === fmt} onclick={() => albumFormatFilter = albumFormatFilter === fmt ? null : fmt}>
                {fmt.toUpperCase()} ({count})
              </button>
            {/if}
          {/each}
        {/if}
        {#if albumSampleRates.length > 1}
          <span class="filter-sep">|</span>
          {#each [44100, 48000, 88200, 96000, 176400, 192000] as sr}
            {@const count = searchFilteredAlbums.filter(a => (a.sample_rate ?? 0) >= sr).length}
            {#if count > 0 && albumSampleRates.some(r => (r ?? 0) >= sr)}
              <button class="quality-chip samplerate" class:active={albumSampleRateFilter === sr} onclick={() => albumSampleRateFilter = albumSampleRateFilter === sr ? null : sr}>
                {sr >= 1000 ? (sr / 1000) + 'kHz' : sr + 'Hz'}+ ({count})
              </button>
            {/if}
          {/each}
        {/if}
        <span class="filter-sep">|</span>
        <button class="quality-chip favorites" class:active={albumFavoritesFilter} onclick={() => albumFavoritesFilter = !albumFavoritesFilter}>
          <svg viewBox="0 0 24 24" fill={albumFavoritesFilter ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          {$tr('favorites.filter')}
        </button>
        <span class="quality-count">{filteredAlbums.length} album{filteredAlbums.length > 1 ? 's' : ''}</span>
      </div>
      <div class="albums-grid">
        {#each filteredAlbums as album}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="album-card" onclick={() => selectAlbumDetail(album)}>
            <div class="album-card-art">
              <img class="album-cover-img" src={api.artworkUrl(album.cover_path, 200)} alt={album.title} loading="lazy" onerror={(e) => (e.target as HTMLImageElement).style.display='none'} />
              <button class="play-overlay" onclick={(e) => { e.stopPropagation(); album.id && playAlbum(album.id); }} title={$tr('library.playAlbum')}>
                <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><path d="M8 5v14l11-7z" /></svg>
              </button>
              <button class="edit-overlay" onclick={(e) => openAlbumEdit(e, album)} title={$tr('metadata.editAlbum')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </button>
              <span class="heart-overlay"><HeartButton albumId={album.id} size={14} /></span>
            </div>
            <span class="album-card-title truncate">{album.title}</span>
            {#if album.artist_name}
              <span class="album-card-artist truncate">{album.artist_name}</span>
            {/if}
          </div>
        {/each}
        {#if filteredAlbums.length === 0}
          <div class="empty">{searchQuery ? $tr('common.noResult') : $tr('library.noAlbums')}</div>
        {/if}
      </div>

    {:else if $libraryTab === 'artists'}
      <div class="artists-grid">
        {#each filteredArtists as artist}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="artist-card" onclick={() => selectArtistDetail(artist)}>
            <div class="artist-card-avatar">
              {#if artist.image_path}
                <AlbumArt coverPath={artist.image_path} size={100} alt={artist.name} round />
              {:else}
                {initials(artist.name)}
              {/if}
            </div>
            <span class="artist-card-name truncate">{artist.name}</span>
          </div>
        {/each}
        {#if filteredArtists.length === 0}
          <div class="empty">{searchQuery ? $tr('common.noResult') : $tr('library.noArtists')}</div>
        {/if}
      </div>

    {:else if $libraryTab === 'tracks'}
      <div class="track-filters">
        {#if availableFormats.length > 1}
          <div class="format-filters">
            <span class="filter-label">Format</span>
            <button class="format-btn" class:active={!formatFilter} onclick={() => formatFilter = null}>{$tr('metadata.all')}</button>
            {#each availableFormats as fmt}
              <button class="format-btn" class:active={formatFilter === fmt} onclick={() => formatFilter = fmt}>{fmt.toUpperCase()}</button>
            {/each}
          </div>
        {/if}
        <div class="format-filters">
          <span class="filter-label">Qualité</span>
          <button class="format-btn" class:active={!qualityFilter} onclick={() => qualityFilter = null}>{$tr('metadata.all')}</button>
          {#each qualityBuckets as bucket}
            {#if qualityCounts[bucket.key]}
              <button class="format-btn" class:active={qualityFilter === bucket.key} onclick={() => qualityFilter = bucket.key}>
                {bucket.label} <span class="badge">{qualityCounts[bucket.key]}</span>
              </button>
            {/if}
          {/each}
        </div>
        <div class="format-filters">
          <button class="format-btn favorites-btn" class:active={trackFavoritesFilter} onclick={() => trackFavoritesFilter = !trackFavoritesFilter}>
            <svg viewBox="0 0 24 24" fill={trackFavoritesFilter ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            {$tr('favorites.filter')}
          </button>
        </div>
        <span class="format-count">{filteredTracks.length} {$tr('common.tracks')}</span>
      </div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="track-list" bind:this={trackListEl}
        onscroll={(e) => { scrollTop = (e.currentTarget as HTMLDivElement).scrollTop; }}
        use:observeHeight={(h) => { containerHeight = h; }}>
        <div style="height:{visibleTracks.totalHeight}px;position:relative;">
          {#each filteredTracks.slice(visibleTracks.startIdx, visibleTracks.endIdx) as t, i (t.id ?? visibleTracks.startIdx + i)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div class="track-item" style="position:absolute;top:{(visibleTracks.startIdx + i) * TRACK_ROW_HEIGHT}px;left:0;right:0;height:{TRACK_ROW_HEIGHT}px;" onclick={() => t.id && playTrack(t.id)}>
              <span class="track-thumb"><AlbumArt coverPath={t.cover_path} albumId={t.album_id} size={36} alt={t.album_title ?? ''} /></span>
              <div class="track-info" title={t.file_path ?? ''}>
                <span class="track-title truncate">{t.title}</span>
                <span class="track-meta truncate">{#if t.artist_name}<button class="track-link" onclick={(e) => { e.stopPropagation(); if (t.artist_id) selectArtistDetail({ id: t.artist_id, name: t.artist_name! }); }}>{t.artist_name}</button>{/if}{#if t.album_title}<span class="track-sep"> — </span><button class="track-link" onclick={(e) => { e.stopPropagation(); if (t.album_id) selectAlbumDetail({ id: t.album_id, title: t.album_title!, artist_name: t.artist_name } as Album); }}>{t.album_title}</button>{/if}</span>
              </div>
              {#if t.format}<span class="audio-format">{formatAudioBadge(t)}</span>{/if}
              <span class="track-duration">{formatTime(t.duration_ms)}</span>
              <HeartButton trackId={t.id} size={14} />
              <button class="edit-track-btn" onclick={(e) => openTrackEdit(e, t)} title={$tr('metadata.editTrack')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </button>
              <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); addTrackToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
              <button class="play-next-btn" onclick={(e) => { e.stopPropagation(); playNext(t); }} title="Lire ensuite">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
              </button>
              {#if onAddToPlaylist && (t.id || t.source_id)}
                <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={$tr('nowplaying.addToPlaylist')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" /><line x1="16" y1="3" x2="16" y2="11" /><line x1="12" y1="7" x2="20" y2="7" /></svg>
                </button>
              {/if}
            </div>
          {/each}
        </div>
        {#if filteredTracks.length === 0}
          <div class="empty">{searchQuery ? $tr('common.noResult') : $tr('library.noTracks')}</div>
        {/if}
      </div>

    {:else if $libraryTab === 'genres'}
      {#if selectedGenre}
        <!-- Genre filtered albums -->
        <div class="genre-detail-header">
          <button class="back-btn" onclick={() => selectedGenre = null}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
            {$tr('common.genres')}
          </button>
          <h3 class="genre-detail-title">{selectedGenre}</h3>
          <span class="genre-detail-count">{genreAlbums.length} {genreAlbums.length > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
        </div>
        <div class="albums-grid">
          {#each genreAlbums as album}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="album-card" onclick={() => selectAlbumDetail(album)}>
              <div class="album-card-art">
                <img class="album-cover-img" src={api.artworkUrl(album.cover_path, 200)} alt={album.title} loading="lazy" onerror={(e) => (e.target as HTMLImageElement).style.display='none'} />
                <button class="play-overlay" onclick={(e) => { e.stopPropagation(); album.id && playAlbum(album.id); }} title={$tr('library.playAlbum')}>
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
              <span class="genre-card-count">{g.count} {g.count > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
            </button>
          {/each}
          {#if $genres.length === 0}
            <div class="empty">{$tr('library.noGenres')}</div>
          {/if}
        </div>
      {/if}
    {/if}
  {/if}
</div>

{#if editingAlbum}
  <AlbumEditModal
    album={editingAlbum}
    onClose={() => editingAlbum = null}
    onSaved={handleAlbumSaved}
  />
{/if}

{#if editingTrack}
  <TrackEditModal
    track={editingTrack}
    onClose={() => editingTrack = null}
    onSaved={handleTrackSaved}
  />
{/if}

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

  .detail-artist-link {
    background: none;
    border: none;
    padding: 0;
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--tune-text-secondary);
    cursor: pointer;
    text-align: left;
  }

  .detail-artist-link:hover {
    color: var(--tune-accent);
    text-decoration: underline;
  }

  .detail-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-top: var(--space-md);
  }

  .edit-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    background: var(--tune-grey2);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text-secondary);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s;
  }

  .edit-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-text);
  }

  .write-tags-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    background: rgba(234, 88, 12, 0.08);
    border: 1px solid rgba(234, 88, 12, 0.25);
    border-radius: var(--radius-md);
    color: #fb923c;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s;
  }

  .write-tags-btn:hover:not(:disabled) {
    background: rgba(234, 88, 12, 0.18);
    border-color: #fb923c;
  }

  .write-tags-btn:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  .write-tags-message {
    margin-top: 8px;
    padding: 6px 12px;
    background: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(34, 197, 94, 0.2);
    border-radius: var(--radius-sm);
    color: #86efac;
    font-size: 13px;
  }

  .bio-toggle-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    background: none;
    border: 1px solid var(--tune-border);
    border-radius: 14px;
    padding: 4px 12px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    cursor: pointer;
    transition: all 0.12s;
  }
  .bio-toggle-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .album-bio-section {
    margin-top: 10px;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: var(--radius-md);
    max-height: 200px;
    overflow-y: auto;
  }

  .album-bio-text {
    font-family: var(--font-body);
    font-size: 13px;
    line-height: 1.7;
    color: var(--tune-text-secondary);
    white-space: pre-wrap;
    margin: 0;
  }

  .album-bio-empty {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    font-style: italic;
    margin: 0;
  }

  /* Album Rating */
  .album-rating-section {
    margin-top: var(--space-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .album-stars {
    display: flex;
    gap: 2px;
  }

  .star-btn {
    background: none;
    border: none;
    padding: 2px;
    cursor: pointer;
    color: var(--tune-text-muted);
    transition: color 0.1s, transform 0.1s;
  }

  .star-btn:hover {
    color: #f59e0b;
    transform: scale(1.2);
  }

  .star-btn.filled {
    color: #f59e0b;
  }

  .star-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .rating-note-input {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text);
    width: 100%;
    max-width: 250px;
    outline: none;
    transition: border-color 0.12s;
  }

  .rating-note-input:focus {
    border-color: var(--tune-accent);
  }

  .rating-note-input::placeholder {
    color: var(--tune-text-muted);
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
  .quality-filters {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    flex-shrink: 0;
  }

  .quality-chip {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    padding: 4px 12px;
    border-radius: 16px;
    font-family: var(--font-body);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.12s ease-out;
  }

  .quality-chip:hover {
    border-color: var(--tune-text-secondary);
  }

  .quality-chip.active {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
  }

  .quality-chip.dsd.active {
    background: #8e44ad;
    border-color: #8e44ad;
  }

  .quality-chip.hi-res.active {
    background: #e67e22;
    border-color: #e67e22;
  }

  .quality-chip.cd.active {
    background: #27ae60;
    border-color: #27ae60;
  }

  .quality-chip.lossy.active {
    background: #7f8c8d;
    border-color: #7f8c8d;
  }

  .quality-chip.format.active {
    background: #2980b9;
    border-color: #2980b9;
  }

  .quality-chip.samplerate.active {
    background: #8e44ad;
    border-color: #8e44ad;
  }

  .filter-sep {
    color: var(--tune-text-muted);
    opacity: 0.3;
    margin: 0 2px;
    font-size: 14px;
  }

  .quality-count {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    margin-left: auto;
  }

  .albums-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    grid-auto-rows: min-content;
    gap: var(--space-lg);
    flex: 1;
    overflow-y: auto;
    align-items: start;
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
    width: 100%;
    aspect-ratio: 1;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--tune-grey2);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .album-card-art::before {
    content: "♪";
    position: absolute;
    font-size: 32px;
    color: var(--tune-text-muted, #555);
    opacity: 0.3;
    z-index: 0;
  }

  .album-cover-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    position: relative;
    z-index: 1;
    opacity: 0;
    animation: fadeIn 0.3s ease-out forwards;
  }

  @keyframes fadeIn {
    to { opacity: 1; }
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

  .edit-overlay {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s ease-out;
    z-index: 2;
  }

  .album-card-art:hover .edit-overlay {
    opacity: 1;
  }

  .edit-overlay:hover {
    background: rgba(0, 0, 0, 0.8);
  }

  .heart-overlay {
    position: absolute;
    top: 6px;
    left: 6px;
    z-index: 2;
  }

  .heart-overlay :global(.heart-btn) {
    opacity: 0;
    color: white;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
  }

  .heart-overlay :global(.heart-btn.active) {
    opacity: 1;
    color: #ef4444;
  }

  .album-card-art:hover .heart-overlay :global(.heart-btn) {
    opacity: 0.8;
  }

  .heart-overlay :global(.heart-btn:hover) {
    opacity: 1 !important;
  }

  .quality-chip.favorites {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .quality-chip.favorites.active {
    background: #ef4444;
    border-color: #ef4444;
    color: white;
  }

  .format-btn.favorites-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .format-btn.favorites-btn.active {
    background: #ef4444 !important;
    border-color: #ef4444;
    color: white;
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

  /* Artists grid */
  .artists-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-lg);
    flex: 1;
    overflow-y: auto;
  }

  .artist-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    cursor: pointer;
    padding: var(--space-sm) 0;
    transition: transform 0.15s ease-out;
  }

  .artist-card:hover {
    transform: translateY(-2px);
  }

  .artist-card-avatar {
    width: 100px;
    height: 100px;
    border-radius: 50%;
    background: var(--tune-grey2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-label);
    font-size: 32px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    overflow: hidden;
    flex-shrink: 0;
  }

  .artist-card-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    text-align: center;
    max-width: 140px;
  }

  /* Track filters */
  .track-filters {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-sm) 28px;
  }

  .format-filters {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .filter-label {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    color: var(--tune-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    min-width: 48px;
  }

  .format-btn {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 3px 10px;
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    cursor: pointer;
    transition: all 0.12s;
  }

  .format-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-text);
  }

  .format-btn.active {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
  }

  .format-btn .badge {
    font-size: 10px;
    opacity: 0.7;
  }

  .format-count {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    margin-left: auto;
    align-self: flex-end;
  }

  /* Track list (virtual scroll) */
  .track-list {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
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

  .track-thumb {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border-radius: var(--radius-sm);
    overflow: hidden;
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

  .track-meta {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
  }

  .track-link {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: var(--tune-text-secondary);
    cursor: pointer;
  }

  .track-link:hover {
    color: var(--tune-accent);
    text-decoration: underline;
  }

  .track-sep {
    color: var(--tune-text-muted);
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

  .track-heart {
    display: flex;
    align-items: center;
    margin-right: 4px;
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

  .track-item:hover .play-next-btn {
    opacity: 1;
  }

  .play-next-btn:hover {
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

  .edit-track-btn {
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
    opacity: 0.5;
  }

  .track-item:hover .edit-track-btn {
    opacity: 1;
  }

  .edit-track-btn:hover {
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

  /* Artist detail page */
  .artist-detail {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    flex: 1;
    overflow-y: auto;
  }

  .artist-detail-header {
    display: flex;
    gap: var(--space-lg);
    align-items: center;
  }

  .artist-detail-avatar {
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background: var(--tune-grey2);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
  }

  .artist-detail-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  .artist-detail-initials {
    font-family: var(--font-label);
    font-size: 56px;
    font-weight: 600;
    color: var(--tune-text-secondary);
  }

  .artist-detail-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .artist-detail-name {
    font-family: var(--font-label);
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -0.8px;
  }

  .artist-detail-count {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
  }

  .artist-meta-loading,
  .artist-enriching {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    margin-top: var(--space-xs);
  }

  .artist-enriching {
    color: var(--tune-accent);
  }

  .spinner-sm {
    width: 14px;
    height: 14px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .artist-bio {
    font-family: var(--font-body);
    font-size: 14px;
    line-height: 1.7;
    color: var(--tune-text-secondary);
    background: var(--tune-surface);
    border-left: 3px solid var(--tune-accent);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    padding: var(--space-md) var(--space-lg);
    margin: 0;
  }

  .artist-section {
    border-top: 1px solid var(--tune-border);
    padding-top: var(--space-sm);
  }

  .artist-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    background: none;
    border: none;
    padding: var(--space-sm) 0;
    cursor: pointer;
    color: var(--tune-text);
  }

  .artist-section-header:hover {
    color: var(--tune-accent);
  }

  .artist-section-header-static {
    display: flex;
    align-items: center;
    padding: var(--space-sm) 0;
  }

  .artist-section-title {
    font-family: var(--font-label);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.3px;
  }

  .artist-section-chevron {
    transition: transform 0.2s ease-out;
    color: var(--tune-text-muted);
  }

  .artist-section-chevron.open {
    transform: rotate(180deg);
  }

  .artist-anecdotes {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--space-md) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .artist-anecdotes li {
    font-family: var(--font-body);
    font-size: 13px;
    line-height: 1.6;
    color: var(--tune-text-secondary);
    padding: var(--space-sm) var(--space-md);
    background: var(--tune-surface);
    border-radius: var(--radius-md);
    position: relative;
    padding-left: var(--space-lg);
  }

  .artist-anecdotes li::before {
    content: '';
    position: absolute;
    left: var(--space-sm);
    top: 50%;
    transform: translateY(-50%);
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--tune-accent);
  }

  .artist-similar-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    padding: var(--space-sm) 0 var(--space-md);
  }

  .artist-similar-chip {
    display: inline-block;
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 16px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    cursor: pointer;
    transition: all 0.12s ease-out;
  }

  .artist-similar-chip:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.1);
  }

  .artist-members-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-sm) 0 var(--space-md);
  }

  .artist-member {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-xs) var(--space-md);
  }

  .artist-member-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text);
  }

  .artist-member-role {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .artist-discography-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-sm) 0 var(--space-md);
  }

  .artist-disc-item {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: var(--tune-surface);
    border-radius: var(--radius-md);
  }

  .artist-disc-year {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 700;
    color: var(--tune-accent);
    min-width: 40px;
    padding-top: 1px;
  }

  .artist-disc-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .artist-disc-title {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text);
  }

  .artist-disc-desc {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    line-height: 1.5;
  }

  @media (max-width: 600px) {
    .artist-detail-header {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .artist-detail-avatar {
      width: 120px;
      height: 120px;
    }

    .artist-detail-initials {
      font-size: 42px;
    }

    .artist-detail-name {
      font-size: 24px;
    }
  }

  .empty {
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    text-align: center;
    padding: var(--space-2xl);
    grid-column: 1 / -1;
  }

  /* Track credits button */
  .credits-btn {
    display: none;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 2px;
    border-radius: var(--radius-sm);
    transition: all 0.12s ease-out;
  }

  .credits-btn.active {
    display: flex;
    color: var(--tune-accent);
  }

  .track-item:hover .credits-btn {
    display: flex;
  }

  .credits-btn:hover {
    color: var(--tune-accent);
  }

  /* Expanded credits row */
  .track-credits-row {
    padding: var(--space-sm) 28px var(--space-sm) 56px;
    background: var(--tune-surface);
    border-bottom: 1px solid var(--tune-border);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
    align-items: flex-start;
  }

  .credits-role-group {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
  }

  .credits-role-label {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tune-text-muted);
    white-space: nowrap;
  }

  .credits-names {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .credit-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 500;
    padding: 2px 10px;
    border-radius: 12px;
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.08);
    color: var(--tune-text);
    cursor: pointer;
    transition: all 0.12s ease-out;
  }

  .credit-chip:hover {
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.18);
    color: var(--tune-accent);
  }

  .credit-instrument {
    font-size: 11px;
    color: var(--tune-text-muted);
    font-style: italic;
  }

  .credit-chip-static {
    display: inline-block;
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 500;
    padding: 3px 12px;
    border-radius: 12px;
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.08);
    color: var(--tune-text);
    border: 1px solid var(--tune-border);
  }

  .credits-empty {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    font-style: italic;
  }

  /* Artist credits section */
  .artist-credits-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-sm) 0 var(--space-md);
  }

  .credits-instruments {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .credits-track-count {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }
</style>

<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { libraryTab, libraryLoading, albums, artists, tracks, selectedAlbum, albumTracks, selectedArtist, artistAlbums, genres, yearFilter, type LibraryTab } from '../lib/stores/library';
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import { currentTrack, seekPositionMs } from '../lib/stores/nowPlaying';
  import { isBrowserZone, browserSeek } from '../lib/stores/browserAudio';
  import { tuneWS } from '../lib/websocket';
  import { queueTracks, queuePosition } from '../lib/stores/queue';
  import { currentProfileId } from '../lib/stores/profile';
  import * as api from '../lib/api';
  import { notifications } from '../lib/stores/notifications';
  import { formatTime, formatDuration, formatAudioBadge, formatAlbumYear, fold } from '../lib/utils';
  import AlbumArt from './AlbumArt.svelte';
  import AlbumEditModal from './AlbumEditModal.svelte';
  import ArtistEditModal from './ArtistEditModal.svelte';
  import TrackEditModal from './TrackEditModal.svelte';
  import HeartButton from './HeartButton.svelte';
  import AlphaIndex from './AlphaIndex.svelte';
  import MetadataChips from './MetadataChips.svelte';
  import type { Album, Artist, Track, TrackCredit, UserTag } from '../lib/types';
  import { t as tr, locale } from '../lib/i18n';
  import { streamingServices, activeStreamingService, pendingStreamingAlbum } from '../lib/stores/streaming';
  import { activeView, pendingSearchQuery } from '../lib/stores/navigation';
  import ServiceBadge from './ServiceBadge.svelte';
  import QualityBadge from './QualityBadge.svelte';
  import { displayFields } from '../lib/stores/displayFields';
  import type { ArtistMetadata } from '../lib/types';

  function observeHeight(node: HTMLElement, callback: (h: number) => void) {
    const ro = new ResizeObserver(entries => {
      for (const e of entries) callback(e.contentRect.height);
    });
    ro.observe(node);
    callback(node.clientHeight);
    return { destroy() { ro.disconnect(); } };
  }

  function observeWidth(node: HTMLElement, callback: (w: number) => void) {
    const ro = new ResizeObserver(entries => {
      for (const e of entries) callback(e.contentRect.width);
    });
    ro.observe(node);
    callback(node.clientWidth);
    return { destroy() { ro.disconnect(); } };
  }

  interface Props {
    onAddToPlaylist?: (track: Track) => void;
  }
  let { onAddToPlaylist }: Props = $props();

  let scanProgress = $state<{ scanned: number; added: number } | null>(null);
  let cancellingScan = $state(false);

  $effect(() => {
    const unsub = tuneWS.onEvent((event) => {
      if (event.type === 'library.scan.progress') {
        scanProgress = { scanned: event.data?.scanned ?? 0, added: event.data?.added ?? 0 };
      } else if (event.type === 'library.scan.completed' || event.type === 'library.scan.started') {
        scanProgress = event.type === 'library.scan.started' ? { scanned: 0, added: 0 } : null;
      }
    });
    return unsub;
  });

  // On mount, ask the server whether a scan is already running (e.g. one started
  // before this page loaded, or a slow NAS scan) so the "stop scan" banner shows
  // even without a fresh scan.started event.
  $effect(() => {
    api.getScanStatus()
      .then((s) => { if (s?.scanning && !scanProgress) scanProgress = { scanned: 0, added: 0 }; })
      .catch(() => {});
  });

  async function stopScan() {
    cancellingScan = true;
    try {
      await api.cancelScan();
      scanProgress = null;
    } catch (e) {
      console.error('Cancel scan error:', e);
    }
    cancellingScan = false;
  }


  // Collections for album
  let collections: any[] = $state([]);
  let showCollectionMenu = $state(false);
  let collectionsLoaded = $state(false);

  async function loadCollections() {
    if (collectionsLoaded) return;
    try {
      collections = await api.getCollections();
      collectionsLoaded = true;
    } catch (e) {
      console.error('Load collections error:', e);
    }
  }

  async function handleAddToCollection(collectionId: number) {
    if (!$selectedAlbum?.id) return;
    try {
      await api.addAlbumToCollection(collectionId, $selectedAlbum.id);
      showCollectionMenu = false;
      notifications.success($tr('library.albumAddedToCollection'));
    } catch (e) {
      console.error('Add to collection error:', e);
      notifications.error($tr('library.collectionAddError'));
    }
  }

  let editingAlbum = $state<Album | null>(null);
  let editingTrack = $state<Track | null>(null);
  let writingAlbumTags = $state(false);
  let writeTagsMessage = $state<string | null>(null);

  // Track context menu ("...")
  let trackMenuOpenId = $state<number | null>(null);

  function openTrackMenu(e: MouseEvent, trackId: number | null | undefined) {
    e.stopPropagation();
    if (!trackId) return;
    trackMenuOpenId = trackMenuOpenId === trackId ? null : trackId;
  }

  function closeTrackMenu() {
    trackMenuOpenId = null;
  }

  // Artist metadata
  let artistMetadata = $state<ArtistMetadata | null>(null);
  let artistMetadataLoading = $state(false);
  let artistMetadataError = $state(false);
  let openSections = $state<Record<string, boolean>>({});

  // Album bio
  let albumBio = $state<string | null>(null);
  let albumBioLevel = $state<'simple' | 'complete' | 'full'>('complete');
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
      notifications.success(newRating > 0 ? `${$tr('library.rating')}: ${newRating}/5` : $tr('library.ratingRemoved'));
    } catch (e) {
      console.error('Rate album error:', e);
      notifications.error($tr('library.ratingError'));
    }
    ratingSubmitting = false;
  }

  async function submitRatingNote(albumId: number) {
    ratingSubmitting = true;
    try {
      await api.rateAlbum(albumId, albumRating, albumRatingNote);
      notifications.success($tr('library.ratingSaved'));
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
  let enrichLoading = $state(false);
  let bioLevel = $state<'simple' | 'complete' | 'full'>('complete');

  // Artist editing
  let editingArtistName = $state(false);
  let artistNameInput = $state('');
  let artistNameSaving = $state(false);
  let showArtistEdit = $state(false);

  async function saveArtistName() {
    if (!$selectedArtist?.id || !artistNameInput.trim()) return;
    artistNameSaving = true;
    try {
      const updated = await api.updateArtist($selectedArtist.id, { name: artistNameInput.trim() });
      // Update the store so the UI refreshes
      selectedArtist.set({ ...$selectedArtist, name: updated.name ?? artistNameInput.trim() });
      editingArtistName = false;
    } catch (e) {
      console.error('Save artist name error:', e);
    }
    artistNameSaving = false;
  }

  function startEditArtistName() {
    if (!$selectedArtist) return;
    artistNameInput = $selectedArtist.name;
    editingArtistName = true;
  }

  function cancelEditArtistName() {
    editingArtistName = false;
  }

  // Streaming albums for current artist
  let streamingArtistAlbums = $state<{ service: string; albums: Album[] }[]>([]);
  let streamingArtistAlbumsLoading = $state(false);

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
      writeTagsMessage = $tr('library.tagsWritten').replace('{success}', String(result.success)).replace('{total}', String(result.tracks_processed));
      setTimeout(() => writeTagsMessage = null, 5000);
    } catch (e: any) {
      writeTagsMessage = `${$tr('common.error')} : ${e?.message || e}`;
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
  let selectedParent = $state<string | null>(null);
  let genreTree = $state<Record<string, string[]>>({});

  // Auto-resolve parent from selectedGenre via tree, even if the user
  // navigated via a chip before the tree finished loading.
  let displayParent = $derived.by(() => {
    if (selectedGenre) {
      for (const [p, kids] of Object.entries(genreTree)) {
        if (p.toLowerCase() === selectedGenre.toLowerCase()) return null; // it's a parent itself
        if (kids.some(c => c.toLowerCase() === selectedGenre!.toLowerCase())) return p;
      }
    }
    return selectedParent;
  });

  // Aggregated count per branch (parent + children).
  let parentAlbumCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    const byName: Record<string, number> = {};
    for (const g of $genres) byName[g.name.toLowerCase()] = g.count;
    for (const [parent, children] of Object.entries(genreTree)) {
      let total = (byName[parent.toLowerCase()] || 0);
      for (const c of children) total += (byName[c.toLowerCase()] || 0);
      counts[parent] = total;
    }
    return counts;
  });

  // Genres in the library that aren't anywhere in the tree → orphan
  // section ("Hors arbre") at the bottom of the genres tab.
  let knownTreeGenres = $derived.by(() => {
    const set = new Set<string>();
    for (const [p, kids] of Object.entries(genreTree)) {
      set.add(p.toLowerCase());
      for (const k of kids) set.add(k.toLowerCase());
    }
    return set;
  });
  let orphanGenres = $derived($genres.filter(g => !knownTreeGenres.has(g.name.toLowerCase())));

  // Genres filtered by search query (for the Genres tab)
  let genreSearchQuery = $derived(fold(searchQuery));
  let filteredGenreTreeKeys = $derived.by(() => {
    if (!genreSearchQuery) return Object.keys(genreTree);
    return Object.keys(genreTree).filter(parent => {
      if (fold(parent).includes(genreSearchQuery)) return true;
      return (genreTree[parent] ?? []).some(child => fold(child).includes(genreSearchQuery));
    });
  });
  let filteredOrphanGenres = $derived.by(() => {
    if (!genreSearchQuery) return orphanGenres;
    return orphanGenres.filter(g => fold(g.name).includes(genreSearchQuery));
  });

  // Use onMount (not $effect) — the $effect(() => { untrack(...) }) pattern
  // can re-trigger on batch flushes in certain Svelte 5 runtime versions.
  onMount(() => {
    api.getGenreTree().then(r => genreTree = r.tree ?? {}).catch(() => {});
    loadUserTags();
  });
  let formatFilter = $state<string | null>(null);
  let qualityFilter = $state<string | null>(null);
  let albumQualityFilter = $state<string | null>(null);
  let albumFormatFilter = $state<string | null>(null);
  let albumSampleRateFilter = $state<number | null>(null);
  let albumYearFilter = $state<number | null>(null);
  let albumDuplicatesFilter = $state(false);

  // Duplicate album detection: same title + same artist but different format/quality
  function normalizeDupKey(title: string, artist: string): string {
    // Strip formatting punctuation/spacing, but keep '!' and '?' — they are
    // part of the title, not noise, so "Joe Cocker!" and "Joe Cocker" are not
    // flagged as duplicates (Alain).
    const strip = (s: string) => s.trim().toLowerCase().replace(/[\s\-_.:;,'"()[\]{}]+/g, '');
    return strip(title) + '|||' + strip(artist);
  }

  function formatAlbumQualityLabel(album: Album): string {
    const parts: string[] = [];
    if (album.format) parts.push(String(album.format).toUpperCase());
    if (album.sample_rate) parts.push(`${(album.sample_rate / 1000).toFixed(album.sample_rate % 1000 === 0 ? 0 : 1)}kHz`);
    if (album.bit_depth) parts.push(`${album.bit_depth}-bit`);
    if (parts.length === 0 && album.quality) parts.push(album.quality.toUpperCase());
    return parts.join(' ') || '?';
  }

  // Map from normalized key -> array of albums that share that key
  let duplicateMap = $derived.by(() => {
    const map = new Map<string, Album[]>();
    for (const a of $albums) {
      const key = normalizeDupKey(a.title, a.artist_name ?? '');
      const arr = map.get(key);
      if (arr) arr.push(a);
      else map.set(key, [a]);
    }
    // Only keep entries with 2+ albums
    const result = new Map<string, Album[]>();
    for (const [key, arr] of map) {
      if (arr.length >= 2) result.set(key, arr);
    }
    return result;
  });

  // Set of album IDs that have duplicates
  let duplicateAlbumIds = $derived.by(() => {
    const ids = new Set<number>();
    for (const arr of duplicateMap.values()) {
      for (const a of arr) {
        if (a.id !== null && a.id !== undefined) ids.add(a.id!);
      }
    }
    return ids;
  });

  // Count of albums that are duplicates (for chip display)
  let duplicateAlbumCount = $derived(duplicateAlbumIds.size);

  // Currently open duplicate popup album id
  let dupPopupAlbumId = $state<number | null>(null);

  function getDuplicateSiblings(album: Album): Album[] {
    const key = normalizeDupKey(album.title, album.artist_name ?? '');
    return duplicateMap.get(key) ?? [];
  }

  function toggleDupPopup(albumId: number, e: MouseEvent) {
    e.stopPropagation();
    dupPopupAlbumId = dupPopupAlbumId === albumId ? null : albumId;
  }

  function closeDupPopup() {
    dupPopupAlbumId = null;
  }

  // Sync year filter from store (set by NowPlaying)
  $effect(() => {
    const v = $yearFilter;
    if (v !== null) {
      untrack(() => {
        albumYearFilter = v;
        yearFilter.set(null); // consume it
      });
    }
  });

  // Sort options
  type AlbumSortKey = 'title' | 'artist' | 'release_date' | 'original_year' | 'added_date';
  const ALBUM_SORT_OPTIONS: { key: AlbumSortKey; label: string; defaultOrder: 'asc' | 'desc' }[] = [
    { key: 'title', label: 'library.sortTitle', defaultOrder: 'asc' },
    { key: 'artist', label: 'library.sortArtist', defaultOrder: 'asc' },
    { key: 'release_date', label: 'library.sortReleaseDate', defaultOrder: 'desc' },
    { key: 'original_year', label: 'library.sortOriginalYear', defaultOrder: 'desc' },
    { key: 'added_date', label: 'library.sortAddedDate', defaultOrder: 'desc' },
  ];
  let albumSort = $state<AlbumSortKey>((localStorage.getItem('tune_album_sort') as AlbumSortKey) || 'title');
  let albumSortOrder = $state<'asc' | 'desc'>((localStorage.getItem('tune_album_sort_order') as 'asc' | 'desc') || 'asc');

  type GenreSortKey = 'title' | 'artist' | 'year';
  const GENRE_SORT_OPTIONS: { key: GenreSortKey; label: string; defaultOrder: 'asc' | 'desc' }[] = [
    { key: 'title', label: 'library.sortTitle', defaultOrder: 'asc' },
    { key: 'artist', label: 'library.sortArtist', defaultOrder: 'asc' },
    { key: 'year', label: 'library.sortYear', defaultOrder: 'desc' },
  ];
  let genreSort = $state<GenreSortKey>((localStorage.getItem('tune_genre_sort') as GenreSortKey) || 'artist');
  let genreSortOrder = $state<'asc' | 'desc'>((localStorage.getItem('tune_genre_sort_order') as 'asc' | 'desc') || 'asc');

  function setGenreSort(key: GenreSortKey) {
    if (genreSort === key) {
      genreSortOrder = genreSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      genreSort = key;
      genreSortOrder = GENRE_SORT_OPTIONS.find(o => o.key === key)?.defaultOrder ?? 'asc';
    }
    localStorage.setItem('tune_genre_sort', genreSort);
    localStorage.setItem('tune_genre_sort_order', genreSortOrder);
  }

  function setAlbumSort(key: AlbumSortKey) {
    if (albumSort === key) {
      // Toggle order on re-click
      albumSortOrder = albumSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      albumSort = key;
      albumSortOrder = ALBUM_SORT_OPTIONS.find(o => o.key === key)?.defaultOrder ?? 'asc';
    }
    localStorage.setItem('tune_album_sort', albumSort);
    localStorage.setItem('tune_album_sort_order', albumSortOrder);
    albumsLoaded = false;
    loadAlbums();
  }

  // Favorites filter
  let albumFavoritesFilter = $state(false);
  let albumTagFilter = $state<number | null>(null);
  let userTags = $state<UserTag[]>([]);
  let tagAlbumIds = $state<Set<number>>(new Set());

  async function loadUserTags() {
    try {
      userTags = await api.getTags('album');
    } catch (e) { /* ignore */ }
  }

  let showTagPicker = $state(false);
  let newTagName = $state('');
  let albumTagsKey = $state(0);

  const TAG_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#e91e63', '#795548', '#607d8b'];
  async function handleCreateAndAssignTag(albumId: number) {
    const name = newTagName.trim();
    if (!name) return;
    const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
    try {
      const result = await api.createTag(name, color);
      if (result.id) {
        await api.tagItem(result.id, 'album', albumId);
      }
    } catch (e) {
      console.error('createTag error:', e);
    }
    newTagName = '';
    showTagPicker = false;
    await loadUserTags();
    albumTagsKey++;
  }

  // Tag management (rename / delete). Backend + api already support these
  // (PUT/DELETE /tags/{id}); this surfaces them in the UI.
  let manageTags = $state(false);
  async function handleRenameTag(tag: UserTag) {
    const next = prompt($tr('library.renameTagPrompt' as any), tag.name);
    if (next === null) return;
    const name = next.trim();
    if (!name || name === tag.name) return;
    try {
      await api.updateTag(tag.id!, name);
      await loadUserTags();
    } catch (e) { console.error('updateTag error:', e); }
  }
  async function handleDeleteTag(tag: UserTag) {
    if (!confirm($tr('library.deleteTagConfirm' as any).replace('{name}', tag.name))) return;
    try {
      await api.deleteTag(tag.id!);
      if (albumTagFilter === tag.id) applyTagFilter(null);
      await loadUserTags();
    } catch (e) { console.error('deleteTag error:', e); }
  }

  async function applyTagFilter(tagId: number | null) {
    albumTagFilter = tagId;
    if (tagId) {
      try {
        const result = await api.getTagAlbums(tagId);
        tagAlbumIds = new Set(result.albums.map(a => a.id!).filter(Boolean));
      } catch (e) { tagAlbumIds = new Set(); }
    } else {
      tagAlbumIds = new Set();
    }
  }
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
    if (_pid) untrack(() => loadFavoriteIds());
  });

  // Virtual scroll state (tracks)
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

  // Virtual scroll state (album grid). These MUST mirror the CSS
  // `.albums-grid` (`repeat(auto-fill, minmax(140px, 1fr))`, gap var(--space-lg)
  // = 24px on desktop). CSS auto-fill fits `floor((width + gap) / (min + gap))`
  // columns; the JS column count must use the SAME formula or the virtual-scroll
  // slice is laid out with a different column count than the grid actually
  // renders, shifting the whole grid by one thumbnail (#1022, triggered when a
  // vertical scrollbar appears past ~2300px and nudges the width across a
  // column boundary).
  const ALBUM_COL_MIN = 140;       // CSS minmax() min
  const ALBUM_GAP = 24;            // --space-lg (desktop)
  const ALBUM_TEXT_HEIGHT = 60;    // text + gap below artwork
  const ALBUM_OVERSCAN_ROWS = 3;
  let albumGridViewport = $state<HTMLDivElement | null>(null);
  let albumScrollTop = $state(0);
  let savedAlbumScrollTop = $state(0);
  let savedArtistScrollTop = $state(0);
  let restoringScroll = $state(false);
  let albumViewportHeight = $state(800);
  let albumViewportWidth = $state(1200);

  let prevAlbumCols = $state(0);

  let albumGridMetrics = $derived.by(() => {
    // Match CSS `auto-fill minmax(140px, 1fr)` exactly: floor((w + gap)/(min + gap)).
    const cols = Math.max(1, Math.floor((albumViewportWidth + ALBUM_GAP) / (ALBUM_COL_MIN + ALBUM_GAP)));
    const colWidth = albumViewportWidth / cols;
    const rowHeight = colWidth + ALBUM_TEXT_HEIGHT;
    const total = filteredAlbums.length;
    const rows = Math.ceil(total / cols);
    const totalHeight = rows * rowHeight;
    const startRow = Math.max(0, Math.floor(albumScrollTop / rowHeight) - ALBUM_OVERSCAN_ROWS);
    const endRow = Math.min(rows, Math.ceil((albumScrollTop + albumViewportHeight) / rowHeight) + ALBUM_OVERSCAN_ROWS);
    const startIdx = startRow * cols;
    const endIdx = Math.min(total, endRow * cols);
    const offsetY = startRow * rowHeight;
    return { cols, colWidth, rowHeight, totalHeight, startIdx, endIdx, offsetY };
  });

  $effect(() => {
    const cols = albumGridMetrics.cols;
    untrack(() => {
      if (prevAlbumCols > 0 && prevAlbumCols !== cols && albumScrollTop > 0) {
        // Reset scroll to top when grid columns change (window resize, etc.)
        // to avoid inconsistent scroll positions
        albumScrollTop = 0;
        if (albumGridViewport) albumGridViewport.scrollTop = 0;
      }
      prevAlbumCols = cols;
    });
  });

  let visibleAlbums = $derived(filteredAlbums.slice(albumGridMetrics.startIdx, albumGridMetrics.endIdx));

  function handleAlbumGridScroll(e: Event) {
    albumScrollTop = (e.currentTarget as HTMLDivElement).scrollTop;
    if (dupPopupAlbumId !== null) dupPopupAlbumId = null;
  }

  // Debounce helper for filter changes
  function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
    let timer: ReturnType<typeof setTimeout>;
    return ((...args: any[]) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    }) as T;
  }

  // Debounced filter setters
  let debouncedQualityFilter = $state<string | null>(null);
  let debouncedFormatFilter = $state<string | null>(null);
  let debouncedSampleRateFilter = $state<number | null>(null);

  const applyAlbumQualityFilter = debounce((v: string | null) => { albumQualityFilter = v; }, 100);
  const applyAlbumFormatFilter = debounce((v: string | null) => { albumFormatFilter = v; }, 100);
  const applyAlbumSampleRateFilter = debounce((v: number | null) => { albumSampleRateFilter = v; }, 100);

  function setAlbumQualityChip(v: string | null) {
    debouncedQualityFilter = v;
    applyAlbumQualityFilter(v);
  }
  function setAlbumFormatChip(v: string | null) {
    debouncedFormatFilter = v;
    applyAlbumFormatFilter(v);
  }
  function setAlbumSampleRateChip(v: number | null) {
    debouncedSampleRateFilter = v;
    applyAlbumSampleRateFilter(v);
  }

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
    const terms = fold(searchQuery).split(/\s+/).filter(t => t.length > 0);
    return $albums.filter(a => terms.every(q =>
      fold(a.title).includes(q)
      || fold(a.artist_name).includes(q)
      || fold(a.genre).includes(q)
      || String(a.year ?? '').includes(q)
    ));
  });

  // Albums filtered by search + quality + format + sample rate + favorites + duplicates (final display)
  // All album filters EXCEPT the year filter. The album date index derives its
  // year list from this, so every year stays selectable while one is active.
  let albumsPreYear = $derived.by(() => {
    let result = searchFilteredAlbums;
    if (albumQualityFilter) result = result.filter(a => a.quality === albumQualityFilter);
    if (albumFormatFilter) result = result.filter(a => a.format === albumFormatFilter);
    if (albumSampleRateFilter) result = result.filter(a => (a.sample_rate ?? 0) >= albumSampleRateFilter);
    if (albumFavoritesFilter) result = result.filter(a => a.id !== null && favAlbumIds.has(a.id!));
    if (albumDuplicatesFilter) result = result.filter(a => a.id !== null && duplicateAlbumIds.has(a.id!));
    if (albumTagFilter) result = result.filter(a => a.id !== null && tagAlbumIds.has(a.id!));
    return result;
  });

  let filteredAlbums = $derived(
    albumYearFilter ? albumsPreYear.filter(a => a.year === albumYearFilter) : albumsPreYear
  );

  // Reset album grid scroll when filters change (but not when restoring after back-nav)
  $effect(() => {
    // Access filteredAlbums.length to subscribe to changes
    const _len = filteredAlbums.length;
    if (restoringScroll) return;
    albumScrollTop = 0;
    if (albumGridViewport) albumGridViewport.scrollTop = 0;
  });

  // Album-grid scroll restore on Back (in-app AND browser/mouse — #1024) is
  // handled by the `_prevInDetail` effect below, which already keys off
  // selectedAlbum/selectedArtist becoming null (added for #870/#70). A separate
  // album-only effect here duplicated it; removed to keep a single source of
  // truth and avoid a double restore.

  let albumFormats = $derived(
    [...new Set(searchFilteredAlbums.map(a => a.format).filter(Boolean))].sort() as string[]
  );

  let albumSampleRates = $derived(
    [...new Set(searchFilteredAlbums.map(a => a.sample_rate).filter(Boolean))].sort((a, b) => (a ?? 0) - (b ?? 0)) as number[]
  );

  let filteredArtists = $derived.by(() => {
    let result = searchQuery.trim()
      ? $artists.filter(a => fold(a.name).includes(fold(searchQuery)))
      : [...$artists];
    result.sort((a, b) => {
      const nameA = (a.sort_name || a.name || '').toLowerCase();
      const nameB = (b.sort_name || b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
    return result;
  });

  // Alpha index for artists
  let artistLetters = $derived(
    [...new Set(filteredArtists.map(a => {
      const first = (a.sort_name || a.name).charAt(0).toUpperCase();
      return /[A-Z]/.test(first) ? first : '#';
    }))].sort((a, b) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b))
  );

  let activeArtistLetter = $state('');

  function scrollToArtistLetter(letter: string) {
    activeArtistLetter = letter;
    const idx = filteredArtists.findIndex(a => {
      const first = (a.sort_name || a.name).charAt(0).toUpperCase();
      const normalized = /[A-Z]/.test(first) ? first : '#';
      return normalized === letter;
    });
    if (idx < 0) return;
    const grid = document.querySelector('.artists-grid');
    if (!grid) return;
    const cards = grid.querySelectorAll('.artist-card');
    if (cards[idx]) {
      cards[idx].scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  const MONTH_NAMES = $derived([
    $tr('date.month1'), $tr('date.month2'), $tr('date.month3'), $tr('date.month4'),
    $tr('date.month5'), $tr('date.month6'), $tr('date.month7'), $tr('date.month8'),
    $tr('date.month9'), $tr('date.month10'), $tr('date.month11'), $tr('date.month12'),
  ]);

  // Year-only key for the album date index (months removed). Prefers `a.year`
  // so clicking a year in the index matches the `a.year === albumYearFilter`
  // grid filter exactly.
  function albumDateKey(a: any): string {
    const year = a.year || a.original_year || a.release_year;
    if (year) return `${year}`;
    const date = a.original_date || a.release_date;
    if (date && typeof date === 'string' && /^\d{4}/.test(date)) return date.substring(0, 4);
    return '?';
  }

  function formatDateKey(key: string): string {
    if (key.length === 7 && key[4] === '-') {
      const month = parseInt(key.substring(5), 10);
      return `${MONTH_NAMES[month - 1]} ${key.substring(0, 4)}`;
    }
    return key;
  }

  // Alpha index for albums (years + months when sorted by date, letters otherwise)
  let albumIndexEntries = $derived.by(() => {
    if (albumSort === 'release_date' || albumSort === 'original_year') {
      const keys = [...new Set(albumsPreYear.map(albumDateKey))];
      return albumSortOrder === 'desc' ? keys.sort((a, b) => b.localeCompare(a)) : keys.sort();
    }
    const letters = [...new Set(filteredAlbums.map(a => {
      const field = albumSort === 'artist' ? (a.artist_name || a.title) : a.title;
      const first = field.charAt(0).toUpperCase();
      return /[A-Z]/.test(first) ? first : '#';
    }))];
    return letters.sort((a, b) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b));
  });

  let activeAlbumEntry = $state('');

  function scrollToAlbumEntry(entry: string) {
    const isYear = albumSort === 'release_date' || albumSort === 'original_year';
    if (isYear) {
      // Clicking a year filters the grid to that year (toggle off if it is the
      // active one). '?' (unknown year) can't be filtered, so it clears instead.
      const y = parseInt(entry, 10);
      albumYearFilter = (!Number.isNaN(y) && albumYearFilter !== y) ? y : null;
      activeAlbumEntry = albumYearFilter ? entry : '';
      if (albumGridViewport) albumGridViewport.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    activeAlbumEntry = entry;
    const idx = filteredAlbums.findIndex(a => {
      const field = albumSort === 'artist' ? (a.artist_name || a.title) : a.title;
      const first = field.charAt(0).toUpperCase();
      const normalized = /[A-Z]/.test(first) ? first : '#';
      return normalized === entry;
    });
    if (idx < 0 || !albumGridViewport) return;
    const cols = albumGridMetrics.cols || 4;
    const rowHeight = albumGridMetrics.rowHeight || 220;
    const row = Math.floor(idx / cols);
    albumGridViewport.scrollTo({ top: row * rowHeight, behavior: 'smooth' });
  }

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
      const terms = fold(searchQuery).split(/\s+/).filter(t => t.length > 0);
      result = result.filter(t => terms.every(q =>
        fold(t.title).includes(q)
        || fold(t.artist_name).includes(q)
        || fold(t.album_title).includes(q)
      ));
    }
    return result;
  });

  let genreAlbums = $derived.by(() => {
    let result: typeof $albums = [];
    if (selectedNoGenre) {
      result = noGenreAlbums;
    } else if (selectedGenre) {
      const sel = selectedGenre.toLowerCase();
      result = $albums.filter(a => a.genre && a.genre.toLowerCase() === sel);
    } else if (selectedParent) {
      const branch = new Set([selectedParent.toLowerCase(),
        ...(genreTree[selectedParent] ?? []).map(c => c.toLowerCase())]);
      result = $albums.filter(a => a.genre && branch.has(a.genre.toLowerCase()));
    }
    if (searchQuery.trim()) {
      const q = fold(searchQuery);
      result = result.filter(a =>
        fold(a.title).includes(q)
        || fold(a.artist_name).includes(q)
        || String(a.year ?? a.original_year ?? '').includes(q)
      );
    }
    const dir = genreSortOrder === 'asc' ? 1 : -1;
    return result.sort((a, b) => {
      if (genreSort === 'year') {
        const ya = a.original_year ?? a.year ?? 0;
        const yb = b.original_year ?? b.year ?? 0;
        return (ya - yb) * dir || (a.title ?? '').localeCompare(b.title ?? '');
      }
      if (genreSort === 'artist') {
        return (a.artist_name ?? '').localeCompare(b.artist_name ?? '') * dir || (a.title ?? '').localeCompare(b.title ?? '');
      }
      return (a.title ?? '').localeCompare(b.title ?? '') * dir;
    });
  });

  // "No genre" filter state for genres tab
  let selectedNoGenre = $state(false);
  let genreBranchSort = $state<'count' | 'name'>('count');

  // Albums without genre
  let noGenreAlbums = $derived.by(() => {
    return $albums.filter(a => !a.genre || a.genre.trim() === '');
  });

  // Years tab: group albums by year (descending), unknown year at the bottom
  // Treat year=0 as unknown (same as null) so totals match the albums tab
  let yearGroups = $derived.by(() => {
    const map = new Map<number | null, Album[]>();
    const filtered = searchQuery.trim()
      ? $albums.filter(a => {
          const q = fold(searchQuery);
          return fold(a.title).includes(q)
            || fold(a.artist_name).includes(q)
            || String(a.year ?? a.original_year ?? '').includes(q);
        })
      : $albums;
    for (const album of filtered) {
      const raw = (album.year && album.year > 0) ? album.year : (album.original_year && album.original_year > 0) ? album.original_year : null;
      const y = raw;
      if (!map.has(y)) map.set(y, []);
      map.get(y)!.push(album);
    }
    const groups: { year: number | null; label: string; albums: Album[] }[] = [];
    const years = [...map.keys()].filter((y): y is number => y !== null).sort((a, b) => b - a);
    for (const y of years) {
      groups.push({ year: y, label: String(y), albums: map.get(y)! });
    }
    if (map.has(null)) {
      groups.push({ year: null, label: $tr('library.unknownYear'), albums: map.get(null)! });
    }
    return groups;
  });

  // Total albums across all year groups (should equal total filtered albums)
  let yearGroupsTotalCount = $derived(yearGroups.reduce((sum, g) => sum + g.albums.length, 0));

  let albumTotalDuration = $derived(
    $albumTracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0)
  );

  let tracksByDisc = $derived.by(() => {
    const map = new Map<number, typeof $albumTracks>();
    const subtitles = new Map<number, string | null>();
    for (const t of $albumTracks) {
      const disc = t.disc_number ?? 1;
      if (!map.has(disc)) map.set(disc, []);
      map.get(disc)!.push(t);
      if (t.disc_subtitle && !subtitles.has(disc)) subtitles.set(disc, t.disc_subtitle);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([num, tracks]) => [num, tracks, subtitles.get(num) ?? null] as [number, typeof $albumTracks, string | null]);
  });

  let hasMultipleDiscs = $derived(tracksByDisc.length > 1);

  function selectGenreInTab(name: string) {
    // If the user clicked on a genre name that's a parent in the tree,
    // treat it as a branch view. Otherwise it's a leaf — also resolve
    // its parent so the breadcrumb shows the path.
    if (genreTree[name]) {
      selectedParent = name;
      selectedGenre = null;
      return;
    }
    selectedGenre = name;
    selectedParent = null;
    for (const [p, kids] of Object.entries(genreTree)) {
      if (kids.some(c => c.toLowerCase() === name.toLowerCase())) {
        selectedParent = p;
        break;
      }
    }
  }

  function clearGenreSelection() {
    selectedGenre = null;
    selectedParent = null;
    selectedNoGenre = false;
  }

  function backToParent() {
    selectedGenre = null;
    selectedParent = displayParent;
  }

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
    selectedNoGenre = false;
    searchQuery = '';
    // Update current history entry so browser-back restores the correct tab
    try {
      const cur = window.history.state ?? {};
      window.history.replaceState({ ...cur, tab }, '', window.location.hash || '#library');
    } catch {}
  }

  let albumsLoaded = $state(false);
  let artistsLoaded = $state(false);
  let tracksLoaded = $state(false);

  async function loadAlbums() {
    libraryLoading.set(true);
    try {
      const first = await api.getAllAlbums(100, albumSort, albumSortOrder, 1, 100);
      albums.set(first);
      albumsLoaded = true;
      libraryLoading.set(false);
      if (first.length >= 100) {
        const rest = await api.getAllAlbums(2000, albumSort, albumSortOrder);
        albums.set(rest);
      }
    } catch (e) {
      console.error('Load albums error:', e);
      albumsLoaded = true;
      libraryLoading.set(false);
    }
  }

  async function loadArtists() {
    libraryLoading.set(true);
    try {
      const result = await api.getAllArtists();
      artists.set(result);
      artistsLoaded = true;
    } catch (e) {
      console.error('Load artists error:', e);
      artistsLoaded = true;
    }
    libraryLoading.set(false);
  }

  async function loadTracks() {
    libraryLoading.set(true);
    try {
      const result = await api.getAllTracks();
      tracks.set(result);
      tracksLoaded = true;
    } catch (e) {
      console.error('Load tracks error:', e);
      tracksLoaded = true;
    }
    libraryLoading.set(false);
  }

  async function selectAlbumDetail(album: Album) {
    if (!album.id) return;
    savedAlbumScrollTop = albumScrollTop;
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
      // Forward the active grid quality/format filter so the detail shows only
      // the matching tracks (a mixed album opened under a Hi-Res/FLAC filter
      // no longer reveals its MP3/44.1 tracks).
      const result = await api.getAlbumTracks(album.id, albumQualityFilter, albumFormatFilter);
      albumTracks.set(result);
      // History is pushed by App.svelte's `selectedAlbum` subscriber (single
      // source of truth). Pushing here too stacked a second identical entry, so
      // the browser Back button appeared to do nothing on the first press
      // (it landed on the duplicate albumId entry). See App.svelte.
    } catch (e) {
      console.error('Load album tracks error:', e);
      selectedAlbum.set(album);
    }
    libraryLoading.set(false);
  }

  async function selectArtistDetail(artist: Artist) {
    if (!artist.id) return;
    // Only save scroll position if navigating from the album grid (not from album detail)
    if (!$selectedAlbum) {
      savedAlbumScrollTop = albumScrollTop;
    }
    // The artist list scrolls inside `.library-view` (height:100% + overflow-y:
    // auto), NOT `.main-content` — whose child fills it exactly, so its scrollTop
    // stays 0. Reading `.main-content` here always captured 0, so Back landed at
    // the top of the artist list instead of the viewed artist (#870, Bilou).
    const scrollEl = document.querySelector('.library-view');
    if (scrollEl) savedArtistScrollTop = scrollEl.scrollTop;
    selectedArtist.set(artist);
    // History is pushed by App.svelte's `selectedArtist` subscriber; a second
    // pushState here made browser Back require two presses.
    selectedAlbum.set(null);
    artistMetadata = null;
    artistMetadataError = false;
    artistCredits = null;
    openSections = {};
    bioLevel = 'complete';
    libraryLoading.set(true);
    try {
      const result = await api.getArtistAlbums(artist.id);
      artistAlbums.set(result);
    } catch (e) {
      console.error('Load artist albums error:', e);
    }
    libraryLoading.set(false);
    // Lazy-load metadata + credits + streaming albums (non-blocking)
    loadArtistMetadata(artist.id);
    loadArtistCredits(artist.id);
    loadStreamingArtistAlbums(artist.name);
  }

  async function loadStreamingArtistAlbums(artistName: string) {
    streamingArtistAlbums = [];
    streamingArtistAlbumsLoading = true;
    const services = $streamingServices;
    const results: { service: string; albums: Album[] }[] = [];

    for (const [svc, status] of Object.entries(services)) {
      if (!status.authenticated) continue;
      try {
        const searchResults = await api.federatedSearch(artistName, [svc], 5);
        const svcData = searchResults.services?.[svc];
        if (!svcData?.artists?.length) {
          console.warn(`[streaming-albums] ${svc}: no artists found for "${artistName}"`);
          continue;
        }
        const matchedArtist = svcData.artists.find(
          (a: any) => a.name.toLowerCase() === artistName.toLowerCase()
        ) ?? svcData.artists[0];
        const artistId = matchedArtist.id ?? (matchedArtist as any).source_id;
        if (!artistId) {
          console.warn(`[streaming-albums] ${svc}: no artist ID for`, matchedArtist);
          continue;
        }
        console.log(`[streaming-albums] ${svc}: fetching albums for artist ${artistId} (${matchedArtist.name})`);
        const albums = await api.getStreamingArtistAlbums(svc, String(artistId));
        console.log(`[streaming-albums] ${svc}: got ${albums.length} albums`);
        if (albums.length > 0) {
          results.push({ service: svc, albums: albums.map(a => ({ ...a, source: svc as any })) });
        }
      } catch (e) {
        console.error(`[streaming-albums] ${svc}: error`, e);
      }
    }

    streamingArtistAlbums = results;
    streamingArtistAlbumsLoading = false;
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
        pendingSearchQuery.set(name);
        activeView.set('search');
      }
    } catch (e) {
      console.error('Navigate to similar artist error:', e);
    }
  }

  let artistBio = $derived.by(() => {
    if (artistMetadata) {
      if ($locale === 'en' && artistMetadata.bio_en) return artistMetadata.bio_en;
      if (artistMetadata.bio) return artistMetadata.bio;
      if (artistMetadata.bio_en) return artistMetadata.bio_en;
    }
    return $selectedArtist?.bio ?? null;
  });

  async function enrichArtistBio() {
    const artist = $selectedArtist;
    if (!artist?.id || enrichLoading) return;
    enrichLoading = true;
    try {
      const result = await api.enrichArtist(artist.id);
      const raw = (result as any)?.data ?? result;
      if (raw.bio_fr) raw.bio = raw.bio_fr;
      if (!raw.bio && raw.bio_summary) raw.bio = raw.bio_summary;
      if (!raw.enrichment_status && (result as any)?.enrichment_status) {
        raw.enrichment_status = (result as any).enrichment_status;
      }
      if (raw.similar_artists && !raw.similar) {
        raw.similar = raw.similar_artists.map((a: any) => a.name).filter(Boolean);
      }
      if (raw.tags && !raw.genres) {
        raw.genres = raw.tags;
      }
      artistMetadata = { ...artistMetadata, ...raw };
      // Auto-expand sections after enrichment
      if (raw.similar_artists?.length) openSections['similar'] = true;
      if (raw.bio) {
        notifications.success($tr('library.bioEnriched'));
      } else if (raw.similar_artists?.length || raw.tags?.length) {
        notifications.success($tr('library.similarAndTagsFound'));
      } else {
        notifications.info($tr('library.noInfoFound'));
      }
    } catch (e) {
      console.error('Enrich artist error:', e);
      notifications.error($tr('library.enrichUnavailable'));
    }
    enrichLoading = false;
  }

  // Restore the album grid scroll once the virtual-scroll list is tall enough to
  // hold the target offset. A fixed double-rAF isn't enough for a large library
  // (the grid's total height is only known after albums render + measure over
  // several frames), so scrollTop clamps to 0 and the user lands at the top
  // (#1024). Poll a bounded number of frames until the height is ready.
  function restoreAlbumScrollWhenReady(target: number) {
    if (target <= 0) { restoringScroll = false; return; }
    let attempts = 0;
    const tick = () => {
      const el = albumGridViewport;
      const ready = el && el.scrollHeight >= target + el.clientHeight;
      if (ready || attempts >= 30) {
        albumScrollTop = target;
        if (el) el.scrollTop = target;
        requestAnimationFrame(() => { restoringScroll = false; });
        return;
      }
      attempts += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Same poll-until-ready pattern as albums, but for the artist list, whose
  // scroll container is `.library-view` (not the album grid viewport). A fixed
  // 2-frame wait clamped to 0 on a large artist list, so the back button landed
  // at the top of the list instead of the viewed artist (#870, Bilou).
  function restoreArtistScrollWhenReady(target: number) {
    if (target <= 0) return;
    let attempts = 0;
    const tick = () => {
      // Restore on the real scroll container `.library-view` (see the capture
      // in selectArtistDetail) — not `.main-content`, which never scrolls (#870).
      const el = document.querySelector('.library-view') as HTMLElement | null;
      const ready = el && el.scrollHeight >= target + el.clientHeight;
      if (ready || attempts >= 30) {
        if (el) el.scrollTop = target;
        return;
      }
      attempts += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function goBack() {
    const restoreAlbumScroll = savedAlbumScrollTop;
    const restoreArtistScroll = savedArtistScrollTop;
    const wasArtistTab = $libraryTab === 'artists';
    selectedAlbum.set(null);
    selectedArtist.set(null);
    albumTracks.set([]);
    artistAlbums.set([]);
    streamingArtistAlbums = [];
    artistMetadata = null;
    artistMetadataError = false;
    artistMetadataLoading = false;
    window.history.back();
    // Restore the album-grid scroll explicitly for this in-app back button.
    // #103 dropped this call assuming the `selectedAlbum → null` effect covered
    // it, but that effect is guarded by `!restoringScroll`, so the in-app button
    // stopped restoring the position (Bertrand). Running it here sets
    // restoringScroll first, so the effect no-ops for browser-back — no double
    // restore. A saved value of 0 is a no-op.
    restoreAlbumScrollWhenReady(restoreAlbumScroll);
    if (wasArtistTab && restoreArtistScroll > 0) {
      // Poll until the re-rendered artist list is tall enough before restoring
      // scroll — a fixed 2-frame wait clamped to 0 on a large list (#870).
      restoreArtistScrollWhenReady(restoreArtistScroll);
    }
  }

  async function reportArtistImage(artistId: number) {
    try {
      await api.reportArtistImage(artistId);
      // Refresh artist in store
      const updated = await api.getArtist(artistId);
      selectedArtist.set(updated);
      notifications.success($tr('artist.imageReported'));
    } catch (e) {
      console.error('Report artist image error:', e);
      notifications.error($tr('artist.imageReportFailed'));
    }
  }

  let shuffleAllLoading = $state(false);

  async function shuffleAllLibrary() {
    if (!zone?.id) {
      notifications.error($tr('library.noZoneSelected'));
      return;
    }
    shuffleAllLoading = true;
    try {
      // Pass current search/filter context so shuffle applies to visible results
      const opts: { search_query?: string; genre?: string } = {};
      if (searchQuery.trim()) opts.search_query = searchQuery.trim();
      else if (selectedGenre) opts.genre = selectedGenre;
      const result = await api.shuffleAll(zone.id, Object.keys(opts).length ? opts : undefined);
      notifications.success($tr('library.shufflePlaying').replace('{count}', String(result.track_count)));
    } catch (e) {
      console.error('Shuffle all error:', e);
      notifications.error($tr('common.error') + ' : ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      shuffleAllLoading = false;
    }
  }

  async function playAlbum(albumId: number) {
    if (!zone?.id) {
      notifications.error($tr('library.noZoneSelected'));
      return;
    }
    try {
      // Respect the active quality/format filter: play only the matching tracks
      // instead of the whole (mixed-quality) album. Sergio #910/#915 — with a
      // FLAC / Hi-Res filter on, hitting play on an album card enqueued the
      // album's MP3 / 44.1 tracks too. getAlbumTracks applies the same
      // server-side filter the album detail uses. No filter (or empty result)
      // → the fast album_id path (whole album), unchanged.
      if (albumQualityFilter || albumFormatFilter) {
        const tracks = await api.getAlbumTracks(albumId, albumQualityFilter, albumFormatFilter);
        const ids = tracks.map(t => t.id).filter(Boolean) as number[];
        if (ids.length > 0) {
          await playAndSync(zone.id, { track_ids: ids });
          return;
        }
      }
      await playAndSync(zone.id, { album_id: albumId });
    } catch (e) {
      console.error('Play album error:', e);
      notifications.error($tr('library.playbackError') + ' : ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  // "Tout lire" from the album detail: play exactly the tracks currently shown.
  // The detail is loaded via getAlbumTracks() with the active quality/format
  // filter, so when a filter is on ($albumTracks holds only the matching subset)
  // the queue matches what the user sees instead of silently enqueuing the whole
  // (mixed-quality) album. Streaming albums (tracks without a numeric id) and any
  // load failure fall back to the plain album_id play.
  async function playAlbumDetail() {
    if (!zone?.id) {
      notifications.error($tr('library.noZoneSelected'));
      return;
    }
    const ids = $albumTracks.map(t => t.id).filter(Boolean) as number[];
    if (ids.length > 0) {
      try {
        await playAndSync(zone.id, { track_ids: ids });
      } catch (e) {
        console.error('Play album detail error:', e);
        notifications.error($tr('library.playbackError') + ' : ' + (e instanceof Error ? e.message : String(e)));
      }
      return;
    }
    if ($selectedAlbum?.id) await playAlbum($selectedAlbum.id);
  }

  async function playTrack(trackId: number) {
    if (!zone?.id) {
      notifications.error($tr('library.noZoneSelected'));
      return;
    }
    // If this track is already the one playing, restart it from the beginning
    // instead of rebuilding the queue (Elie: "retour au début de la piste").
    if (trackId === $currentTrack?.id) {
      try {
        await api.seek(zone.id, 0);
        if (isBrowserZone(zone)) browserSeek(0);
        seekPositionMs.set(0);
      } catch (e) {
        console.error('Restart track error:', e);
      }
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
      notifications.error($tr('library.playbackError') + ' : ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function playNext(track: Track) {
    if (!zone?.id) {
      notifications.error($tr('library.noZoneSelectedShort'));
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
      notifications.success(`"${track.title}" — ${$tr('library.playNext').toLowerCase()}`);
    } catch (e: any) {
      notifications.error(e?.message || $tr('common.error'));
    }
  }

  async function addTrackToQueue(track: Track) {
    if (!zone?.id) {
      notifications.error($tr('library.noZoneSelectedSelectZone'));
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

  // Detect browser-back (popstate) returning to grid from detail view
  let _prevInDetail = false;
  $effect(() => {
    const album = $selectedAlbum;
    const artist = $selectedArtist;
    untrack(() => {
      const inDetail = album != null || artist != null;
      const wasInDetail = _prevInDetail;
      _prevInDetail = inDetail;
      // Restore scroll when transitioning from detail back to grid (e.g. browser back button)
      if (wasInDetail && !inDetail && savedAlbumScrollTop > 0 && !restoringScroll) {
        restoringScroll = true;
        // Wait for the grid's virtual-scroll height to be laid out before setting
        // scrollTop, otherwise it clamps to 0 on browser-back (Pierre/#1024).
        restoreAlbumScrollWhenReady(savedAlbumScrollTop);
      }
      // Same for the artist list on browser-back (#870): restore its saved
      // position once the re-rendered list is tall enough.
      if (wasInDetail && !inDetail && $libraryTab === 'artists' && savedArtistScrollTop > 0) {
        restoreArtistScrollWhenReady(savedArtistScrollTop);
      }
    });
  });

  // Auto-load on tab switch
  $effect(() => {
    const tab = $libraryTab;
    untrack(() => {
      if (tab === 'albums' && !albumsLoaded && $albums.length === 0) loadAlbums();
      if (tab === 'artists' && !artistsLoaded && $artists.length === 0) loadArtists();
      if (tab === 'tracks' && !tracksLoaded && $tracks.length === 0) loadTracks();
      if (tab === 'genres' && !albumsLoaded && $albums.length === 0) loadAlbums();
      if (tab === 'years' && !albumsLoaded && $albums.length === 0) loadAlbums();
    });
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
        <AlbumArt coverPath={$selectedAlbum.cover_path} albumId={$selectedAlbum.id} size={400} alt={$selectedAlbum.title} />
        <div class="album-detail-info">
          <h2>{$selectedAlbum.title}</h2>
          {#if $selectedAlbum.artist_name}
            <button class="detail-artist-link" onclick={() => { if ($selectedAlbum?.artist_id) selectArtistDetail({ id: $selectedAlbum.artist_id, name: $selectedAlbum.artist_name! }); }}>{$selectedAlbum.artist_name}</button>
          {/if}
          <div class="detail-meta">
            {#if $selectedAlbum.year || $selectedAlbum.original_year}
              <span>{formatAlbumYear($selectedAlbum)}</span>
            {/if}
            {#if $selectedAlbum.genre}
              <span>{$selectedAlbum.genre.split(/[;\/\\]/).map(g => g.trim()).filter(Boolean).join(', ')}</span>
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
            <button class="play-all-btn" onclick={() => playAlbumDetail()} title={$tr('library.playAlbum')}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M8 5v14l11-7z" /></svg>
            </button>
            <button class="edit-btn" onclick={(e) => $selectedAlbum && openAlbumEdit(e, $selectedAlbum)} title={$tr('metadata.editAlbum')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              {$tr('metadata.editAlbum')}
            </button>
            {#if !$selectedAlbum.source || $selectedAlbum.source === 'local'}
              <button class="write-tags-btn" onclick={() => $selectedAlbum?.id && handleWriteAlbumTags($selectedAlbum.id)} disabled={writingAlbumTags}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /></svg>
                {writingAlbumTags ? $tr('library.writingTags') : $tr('library.writeTags')}
              </button>
            {/if}
            <div class="collection-dropdown-wrap" style="position:relative;display:inline-flex">
              <button class="edit-btn" onclick={() => { showCollectionMenu = !showCollectionMenu; if (!collectionsLoaded) loadCollections(); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                Collection
              </button>
              {#if showCollectionMenu}
                <div class="collection-dropdown">
                  {#if collections.length === 0}
                    <span class="collection-empty">{$tr('library.noCollections')}</span>
                  {:else}
                    {#each collections as col}
                      <button class="collection-option" onclick={() => handleAddToCollection(col.id)}>
                        {#if col.color}<span class="col-dot" style="background:{col.color}"></span>{/if}
                        {col.name}
                      </button>
                    {/each}
                  {/if}
                </div>
              {/if}
            </div>
          </div>
          {#if writeTagsMessage}
            <div class="write-tags-message">{writeTagsMessage}</div>
          {/if}
          <!-- User tags -->
          {#if $selectedAlbum?.id}
            {@const albumId = $selectedAlbum.id}
            {#key albumTagsKey}
              {#await api.getTagsForItem('album', albumId) then albumTags}
                <div class="album-tags-row">
                  {#each albumTags as tag}
                    <span class="album-tag-chip" style="background:{tag.color}">
                      {tag.name}
                      <button class="tag-remove" onclick={async () => { await api.untagItem(tag.id!, 'album', albumId); await loadUserTags(); albumTagsKey++; }}>×</button>
                    </span>
                  {/each}
                  <button class="tag-add-btn" onclick={() => showTagPicker = !showTagPicker}>+ Tag</button>
                </div>
              {/await}
            {/key}
            {#if showTagPicker}
              <div class="tag-picker">
                <input class="tag-picker-input" type="text" placeholder={$tr('library.newTagPlaceholder')} bind:value={newTagName} onkeydown={(e) => { if (e.key === 'Enter' && newTagName.trim()) handleCreateAndAssignTag(albumId); }} />
                {#each userTags as tag}
                  <button class="tag-picker-option" onclick={async () => { await api.tagItem(tag.id!, 'album', albumId); showTagPicker = false; await loadUserTags(); albumTagsKey++; }}>
                    <span class="tag-dot" style="background:{tag.color}"></span>
                    {tag.name}
                  </button>
                {/each}
              </div>
            {/if}
          {/if}
          <button class="bio-toggle-btn" onclick={() => { showAlbumBio = !showAlbumBio; if (showAlbumBio && $selectedAlbum?.id) loadAlbumBio($selectedAlbum.id); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            {showAlbumBio ? $tr('library.hideNotes') : $tr('library.notesBio')}
          </button>
          {#if showAlbumBio}
            <div class="album-bio-section">
              {#if albumBioLoading}
                <div class="spinner-sm"></div>
              {:else if albumBio}
                {@const simpleCut = albumBio.indexOf('.') > 0 ? albumBio.indexOf('.', 80) + 1 || 200 : 200}
                {@const simpleText = albumBio.slice(0, Math.min(simpleCut, 300)).trim()}
                {@const completeCut = 800}
                {@const completeText = albumBio.length > completeCut ? albumBio.slice(0, completeCut).trim() + '...' : albumBio}
                {@const displayAlbumBio = albumBioLevel === 'simple' ? simpleText : albumBioLevel === 'complete' ? completeText : albumBio}
                {#if albumBio.length > 300}
                  <div class="bio-level-pills">
                    <button class="bio-level-pill" class:active={albumBioLevel === 'simple'} onclick={() => albumBioLevel = 'simple'}>{$tr('library.bioLevelSimple')}</button>
                    <button class="bio-level-pill" class:active={albumBioLevel === 'complete'} onclick={() => albumBioLevel = 'complete'}>{$tr('library.bioLevelComplete')}</button>
                    <button class="bio-level-pill" class:active={albumBioLevel === 'full'} onclick={() => albumBioLevel = 'full'}>{$tr('library.bioLevelFull')}</button>
                  </div>
                {/if}
                <p class="album-bio-text">{displayAlbumBio}</p>
              {:else}
                <p class="album-bio-empty">{$tr('library.noAlbumNote')}</p>
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
                  placeholder={$tr('library.ratingNotePlaceholder')}
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
        {#each tracksByDisc as [discNum, discTracks, discSubtitle]}
          <div class="disc-header">{$tr('library.disc').replace('{num}', String(discNum))}{#if discSubtitle} — {discSubtitle}{/if}</div>
          <div class="track-list">
            {#each discTracks as t, index}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="track-item" onclick={() => t.id && playTrack(t.id)}>
                <span class="track-num">
                  <span class="num-text">{t.track_number ?? index + 1}</span>
                  <span class="num-play">&#9654;</span>
                </span>
                <div class="track-info">
                  <span class="track-title truncate">{t.title}</span>
                  {#if t.artist_name}
                    <span class="track-artist truncate">{t.artist_name}</span>
                  {/if}
                  <MetadataChips track={t} fields={$displayFields} />
                </div>
                {#if t.format}<span class="audio-format">{formatAudioBadge(t)}</span>{/if}
                <span class="track-duration">{formatTime(t.duration_ms)}</span>
                <span class="track-heart" onclick={(e) => e.stopPropagation()}><HeartButton trackId={t.id} size={14} /></span>
                <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); addTrackToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
              <button class="play-next-btn" onclick={(e) => { e.stopPropagation(); playNext(t); }} title={$tr('library.playNext')}>
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
                <!-- Track context menu -->
                <div class="track-more-wrap">
                  <button class="track-more-btn" onclick={(e) => openTrackMenu(e, t.id)} title={$tr('library.moreOptions')}>···</button>
                  {#if trackMenuOpenId === t.id}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="track-menu-backdrop" onclick={closeTrackMenu}></div>
                    <div class="track-menu">
                      <button class="track-menu-item" onclick={(e) => { e.stopPropagation(); closeTrackMenu(); t.id && playTrack(t.id); }}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z"/></svg>
                        {$tr('common.play')}
                      </button>
                      <button class="track-menu-item" onclick={(e) => { e.stopPropagation(); closeTrackMenu(); addTrackToQueue(t); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                        {$tr('queue.addToQueue')}
                      </button>
                      {#if onAddToPlaylist}
                        <button class="track-menu-item" onclick={(e) => { e.stopPropagation(); closeTrackMenu(); onAddToPlaylist!(t); }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5"/><line x1="16" y1="3" x2="16" y2="11"/><line x1="12" y1="7" x2="20" y2="7"/></svg>
                          {$tr('nowplaying.addToPlaylist')}
                        </button>
                      {/if}
                      {#if t.artist_name}
                        <button class="track-menu-item" onclick={(e) => { e.stopPropagation(); closeTrackMenu(); const a = $artists.find(ar => ar.name === t.artist_name); if (a) selectArtistDetail(a); }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          {$tr('library.goToArtist')}
                        </button>
                      {/if}
                    </div>
                  {/if}
                </div>
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
              <span class="track-num">
                <span class="num-text">{t.track_number ?? index + 1}</span>
                <span class="num-play">&#9654;</span>
              </span>
              <div class="track-info" title={t.file_path ?? ''}>
                <span class="track-title truncate">{t.title}</span>
                {#if t.artist_name}
                  <span class="track-artist truncate">{t.artist_name}</span>
                {/if}
                <MetadataChips track={t} fields={$displayFields} />
              </div>
              {#if t.format}<span class="audio-format">{formatAudioBadge(t)}</span>{/if}
              <span class="track-duration">{formatTime(t.duration_ms)}</span>
              <span class="track-heart" onclick={(e) => e.stopPropagation()}><HeartButton trackId={t.id} size={14} /></span>
              <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); addTrackToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
              <button class="play-next-btn" onclick={(e) => { e.stopPropagation(); playNext(t); }} title={$tr('library.playNext')}>
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
              <!-- Track context menu -->
              <div class="track-more-wrap">
                <button class="track-more-btn" onclick={(e) => openTrackMenu(e, t.id)} title={$tr('library.moreOptions')}>···</button>
                {#if trackMenuOpenId === t.id}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="track-menu-backdrop" onclick={closeTrackMenu}></div>
                  <div class="track-menu">
                    <button class="track-menu-item" onclick={(e) => { e.stopPropagation(); closeTrackMenu(); t.id && playTrack(t.id); }}>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z"/></svg>
                      {$tr('common.play')}
                    </button>
                    <button class="track-menu-item" onclick={(e) => { e.stopPropagation(); closeTrackMenu(); addTrackToQueue(t); }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                      {$tr('queue.addToQueue')}
                    </button>
                    {#if onAddToPlaylist}
                      <button class="track-menu-item" onclick={(e) => { e.stopPropagation(); closeTrackMenu(); onAddToPlaylist!(t); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5"/><line x1="16" y1="3" x2="16" y2="11"/><line x1="12" y1="7" x2="20" y2="7"/></svg>
                        {$tr('nowplaying.addToPlaylist')}
                      </button>
                    {/if}
                    {#if t.artist_name}
                      <button class="track-menu-item" onclick={(e) => { e.stopPropagation(); closeTrackMenu(); const a = $artists.find(ar => ar.id === t.artist_id) ?? $artists.find(ar => ar.name === t.artist_name) ?? (t.artist_id != null ? { id: t.artist_id, name: t.artist_name ?? '' } as Artist : undefined); if (a?.id != null) selectArtistDetail(a as Artist); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        {$tr('library.goToArtist')}
                      </button>
                    {/if}
                    <button class="track-menu-item" onclick={(e) => { e.stopPropagation(); closeTrackMenu(); selectAlbumDetail($selectedAlbum!); }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 13h4"/></svg>
                      {$tr('library.goToAlbum')}
                    </button>
                  </div>
                {/if}
              </div>
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
          {#if $selectedArtist.image_path}
            <AlbumArt coverPath={$selectedArtist.image_path} size={160} alt={$selectedArtist.name} round />
          {:else if artistMetadata?.image_url}
            <img class="artist-detail-img" src={artistMetadata.image_url} alt={$selectedArtist.name} loading="lazy" onerror={(e) => (e.target as HTMLImageElement).style.display='none'} />
          {:else}
            <span class="artist-detail-initials">{initials($selectedArtist.name)}</span>
          {/if}
        </div>
        <div class="artist-detail-info">
          {#if editingArtistName}
            <div class="artist-name-edit">
              <input
                type="text"
                class="artist-name-input"
                bind:value={artistNameInput}
                onkeydown={(e) => { if (e.key === 'Enter') saveArtistName(); if (e.key === 'Escape') cancelEditArtistName(); }}
                autofocus
              />
              <button class="artist-name-save" onclick={saveArtistName} disabled={artistNameSaving || !artistNameInput.trim()}>
                {#if artistNameSaving}
                  <div class="spinner-sm"></div>
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
                {/if}
              </button>
              <button class="artist-name-cancel" onclick={cancelEditArtistName}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          {:else}
            <h2 class="artist-detail-name">
              {$selectedArtist.name}
              <span class="artist-detail-heart"><HeartButton artistId={$selectedArtist.id} size={20} /></span>
              <button class="artist-edit-btn" onclick={() => showArtistEdit = true} title={$tr('library.editArtist')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </button>
            </h2>
          {/if}
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
          {#if $selectedArtist.image_path || artistMetadata?.image_url}
            <button class="report-image-btn" title={$tr('artist.reportImage')} onclick={() => reportArtistImage($selectedArtist.id!)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
            </button>
          {/if}
        </div>
      </div>

      <!-- Bio -->
      {#if artistBio}
        {@const isLong = artistBio.length > 500}
        {@const simpleCut = artistBio.indexOf('.') > 0 ? artistBio.indexOf('.', 100) + 1 || 200 : 200}
        {@const simpleText = artistBio.slice(0, Math.min(simpleCut, 400)).trim()}
        {@const completeCut = 1500}
        {@const completeText = artistBio.length > completeCut ? artistBio.slice(0, completeCut).replace(/\n[^\n]*$/, '').trim() + '...' : artistBio}
        {@const displayBio = !isLong ? artistBio : bioLevel === 'simple' ? simpleText : bioLevel === 'complete' ? completeText : artistBio}
        {#if isLong}
          <div class="bio-level-pills">
            <button class="bio-level-pill" class:active={bioLevel === 'simple'} onclick={() => bioLevel = 'simple'}>{$tr('library.bioLevelSimple')}</button>
            <button class="bio-level-pill" class:active={bioLevel === 'complete'} onclick={() => bioLevel = 'complete'}>{$tr('library.bioLevelComplete')}</button>
            <button class="bio-level-pill" class:active={bioLevel === 'full'} onclick={() => bioLevel = 'full'}>{$tr('library.bioLevelFull')}</button>
          </div>
        {/if}
        <blockquote class="artist-bio">
          {#each displayBio.split('\n').filter(p => p.trim()) as paragraph}
            <p>{paragraph}</p>
          {/each}
        </blockquote>
        <div class="bio-actions">
          <button class="bio-enrich-btn" onclick={enrichArtistBio} disabled={enrichLoading}>
            {#if enrichLoading}
              <div class="btn-spinner"></div>
              {$tr('artist.enriching')}
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" /></svg>
              {isLong ? $tr('library.reEnrich') : $tr('library.enrichBio')}
            {/if}
          </button>
        </div>
      {:else if !artistMetadataLoading}
        <div class="bio-actions">
          <button class="bio-enrich-btn bio-enrich-btn--prominent" onclick={enrichArtistBio} disabled={enrichLoading}>
            {#if enrichLoading}
              <div class="btn-spinner"></div>
              {$tr('artist.enriching')}
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" /></svg>
              {$tr('library.getBio')}
            {/if}
          </button>
        </div>
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
        {#if $artistAlbums.length === 0 && !streamingArtistAlbumsLoading}
          <div class="empty-hint" style="padding: 8px 0; color: var(--tune-text-muted); font-size: 13px;">{$tr('library.noLocalAlbumsHint')}</div>
        {/if}
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
              <span class="album-card-title truncate" title={album.title}>{album.title}</span>
              {#if album.year || album.original_year}
                <span class="album-card-year">{formatAlbumYear(album)}</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Streaming albums -->
      {#if streamingArtistAlbumsLoading}
        <div class="artist-section">
          <div class="artist-section-header-static">
            <span class="artist-section-title">{$tr('library.streamingAlbums')}</span>
          </div>
          <div class="streaming-loading">{$tr('common.loading')}</div>
        </div>
      {:else if streamingArtistAlbums.length === 0 && $artistAlbums.length === 0}
        <div class="artist-section">
          <div class="artist-section-header-static">
            <span class="artist-section-title">{$tr('library.streamingAlbums')}</span>
          </div>
          <div class="empty-hint" style="padding: 8px 0; color: var(--tune-text-muted); font-size: 13px;">{$tr('library.noStreamingAlbumsHint')}</div>
        </div>
      {/if}
      {#each streamingArtistAlbums as { service, albums: svcAlbums }}
        <div class="artist-section">
          <div class="artist-section-header-static">
            <span class="artist-section-title">
              <ServiceBadge source={service} />
              {svcAlbums.length} {svcAlbums.length > 1 ? 'albums' : 'album'}
            </span>
          </div>
          <div class="albums-grid">
            {#each svcAlbums as album}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="album-card" onclick={() => {
                activeStreamingService.set(service);
                pendingStreamingAlbum.set(album);
                activeView.set('streaming');
              }}>
                <div class="album-card-art">
                  <AlbumArt coverPath={album.cover_path} size={200} alt={album.title} />
                  <button class="play-overlay" onclick={(e) => {
                    e.stopPropagation();
                    const zoneId = $currentZone?.id;
                    if (zoneId && album.source_id) {
                      playAndSync(zoneId, { source: service, streaming_album_id: album.source_id });
                    }
                  }} title={$tr('common.play')}>
                    <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><path d="M8 5v14l11-7z" /></svg>
                  </button>
                </div>
                <span class="album-card-title truncate" title={album.title}>{album.title}</span>
                {#if album.year}
                  <span class="album-card-year">{album.year}</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>

  {:else}
    <!-- Main library view -->
    <div class="library-header">
      <h2>{$tr('library.title')}</h2>
      <button class="shuffle-all-btn" onclick={shuffleAllLibrary} disabled={shuffleAllLoading} title={searchQuery.trim() || selectedGenre ? $tr('library.shuffleResults') : $tr('library.shuffleAll')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
        {shuffleAllLoading ? $tr('common.loading') : (searchQuery.trim() || selectedGenre ? $tr('library.shuffle') : $tr('library.shuffleAll'))}
      </button>
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
          <button class="tab" class:active={$libraryTab === 'years'} onclick={() => switchTab('years')}>{$tr('common.years')}</button>
        </div>
      </div>
    </div>

    {#if scanProgress}
      <div class="scan-banner">
        <div class="spinner small"></div>
        <span class="scan-progress">{$tr('library.scanProgress').replace('{scanned}', String(scanProgress.scanned)).replace('{added}', String(scanProgress.added))}</span>
        <button class="scan-stop-btn" onclick={stopScan} disabled={cancellingScan}>
          {cancellingScan ? '…' : $tr('library.stopScan')}
        </button>
      </div>
    {/if}

    {#if $libraryLoading}
      <div class="loading">
        <div class="spinner"></div>
        {$tr('common.loading')}
      </div>
    {:else if $libraryTab === 'albums'}
      <div class="quality-filters">
        <button class="quality-chip" class:active={!albumQualityFilter} onclick={() => setAlbumQualityChip(null)}>{$tr('metadata.all')} ({searchFilteredAlbums.length})</button>
        {#each [
          { key: 'dsd', label: 'DSD' },
          { key: 'hi-res', label: 'Hi-Res' },
          { key: 'cd', label: 'CD' },
          { key: 'lossy', label: 'Lossy' },
        ] as tier}
          {@const count = searchFilteredAlbums.filter(a => a.quality === tier.key).length}
          {#if count > 0}
            <button class="quality-chip {tier.key}" class:active={albumQualityFilter === tier.key} onclick={() => setAlbumQualityChip(albumQualityFilter === tier.key ? null : tier.key)}>
              {tier.label} ({count})
            </button>
          {/if}
        {/each}
        {#if albumFormats.length > 1}
          <span class="filter-sep">|</span>
          {#each albumFormats as fmt}
            {@const count = searchFilteredAlbums.filter(a => a.format === fmt).length}
            {#if count > 0}
              <button class="quality-chip format" class:active={albumFormatFilter === fmt} onclick={() => setAlbumFormatChip(albumFormatFilter === fmt ? null : fmt)}>
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
              <button class="quality-chip samplerate" class:active={albumSampleRateFilter === sr} onclick={() => setAlbumSampleRateChip(albumSampleRateFilter === sr ? null : sr)}>
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
        {#if duplicateAlbumCount > 0}
          <button class="quality-chip duplicates" class:active={albumDuplicatesFilter} onclick={() => albumDuplicatesFilter = !albumDuplicatesFilter}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="8" y="2" width="13" height="13" rx="2" /><path d="M4 8H3a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1" /></svg>
            {$tr('library.duplicates')} ({duplicateAlbumCount})
          </button>
        {/if}
        {#if userTags.length > 0}
          <span class="filter-sep">|</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="opacity:0.5;flex-shrink:0"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          {#each userTags as tag}
            <span class="user-tag-wrap">
              <button
                class="quality-chip user-tag"
                class:active={albumTagFilter === tag.id}
                style="--tag-color: {tag.color}"
                onclick={() => applyTagFilter(albumTagFilter === tag.id ? null : tag.id!)}
              >
                <span class="tag-dot" style="background:{tag.color}"></span>
                {tag.name} ({tag.count ?? 0})
              </button>
              {#if manageTags}
                <button class="tag-manage-btn" title={$tr('library.renameTag' as any)} onclick={() => handleRenameTag(tag)} aria-label={$tr('library.renameTag' as any)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                </button>
                <button class="tag-manage-btn danger" title={$tr('library.deleteTag' as any)} onclick={() => handleDeleteTag(tag)} aria-label={$tr('library.deleteTag' as any)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              {/if}
            </span>
          {/each}
          <button class="tag-manage-toggle" class:active={manageTags} title={$tr('library.manageTags' as any)} aria-label={$tr('library.manageTags' as any)} onclick={() => manageTags = !manageTags}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        {/if}
        {#if albumYearFilter}
          <span class="filter-sep">|</span>
          <button class="quality-chip year active" onclick={() => { albumYearFilter = null; activeAlbumEntry = ''; }}>
            {albumYearFilter}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        {/if}
        <span class="filter-sep">|</span>
        <span class="sort-control">
          <svg class="sort-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M3 6h18M3 12h12M3 18h6" /></svg>
          <select class="sort-select" value={albumSort} onchange={(e) => setAlbumSort((e.currentTarget as HTMLSelectElement).value as AlbumSortKey)}>
            {#each ALBUM_SORT_OPTIONS as opt}
              <option value={opt.key}>{$tr(opt.label)}</option>
            {/each}
          </select>
          <button class="sort-order-btn" onclick={() => { albumSortOrder = albumSortOrder === 'asc' ? 'desc' : 'asc'; localStorage.setItem('tune_album_sort_order', albumSortOrder); loadAlbums(); }} title={albumSortOrder === 'asc' ? $tr('library.ascending') : $tr('library.descending')}>
            {#if albumSortOrder === 'asc'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="18 15 12 9 6 15" /></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9" /></svg>
            {/if}
          </button>
        </span>
        <span class="quality-count">{filteredAlbums.length} album{filteredAlbums.length > 1 ? 's' : ''}</span>
      </div>
      <div class="album-viewport-wrapper">
        {#if albumIndexEntries.length > 5}
          <AlphaIndex letters={albumIndexEntries} activeLetter={activeAlbumEntry} onSelect={scrollToAlbumEntry} formatLabel={(albumSort === 'release_date' || albumSort === 'original_year') ? formatDateKey : undefined} />
        {/if}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="album-grid-viewport" bind:this={albumGridViewport} onscroll={handleAlbumGridScroll}
          use:observeHeight={(h) => { albumViewportHeight = h; }}
          use:observeWidth={(w) => { albumViewportWidth = w; }}>
          {#if filteredAlbums.length === 0}
          <div class="empty">{searchQuery ? $tr('common.noResult') : $tr('library.noAlbums')}</div>
        {:else}
          <div style="height:{albumGridMetrics.totalHeight}px;position:relative;">
            <div class="albums-grid" style="transform:translateY({albumGridMetrics.offsetY}px);">
              {#each visibleAlbums as album (album.id ?? album.title)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="album-card" onclick={() => selectAlbumDetail(album)}>
                  <div class="album-card-art">
                    <img class="album-cover-img" src={api.artworkUrl(album.cover_path, 200)} alt={album.title} loading="lazy" onerror={(e) => (e.target as HTMLImageElement).style.display='none'} />
                    <div class="art-scrim"></div>
                    <button class="play-overlay" onclick={(e) => { e.stopPropagation(); album.id && playAlbum(album.id); }} title={$tr('library.playAlbum')}>
                      <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><path d="M8 5v14l11-7z" /></svg>
                    </button>
                    <button class="edit-overlay" onclick={(e) => openAlbumEdit(e, album)} title={$tr('metadata.editAlbum')}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                    <span class="heart-overlay"><HeartButton albumId={album.id} size={14} /></span>
                    {#if album.id !== null && album.id !== undefined && duplicateAlbumIds.has(album.id)}
                      {@const siblings = getDuplicateSiblings(album)}
                      <button class="dup-badge" onclick={(e) => toggleDupPopup(album.id!, e)} title={$tr('library.existsInVersions').replace('{count}', String(siblings.length))}>
                        {siblings.length} versions
                      </button>
                      {#if dupPopupAlbumId === album.id}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div class="dup-popup-backdrop" onclick={(e) => { e.stopPropagation(); closeDupPopup(); }}></div>
                        <div class="dup-popup">
                          <div class="dup-popup-title">{siblings.length} versions</div>
                          {#each siblings as sib (sib.id ?? sib.title)}
                            <button class="dup-popup-item" class:current={sib.id === album.id} onclick={(e) => { e.stopPropagation(); closeDupPopup(); selectAlbumDetail(sib); }}>
                              <span class="dup-popup-format">{formatAlbumQualityLabel(sib)}</span>
                              {#if sib.year}<span class="dup-popup-year">{sib.year}</span>{/if}
                              {#if sib.id === album.id}<span class="dup-popup-current">{$tr('library.current')}</span>{/if}
                            </button>
                          {/each}
                        </div>
                      {/if}
                    {/if}
                  </div>
                  <span class="album-card-title truncate" title={album.title}>{album.title}</span>
                  {#if album.artist_name}
                    <span class="album-card-artist truncate" title={album.artist_name}>{album.artist_name}</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
          {/if}
        </div>
      </div>

    {:else if $libraryTab === 'artists'}
      <div class="artists-section">
        {#if artistLetters.length > 5}
          <AlphaIndex letters={artistLetters} activeLetter={activeArtistLetter} onSelect={scrollToArtistLetter} />
        {/if}
        <div class="artists-grid">
          {#each filteredArtists as artist}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="artist-card" onclick={() => selectArtistDetail(artist)}>
            <div class="artist-card-avatar-wrap">
              <div class="artist-card-avatar">
                {#if artist.image_path}
                  <AlbumArt coverPath={artist.image_path} size={100} alt={artist.name} round />
                {:else}
                  {initials(artist.name)}
                {/if}
              </div>
              <span class="artist-heart"><HeartButton artistId={artist.id} size={14} /></span>
            </div>
            <span class="artist-card-name truncate">{artist.name}</span>
          </div>
        {/each}
        {#if filteredArtists.length === 0}
          <div class="empty">{searchQuery ? $tr('common.noResult') : $tr('library.noArtists')}</div>
        {/if}
        </div>
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
          <span class="filter-label">{$tr('library.quality')}</span>
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
                <MetadataChips track={t} fields={$displayFields} />
              </div>
              {#if t.format}<span class="audio-format">{formatAudioBadge(t)}</span>{/if}
              <span class="track-duration">{formatTime(t.duration_ms)}</span>
              <HeartButton trackId={t.id} size={14} />
              <button class="edit-track-btn" onclick={(e) => openTrackEdit(e, t)} title={$tr('metadata.editTrack')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </button>
              <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); addTrackToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
              <button class="play-next-btn" onclick={(e) => { e.stopPropagation(); playNext(t); }} title={$tr('library.playNext')}>
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
      {#if selectedGenre || selectedParent || selectedNoGenre}
        <!-- Genre filtered albums (parent branch OR specific subgenre OR no genre) -->
        <div class="genre-detail-header">
          <button class="back-btn" onclick={clearGenreSelection}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
            {$tr('common.genres')}
          </button>
          {#if selectedNoGenre}
            <span class="bc-sep">/</span>
            <span class="bc-current">{$tr('library.noGenreLabel')}</span>
          {:else}
            {#if displayParent}
              <span class="bc-sep">/</span>
              {#if selectedGenre}
                <button class="bc-link" onclick={backToParent}>{displayParent}</button>
              {:else}
                <span class="bc-current">{displayParent}</span>
              {/if}
            {/if}
            {#if selectedGenre}
              <span class="bc-sep">/</span>
              <span class="bc-current">{selectedGenre}</span>
            {/if}
          {/if}
          <span class="genre-detail-count">{genreAlbums.length} {genreAlbums.length > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
          <span class="sort-control">
            <svg class="sort-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M3 6h18M3 12h12M3 18h6" /></svg>
            <select class="sort-select" value={genreSort} onchange={(e) => setGenreSort((e.currentTarget as HTMLSelectElement).value as GenreSortKey)}>
              {#each GENRE_SORT_OPTIONS as opt}
                <option value={opt.key}>{$tr(opt.label)}</option>
              {/each}
            </select>
            <button class="sort-order-btn" onclick={() => { genreSortOrder = genreSortOrder === 'asc' ? 'desc' : 'asc'; localStorage.setItem('tune_genre_sort_order', genreSortOrder); }} title={genreSortOrder === 'asc' ? $tr('library.ascending') : $tr('library.descending')}>
              {#if genreSortOrder === 'asc'}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 5v14M5 12l7-7 7 7" /></svg>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 19V5M5 12l7 7 7-7" /></svg>
              {/if}
            </button>
          </span>
        </div>

        <!-- Subchips when on a parent branch (or with a child selected) -->
        {#if displayParent && genreTree[displayParent]}
          <div class="bc-chips">
            {#if selectedGenre}
              <button class="bc-chip" onclick={backToParent}>{$tr('metadata.all')}</button>
            {:else}
              <button class="bc-chip bc-chip-all" disabled>{$tr('metadata.all')}</button>
            {/if}
            {#each genreTree[displayParent] as child}
              {@const c = ($genres.find(g => g.name.toLowerCase() === child.toLowerCase())?.count ?? 0)}
              {#if c > 0}
                <button class="bc-chip" class:active={selectedGenre === child} onclick={() => selectGenreInTab(child)}>
                  {child} <span class="bc-chip-count">{c}</span>
                </button>
              {/if}
            {/each}
          </div>
        {/if}

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
              <span class="album-card-title truncate" title={album.title}>{album.title}</span>
              {#if album.artist_name}
                <span class="album-card-artist truncate" title={album.artist_name}>{album.artist_name}</span>
              {/if}
              {#if selectedParent && album.genre && album.genre.toLowerCase() !== (selectedParent ?? '').toLowerCase()}
                <span class="album-card-genre truncate">{album.genre.split(/[;\/\\]/).map(g => g.trim()).filter(Boolean).join(', ')}</span>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <!-- Genre tree: branches first, then orphans. -->
        {#if !genreSearchQuery}
          <div class="year-summary">
            <span class="year-summary-total">{$albums.length} {$albums.length > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
            {#if noGenreAlbums.length > 0}
              <span class="year-summary-groups">{$tr('library.ofWhichNoGenre').replace('{count}', String(noGenreAlbums.length))}</span>
            {/if}
            <div class="genre-sort-btns">
              <button class="genre-sort-btn" class:active={genreBranchSort === 'count'} onclick={() => genreBranchSort = 'count'}>{$tr('library.sortByCount')}</button>
              <button class="genre-sort-btn" class:active={genreBranchSort === 'name'} onclick={() => genreBranchSort = 'name'}>A-Z</button>
            </div>
          </div>
        {/if}
        {#if filteredGenreTreeKeys.length > 0}
          <div class="branches">
            {#each filteredGenreTreeKeys.sort((a, b) => genreBranchSort === 'name' ? a.localeCompare(b) : (parentAlbumCounts[b] ?? 0) - (parentAlbumCounts[a] ?? 0)) as parent (parent)}
              {@const total = parentAlbumCounts[parent] ?? 0}
              {#if total > 0}
                <div class="branch-row">
                  <button class="branch-card" onclick={() => selectGenreInTab(parent)}>
                    <span class="branch-name">{parent}</span>
                    <span class="branch-count">{total} {total > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
                  </button>
                  <div class="branch-children">
                    {#each genreTree[parent] as child}
                      {@const c = ($genres.find(g => g.name.toLowerCase() === child.toLowerCase())?.count ?? 0)}
                      {#if c > 0}
                        <button class="child-chip" onclick={() => selectGenreInTab(child)}>
                          {child} <span class="child-chip-count">{c}</span>
                        </button>
                      {/if}
                    {/each}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {/if}

        {#if filteredOrphanGenres.length > 0}
          <h3 class="bc-section-title">{$tr('library.outsideTree')}</h3>
          <div class="genres-grid">
            {#each filteredOrphanGenres.sort((a, b) => genreBranchSort === 'name' ? a.name.localeCompare(b.name) : b.count - a.count) as g}
              <button class="genre-card" onclick={() => selectGenreInTab(g.name)}>
                <span class="genre-card-name">{g.name}</span>
                <span class="genre-card-count">{g.count} {g.count > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
              </button>
            {/each}
          </div>
        {/if}

        {#if noGenreAlbums.length > 0 && !genreSearchQuery}
          <h3 class="bc-section-title">{$tr('library.noGenreSection')}</h3>
          <div class="genres-grid">
            <button class="genre-card genre-card-warning" onclick={() => { selectedNoGenre = true; selectedGenre = null; selectedParent = null; }}>
              <span class="genre-card-name">{$tr('library.noGenreLabel')}</span>
              <span class="genre-card-count">{noGenreAlbums.length} {noGenreAlbums.length > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
            </button>
          </div>
        {/if}

        {#if $genres.length === 0}
          <div class="empty">{$tr('library.noGenres')}</div>
        {:else if genreSearchQuery && filteredGenreTreeKeys.length === 0 && filteredOrphanGenres.length === 0}
          <div class="empty">{$tr('common.noResult')}</div>
        {/if}
      {/if}

    {:else if $libraryTab === 'years'}
      {#if yearGroups.length === 0}
        <div class="empty">{$tr('library.noAlbums')}</div>
      {:else}
        <div class="year-summary">
          <span class="year-summary-total">{yearGroupsTotalCount} {yearGroupsTotalCount > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
          <span class="year-summary-groups">{yearGroups.length} {yearGroups.length > 1 ? $tr('library.yearGroupPlural') : $tr('library.yearGroup')}</span>
        </div>
        {#each yearGroups as group}
          <div class="year-section">
            <h3 class="year-header">{group.label}</h3>
            <span class="year-count">{group.albums.length} {group.albums.length > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
          </div>
          <div class="albums-grid">
            {#each group.albums as album}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="album-card" onclick={() => selectAlbumDetail(album)}>
                <div class="album-card-art">
                  <img class="album-cover-img" src={api.artworkUrl(album.cover_path, 200)} alt={album.title} loading="lazy" onerror={(e) => (e.target as HTMLImageElement).style.display='none'} />
                  <button class="play-overlay" onclick={(e) => { e.stopPropagation(); album.id && playAlbum(album.id); }} title={$tr('library.playAlbum')}>
                    <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><path d="M8 5v14l11-7z" /></svg>
                  </button>
                </div>
                <span class="album-card-title truncate" title={album.title}>{album.title}</span>
                {#if album.artist_name}
                  <span class="album-card-artist truncate" title={album.artist_name}>{album.artist_name}</span>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
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

{#if showArtistEdit && $selectedArtist}
  <ArtistEditModal
    artist={$selectedArtist}
    onClose={() => showArtistEdit = false}
    onSaved={(updated) => {
      selectedArtist.set(updated);
      showArtistEdit = false;
    }}
  />
{/if}

<style>
  .library-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    padding-bottom: calc(var(--space-lg) + 24px);
    overflow-y: auto;
    overflow-x: hidden;
  }

  .library-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    gap: var(--space-md);
    flex-wrap: wrap;
    /* Keep the right-side controls (year switches etc.) clear of the floating
       global search button pinned to the top-right. */
    padding-right: 52px;
  }

  .library-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  .shuffle-all-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: var(--tune-accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s;
  }

  .shuffle-all-btn:hover {
    opacity: 0.85;
  }

  .shuffle-all-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
    gap: 2px;
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

  .bio-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .bio-actions .bio-toggle-btn { margin-top: 0; }

  .bio-enrich-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--tune-border);
    border-radius: 14px;
    padding: 5px 14px;
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 500;
    color: var(--tune-accent);
    cursor: pointer;
    transition: all 0.15s;
  }
  .bio-enrich-btn:hover:not(:disabled) {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
  }
  .bio-enrich-btn:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .bio-enrich-btn--prominent {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
    padding: 8px 20px;
    font-size: 13px;
  }
  .bio-enrich-btn--prominent:hover:not(:disabled) {
    background: var(--tune-accent-hover);
  }
  .btn-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255,255,255,0.2);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  .bio-level-pills {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }
  .bio-level-pill {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 14px;
    border: 1px solid var(--tune-border);
    background: transparent;
    color: var(--tune-text-secondary);
    cursor: pointer;
    transition: all 0.12s;
  }
  .bio-level-pill:hover { border-color: var(--tune-accent); color: var(--tune-text); }
  .bio-level-pill.active {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
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
    justify-content: center;
    width: 40px;
    height: 40px;
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: transform 0.12s ease-out, background 0.12s ease-out;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .play-all-btn:hover {
    background: var(--tune-accent-hover);
    transform: scale(1.08);
  }

  /* Albums grid */
  .quality-filters {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    flex-shrink: 0;
    flex-wrap: wrap;
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

  .quality-chip.user-tag {
    gap: 4px;
  }
  .quality-chip.user-tag.active {
    background: var(--tag-color, #808080);
    border-color: var(--tag-color, #808080);
  }
  .tag-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .user-tag-wrap {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .tag-manage-btn,
  .tag-manage-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px;
    border: none;
    background: transparent;
    color: var(--tune-text, #ccc);
    opacity: 0.6;
    border-radius: 4px;
    cursor: pointer;
    line-height: 0;
  }
  .tag-manage-btn:hover,
  .tag-manage-toggle:hover {
    opacity: 1;
    background: rgba(128, 128, 128, 0.18);
  }
  .tag-manage-btn.danger:hover {
    color: #e74c3c;
  }
  .tag-manage-toggle.active {
    opacity: 1;
    color: var(--tune-accent, #3498db);
  }

  .album-tags-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
    align-items: center;
  }
  .album-tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    color: white;
    letter-spacing: 0.3px;
  }
  .tag-remove {
    background: none;
    border: none;
    color: rgba(255,255,255,0.7);
    cursor: pointer;
    font-size: 14px;
    padding: 0 2px;
    line-height: 1;
  }
  .tag-remove:hover { color: white; }
  .tag-add-wrap { position: relative; }
  .tag-add-btn {
    background: none;
    border: 1px dashed var(--tune-border);
    color: var(--tune-text-muted);
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tag-add-btn:hover { border-color: var(--tune-accent); color: var(--tune-accent); }
  .tag-picker {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: 6px;
    min-width: 180px;
    z-index: 100;
    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tag-picker-input {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    background: var(--tune-bg);
    color: var(--tune-text);
    font-size: 12px;
    font-family: inherit;
    outline: none;
    margin-bottom: 4px;
  }
  .tag-picker-input:focus { border-color: var(--tune-accent); }
  .tag-picker-option {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border: none;
    background: none;
    color: var(--tune-text);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    border-radius: var(--radius-sm);
    text-align: left;
  }
  .tag-picker-option:hover { background: var(--tune-surface-hover); }

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

  .sort-control {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .sort-icon {
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  .sort-select {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 12px;
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    outline: none;
    transition: border-color 0.12s;
  }

  .sort-select:focus {
    border-color: var(--tune-accent);
  }

  .sort-order-btn {
    background: none;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    color: var(--tune-text-secondary);
    cursor: pointer;
    padding: 2px 4px;
    display: inline-flex;
    align-items: center;
    transition: all 0.12s;
  }

  .sort-order-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .album-viewport-wrapper {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
    gap: 4px;
  }

  .album-grid-viewport {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    /* Reserve the scrollbar gutter permanently so the content-box width does not
       shrink when the vertical scrollbar appears (content taller than viewport,
       e.g. past ~2300px). Otherwise the width feeds back into the virtual-scroll
       column math (floor((w+gap)/(min+gap))) and the album grid shifts by one
       thumbnail to the left the moment the scrollbar shows up (#1022). With the
       gutter always reserved, albumViewportWidth is invariant → JS cols == CSS
       cols at every scroll position. */
    scrollbar-gutter: stable;
  }

  .albums-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    grid-auto-rows: min-content;
    gap: var(--space-lg);
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

  /* Hover dim over the whole cover — purely visual, lets clicks fall through
     to the card so clicking the cover OPENS the album (a click on the cover
     used to start playback, which was confusing — esp. for coverless albums). */
  .art-scrim {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    opacity: 0;
    transition: opacity 0.15s ease-out;
    pointer-events: none;
    border-radius: var(--radius-lg);
    z-index: 2;
  }

  .album-card-art:hover .art-scrim {
    opacity: 1;
  }

  /* Dedicated centered play button — the only spot that triggers playback. */
  .play-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 52px;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    opacity: 0;
    /* Invisible-but-clickable would swallow a click on the (grey) art area of a
       cover-less album (e.g. DSF), playing it instead of opening the detail view
       (Thibaud, #989). Only capture clicks while actually shown on hover; a
       plain click on the artwork then bubbles to the card → open detail. Also
       prevents accidental plays on touch devices (no hover). */
    pointer-events: none;
    transition: opacity 0.15s ease-out;
    border: none;
    cursor: pointer;
    border-radius: 50%;
    z-index: 3;
  }

  .album-card-art:hover .play-overlay {
    opacity: 1;
    pointer-events: auto;
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

  /* Duplicate badge overlay on album card */
  .dup-badge {
    position: absolute;
    bottom: 6px;
    right: 6px;
    z-index: 3;
    background: rgba(245, 158, 11, 0.92);
    color: white;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    line-height: 1.3;
    letter-spacing: 0.02em;
    backdrop-filter: blur(4px);
    box-shadow: 0 1px 4px rgba(0,0,0,0.25);
    transition: background 0.15s;
  }

  .dup-badge:hover {
    background: rgba(217, 119, 6, 0.95);
  }

  .dup-popup-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .dup-popup {
    position: absolute;
    bottom: 36px;
    right: 4px;
    z-index: 100;
    background: var(--tune-surface, #1e1e2e);
    border: 1px solid var(--tune-border, #333);
    border-radius: 8px;
    padding: 6px 0;
    min-width: 180px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }

  .dup-popup-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--tune-text-muted, #999);
    padding: 4px 12px 6px;
    border-bottom: 1px solid var(--tune-border, #333);
    margin-bottom: 2px;
  }

  .dup-popup-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: none;
    color: var(--tune-text, #eee);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .dup-popup-item:hover {
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.15);
  }

  .dup-popup-item.current {
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.1);
  }

  .dup-popup-format {
    font-weight: 600;
    flex: 1;
  }

  .dup-popup-year {
    font-size: 11px;
    color: var(--tune-text-muted, #999);
  }

  .dup-popup-current {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--tune-accent, #6366f1);
    font-weight: 700;
  }

  /* Duplicates filter chip */
  .quality-chip.duplicates {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .quality-chip.duplicates.active {
    background: #f59e0b;
    border-color: #f59e0b;
    color: white;
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

  .quality-chip.year {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .quality-chip.year.active {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
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

  .album-card-genre {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-accent);
    opacity: 0.7;
    max-width: 160px;
  }

  /* Artists section + grid */
  .artists-section {
    flex: 1;
    display: flex;
    min-height: 0;
    gap: 4px;
  }

  .artists-grid {
    /* Fill the remaining width next to the vertical AlphaIndex — .artists-section
       is a flex row, and without flex:1 the grid shrank to its min content, so
       `auto-fill` collapsed to a SINGLE column (Bilou #1092, Jean Valjean #1096:
       "un artiste par ligne"). min-width:0 lets it shrink past content instead
       of overflowing. */
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-lg);
    /* No inner scroll: the whole .library-view scrolls as one region (same
       Firefox double-scrollbar fix as the Genres tab — #1075). The old
       padding-right cleared the now-removed inner scrollbar. */
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

  .artist-card-avatar-wrap {
    position: relative;
    display: flex;
  }

  /* Heart sits in a non-clipped wrapper (the avatar itself is overflow:hidden
     + round, which would clip a corner-anchored heart). */
  .artist-heart {
    position: absolute;
    top: 2px;
    right: 2px;
    z-index: 2;
  }

  .artist-heart :global(.heart-btn) {
    opacity: 0;
    color: white;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
  }

  .artist-heart :global(.heart-btn.active) {
    opacity: 1;
    color: #ef4444;
  }

  .artist-card:hover .artist-heart :global(.heart-btn) {
    opacity: 0.85;
  }

  .artist-heart :global(.heart-btn:hover) {
    opacity: 1 !important;
  }

  .artist-detail-heart {
    display: inline-flex;
    vertical-align: middle;
  }

  .artist-detail-heart :global(.heart-btn.active) {
    color: #ef4444;
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
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
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
    flex-wrap: wrap;
  }

  .scan-progress {
    width: 100%;
    text-align: center;
    font-size: 0.85em;
    opacity: 0.7;
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

  .scan-banner {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin: 0 var(--space-md) var(--space-md);
    padding: 8px 14px;
    background: var(--tune-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--tune-border);
    border-radius: 8px;
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 0.85em;
  }

  .scan-banner .scan-progress {
    width: auto;
    text-align: left;
    flex: 1;
    opacity: 0.85;
  }

  .scan-stop-btn {
    border: 1px solid var(--tune-border);
    background: transparent;
    color: var(--tune-text, inherit);
    padding: 4px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 1em;
    white-space: nowrap;
  }

  .scan-stop-btn:hover:not(:disabled) {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .scan-stop-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Genres grid */
  .genres-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-md);
    /* No inner scroll: the whole .library-view scrolls as one region. A second
       overflow-y here made Firefox draw a classic scrollbar overlapping the
       page's on the Genres tab (#1075); Chrome hid it with overlay scrollbars. */
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
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
    flex-wrap: wrap;
  }
  .bc-sep { color: var(--tune-text-muted); user-select: none; }
  .bc-link {
    background: none; border: none; color: var(--tune-accent);
    cursor: pointer; font-size: 14px; padding: 0;
  }
  .bc-link:hover { text-decoration: underline; }
  .bc-current { font-weight: 600; color: var(--tune-text); font-size: 14px; }

  .bc-chips {
    display: flex; flex-wrap: wrap; gap: 6px;
    margin-bottom: var(--space-md);
  }
  .bc-chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 10px;
    background: var(--tune-bg);
    color: var(--tune-text-muted);
    border: 1px solid var(--tune-border);
    border-radius: 14px; font-size: 12px; cursor: pointer;
  }
  .bc-chip:hover { color: var(--tune-text); border-color: var(--tune-accent); }
  .bc-chip.active { background: var(--tune-accent); color: white; border-color: var(--tune-accent); }
  .bc-chip-all { background: rgba(var(--tune-accent-rgb,99,102,241),0.15); color: var(--tune-accent); cursor: default; }
  .bc-chip-count { color: inherit; opacity: 0.7; font-size: 11px; }
  .bc-section-title {
    font-family: var(--font-label);
    font-size: 13px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--tune-text-muted);
    margin: var(--space-md) 0 var(--space-sm);
  }

  /* Grid on wide screens (desktop) instead of a single vertical column: the
     branch cards tile in 2-3 columns, which reads better on large displays and
     keeps the genre name close to its album count. On narrow screens auto-fill
     collapses to one column. Both this and the orphan `.genres-grid` below are
     grids, so the load-order flip (orphans render first, then the tree groups
     them) no longer swaps a grid for a vertical list. */
  .branches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--space-md);
    align-items: start;
    margin-bottom: var(--space-xl);
  }
  .branch-row {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    padding: var(--space-md) var(--space-lg);
    display: flex; flex-direction: column; gap: var(--space-sm);
  }
  /* Full-width button (whole top strip clickable) with the count sitting right
     after the name instead of pushed to the far edge — on wide screens
     `space-between` left the count marooned across the card from the name. */
  .branch-card {
    display: flex; justify-content: flex-start; align-items: baseline;
    gap: var(--space-sm); width: 100%;
    background: none; border: none; padding: 0;
    color: var(--tune-text); cursor: pointer; text-align: left;
  }
  .branch-name { font-family: var(--font-label); font-size: 18px; font-weight: 700; }
  .branch-card:hover .branch-name { color: var(--tune-accent); }
  .branch-count { font-family: var(--font-body); font-size: 13px; color: var(--tune-text-muted); }
  .branch-children { display: flex; flex-wrap: wrap; gap: 6px; }
  .child-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px;
    background: rgba(var(--tune-accent-rgb,99,102,241),0.10);
    color: var(--tune-text);
    border: 1px solid rgba(var(--tune-accent-rgb,99,102,241),0.18);
    border-radius: 14px; font-size: 12px; cursor: pointer;
  }
  .child-chip:hover { background: rgba(var(--tune-accent-rgb,99,102,241),0.22); }
  .child-chip-count { color: var(--tune-text-muted); font-size: 11px; }

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
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .artist-edit-btn {
    display: inline-flex;
    align-items: center;
    padding: 4px;
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    border-radius: 4px;
    /* Always visible (subtle), not hover-only: it was invisible without a mouse
       hover, so touch users and anyone not hovering couldn't find it (#1081). */
    opacity: 0.55;
    transition: opacity 0.15s, color 0.15s;
  }

  .artist-detail-name:hover .artist-edit-btn {
    opacity: 1;
  }

  .artist-edit-btn:hover {
    color: var(--tune-accent);
  }

  .artist-name-edit {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .artist-name-input {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.8px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-accent);
    border-radius: 6px;
    padding: 4px 10px;
    color: var(--tune-text);
    outline: none;
    min-width: 200px;
  }

  .artist-name-save,
  .artist-name-cancel {
    display: inline-flex;
    align-items: center;
    padding: 6px;
    border: 1px solid var(--tune-border);
    border-radius: 4px;
    background: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    transition: all 0.12s;
  }

  .artist-name-save:hover:not(:disabled) {
    color: var(--tune-success, #4ade80);
    border-color: var(--tune-success, #4ade80);
  }

  .artist-name-cancel:hover {
    color: var(--tune-danger, #f87171);
    border-color: var(--tune-danger, #f87171);
  }

  .artist-name-save:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .artist-detail-count {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
  }

  .report-image-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: 1px solid var(--tune-border);
    border-radius: 4px;
    background: transparent;
    color: var(--tune-text-muted);
    cursor: pointer;
    font-size: 11px;
    opacity: 0.6;
    transition: opacity 0.15s, color 0.15s;
  }
  .report-image-btn:hover {
    opacity: 1;
    color: var(--tune-accent);
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
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .streaming-loading {
    color: var(--tune-text-muted);
    font-size: 13px;
    padding: 12px 0;
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

  /* Collection dropdown */
  .collection-dropdown-wrap {
    display: inline-flex;
  }

  .collection-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 10px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    z-index: 20;
    box-shadow: var(--shadow-lg);
    min-width: 160px;
    margin-top: 4px;
  }

  .collection-option {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    padding: 6px 12px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.1s;
    white-space: nowrap;
  }

  .collection-option:hover {
    background: var(--tune-surface-hover);
    color: var(--tune-text);
  }

  .collection-empty {
    padding: 8px 12px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .col-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  @media (max-width: 480px) {
    .library-view {
      padding: var(--space-md) 12px;
    }

    .library-header {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-sm);
    }

    .library-header h2 {
      font-size: 22px;
    }

    .library-header-right {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-sm);
    }

    .search-box {
      width: 100%;
    }

    .search-box input {
      width: 100%;
      flex: 1;
    }

    .tab-bar {
      width: 100%;
      justify-content: stretch;
    }

    .tab {
      flex: 1;
      text-align: center;
      padding: var(--space-xs) var(--space-sm);
      font-size: 12px;
    }

    .shuffle-all-btn {
      width: 100%;
      justify-content: center;
    }
  }

  /* Kiosk: fewer, larger album cards */
  @media (max-width: 840px) and (max-height: 520px) {
    .albums-grid {
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 8px;
    }

    .album-card-title {
      font-size: 12px;
    }

    .album-card-artist {
      font-size: 11px;
    }
  }

  /* "No genre" card variant */
  .genre-card-warning {
    border-color: var(--tune-warning, #e6a23c);
    border-style: dashed;
  }

  .genre-card-warning:hover {
    border-color: var(--tune-warning, #e6a23c);
    background: color-mix(in srgb, var(--tune-warning, #e6a23c) 8%, var(--tune-surface));
  }

  /* Years tab summary */
  .year-summary {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
    padding: var(--space-sm) 0;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
  }

  .genre-sort-btns {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }

  .genre-sort-btn {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: 12px;
    padding: 3px 10px;
    font-size: 11px;
    color: var(--tune-text-muted);
    cursor: pointer;
    transition: all 0.12s;
  }

  .genre-sort-btn.active {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
  }

  .year-summary-total {
    font-weight: 600;
    color: var(--tune-text);
  }

  .year-summary-groups::before {
    content: '·';
    margin-right: var(--space-md);
  }

  /* Years tab */
  .year-section {
    display: flex;
    align-items: baseline;
    gap: var(--space-md);
    margin-top: var(--space-lg);
    margin-bottom: var(--space-sm);
    padding-bottom: 6px;
    border-bottom: 1px solid var(--tune-border);
  }

  .year-section:first-child {
    margin-top: 0;
  }

  .year-header {
    font-family: var(--font-label);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.5px;
    margin: 0;
  }

  .year-count {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
  }

  /* Hover play icon on track number */
  .track-num .num-play {
    display: none;
    color: var(--tune-accent);
    font-size: 11px;
  }

  .track-item:hover .num-text {
    display: none;
  }

  .track-item:hover .num-play {
    display: inline;
  }

  /* Track context menu ("...") */
  .track-more-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .track-more-btn {
    width: 28px;
    height: 28px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 1px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s ease-out;
    opacity: 0;
    line-height: 1;
    padding: 0;
  }

  .track-item:hover .track-more-btn {
    opacity: 1;
  }

  .track-more-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .track-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .track-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 10px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 1px;
    z-index: 100;
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.4));
    min-width: 190px;
    white-space: nowrap;
  }

  .track-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    padding: 7px 12px;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.1s;
    text-align: left;
    width: 100%;
  }

  .track-menu-item:hover {
    background: var(--tune-surface-hover);
    color: var(--tune-text);
  }
</style>

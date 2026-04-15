<script lang="ts">
  import * as api from '../lib/api';
  import { artworkUrl } from '../lib/api';
  import type { Album, Artist, Track, CompletenessStats, BackupInfo } from '../lib/types';
  import { t } from '../lib/i18n';
  import AlbumArt from './AlbumArt.svelte';
  import AlbumEditModal from './AlbumEditModal.svelte';

  let stats = $state<CompletenessStats | null>(null);
  let albumsWithoutCover = $state<Album[]>([]);
  let allAlbums = $state<Album[]>([]);
  let tracksWithoutArtist = $state<Track[]>([]);
  let tracksWithoutArtistLoaded = $state(false);
  let unknownTracks = $state<Track[]>([]);
  let unknownTracksLoaded = $state(false);
  let selectedTrackIds = $state<Set<number>>(new Set());
  let artists = $state<Artist[]>([]);
  let selectedArtistId = $state<number | null>(null);
  let artistSearch = $state('');
  let artistDropdownOpen = $state(false);
  let applying = $state(false);
  let editingAlbumId = $state<number | null>(null);
  let editingAlbumTitle = $state('');
  let editingTrackId = $state<number | null>(null);
  let editingTrackTitle = $state('');
  let editingAlbumArtistId = $state<number | null>(null);
  let albumArtistSearch = $state('');
  let albumArtistDropdownOpen = $state(false);
  let loading = $state(true);
  let filter = $state<'all' | 'no_cover' | 'no_genre' | 'no_year' | 'no_artist' | 'unknown' | 'doubtful' | 'duplicates'>('no_cover');
  let doubtfulAlbums = $state<import('../lib/api').DoubtfulAlbum[]>([]);
  let doubtfulLoaded = $state(false);

  // Metadata Manager v2
  let autoFixStatus = $state('idle');
  let autoFixProgress = $state('');
  let scanningDuplicates = $state(false);
  let duplicates = $state<any[]>([]);
  let suggestions = $state<any[]>([]);
  let suggestionCount = $state(0);
  let showSuggestions = $state(false);

  let fixYearsRunning = $state<string | null>(null);
  let fixYearsResult = $state<{ source: string; total: number; fixed: number; not_found: number } | null>(null);
  let fixGenresRunning = $state(false);
  let fixGenresResult = $state<{ total: number; fixed: number } | null>(null);

  async function handleFixYears(source: string) {
    fixYearsRunning = source;
    fixYearsResult = null;
    try {
      let result: any;
      if (source === 'musicbrainz') result = await api.fixYearsMusicBrainz();
      else if (source === 'discogs') result = await api.fixYearsDiscogs();
      else if (source === 'tidal') result = await api.fixYearsTidal();
      else if (source === 'tags') result = await api.fixYearsTags();
      fixYearsResult = { source, total: result.total ?? 0, fixed: result.fixed ?? 0, not_found: result.not_found ?? 0 };
      api.getCompletenessStats().then(s => stats = s);
    } catch (e: any) {
      fixYearsResult = { source, total: 0, fixed: 0, not_found: 0 };
    }
    fixYearsRunning = null;
  }

  async function handleFixGenres() {
    fixGenresRunning = true;
    fixGenresResult = null;
    try {
      const result = await api.fixGenres();
      fixGenresResult = { total: result.total ?? 0, fixed: result.fixed ?? 0 };
      api.getCompletenessStats().then(s => stats = s);
    } catch {
      fixGenresResult = { total: 0, fixed: 0 };
    }
    fixGenresRunning = false;
  }

  function dismissFixResult() {
    fixYearsResult = null;
    fixGenresResult = null;
    writeResult = null;
  }

  let writingTags = $state(false);
  let writingCovers = $state(false);
  let writeResult = $state<{ type: string; message: string } | null>(null);

  async function handleWriteTags() {
    if (!confirm('Écrire les métadonnées (genre, année, artiste...) dans tous les fichiers musicaux ?')) return;
    writingTags = true;
    writeResult = null;
    try {
      const r = await api.writeAllTags();
      writeResult = { type: 'tags', message: `Tags écrits : ${r.updated} fichiers modifiés, ${r.skipped} ignorés, ${r.errors} erreurs` };
    } catch (e: any) {
      writeResult = { type: 'tags', message: `Erreur : ${e?.message || e}` };
    }
    writingTags = false;
  }

  async function handleWriteCovers() {
    if (!confirm('Copier les covers dans les dossiers albums (cover.jpg) ?')) return;
    writingCovers = true;
    writeResult = null;
    try {
      const r = await api.writeAllCovers();
      writeResult = { type: 'covers', message: `Covers : ${r.written} copiées, ${r.skipped} déjà présentes, ${r.errors} erreurs` };
    } catch (e: any) {
      writeResult = { type: 'covers', message: `Erreur : ${e?.message || e}` };
    }
    writingCovers = false;
  }

  let albumNameInput = $state('');
  let unknownGraved = $state(false);
  let unknownGravedTrackIds = $state<number[]>([]);

  async function applyArtistAndAlbum() {
    if (selectedTrackIds.size === 0) return;
    const savedIds = [...selectedTrackIds];
    applying = true;
    try {
      // Apply artist directly (don't call applyArtist which clears state)
      if (selectedArtistId) {
        const artistName = artists.find(a => a.id === selectedArtistId)?.name ?? '';
        await Promise.all(
          savedIds.map(id => api.updateTrack(id, { artist_id: selectedArtistId! }))
        );
        const idsSet = new Set(savedIds);
        unknownTracks = unknownTracks.map(t =>
          idsSet.has(t.id!) ? { ...t, artist_id: selectedArtistId, artist_name: artistName } : t
        );
      }

      // Apply album name directly
      if (albumNameInput.trim()) {
        const name = albumNameInput.trim();
        const albums = await api.getAlbums();
        const existing = albums.find((a: any) => a.title?.toLowerCase() === name.toLowerCase());
        let albumId = existing?.id;
        if (!albumId) {
          const res = await api.apiFetch(`/library/albums`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: name }),
          });
          albumId = res?.id;
        }
        if (albumId) {
          for (const tid of savedIds) {
            await api.updateTrackMetadata(tid, { album_id: albumId });
          }
        }
        albumNameInput = '';
      }

      unknownGraved = true;
      unknownGravedTrackIds = savedIds;
      selectedTrackIds = new Set();
      selectedArtistId = null;
      artistSearch = '';
    } catch (e) {
      console.error('Apply error:', e);
    }
    applying = false;
  }

  async function graverUnknownTags() {
    if (unknownGravedTrackIds.length === 0) return;
    try {
      // Get album IDs for these tracks and write tags per album
      const albumIds = new Set<number>();
      for (const t of unknownTracks) {
        if (unknownGravedTrackIds.includes(t.id!) && t.album_id) {
          albumIds.add(t.album_id);
        }
      }
      let total = 0;
      for (const aid of albumIds) {
        const r = await api.writeAlbumTags(aid);
        total += r.success ?? r.tracks_processed ?? 0;
      }
      writeResult = { type: 'tags', message: `Tags gravés : ${total} fichiers` };
      unknownGraved = false;
      unknownGravedTrackIds = [];
    } catch (e: any) {
      writeResult = { type: 'tags', message: `Erreur gravure : ${e?.message || e}` };
    }
  }

  async function applyAlbumName() {
    const name = albumNameInput.trim();
    if (!name || selectedTrackIds.size === 0) return;
    applying = true;
    try {
      const trackIds = [...selectedTrackIds];
      // Find or create album with this name
      let albumId: number | null = null;
      const albums = await api.getAlbums();
      const existing = albums.find((a: any) => a.title?.toLowerCase() === name.toLowerCase());
      if (existing) {
        albumId = existing.id;
      } else {
        // Create album via library API
        const res = await api.apiFetch(`/library/albums`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: name }),
        });
        albumId = res?.id;
      }
      if (albumId) {
        // Update all selected tracks to point to this album
        for (const tid of trackIds) {
          await api.updateTrackMetadata(tid, { album_id: albumId });
        }
      }
      albumNameInput = '';
      selectedTrackIds = new Set();
      // Refresh data without full reload
      const sc = await api.getCompletenessStats();
      stats = sc;
    } catch (e) {
      console.error('Apply album error:', e);
    }
    applying = false;
  }

  let fixingAlbums = $state(false);
  let fixAlbumsResult = $state('');

  async function handleAutoFixAlbums() {
    fixingAlbums = true;
    try {
      const r = await api.autoFixAlbums();
      fixAlbumsResult = `${r.tracks_fixed} tracks corrigés, ${r.albums_created} albums créés`;
      // Refresh stats
      // Refresh data without full reload
      const sc = await api.getCompletenessStats();
      stats = sc;
    } catch (e) {
      fixAlbumsResult = 'Erreur';
    }
    fixingAlbums = false;
  }

  async function handleAutoFix() {
    if (autoFixStatus === 'running') return;
    autoFixStatus = 'running';
    try {
      await api.startAutoFix();
      // Poll status
      const poll = setInterval(async () => {
        const s = await api.getAutoFixStatus();
        autoFixProgress = `${s.current}/${s.total}`;
        if (s.status === 'completed') {
          autoFixStatus = 'idle';
          autoFixProgress = `${s.fixed} corrigés, ${s.suggestions} suggestions`;
          clearInterval(poll);
          await loadSuggestions();
        }
      }, 2000);
    } catch { autoFixStatus = 'idle'; }
  }

  let scanDupMessage = $state<string | null>(null);

  async function handleScanDuplicates() {
    scanningDuplicates = true;
    scanDupMessage = null;
    try {
      const result = await api.scanDuplicates();
      scanDupMessage = `Scan : ${result.total_scanned} pistes analysées, ${result.duplicates_found} doublons`;
      try {
        const d = await api.listDuplicates();
        duplicates = d;
        if (d.length === 0 && result.duplicates_found === 0) {
          scanDupMessage = `Scan terminé : ${result.total_scanned} pistes analysées, aucun doublon audio détecté`;
        }
      } catch (e2) {
        console.error('List duplicates error:', e2);
        scanDupMessage = `Scan OK (${result.duplicates_found} doublons) mais erreur au chargement de la liste`;
      }
      setTimeout(() => scanDupMessage = null, 8000);
    } catch (e: any) {
      console.error('Scan duplicates error:', e);
      scanDupMessage = `Erreur : ${e?.message || e}`;
    }
    scanningDuplicates = false;
  }

  async function resolveDuplicate(duplicateId: number, keepTrackId: number) {
    try {
      await api.resolveDuplicate(duplicateId, keepTrackId);
      duplicates = duplicates.filter(d => d.id !== duplicateId);
      api.getCompletenessStats().then(s => stats = s);
    } catch (e) {
      console.error('Resolve duplicate error:', e);
    }
  }

  async function loadSuggestions() {
    try {
      suggestions = await api.getMetadataSuggestions();
      suggestionCount = suggestions.length;
    } catch {}
  }

  async function handleShowSuggestions() {
    showSuggestions = !showSuggestions;
    if (showSuggestions) await loadSuggestions();
  }

  async function handleAcceptSuggestion(id: number) {
    await api.acceptSuggestion(id);
    suggestions = suggestions.filter(s => s.id !== id);
    suggestionCount = suggestions.length;
  }

  async function handleRejectSuggestion(id: number) {
    await api.rejectSuggestion(id);
    suggestions = suggestions.filter(s => s.id !== id);
    suggestionCount = suggestions.length;
  }

  async function handleAcceptAll() {
    await api.acceptAllSuggestions(0.9);
    await loadSuggestions();
  }

  let editAlbum = $state<Album | null>(null);
  let rescanningAll = $state(false);

  // Merge duplicates
  let merging = $state(false);
  let mergeMessage = $state<string | null>(null);

  // Enrich
  let enriching = $state(false);
  let enrichMessage = $state<string | null>(null);

  // Batch genre/year
  let batchGenre = $state('');
  let batchYear = $state<number | null>(null);
  let batchSelectedIds = $state<Set<number>>(new Set());
  let batchApplying = $state(false);
  let batchProgress = $state<{ current: number; total: number } | null>(null);
  let batchMessage = $state<string | null>(null);

  let backups = $state<BackupInfo[]>([]);
  let backupLoading = $state(false);
  let backupCreating = $state(false);
  let restoring = $state<string | null>(null);
  let backupMessage = $state<{ text: string; type: 'success' | 'error' } | null>(null);

  async function loadData() {
    loading = true;
    try {
      const [s, albums] = await Promise.all([
        api.getCompletenessStats(),
        api.getAllAlbums(),
      ]);
      stats = s;
      allAlbums = albums;
      albumsWithoutCover = albums.filter(a => !a.cover_path);
    } catch (e) {
      console.error('Load metadata error:', e);
    }
    loading = false;
  }

  let unknownAlbums = $derived(
    allAlbums.filter(a => {
      const title = (a.title ?? '').toLowerCase();
      const artist = (a.artist_name ?? '').toLowerCase();
      return title.includes('unknown') || artist.includes('unknown');
    })
  );

  let metadataSearch = $state('');
  let filterArtist = $state('');
  let filterGenre = $state('');

  let filteredAlbums = $derived.by(() => {
    let result: Album[];
    switch (filter) {
      case 'no_cover':
        result = allAlbums.filter(a => !a.cover_path || a.id === editingDoubtfulId);
        break;
      case 'no_genre':
        result = allAlbums.filter(a => !a.genre || a.id === editingDoubtfulId);
        break;
      case 'no_year':
        result = allAlbums.filter(a => !a.year || a.id === editingDoubtfulId);
        break;
      case 'no_artist':
        result = allAlbums.filter(a => !a.artist_name || a.artist_name === 'Unknown Artist' || a.id === editingDoubtfulId);
        break;
      case 'unknown':
        result = allAlbums.filter(a => {
          const t = (a.title ?? '').toLowerCase();
          const ar = (a.artist_name ?? '').toLowerCase();
          return t.includes('unknown') || ar.includes('unknown') || a.id === editingDoubtfulId;
        });
        break;
      default:
        result = allAlbums;
    }
    // Text search across title, artist, genre
    if (metadataSearch.trim()) {
      const q = metadataSearch.trim().toLowerCase();
      result = result.filter(a =>
        (a.title ?? '').toLowerCase().includes(q) ||
        (a.artist_name ?? '').toLowerCase().includes(q) ||
        (a.genre ?? '').toLowerCase().includes(q)
      );
    }
    // Artist dropdown filter
    if (filterArtist) {
      result = result.filter(a => a.artist_name === filterArtist);
    }
    // Genre dropdown filter
    if (filterGenre) {
      result = result.filter(a => a.genre === filterGenre);
    }
    return result;
  });

  // Count duplicate albums (same title, multiple entries)
  let duplicateCount = $derived.by(() => {
    // Exact same title + same artist + same quality = real duplicate
    // Different editions, remasters, CD1/CD2 are NOT duplicates
    const groups = new Map<string, number>();
    for (const a of allAlbums) {
      const title = (a.title ?? '').toLowerCase().trim();
      const artist = (a.artist_name ?? '').toLowerCase().trim();
      const sr = a.sample_rate ?? 0;
      const bd = a.bit_depth ?? 0;
      const key = `${title}||${artist}||${sr}||${bd}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    let count = 0;
    for (const c of groups.values()) {
      if (c > 1) count += c - 1;
    }
    return count;
  });

  let duplicateGroups = $derived.by(() => {
    const groups = new Map<string, Album[]>();
    for (const a of allAlbums) {
      const title = (a.title ?? '').toLowerCase().trim();
      const artist = (a.artist_name ?? '').toLowerCase().trim();
      const sr = a.sample_rate ?? 0;
      const bd = a.bit_depth ?? 0;
      const key = `${title}||${artist}||${sr}||${bd}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    }
    return [...groups.values()].filter(g => g.length > 1);
  });

  function dupGroupType(group: Album[]): { type: 'album' | 'track'; trackCounts: number[] } {
    const counts = group.map(a => a.track_count ?? 0);
    const allMulti = counts.every(c => c > 1);
    return { type: allMulti ? 'album' : 'track', trackCounts: counts };
  }

  let dupAlbumPaths = $state<Record<number, string>>({});

  async function moveToDuplicates(album: Album, groupIndex: number) {
    if (!album.id) return;
    if (!confirm(`Déplacer "${album.title}" (${album.artist_name}) dans /data/duplicates ?\n\nLes fichiers seront déplacés et l'album supprimé de la bibliothèque.`)) return;
    try {
      const result = await api.moveAlbumToDuplicates(album.id);
      // Remove from allAlbums — triggers recompute of duplicateGroups
      allAlbums = allAlbums.filter(a => a.id !== album.id);
      // Refresh stats
      api.getCompletenessStats().then(s => stats = s);
      // Clean up paths cache
      delete dupAlbumPaths[album.id];
      dupAlbumPaths = { ...dupAlbumPaths };
    } catch (e: any) {
      console.error('Move to duplicates error:', e);
      alert(`Erreur : ${e?.message || e}`);
    }
  }

  async function mergeGroup(groupIndex: number) {
    const group = duplicateGroups[groupIndex];
    if (!group || group.length < 2) return;
    const ids = group.map((a: Album) => a.id!).filter(Boolean);
    const trackCounts = group.map((a: any) => `${a.title} (${a.track_count ?? '?'} pistes)`).join('\n');
    if (!confirm(`Fusionner ${group.length} albums en un seul ?\n\n${trackCounts}\n\nL'album avec le plus de pistes sera conservé, les autres seront supprimés.`)) return;
    try {
      const result = await api.mergeAlbums(ids);
      // Remove merged albums from allAlbums, keep master
      const mergedIds = ids.filter((id: number) => id !== result.master_id);
      allAlbums = allAlbums.filter(a => !mergedIds.includes(a.id!));
      // Update master track count
      allAlbums = allAlbums.map(a => a.id === result.master_id ? { ...a, track_count: result.total_tracks } : a);
      api.getCompletenessStats().then(s => stats = s);
      writeResult = { type: 'tags', message: `Fusionné : ${result.tracks_moved} pistes déplacées, total ${result.total_tracks} pistes` };
    } catch (e: any) {
      console.error('Merge error:', e);
      alert(`Erreur fusion : ${e?.message || e}`);
    }
  }

  async function loadDupPaths() {
    const needed: number[] = [];
    for (const group of duplicateGroups) {
      for (const a of group) {
        if (a.id && !dupAlbumPaths[a.id]) needed.push(a.id);
      }
    }
    for (const id of needed) {
      try {
        const tracks = await api.getAlbumTracks(id);
        if (tracks.length > 0 && tracks[0].file_path) {
          const path = tracks[0].file_path;
          const folder = path.substring(0, path.lastIndexOf('/'));
          dupAlbumPaths[id] = folder;
        }
      } catch {}
    }
    dupAlbumPaths = { ...dupAlbumPaths };
  }

  // Available genres from library (distinct, sorted)
  let availableGenres = $derived.by(() => {
    const genres = new Set<string>();
    for (const a of allAlbums) {
      if (a.genre) genres.add(a.genre);
    }
    return [...genres].sort((a, b) => a.localeCompare(b));
  });

  // Toggle batch selection for a single album
  function toggleBatchSelect(id: number) {
    const next = new Set(batchSelectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    batchSelectedIds = next;
  }

  // Toggle select all for the current filtered view
  function toggleBatchSelectAll() {
    const ids = filteredAlbums.map(a => a.id!);
    const allSelected = ids.length > 0 && ids.every(id => batchSelectedIds.has(id));
    if (allSelected) {
      batchSelectedIds = new Set();
    } else {
      batchSelectedIds = new Set(ids);
    }
  }

  let batchAllSelected = $derived(
    filteredAlbums.length > 0 && filteredAlbums.every(a => batchSelectedIds.has(a.id!))
  );

  async function applyBatchGenre() {
    if (!batchGenre.trim() || batchSelectedIds.size === 0) return;
    batchApplying = true;
    batchMessage = null;
    const ids = [...batchSelectedIds];
    const total = ids.length;
    let done = 0;
    try {
      for (const id of ids) {
        batchProgress = { current: done + 1, total };
        await api.updateAlbum(id, { genre: batchGenre.trim() });
        done++;
        // Update local state
        allAlbums = allAlbums.map(a => a.id === id ? { ...a, genre: batchGenre.trim() } : a);
      }
      batchMessage = $t('metadata.batchDone').replace('{count}', String(done));
      batchSelectedIds = new Set();
      batchGenre = '';
      api.getCompletenessStats().then(s => stats = s);
    } catch (e) {
      console.error('Batch genre error:', e);
      batchMessage = $t('metadata.saveError');
    }
    batchApplying = false;
    batchProgress = null;
  }

  async function applyBatchYear() {
    if (!batchYear || batchSelectedIds.size === 0) return;
    batchApplying = true;
    batchMessage = null;
    const ids = [...batchSelectedIds];
    const total = ids.length;
    let done = 0;
    try {
      for (const id of ids) {
        batchProgress = { current: done + 1, total };
        await api.updateAlbum(id, { year: batchYear });
        done++;
        allAlbums = allAlbums.map(a => a.id === id ? { ...a, year: batchYear } : a);
      }
      batchMessage = $t('metadata.batchDone').replace('{count}', String(done));
      batchSelectedIds = new Set();
      batchYear = null;
      api.getCompletenessStats().then(s => stats = s);
    } catch (e) {
      console.error('Batch year error:', e);
      batchMessage = $t('metadata.saveError');
    }
    batchApplying = false;
    batchProgress = null;
  }

  // Batch artist
  let batchArtistSearch = $state('');
  let batchArtistId = $state<number | null>(null);
  let batchArtistDropdownOpen = $state(false);

  let batchArtistResults = $derived(
    batchArtistSearch.length >= 2
      ? artists.filter(a => a.name.toLowerCase().includes(batchArtistSearch.toLowerCase())).slice(0, 10)
      : []
  );

  async function applyBatchArtist() {
    if (!batchArtistId || batchSelectedIds.size === 0) return;
    const artist = artists.find(a => a.id === batchArtistId);
    if (!artist) return;
    batchApplying = true;
    batchMessage = null;
    const ids = [...batchSelectedIds];
    const total = ids.length;
    let done = 0;
    try {
      for (const id of ids) {
        batchProgress = { current: done + 1, total };
        await api.updateAlbum(id, { artist_id: batchArtistId });
        done++;
        allAlbums = allAlbums.map(a => a.id === id ? { ...a, artist_name: artist.name, artist_id: batchArtistId } : a);
      }
      batchMessage = $t('metadata.batchDone').replace('{count}', String(done));
      batchSelectedIds = new Set();
      batchArtistSearch = '';
      batchArtistId = null;
      api.getCompletenessStats().then(s => stats = s);
    } catch (e) {
      console.error('Batch artist error:', e);
      batchMessage = $t('metadata.saveError');
    }
    batchApplying = false;
    batchProgress = null;
  }

  // Load artists for autocomplete when needed
  async function ensureArtistsLoaded() {
    if (artists.length === 0) {
      try {
        artists = await api.getArtists(5000, 0);
      } catch {}
    }
  }

  // Select same artist albums
  function selectSameArtist(artistName: string) {
    const ids = filteredAlbums.filter(a => a.artist_name === artistName).map(a => a.id!);
    batchSelectedIds = new Set(ids);
  }

  async function mergeDuplicates() {
    merging = true;
    mergeMessage = null;
    try {
      const result = await api.mergeAlbumDuplicates();
      mergeMessage = $t('metadata.merged').replace('{count}', String(result.merged));
      // Reload data
      await loadData();
    } catch (e) {
      console.error('Merge duplicates error:', e);
      mergeMessage = $t('metadata.saveError');
    }
    merging = false;
  }

  async function triggerEnrich() {
    enriching = true;
    enrichMessage = null;
    try {
      await api.triggerEnrich();
      enrichMessage = $t('metadata.enrichStarted');
    } catch (e) {
      console.error('Enrich error:', e);
      enrichMessage = $t('metadata.saveError');
    }
    enriching = false;
  }

  async function loadTracksWithoutArtist() {
    if (tracksWithoutArtistLoaded) return;
    try {
      const all = await api.getTracks(500, 0);
      tracksWithoutArtist = all.filter(t => !t.artist_id);
      tracksWithoutArtistLoaded = true;
    } catch (e) {
      console.error('Load tracks error:', e);
    }
  }

  let unknownTracksByAlbum = $derived.by(() => {
    const groups: { album: Album; tracks: Track[] }[] = [];
    const map = new Map<number, Track[]>();
    for (const t of unknownTracks) {
      const aid = t.album_id ?? 0;
      if (!map.has(aid)) map.set(aid, []);
      map.get(aid)!.push(t);
    }
    for (const a of unknownAlbums) {
      const tracks = map.get(a.id) ?? [];
      if (tracks.length > 0) groups.push({ album: a, tracks });
    }
    return groups;
  });

  function toggleAlbumTracks(albumId: number) {
    const group = unknownTracksByAlbum.find(g => g.album.id === albumId);
    if (!group) return;
    const ids = group.tracks.map(t => t.id!);
    const allSelected = ids.every(id => selectedTrackIds.has(id));
    const next = new Set(selectedTrackIds);
    if (allSelected) {
      ids.forEach(id => next.delete(id));
    } else {
      ids.forEach(id => next.add(id));
    }
    selectedTrackIds = next;
  }

  function toggleTrack(id: number) {
    const next = new Set(selectedTrackIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    selectedTrackIds = next;
  }

  function isAlbumSelected(albumId: number): boolean {
    const group = unknownTracksByAlbum.find(g => g.album.id === albumId);
    if (!group || group.tracks.length === 0) return false;
    return group.tracks.every(t => selectedTrackIds.has(t.id!));
  }

  function isAlbumPartial(albumId: number): boolean {
    const group = unknownTracksByAlbum.find(g => g.album.id === albumId);
    if (!group || group.tracks.length === 0) return false;
    const some = group.tracks.some(t => selectedTrackIds.has(t.id!));
    const all = group.tracks.every(t => selectedTrackIds.has(t.id!));
    return some && !all;
  }

  let unknownTracksLoading = $state(false);

  async function loadUnknownTracks() {
    if (unknownTracksLoaded || unknownTracksLoading) return;
    if (unknownAlbums.length === 0) return;
    unknownTracksLoading = true;
    try {
      // Fetch all album tracks in one batch
      const results = await Promise.all(
        unknownAlbums.map(a => api.getAlbumTracks(a.id!))
      );
      unknownTracks = results.flat();
      unknownTracksLoaded = true;
    } catch (e) {
      console.error('Load unknown tracks error:', e);
    }
    unknownTracksLoading = false;
    // Load artists in background for the action bar
    if (artists.length === 0) {
      api.getArtists(5000, 0).then(a => {
        artists = a.sort((x, y) => x.name.localeCompare(y.name));
      });
    }
  }

  let filteredArtists = $derived(
    artistSearch.length < 1
      ? artists.slice(0, 20)
      : artists.filter(a => a.name.toLowerCase().includes(artistSearch.toLowerCase())).slice(0, 20)
  );

  let filteredAlbumArtists = $derived(
    albumArtistSearch.length < 1
      ? artists.slice(0, 20)
      : artists.filter(a => a.name.toLowerCase().includes(albumArtistSearch.toLowerCase())).slice(0, 20)
  );

  function startEditAlbumArtist(album: Album) {
    editingAlbumArtistId = album.id;
    albumArtistSearch = album.artist_name ?? '';
    albumArtistDropdownOpen = true;
  }

  async function selectAlbumArtist(artist: Artist) {
    if (!editingAlbumArtistId) return;
    const albumId = editingAlbumArtistId;
    albumArtistDropdownOpen = false;
    editingAlbumArtistId = null;
    try {
      const group = unknownTracksByAlbum.find(g => g.album.id === albumId);
      if (group) {
        // Only update selected tracks in this album (or all if none selected)
        const albumTrackIds = group.tracks.map(t => t.id!);
        const selectedInAlbum = albumTrackIds.filter(id => selectedTrackIds.has(id));
        const idsToUpdate = selectedInAlbum.length > 0 ? selectedInAlbum : albumTrackIds;
        await Promise.all(idsToUpdate.map(id => api.updateTrack(id, { artist_id: artist.id! })));
        // Refresh local state only for updated tracks
        const idsSet = new Set(idsToUpdate);
        unknownTracks = unknownTracks.map(t =>
          idsSet.has(t.id!) ? { ...t, artist_id: artist.id, artist_name: artist.name } : t
        );
      }
      // Update album artist if all tracks in album were updated
      const remaining = unknownTracks.filter(t => t.album_id === albumId && (!t.artist_name || t.artist_name.toLowerCase().includes('unknown')));
      if (remaining.length === 0) {
        await api.updateAlbum(albumId, { artist_id: artist.id! });
        allAlbums = allAlbums.map(a => a.id === albumId ? { ...a, artist_id: artist.id, artist_name: artist.name } : a);
      }
    } catch (e) {
      console.error('Update album artist error:', e);
    }
  }

  async function createAndSelectAlbumArtist() {
    if (!albumArtistSearch.trim() || !editingAlbumArtistId) return;
    try {
      const newArtist = await api.createArtist(albumArtistSearch.trim());
      artists = [...artists, newArtist].sort((a, b) => a.name.localeCompare(b.name));
      await selectAlbumArtist(newArtist);
    } catch (e) {
      console.error('Create artist error:', e);
    }
  }

  function selectArtist(artist: Artist) {
    selectedArtistId = artist.id;
    artistSearch = artist.name;
    artistDropdownOpen = false;
  }

  async function createAndSelectArtist() {
    if (!artistSearch.trim()) return;
    try {
      const newArtist = await api.createArtist(artistSearch.trim());
      artists = [...artists, newArtist].sort((a, b) => a.name.localeCompare(b.name));
      selectArtist(newArtist);
    } catch (e) {
      console.error('Create artist error:', e);
    }
  }

  function startEditAlbum(album: Album) {
    editingAlbumId = album.id;
    editingAlbumTitle = album.title;
  }

  async function saveAlbumTitle() {
    if (!editingAlbumId || !editingAlbumTitle.trim()) { editingAlbumId = null; return; }
    try {
      await api.updateAlbum(editingAlbumId, { title: editingAlbumTitle.trim() });
      // Update local state
      unknownTracks = unknownTracks.map(t =>
        t.album_id === editingAlbumId ? { ...t, album_title: editingAlbumTitle.trim() } : t
      );
      allAlbums = allAlbums.map(a =>
        a.id === editingAlbumId ? { ...a, title: editingAlbumTitle.trim() } : a
      );
    } catch (e) {
      console.error('Update album title error:', e);
    }
    editingAlbumId = null;
  }

  function startEditTrack(track: Track) {
    editingTrackId = track.id;
    editingTrackTitle = track.title;
  }

  async function saveTrackTitle() {
    if (!editingTrackId || !editingTrackTitle.trim()) { editingTrackId = null; return; }
    try {
      await api.updateTrack(editingTrackId, { title: editingTrackTitle.trim() });
      unknownTracks = unknownTracks.map(t =>
        t.id === editingTrackId ? { ...t, title: editingTrackTitle.trim() } : t
      );
    } catch (e) {
      console.error('Update track title error:', e);
    }
    editingTrackId = null;
  }

  async function applyArtist() {
    if (!selectedArtistId || selectedTrackIds.size === 0) return;
    applying = true;
    const artistName = artists.find(a => a.id === selectedArtistId)?.name ?? '';
    const idsToUpdate = [...selectedTrackIds];
    try {
      await Promise.all(
        idsToUpdate.map(id => api.updateTrack(id, { artist_id: selectedArtistId! }))
      );
      // Update local state only for the selected tracks
      const idsSet = new Set(idsToUpdate);
      unknownTracks = unknownTracks.map(t =>
        idsSet.has(t.id!) ? { ...t, artist_id: selectedArtistId, artist_name: artistName } : t
      );
      selectedTrackIds = new Set();
      selectedArtistId = null;
      artistSearch = '';
    } catch (e) {
      console.error('Apply artist error:', e);
    }
    applying = false;
  }

  function completionPercent(missing: number, total: number): string {
    if (total === 0) return '100';
    if (missing === 0) return '100';
    const pct = ((total - missing) / total) * 100;
    return pct.toFixed(2);
  }

  async function rescanAll() {
    rescanningAll = true;
    try {
      await api.rescanArtwork();
    } catch (e) {
      console.error('Rescan error:', e);
    }
    rescanningAll = false;
  }

  async function triggerScan() {
    try {
      await api.triggerScan();
    } catch (e) {
      console.error('Scan error:', e);
    }
  }

  function handleAlbumSaved(updated: Album) {
    allAlbums = allAlbums.map(a => a.id === updated.id ? updated : a);
    albumsWithoutCover = allAlbums.filter(a => !a.cover_path);
    // Refresh stats
    api.getCompletenessStats().then(s => stats = s);
  }

  async function loadBackups() {
    backupLoading = true;
    try {
      backups = await api.getBackups();
    } catch (e) {
      console.error('Load backups error:', e);
    }
    backupLoading = false;
  }

  async function createBackup() {
    backupCreating = true;
    backupMessage = null;
    try {
      await api.createBackup();
      await loadBackups();
      backupMessage = { text: $t('maintenance.backupCreated'), type: 'success' };
    } catch (e) {
      backupMessage = { text: $t('maintenance.backupError'), type: 'error' };
    }
    backupCreating = false;
  }

  async function restoreBackup(filename: string) {
    if (!confirm($t('maintenance.restoreConfirm'))) return;
    restoring = filename;
    backupMessage = null;
    try {
      await api.restoreBackup(filename);
      backupMessage = { text: $t('maintenance.restoreSuccess'), type: 'success' };
      await loadData();
    } catch (e) {
      backupMessage = { text: $t('maintenance.restoreError'), type: 'error' };
    }
    restoring = null;
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatBackupDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  $effect(() => {
    loadData();
    loadBackups();
  });

  async function validateDoubtful(album: import('../lib/api').DoubtfulAlbum) {
    // Normalize: fix uppercase artist, apply resolved artist, etc.
    const updates: Record<string, any> = {};
    for (const reason of album.reasons) {
      if (reason === 'artist_uppercase' && album.artist_name) {
        // Title-case the artist
        updates.artist_name = album.artist_name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      }
      if (reason === 'artist_mismatch' && album.artist_resolved) {
        updates.artist_name = album.artist_resolved;
      }
      if (reason === 'genre_placeholder') {
        // Keep as-is, user validated it
      }
    }
    if (Object.keys(updates).length > 0) {
      try {
        await api.updateAlbumMetadata(album.id, updates);
      } catch (e) {
        console.error('Validate error:', e);
      }
    }
    // Remove from list
    doubtfulAlbums = doubtfulAlbums.filter(a => a.id !== album.id);
    if (stats) stats.doubtful_count = doubtfulAlbums.length;
  }

  let doubtfulZoomCover = $state<string | null>(null);
  let doubtfulCoverUploadId = $state<number | null>(null);
  let editingDoubtfulId = $state<number | null>(null);
  let doubtfulSavedId = $state<number | null>(null);

  async function graverDoubtfulTags(albumId: number) {
    try {
      const r = await api.writeAlbumTags(albumId);
      writeResult = { type: 'tags', message: `Tags gravés : ${r.updated ?? 0} fichiers` };
      doubtfulSavedId = null;
      editingDoubtfulId = null;
    } catch (e: any) {
      writeResult = { type: 'tags', message: `Erreur gravure : ${e?.message || e}` };
    }
  }

  async function handleDoubtfulCoverUpload(albumId: number, file: File) {
    try {
      const updated = await api.uploadAlbumArtwork(albumId, file);
      doubtfulAlbums = doubtfulAlbums.map(a =>
        a.id === albumId ? { ...a, cover_path: updated.cover_path } : a
      );
      allAlbums = allAlbums.map(a =>
        a.id === albumId ? { ...a, cover_path: updated.cover_path } : a
      );
      api.getCompletenessStats().then(s => stats = s);
      // Enable Graver button after cover upload
      doubtfulSavedId = albumId;
      if (!editingDoubtfulId) {
        const album = doubtfulAlbums.find(a => a.id === albumId) ?? allAlbums.find(a => a.id === albumId);
        if (album) editDoubtful(album);
      }
    } catch (e) {
      console.error('Cover upload error:', e);
    }
    doubtfulCoverUploadId = null;
  }

  function onDoubtfulCoverClick(albumId: number, coverPath: string | null) {
    if (coverPath) {
      doubtfulZoomCover = api.artworkUrl(coverPath);
    } else {
      // No cover: trigger file picker
      doubtfulCoverUploadId = albumId;
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) handleDoubtfulCoverUpload(albumId, file);
      };
      input.click();
    }
  }

  function onDoubtfulCoverDrop(e: DragEvent, albumId: number) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleDoubtfulCoverUpload(albumId, file);
    }
  }
  let editingDoubtfulData = $state<{ artist_name: string; title: string; genre: string; year: string }>({ artist_name: '', title: '', genre: '', year: '' });

  function editDoubtful(album: any) {
    editingDoubtfulId = album.id;
    editingDoubtfulData = {
      artist_name: album.artist_name ?? '',
      title: album.title ?? '',
      genre: album.genre ?? '',
      year: album.year ? String(album.year) : '',
    };
  }

  async function saveDoubtful() {
    if (!editingDoubtfulId) return;
    const updates: Record<string, any> = {};
    const album = doubtfulAlbums.find(a => a.id === editingDoubtfulId) ?? allAlbums.find(a => a.id === editingDoubtfulId);
    if (!album) return;
    if (editingDoubtfulData.artist_name !== (album.artist_name ?? '')) updates.artist_name = editingDoubtfulData.artist_name;
    if (editingDoubtfulData.title !== (album.title ?? '')) updates.title = editingDoubtfulData.title;
    if (editingDoubtfulData.genre !== (album.genre ?? '')) updates.genre = editingDoubtfulData.genre;
    const newYear = editingDoubtfulData.year ? parseInt(editingDoubtfulData.year) : null;
    if (newYear !== (album as any).year) updates.year = newYear;
    if (Object.keys(updates).length > 0) {
      try {
        await api.updateAlbumMetadata(editingDoubtfulId, updates);
        // Update local state
        doubtfulAlbums = doubtfulAlbums.map(a => a.id === editingDoubtfulId ? { ...a, ...updates } : a);
        allAlbums = allAlbums.map(a => a.id === editingDoubtfulId ? { ...a, ...updates } : a);
        doubtfulSavedId = editingDoubtfulId;
      } catch (e) {
        console.error('Save doubtful error:', e);
      }
    } else {
      editingDoubtfulId = null;
    }
  }

  function cancelDoubtful() {
    editingDoubtfulId = null;
    doubtfulSavedId = null;
  }

  // Column resize for doubtful table
  let resizingCol = $state<number | null>(null);
  let resizeStartX = 0;
  let resizeStartW = 0;
  let doubtfulColWidths = $state<number[]>([40, 140, 170, 90, 50, 150, 65]);

  function onResizeStart(e: MouseEvent, colIdx: number) {
    e.preventDefault();
    resizingCol = colIdx;
    resizeStartX = e.clientX;
    resizeStartW = doubtfulColWidths[colIdx];
    const onMove = (ev: MouseEvent) => {
      if (resizingCol === null) return;
      const delta = ev.clientX - resizeStartX;
      const newWidths = [...doubtfulColWidths];
      newWidths[resizingCol] = Math.max(50, resizeStartW + delta);
      doubtfulColWidths = newWidths;
    };
    const onUp = () => {
      resizingCol = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  async function loadDoubtful() {
    if (doubtfulLoaded) return;
    try {
      doubtfulAlbums = await api.getDoubtfulAlbums();
      doubtfulLoaded = true;
    } catch (e) {
      console.error('Load doubtful error:', e);
    }
  }

  const REASON_LABELS: Record<string, string> = {
    artist_uppercase: 'Artiste MAJ',
    artist_placeholder: 'Artiste provisoire',
    artist_has_year: 'Artiste = dossier',
    genre_placeholder: 'Genre provisoire',
    year_suspicious: 'Année suspecte',
    title_uppercase: 'Titre MAJ',
  };

  $effect(() => {
    if (filter === 'no_artist') {
      loadTracksWithoutArtist();
    }
    if (filter === 'unknown' && unknownAlbums.length > 0) {
      loadUnknownTracks();
    }
    if (filter === 'duplicates') {
      loadDupPaths();
    }
    if (filter === 'doubtful') {
      loadDoubtful();
    }
    // Clear batch selection when changing filters
    batchSelectedIds = new Set();
    batchMessage = null;
  });
</script>

<div class="metadata-view">
  <div class="view-header">
    <h1>{$t('metadata.title')}</h1>
    <div class="header-actions">
      <button class="btn-action" onclick={triggerScan}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 12a9 9 0 1 1-9-9" /><polyline points="21 3 21 9 15 9" /></svg>
        {$t('settings.scanLibrary')}
      </button>
      <button class="btn-action" onclick={rescanAll} disabled={rescanningAll}>
        {#if rescanningAll}
          <div class="spinner small"></div>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
        {/if}
        {$t('metadata.rescanAll')}
      </button>
    </div>
  </div>

  {#if loading}
    <div class="loading"><div class="spinner"></div></div>
  {:else if stats}
    <!-- Stats dashboard -->
    <div class="stats-grid">
      <button class="stat-card" class:stat-active={filter === 'no_cover'} onclick={() => filter = 'no_cover'}>
        <div class="stat-header">
          <span class="stat-label">{$t('metadata.cover')}</span>
          <span class="stat-value">{completionPercent(stats.albums_without_cover, stats.total_albums)}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {completionPercent(stats.albums_without_cover, stats.total_albums)}%"></div>
        </div>
        <span class="stat-detail">{stats.albums_without_cover} / {stats.total_albums} {$t('metadata.missingCovers').toLowerCase()}</span>
      </button>

      <button class="stat-card" class:stat-active={filter === 'no_genre'} onclick={() => filter = 'no_genre'}>
        <div class="stat-header">
          <span class="stat-label">{$t('metadata.genre')}</span>
          <span class="stat-value">{completionPercent(stats.albums_without_genre, stats.total_albums)}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {completionPercent(stats.albums_without_genre, stats.total_albums)}%"></div>
        </div>
        <span class="stat-detail">{stats.albums_without_genre} / {stats.total_albums} {$t('metadata.missingGenre').toLowerCase()}</span>
      </button>

      <button class="stat-card" class:stat-active={filter === 'no_year'} onclick={() => filter = 'no_year'}>
        <div class="stat-header">
          <span class="stat-label">{$t('metadata.year')}</span>
          <span class="stat-value">{completionPercent(stats.albums_without_year, stats.total_albums)}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {completionPercent(stats.albums_without_year, stats.total_albums)}%"></div>
        </div>
        <span class="stat-detail">{stats.albums_without_year} / {stats.total_albums} {$t('metadata.missingYear').toLowerCase()}</span>
      </button>

      <button class="stat-card" class:stat-active={filter === 'no_artist'} onclick={() => filter = 'no_artist'}>
        <div class="stat-header">
          <span class="stat-label">{$t('metadata.artist')}</span>
          <span class="stat-value">{completionPercent(stats.tracks_without_artist, stats.total_tracks)}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {completionPercent(stats.tracks_without_artist, stats.total_tracks)}%"></div>
        </div>
        <span class="stat-detail">{stats.tracks_without_artist} / {stats.total_tracks} {$t('metadata.missingArtist').toLowerCase()}</span>
      </button>
    </div>

    <!-- 2. Enrichir -->
    <div class="meta-section">
      <span class="meta-section-label">Enrichir</span>
      <div class="meta-section-btns">
        <button class="enrich-btn" onclick={() => handleFixYears('musicbrainz')} disabled={!!fixYearsRunning}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          {fixYearsRunning === 'musicbrainz' ? '...' : 'Années MusicBrainz'}
        </button>
        <button class="enrich-btn" onclick={() => handleFixYears('discogs')} disabled={!!fixYearsRunning}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          {fixYearsRunning === 'discogs' ? '...' : 'Années Discogs'}
        </button>
        <button class="enrich-btn" onclick={() => handleFixYears('tidal')} disabled={!!fixYearsRunning}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          {fixYearsRunning === 'tidal' ? '...' : 'Années Tidal'}
        </button>
        <button class="enrich-btn" onclick={handleFixGenres} disabled={fixGenresRunning}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          {fixGenresRunning ? '...' : 'Genres Last.fm'}
        </button>
        <button class="enrich-btn" onclick={() => api.triggerEnrich()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 12a9 9 0 1 1-9-9"/><path d="M21 3v6h-6"/></svg>
          Enrichir via MusicBrainz
        </button>
      </div>
    </div>

    <!-- 3. Doublons -->
    <div class="meta-section">
      <span class="meta-section-label">Doublons</span>
      <div class="meta-section-btns">
        <button class="enrich-btn" onclick={() => filter = 'duplicates'} disabled={duplicateCount === 0}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
          {duplicateCount > 0 ? `Visualiser ${duplicateCount} doublons` : 'Aucun doublon'}
        </button>
        <button class="enrich-btn" onclick={handleScanDuplicates} disabled={scanningDuplicates}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          {scanningDuplicates ? 'Scan...' : 'Scan doublons audio'}
        </button>
        {#if mergeMessage}<span class="inline-message">{mergeMessage}</span>{/if}
        {#if scanDupMessage}<span class="inline-message success" style="font-size:11px">{scanDupMessage}</span>{/if}
      </div>
    </div>

    <!-- 4. Corriger -->
    <div class="meta-section">
      <span class="meta-section-label">Corriger</span>
      <div class="meta-section-filters">
        <div class="filter-col-tous">
          <button class="filter-btn" class:active={filter === 'all'} onclick={() => filter = 'all'}>{$t('metadata.all')}</button>
          <input
            type="text"
            class="metadata-search"
            placeholder="Rechercher..."
            bind:value={metadataSearch}
            oninput={() => { if (metadataSearch.trim() && !['all', 'no_cover', 'no_genre', 'no_year', 'doubtful'].includes(filter)) filter = 'all'; }}
          />
          <select
            class="metadata-search metadata-select"
            value={filterArtist}
            onchange={(e) => { filterArtist = (e.target as HTMLSelectElement).value; if (filterArtist) filter = 'all'; }}
            onfocus={ensureArtistsLoaded}
          >
            <option value="">-- Artiste --</option>
            {#each artists as a (a.id)}
              <option value={a.name}>{a.name}</option>
            {/each}
          </select>
          <select
            class="metadata-search metadata-select"
            value={filterGenre}
            onchange={(e) => { filterGenre = (e.target as HTMLSelectElement).value; if (filterGenre) filter = 'all'; }}
          >
            <option value="">-- Genre --</option>
            {#each availableGenres as g}
              <option value={g}>{g}</option>
            {/each}
          </select>
        </div>
        <button class="filter-btn" class:active={filter === 'no_cover'} onclick={() => filter = 'no_cover'}>{$t('metadata.missingCovers')} ({stats.albums_without_cover})</button>
        <button class="filter-btn" class:active={filter === 'no_genre'} onclick={() => filter = 'no_genre'}>{$t('metadata.missingGenre')} ({stats.albums_without_genre})</button>
        <button class="filter-btn" class:active={filter === 'no_year'} onclick={() => filter = 'no_year'}>{$t('metadata.missingYear')} ({stats.albums_without_year})</button>
        <button class="filter-btn" class:active={filter === 'no_artist'} onclick={() => filter = 'no_artist'}>{$t('metadata.missingArtist')} ({stats.tracks_without_artist})</button>
        <button class="filter-btn" class:active={filter === 'unknown'} onclick={() => filter = 'unknown'}>{$t('metadata.unknown')} ({unknownAlbums.length})</button>
        <button class="filter-btn" class:active={filter === 'doubtful'} onclick={() => filter = 'doubtful'}>{$t('metadata.doubtful')} ({stats?.doubtful_count ?? 0})</button>
      </div>
    </div>

    <!-- Fix Results -->
    {#if fixYearsResult || fixGenresResult || writeResult}
      <div class="fix-result-banner">
        {#if fixYearsResult}
          <span class="fix-result-text">
            <strong>{fixYearsResult.source}</strong> : {fixYearsResult.fixed} corrigés / {fixYearsResult.total} analysés
            {#if fixYearsResult.not_found > 0}
              — {fixYearsResult.not_found} non trouvés
            {/if}
          </span>
        {/if}
        {#if fixGenresResult}
          <span class="fix-result-text">
            <strong>Genres</strong> : {fixGenresResult.fixed} corrigés / {fixGenresResult.total} analysés
          </span>
        {/if}
        {#if writeResult}
          <span class="fix-result-text">{writeResult.message}</span>
        {/if}
        <button class="fix-result-dismiss" onclick={dismissFixResult}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
    {/if}

    <!-- Suggestions Panel -->
    {#if showSuggestions && suggestions.length > 0}
      <div class="suggestions-panel">
        <div class="suggestions-header">
          <h3>Suggestions ({suggestions.length})</h3>
          <button class="action-btn" onclick={handleAcceptAll}>Accepter tout (≥90%)</button>
        </div>
        {#each suggestions as s}
          <div class="suggestion-row">
            <span class="suggestion-field">{s.field}</span>
            <span class="suggestion-current">{s.current_value || '—'}</span>
            <span class="suggestion-arrow">→</span>
            <span class="suggestion-value">{s.suggested_value}</span>
            <span class="suggestion-source">{s.source}</span>
            <span class="suggestion-confidence">{Math.round((s.confidence || 0) * 100)}%</span>
            <button class="btn-accept" onclick={() => handleAcceptSuggestion(s.id)}>✓</button>
            <button class="btn-reject" onclick={() => handleRejectSuggestion(s.id)}>✕</button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Duplicates Panel -->
    {#if duplicates.length > 0}
      <div class="duplicates-panel">
        <div class="dup-header">
          <h3>Doublons détectés ({duplicates.length})</h3>
          <button class="action-btn" onclick={() => duplicates = []}>Fermer</button>
        </div>
        {#each duplicates as d (d.id)}
          <div class="dup-card">
            <div class="dup-card-top">
              <div class="dup-card-title">{d.a?.title || d.track_a_title || '?'}</div>
              {#if d.type === 'album'}
                <span class="dup-badge dup-badge-album">Album complet ({d.album_duplicate_count} pistes)</span>
              {:else}
                <span class="dup-badge dup-badge-track">Piste seule</span>
              {/if}
            </div>
            {#if d.differences?.length > 0}
              <div class="dup-diff-notice">Métadonnées différentes : {d.differences.join(', ')}</div>
            {/if}
            <div class="dup-compare">
              <!-- Copy A -->
              <div class="dup-copy" class:dup-selected={true}>
                <div class="dup-copy-label">Copie A</div>
                <div class="dup-field"><span class="dup-key">Titre</span> <span class:dup-diff={d.differences?.includes('title')}>{d.a?.title ?? d.track_a_title ?? '—'}</span></div>
                <div class="dup-field"><span class="dup-key">Artiste</span> <span class:dup-diff={d.differences?.includes('artist')}>{d.a?.artist ?? '—'}</span></div>
                <div class="dup-field"><span class="dup-key">Album</span> <span class:dup-diff={d.differences?.includes('album')}>{d.a?.album ?? '—'}</span></div>
                <div class="dup-field"><span class="dup-key">Genre</span> <span class:dup-diff={d.differences?.includes('genre')}>{d.a?.genre ?? '—'}</span></div>
                <div class="dup-field"><span class="dup-key">Année</span> <span class:dup-diff={d.differences?.includes('year')}>{d.a?.year ?? '—'}</span></div>
                <div class="dup-field"><span class="dup-key">Format</span> <span>{d.a?.format ?? '?'} {d.a?.sample_rate ? Math.round(d.a.sample_rate/1000) + 'kHz' : ''} {d.a?.bit_depth ? d.a.bit_depth + 'bit' : ''}</span></div>
                <div class="dup-field dup-path">{d.a?.path ?? d.track_a_path ?? ''}</div>
                {#if d.a?.size}<div class="dup-field"><span class="dup-key">Taille</span> {(d.a.size / 1048576).toFixed(1)} Mo</div>{/if}
                <button class="btn-keep" onclick={() => resolveDuplicate(d.id, d.a?.track_id)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><polyline points="20 6 9 17 4 12" /></svg>
                  Garder A
                </button>
              </div>
              <!-- Copy B -->
              <div class="dup-copy">
                <div class="dup-copy-label">Copie B</div>
                <div class="dup-field"><span class="dup-key">Titre</span> <span class:dup-diff={d.differences?.includes('title')}>{d.b?.title ?? d.track_b_title ?? '—'}</span></div>
                <div class="dup-field"><span class="dup-key">Artiste</span> <span class:dup-diff={d.differences?.includes('artist')}>{d.b?.artist ?? '—'}</span></div>
                <div class="dup-field"><span class="dup-key">Album</span> <span class:dup-diff={d.differences?.includes('album')}>{d.b?.album ?? '—'}</span></div>
                <div class="dup-field"><span class="dup-key">Genre</span> <span class:dup-diff={d.differences?.includes('genre')}>{d.b?.genre ?? '—'}</span></div>
                <div class="dup-field"><span class="dup-key">Année</span> <span class:dup-diff={d.differences?.includes('year')}>{d.b?.year ?? '—'}</span></div>
                <div class="dup-field"><span class="dup-key">Format</span> <span>{d.b?.format ?? '?'} {d.b?.sample_rate ? Math.round(d.b.sample_rate/1000) + 'kHz' : ''} {d.b?.bit_depth ? d.b.bit_depth + 'bit' : ''}</span></div>
                <div class="dup-field dup-path">{d.b?.path ?? d.track_b_path ?? ''}</div>
                {#if d.b?.size}<div class="dup-field"><span class="dup-key">Taille</span> {(d.b.size / 1048576).toFixed(1)} Mo</div>{/if}
                <button class="btn-keep" onclick={() => resolveDuplicate(d.id, d.b?.track_id)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><polyline points="20 6 9 17 4 12" /></svg>
                  Garder B
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Content -->
    {#if filter === 'duplicates'}
      {#if duplicateGroups.length === 0}
        <div class="empty">Aucun doublon détecté</div>
      {:else}
        <div class="dup-groups">
          {#each duplicateGroups as group, gi}
            <div class="dup-group-card">
              <div class="dup-group-header">
                {#if dupGroupType(group).type === 'album'}
                <span class="dup-badge dup-badge-album">Album</span>
              {:else}
                <span class="dup-badge dup-badge-track">Piste</span>
              {/if}
              <span class="dup-group-title">{group[0].title}</span>
              <span class="dup-group-artist">{group[0].artist_name ?? '—'}</span>
              <span class="dup-group-count">{group.length} copies</span>
              <button class="btn-merge" onclick={() => mergeGroup(gi)} title="Fusionner en un seul album">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                Fusionner
              </button>
              </div>
              <div class="dup-group-items">
                {#each group as album, ai}
                  <div class="dup-group-item">
                    <div class="dup-group-item-cover">
                      {#if album.cover_path}
                        <img src={api.artworkUrl(album.cover_path)} alt="" style="width:40px;height:40px;border-radius:4px;object-fit:cover" />
                      {:else}
                        <div style="width:40px;height:40px;border-radius:4px;background:var(--tune-bg);border:1px dashed var(--tune-border);display:flex;align-items:center;justify-content:center;color:var(--tune-text-muted)">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                        </div>
                      {/if}
                    </div>
                    <div class="dup-group-item-info">
                      <div style="font-weight:600;font-size:13px;color:var(--tune-text)">{album.title}</div>
                      <div style="font-size:12px;color:var(--tune-text-muted)">
                        {album.track_count ?? '?'} pistes · {album.format ?? '?'} · {album.sample_rate ? Math.round(album.sample_rate/1000) + 'kHz' : '?'} · {album.bit_depth ?? '?'}bit · {album.genre ?? '—'} · {album.year ?? '—'}
                      </div>
                      {#if album.id && dupAlbumPaths[album.id]}
                        <div style="font-size:10px;color:var(--tune-text-muted);margin-top:2px;word-break:break-all">{dupAlbumPaths[album.id]}</div>
                      {/if}
                    </div>
                    <div class="dup-group-item-actions">
                      <button class="btn-doubtful-edit" title="Éditer" onclick={() => editAlbum = album}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      {#if group.length > 1}
                        <button class="btn-dup-move" title="Déplacer dans /data/duplicates" onclick={() => moveToDuplicates(album, gi)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else if filter === 'doubtful'}
      {#if doubtfulAlbums.length === 0}
        <div class="empty">{$t('metadata.noDoubtful')}</div>
      {:else}
        <div class="doubtful-cards">
          {#each (metadataSearch.trim() ? doubtfulAlbums.filter(a => {
            const q = metadataSearch.trim().toLowerCase();
            return (a.title ?? '').toLowerCase().includes(q) || (a.artist_name ?? '').toLowerCase().includes(q) || (a.genre ?? '').toLowerCase().includes(q);
          }) : doubtfulAlbums) as album (album.id)}
            {@const albumAny = album as any}
            <div class="dcard" ondragover={(e) => e.preventDefault()} ondrop={(e) => onDoubtfulCoverDrop(e, album.id)}>
              {#if editingDoubtfulId === album.id}
                <!-- Edit mode -->
                <div class="dcard-cover-wrap">
                  {#if album.cover_path}
                    <img class="dcard-cover" src={api.artworkUrl(album.cover_path)} alt="" />
                  {:else}
                    <div class="dcard-cover-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg></div>
                  {/if}
                  <label class="dcard-cover-upload">
                    <input type="file" accept="image/*" style="display:none" onchange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleDoubtfulCoverUpload(album.id, f); }} />
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  </label>
                </div>
                <div class="dcard-body">
                  <div class="dcard-edit-fields">
                    <label class="dcard-label">Artiste</label>
                    <input class="dcard-input" bind:value={editingDoubtfulData.artist_name} onkeydown={(e) => { if (e.key === 'Enter') saveDoubtful(); if (e.key === 'Escape') cancelDoubtful(); }} />
                    <label class="dcard-label">Album</label>
                    <input class="dcard-input" bind:value={editingDoubtfulData.title} onkeydown={(e) => { if (e.key === 'Enter') saveDoubtful(); if (e.key === 'Escape') cancelDoubtful(); }} />
                    <div class="dcard-edit-row">
                      <div class="dcard-field-group">
                        <label class="dcard-label">Genre</label>
                        <input class="dcard-input dcard-input-sm" bind:value={editingDoubtfulData.genre} onkeydown={(e) => { if (e.key === 'Enter') saveDoubtful(); if (e.key === 'Escape') cancelDoubtful(); }} />
                      </div>
                      <div class="dcard-field-group dcard-field-year">
                        <label class="dcard-label">Année</label>
                        <input class="dcard-input dcard-input-year" bind:value={editingDoubtfulData.year} onkeydown={(e) => { if (e.key === 'Enter') saveDoubtful(); if (e.key === 'Escape') cancelDoubtful(); }} />
                      </div>
                    </div>
                  </div>
                  <div class="dcard-edit-actions">
                    <button class="btn-doubtful-ok" onclick={saveDoubtful}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg> Enregistrer</button>
                    <button class="btn-doubtful-ok btn-graver" disabled={!doubtfulSavedId || doubtfulSavedId !== album.id} onclick={() => graverDoubtfulTags(album.id)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 3v13M5 10l7 7 7-7"/><line x1="4" y1="21" x2="20" y2="21"/></svg> Graver tags</button>
                    <button class="btn-doubtful-edit" onclick={cancelDoubtful}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg> Annuler</button>
                  </div>
                </div>
              {:else}
                <!-- Display mode -->
                <div class="dcard-cover-wrap">
                  {#if album.cover_path}
                    <img class="dcard-cover" src={api.artworkUrl(album.cover_path)} alt="" onerror={(e) => (e.target as HTMLImageElement).style.display='none'} onclick={(e) => { e.stopPropagation(); doubtfulZoomCover = api.artworkUrl(album.cover_path!); }} />
                  {:else}
                    <div class="dcard-cover-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg></div>
                  {/if}
                  <label class="dcard-cover-upload">
                    <input type="file" accept="image/*" style="display:none" onchange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleDoubtfulCoverUpload(album.id, f); }} />
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  </label>
                </div>
                <div class="dcard-body">
                  <div class="dcard-title">{album.title}</div>
                  <div class="dcard-artist" class:dcard-warn={albumAny.reasons?.some((r: string) => r.startsWith('artist'))}>
                    {album.artist_name ?? '—'}
                    {#if albumAny.artist_resolved && albumAny.artist_resolved !== album.artist_name}
                      <span class="dcard-hint">→ {albumAny.artist_resolved}</span>
                    {/if}
                  </div>
                  <div class="dcard-meta">
                    <span class:dcard-warn={!album.genre}>{album.genre ?? '—'}</span>
                    <span class="dcard-sep">·</span>
                    <span class:dcard-warn={!album.year}>{album.year ?? '—'}</span>
                  </div>
                  <div class="dcard-tags">
                    {#if albumAny.reasons}
                      {#each albumAny.reasons as reason}
                        <span class="doubtful-tag">{REASON_LABELS[reason] ?? reason}</span>
                      {/each}
                    {/if}
                  </div>
                </div>
                <div class="dcard-actions">
                  <button class="btn-doubtful-edit" title="Éditer" onclick={() => editDoubtful(album)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {:else if filteredAlbums.length === 0}
      <div class="empty">
        {#if filter === 'no_cover'}
          {$t('metadata.noMissingCovers')}
        {:else}
          {$t('common.noResult')}
        {/if}
      </div>
    {:else}
      <!-- Batch toolbar — visible on all album views when selection active or always on filtered views -->
      {#if filter !== 'no_artist' && filter !== 'unknown' && filter !== 'doubtful'}
        <div class="batch-toolbar">
          <label class="batch-select-all">
            <input type="checkbox" checked={batchAllSelected} onchange={toggleBatchSelectAll} />
            {$t('metadata.selectAll')} ({filteredAlbums.length})
          </label>

          {#if batchSelectedIds.size > 0}
            <!-- Artist -->
            <div class="batch-input-group">
              <div class="batch-autocomplete">
                <input
                  type="text"
                  class="batch-input"
                  placeholder="Artiste..."
                  bind:value={batchArtistSearch}
                  onfocus={() => { ensureArtistsLoaded(); batchArtistDropdownOpen = true; }}
                  onblur={() => setTimeout(() => batchArtistDropdownOpen = false, 200)}
                />
                {#if batchArtistDropdownOpen && batchArtistResults.length > 0}
                  <div class="batch-dropdown">
                    {#each batchArtistResults as a}
                      <button class="batch-dropdown-item" onmousedown={() => { batchArtistId = a.id!; batchArtistSearch = a.name; batchArtistDropdownOpen = false; }}>
                        {a.name}
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
              <button class="btn-action btn-primary" onclick={applyBatchArtist} disabled={batchApplying || !batchArtistId || batchSelectedIds.size === 0}>
                {#if batchApplying && batchArtistId}
                  <div class="spinner small"></div>
                {/if}
                Artiste ({batchSelectedIds.size})
              </button>
            </div>

            <span class="batch-sep">|</span>

            <!-- Genre -->
            <div class="batch-input-group">
              <input
                type="text"
                class="batch-input"
                placeholder={$t('metadata.genre')}
                bind:value={batchGenre}
                list="batch-genre-suggestions"
                autocomplete="off"
              />
              <datalist id="batch-genre-suggestions">
                {#each availableGenres as g}
                  <option value={g}>{g}</option>
                {/each}
              </datalist>
              <button class="btn-action btn-primary" onclick={applyBatchGenre} disabled={batchApplying || !batchGenre.trim() || batchSelectedIds.size === 0}>
                Genre ({batchSelectedIds.size})
              </button>
            </div>

            <span class="batch-sep">|</span>

            <!-- Year -->
            <div class="batch-input-group">
              <input
                type="number"
                class="batch-input batch-input-narrow"
                placeholder={$t('metadata.year')}
                bind:value={batchYear}
                min="1900"
                max="2100"
              />
              <button class="btn-action btn-primary" onclick={applyBatchYear} disabled={batchApplying || !batchYear || batchSelectedIds.size === 0}>
                Année ({batchSelectedIds.size})
              </button>
            </div>
          {/if}

          {#if batchMessage}
            <span class="inline-message success">{batchMessage}</span>
          {/if}
        </div>
      {/if}

      <div class="doubtful-cards">
        {#each filteredAlbums as album (album.id)}
          <div class="dcard" ondragover={(e) => e.preventDefault()} ondrop={(e) => onDoubtfulCoverDrop(e, album.id!)}>
            {#if editingDoubtfulId === album.id}
              <!-- Edit mode -->
              <div class="dcard-cover-wrap">
                {#if album.cover_path}
                  <img class="dcard-cover" src={api.artworkUrl(album.cover_path)} alt="" />
                {:else}
                  <div class="dcard-cover-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg></div>
                {/if}
                <label class="dcard-cover-upload">
                  <input type="file" accept="image/*" style="display:none" onchange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleDoubtfulCoverUpload(album.id!, f); }} />
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </label>
              </div>
              <div class="dcard-body">
                <div class="dcard-edit-fields">
                  <label class="dcard-label">Artiste</label>
                  <input class="dcard-input" bind:value={editingDoubtfulData.artist_name} onkeydown={(e) => { if (e.key === 'Enter') saveDoubtful(); if (e.key === 'Escape') cancelDoubtful(); }} />
                  <label class="dcard-label">Album</label>
                  <input class="dcard-input" bind:value={editingDoubtfulData.title} onkeydown={(e) => { if (e.key === 'Enter') saveDoubtful(); if (e.key === 'Escape') cancelDoubtful(); }} />
                  <div class="dcard-edit-row">
                    <div class="dcard-field-group">
                      <label class="dcard-label">Genre</label>
                      <input class="dcard-input dcard-input-sm" bind:value={editingDoubtfulData.genre} onkeydown={(e) => { if (e.key === 'Enter') saveDoubtful(); if (e.key === 'Escape') cancelDoubtful(); }} />
                    </div>
                    <div class="dcard-field-group dcard-field-year">
                      <label class="dcard-label">Année</label>
                      <input class="dcard-input dcard-input-year" bind:value={editingDoubtfulData.year} onkeydown={(e) => { if (e.key === 'Enter') saveDoubtful(); if (e.key === 'Escape') cancelDoubtful(); }} />
                    </div>
                  </div>
                </div>
                <div class="dcard-edit-actions">
                  <button class="btn-doubtful-ok" onclick={saveDoubtful}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg> Enregistrer</button>
                  <button class="btn-doubtful-ok btn-graver" disabled={!doubtfulSavedId || doubtfulSavedId !== album.id} onclick={() => graverDoubtfulTags(album.id!)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 3v13M5 10l7 7 7-7"/><line x1="4" y1="21" x2="20" y2="21"/></svg> Graver tags</button>
                  <button class="btn-doubtful-edit" onclick={cancelDoubtful}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg> Annuler</button>
                </div>
              </div>
            {:else}
              <!-- Display mode -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="dcard-cover-wrap">
                {#if album.cover_path}
                  <img class="dcard-cover" src={api.artworkUrl(album.cover_path)} alt="" onerror={(e) => (e.target as HTMLImageElement).style.display='none'} onclick={(e) => { e.stopPropagation(); doubtfulZoomCover = api.artworkUrl(album.cover_path!); }} />
                {:else}
                  <div class="dcard-cover-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg></div>
                {/if}
                <label class="dcard-cover-upload">
                  <input type="file" accept="image/*" style="display:none" onchange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleDoubtfulCoverUpload(album.id!, f); }} />
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </label>
              </div>
              <div class="dcard-body">
                <div class="dcard-title">{album.title}</div>
                <div class="dcard-artist">{album.artist_name ?? '—'}</div>
                <div class="dcard-meta">
                  <span class:dcard-warn={!album.genre}>{album.genre ?? '—'}</span>
                  <span class="dcard-sep">·</span>
                  <span class:dcard-warn={!album.year}>{album.year ?? '—'}</span>
                </div>
                {#if (album as any).folder_path}
                  <div class="dcard-path">{(album as any).folder_path}</div>
                {/if}
                <div class="dcard-tags">
                  {#if !album.cover_path}<span class="doubtful-tag">Cover manquante</span>{/if}
                  {#if !album.genre}<span class="doubtful-tag">Genre manquant</span>{/if}
                  {#if !album.year}<span class="doubtful-tag">Année manquante</span>{/if}
                </div>
              </div>
              <div class="dcard-actions">
                <input type="checkbox" checked={batchSelectedIds.has(album.id!)} onchange={() => toggleBatchSelect(album.id!)} onclick={(e) => e.stopPropagation()} />
                <button class="btn-doubtful-edit" title="Éditer" onclick={() => editDoubtful(album)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  {#if doubtfulZoomCover}
    <div class="cover-zoom-overlay" onclick={() => doubtfulZoomCover = null} onkeydown={(e) => { if (e.key === 'Escape') doubtfulZoomCover = null; }} role="button" tabindex="-1">
      <img class="cover-zoom-img" src={doubtfulZoomCover} alt="" />
    </div>
  {/if}
</div>

{#if editAlbum}
  <AlbumEditModal
    album={editAlbum}
    onClose={() => editAlbum = null}
    onSaved={handleAlbumSaved}
    {availableGenres}
  />
{/if}

<style>
  .metadata-view {
    padding: 24px;
    max-width: 1200px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .view-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .view-header h1 {
    font-family: var(--font-display);
    font-size: 24px;
    font-weight: 700;
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .btn-action {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: var(--tune-grey2);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s;
  }

  .btn-action:hover:not(:disabled) {
    background: var(--tune-surface-hover);
    border-color: var(--tune-accent);
  }

  .btn-action:disabled { opacity: 0.5; cursor: default; }

  .btn-action.btn-primary {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
  }

  .btn-action.btn-primary:hover:not(:disabled) {
    background: var(--tune-accent-hover);
  }

  .btn-action.btn-graver {
    background: #e67e22;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .btn-action.btn-graver:hover:not(:disabled) { background: #d35400; }
  .btn-action.btn-graver:disabled { opacity: 0.4; }

  /* Section divider */
  .section-divider {
    margin-top: 8px;
  }

  .section-title {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--tune-text-muted);
  }

  /* Backup section */
  .backup-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .backup-header {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .backup-msg {
    font-family: var(--font-body);
    font-size: 13px;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
  }

  .backup-msg.success {
    color: var(--tune-success, #4ade80);
    background: rgba(74, 222, 128, 0.1);
  }

  .backup-msg.error {
    color: var(--tune-error, #ef4444);
    background: rgba(239, 68, 68, 0.1);
  }

  .backup-empty {
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 13px;
  }

  .backup-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--tune-border);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .backup-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--tune-surface);
  }

  .backup-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .backup-name {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
  }

  .backup-meta {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .btn-restore {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    background: var(--tune-grey2);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text-secondary);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 12px;
    transition: all 0.12s;
  }

  .btn-restore:hover:not(:disabled) {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .btn-restore:disabled { opacity: 0.5; cursor: default; }

  /* Stats grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }

  .stat-card {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    color: inherit;
    font: inherit;
  }

  .stat-card:hover {
    border-color: var(--tune-accent);
    background: var(--tune-surface-hover);
  }

  .stat-card.stat-active {
    border-color: var(--tune-accent);
    box-shadow: 0 0 0 1px var(--tune-accent);
  }

  .stat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stat-label {
    font-family: var(--font-label);
    font-size: 13px;
    color: var(--tune-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-value {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 700;
  }

  .progress-bar {
    height: 6px;
    background: var(--tune-grey2);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--tune-accent);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .stat-detail {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  /* Filter bar */
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .filter-label {
    font-family: var(--font-label);
    font-size: 12px;
    color: var(--tune-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .metadata-search {
    margin-left: auto;
    padding: 5px 10px;
    border: 1px solid var(--tune-border);
    border-radius: 6px;
    background: var(--tune-bg);
    color: var(--tune-text);
    font-size: 13px;
    width: 260px;
    outline: none;
  }
  .metadata-search:focus { border-color: var(--tune-accent); }

  .filter-btn {
    padding: 6px 12px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-full, 999px);
    color: var(--tune-text-muted);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 12px;
    transition: all 0.12s;
  }

  .filter-btn:hover { border-color: var(--tune-accent); color: var(--tune-text); }

  .filter-btn.active {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
  }

  /* Albums grid */
  .albums-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 16px;
  }

  .album-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    padding: 8px;
    border-radius: var(--radius-md);
    transition: background 0.12s;
  }

  .album-card:hover {
    background: var(--tune-surface-hover);
  }

  .album-card-art {
    position: relative;
  }

  .no-cover-badge {
    position: absolute;
    bottom: 6px;
    left: 6px;
    background: rgba(239, 68, 68, 0.85);
    color: white;
    font-family: var(--font-body);
    font-size: 10px;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .album-card-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .album-card-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .album-card-tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .tag {
    font-family: var(--font-body);
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
  }

  .tag.missing {
    background: rgba(251, 146, 60, 0.2);
    color: var(--tune-warning, #fb923c);
  }

  /* Tracks list (no_artist filter) */
  .tracks-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--tune-border);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .track-row {
    display: grid;
    grid-template-columns: 1.2fr 1fr 1fr 2fr;
    gap: 12px;
    padding: 10px 14px;
    background: var(--tune-surface);
    align-items: center;
  }

  .track-row-header {
    background: var(--tune-bg);
    border-bottom: 1px solid var(--tune-border);
    padding: 8px 14px;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .track-col-header {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--tune-text-muted);
  }

  .track-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-row-4col {
    grid-template-columns: auto 1fr 1fr 2fr;
    cursor: pointer;
  }

  .track-row-4col:hover {
    background: var(--tune-surface-hover);
  }

  .track-row.selected {
    background: rgba(87, 198, 185, 0.08);
  }

  .track-row-4col input[type="checkbox"] {
    accent-color: var(--tune-accent);
    cursor: pointer;
  }

  /* Album group */
  .album-group {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .album-group-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: var(--tune-grey2);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    cursor: pointer;
    text-align: left;
    color: var(--tune-text);
    font-family: var(--font-body);
    transition: background 0.12s;
  }

  .album-group-header:hover {
    background: var(--tune-surface-hover);
  }

  .album-group-header input[type="checkbox"] {
    accent-color: var(--tune-accent);
    cursor: pointer;
  }

  .album-group-title {
    font-size: 14px;
    font-weight: 700;
  }

  .album-group-artist {
    font-size: 13px;
    color: var(--tune-text-muted);
  }

  .album-group-count {
    margin-left: auto;
    font-size: 12px;
    color: var(--tune-text-muted);
    font-family: var(--font-label);
  }

  .album-group .tracks-list {
    border-top: none;
    border-radius: 0 0 var(--radius-md) var(--radius-md);
  }

  /* Action bar */
  .action-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-accent);
    border-radius: var(--radius-md);
    position: sticky;
    bottom: 16px;
    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.15);
  }

  .action-count {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-accent);
    white-space: nowrap;
  }

  .artist-picker {
    position: relative;
    flex: 1;
    max-width: 300px;
  }

  .artist-picker input {
    width: 100%;
    padding: 6px 10px;
    background: var(--tune-grey2);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    box-sizing: border-box;
  }

  .artist-picker input:focus {
    outline: none;
    border-color: var(--tune-accent);
  }

  .artist-picker input:disabled {
    opacity: 0.5;
  }

  .artist-dropdown {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    max-height: 200px;
    overflow-y: auto;
    background: var(--tune-surface);
    border: 1px solid var(--tune-accent);
    border-radius: var(--radius-md);
    margin-bottom: 4px;
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.2);
    z-index: 10;
  }

  .artist-option {
    display: block;
    width: 100%;
    padding: 8px 12px;
    background: none;
    border: none;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }

  .artist-option:hover {
    background: var(--tune-surface-hover);
  }

  /* Inline editing */
  .editable {
    cursor: pointer;
    border-bottom: 1px dashed transparent;
    padding: 2px 4px;
    border-radius: var(--radius-sm);
  }

  .editable:hover {
    border-bottom-color: var(--tune-accent);
    background: rgba(87, 198, 185, 0.08);
  }

  .inline-edit {
    padding: 2px 6px;
    background: var(--tune-grey2);
    border: 1px solid var(--tune-accent);
    border-radius: var(--radius-sm);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    min-width: 100px;
    outline: none;
  }

  .album-group-header .inline-edit {
    font-size: 14px;
    font-weight: 700;
  }

  .inline-artist-picker {
    max-width: 250px;
  }

  .inline-artist-picker .artist-dropdown {
    bottom: auto;
    top: 100%;
    margin-top: 4px;
    margin-bottom: 0;
  }

  .artist-option.artist-create {
    color: var(--tune-accent);
    font-weight: 600;
    border-top: 1px solid var(--tune-border);
  }

  .track-artist,
  .track-album {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-path {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--tune-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Empty & loading */
  .empty {
    text-align: center;
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 14px;
    padding: 40px;
  }

  .loading {
    display: flex;
    justify-content: center;
    padding: 40px;
  }

  .spinner {
    width: 24px;
    height: 24px;
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

  /* Stats actions row */
  .stats-actions {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }

  .stats-actions-group {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    flex-wrap: wrap;
  }

  .stats-actions-label {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--tune-text-muted);
    margin-right: 4px;
  }

  .inline-message {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    background: rgba(87, 198, 185, 0.1);
  }

  .inline-message.success {
    color: var(--tune-success, #4ade80);
    background: rgba(74, 222, 128, 0.1);
  }

  /* Batch toolbar */
  .batch-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    flex-wrap: wrap;
  }

  .batch-select-all {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text);
    cursor: pointer;
    white-space: nowrap;
  }

  .batch-select-all input[type="checkbox"] {
    accent-color: var(--tune-accent);
    cursor: pointer;
  }

  .batch-input-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 200px;
  }

  .batch-input {
    flex: 1;
    padding: 6px 10px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    outline: none;
    min-width: 120px;
  }

  .batch-input:focus {
    border-color: var(--tune-accent);
  }

  .batch-input-narrow {
    max-width: 100px;
    min-width: 80px;
    flex: unset;
  }

  .batch-sep {
    color: var(--tune-border);
    font-size: 16px;
    user-select: none;
  }

  .batch-autocomplete {
    position: relative;
    flex: 1;
    min-width: 120px;
  }

  .batch-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-top: none;
    border-radius: 0 0 var(--radius-sm) var(--radius-sm);
    max-height: 200px;
    overflow-y: auto;
    z-index: 20;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }

  .batch-dropdown-item {
    display: block;
    width: 100%;
    padding: 6px 10px;
    text-align: left;
    background: none;
    border: none;
    color: var(--tune-text);
    font-size: 13px;
    cursor: pointer;
  }

  .batch-dropdown-item:hover {
    background: var(--tune-surface-hover);
    color: var(--tune-accent);
  }

  .album-card-artist {
    cursor: pointer !important;
  }

  .album-card-artist:hover {
    color: var(--tune-accent) !important;
    text-decoration: underline;
  }

  /* Album card checkbox */
  .album-card-checkbox {
    position: absolute;
    top: 4px;
    left: 4px;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .album-card-checkbox input[type="checkbox"] {
    accent-color: var(--tune-accent);
    cursor: pointer;
    pointer-events: none;
  }

  .album-card {
    position: relative;
  }
  .action-bar { display: flex; gap: 8px; margin: 12px 0 16px; }
  .action-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border: 1px solid var(--tune-border); border-radius: 8px; background: var(--tune-surface); color: var(--tune-text); cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.12s; }
  .action-btn:hover { background: var(--tune-surface-hover); border-color: var(--tune-accent); color: var(--tune-accent); }
  .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .suggestions-panel { background: var(--tune-surface); border-radius: 12px; padding: 16px; margin-bottom: 16px; border: 1px solid var(--tune-border); }
  .suggestions-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .suggestions-header h3 { font-size: 15px; font-weight: 600; }
  .suggestion-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--tune-border); font-size: 13px; }
  .suggestion-field { font-weight: 600; color: var(--tune-accent); min-width: 80px; }
  .suggestion-current { color: var(--tune-text-muted); text-decoration: line-through; }
  .suggestion-arrow { color: var(--tune-text-muted); }
  .suggestion-value { color: var(--tune-text); font-weight: 500; }
  .suggestion-source { font-size: 10px; color: var(--tune-text-muted); background: var(--tune-grey2); padding: 2px 6px; border-radius: 4px; }
  .suggestion-confidence { font-size: 11px; font-weight: 700; color: var(--tune-accent); }
  .btn-accept { background: none; border: none; color: #10B981; cursor: pointer; font-size: 16px; padding: 4px; }
  .btn-reject { background: none; border: none; color: #EF4444; cursor: pointer; font-size: 16px; padding: 4px; }
  .btn-accept:hover { background: #10B98122; border-radius: 4px; }
  .btn-reject:hover { background: #EF444422; border-radius: 4px; }

  .duplicates-panel { background: var(--tune-surface); border-radius: 12px; padding: 16px; margin-bottom: 16px; border: 1px solid #F59E0B44; }
  .dup-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .dup-header h3 { font-size: 15px; font-weight: 600; color: #F59E0B; margin: 0; }

  .dup-card {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: 14px;
    margin-bottom: 10px;
  }

  .dup-card-top { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .dup-card-title { font-size: 15px; font-weight: 700; color: var(--tune-text); }

  .dup-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 10px;
    white-space: nowrap;
  }

  .dup-badge-album {
    background: rgba(109, 40, 217, 0.15);
    color: #c4b5fd;
    border: 1px solid rgba(109, 40, 217, 0.3);
  }

  .dup-badge-track {
    background: rgba(59, 130, 246, 0.1);
    color: #93c5fd;
    border: 1px solid rgba(59, 130, 246, 0.25);
  }
  .dup-diff-notice { font-size: 11px; color: #f59e0b; margin-bottom: 10px; font-weight: 600; }

  .dup-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  .dup-copy {
    background: rgba(255,255,255,0.02);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 10px;
    font-size: 12px;
  }

  .dup-copy-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--tune-text-muted);
    margin-bottom: 6px;
    letter-spacing: 0.05em;
  }

  .dup-field { display: flex; gap: 6px; padding: 2px 0; color: var(--tune-text-secondary); }
  .dup-key { color: var(--tune-text-muted); min-width: 50px; flex-shrink: 0; }
  .dup-diff { color: #f59e0b !important; font-weight: 600; }
  .dup-path { font-size: 10px; color: var(--tune-text-muted); word-break: break-all; margin-top: 4px; }

  .btn-keep {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    padding: 5px 12px;
    border-radius: 6px;
    border: 1px solid rgba(34, 197, 94, 0.3);
    background: rgba(34, 197, 94, 0.08);
    color: #22c55e;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s;
  }

  .btn-keep:hover {
    background: rgba(34, 197, 94, 0.2);
    border-color: #22c55e;
  }
  .dup-track { color: var(--tune-text); }
  .dup-vs { color: var(--tune-text-muted); font-size: 11px; }
  .dup-hash { font-size: 10px; color: var(--tune-text-muted); font-family: monospace; }
  .album-input { background: var(--tune-surface); border: 1px solid var(--tune-border); border-radius: 6px; padding: 6px 12px; color: var(--tune-text); font-size: 13px; width: 200px; }
  .album-input:focus { border-color: var(--tune-accent); outline: none; }

  /* Duplicate groups view */
  .dup-groups { display: flex; flex-direction: column; gap: 12px; }

  .dup-group-card {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .dup-group-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    background: rgba(245, 158, 11, 0.06);
    border-bottom: 1px solid var(--tune-border);
  }

  .dup-group-title { font-weight: 700; font-size: 14px; color: var(--tune-text); }
  .dup-group-artist { font-size: 13px; color: var(--tune-text-muted); }
  .dup-group-count { margin-left: auto; font-size: 11px; color: #f59e0b; font-weight: 600; padding: 2px 8px; border-radius: 10px; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.25); }

  .dup-group-items { display: flex; flex-direction: column; }

  .dup-group-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--tune-border);
  }
  .dup-group-item:last-child { border-bottom: none; }
  .dup-group-item:hover { background: var(--tune-surface-hover); }

  .dup-group-item-info { flex: 1; min-width: 0; }
  .dup-group-item-actions { display: flex; gap: 6px; flex-shrink: 0; }

  .btn-dup-move {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid rgba(239, 68, 68, 0.25);
    background: rgba(239, 68, 68, 0.08);
    color: #ef4444;
    cursor: pointer;
    transition: all 0.12s;
    padding: 0;
  }

  .btn-dup-move:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: #ef4444;
  }

  .btn-merge {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid rgba(87, 198, 185, 0.3);
    background: rgba(87, 198, 185, 0.1);
    color: var(--tune-accent);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.12s;
  }
  .btn-merge:hover {
    background: rgba(87, 198, 185, 0.25);
    border-color: var(--tune-accent);
  }

  /* Doubtful cards */
  .doubtful-cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .dcard {
    display: flex;
    gap: 14px;
    padding: 12px 16px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    align-items: center;
    transition: border-color 0.12s;
  }

  .dcard:hover { border-color: rgba(109, 40, 217, 0.3); }

  .dcard-cover-wrap {
    position: relative;
    width: 56px;
    height: 56px;
    flex-shrink: 0;
  }

  .dcard-cover {
    width: 56px;
    height: 56px;
    border-radius: 6px;
    object-fit: cover;
    cursor: zoom-in;
  }

  .dcard-cover-empty {
    width: 56px;
    height: 56px;
    border-radius: 6px;
    background: var(--tune-bg);
    border: 1px dashed var(--tune-border);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--tune-text-muted);
  }

  .dcard-cover-upload {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(109, 40, 217, 0.9);
    border: 1px solid #fff;
    color: #fff;
    display: none;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .dcard-cover-wrap:hover .dcard-cover-upload { display: flex; }

  .dcard-body {
    flex: 1;
    min-width: 0;
  }

  .dcard-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dcard-artist {
    font-size: 13px;
    color: var(--tune-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dcard-meta {
    font-size: 12px;
    color: var(--tune-text-muted);
    margin-top: 2px;
  }

  .dcard-sep { margin: 0 4px; }

  .dcard-path {
    font-size: 10px;
    color: var(--tune-text-muted);
    margin-top: 2px;
    word-break: break-all;
    opacity: 0.7;
  }

  .dcard-warn { color: #f59e0b !important; font-weight: 600; }

  .dcard-hint {
    font-size: 11px;
    color: var(--tune-accent);
    margin-left: 4px;
  }

  .dcard-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }

  .dcard-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }

  .dcard-edit-fields {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .dcard-edit-row {
    display: flex;
    gap: 8px;
  }

  .dcard-input {
    width: 100%;
    background: var(--tune-bg);
    border: 1px solid var(--tune-accent);
    border-radius: 4px;
    padding: 5px 8px;
    color: var(--tune-text);
    font-size: 13px;
    outline: none;
  }

  .dcard-input:focus { box-shadow: 0 0 0 2px rgba(87, 198, 185, 0.2); }
  .dcard-input-sm { flex: 1; }
  .dcard-input-year { width: 70px; flex: unset; }

  .dcard-label {
    font-size: 11px;
    color: var(--tune-text-secondary, #999);
    margin-bottom: 2px;
    margin-top: 4px;
  }
  .dcard-label:first-child { margin-top: 0; }

  .dcard-field-group { display: flex; flex-direction: column; flex: 1; }
  .dcard-field-year { width: 80px; flex: unset; }

  .btn-graver { background: #e67e22 !important; }
  .btn-graver:disabled { opacity: 0.4; cursor: not-allowed; }

  .dcard-edit-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .dcard-edit-actions .btn-doubtful-ok,
  .dcard-edit-actions .btn-doubtful-edit {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 12px;
    font-size: 12px;
    width: auto;
    height: auto;
    border-radius: 6px;
  }

  .meta-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .meta-section-label {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--tune-text-muted);
  }

  .meta-section-btns {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .meta-section-filters {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    flex-wrap: wrap;
  }

  .filter-col-tous {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .filter-col-tous .metadata-search {
    width: 260px;
    margin-left: 0;
  }
  .metadata-select {
    appearance: auto;
    cursor: pointer;
  }

  .enrich-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border-radius: 6px;
    border: 1px solid rgba(109, 40, 217, 0.25);
    background: rgba(109, 40, 217, 0.08);
    color: #c4b5fd;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.12s;
  }
  .enrich-btn:hover:not(:disabled) {
    background: rgba(109, 40, 217, 0.2);
    border-color: rgba(109, 40, 217, 0.4);
  }
  .enrich-btn:disabled { opacity: 0.4; cursor: default; }

  .fix-result-banner {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 16px;
    margin: 8px 0;
    background: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(34, 197, 94, 0.2);
    border-radius: var(--radius-md);
    font-size: 13px;
    color: #86efac;
  }

  .fix-result-text strong {
    text-transform: capitalize;
  }

  .fix-result-dismiss {
    margin-left: auto;
    background: none;
    border: none;
    color: #86efac;
    cursor: pointer;
    padding: 4px;
    display: flex;
    opacity: 0.6;
  }

  .fix-result-dismiss:hover {
    opacity: 1;
  }

  /* Doubtful view */
  .doubtful-table {
    display: table;
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
  }

  .doubtful-thead {
    display: table-header-group;
  }

  .doubtful-tbody {
    display: table-row-group;
  }

  .doubtful-tr {
    display: table-row;
    background: var(--tune-surface);
  }

  .doubtful-tr:hover {
    background: var(--tune-surface-hover);
  }

  .doubtful-th, .doubtful-td {
    display: table-cell;
    padding: 8px 12px;
    border-bottom: 1px solid var(--tune-border);
    vertical-align: middle;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    position: relative;
  }

  .doubtful-th {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--tune-text-muted);
    background: var(--tune-bg);
    position: sticky;
    top: 0;
    z-index: 1;
    cursor: default;
    border-right: 2px solid transparent;
    user-select: none;
  }

  .resize-handle {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
    background: transparent;
    z-index: 2;
  }

  .resize-handle:hover,
  .resize-handle:active {
    background: var(--tune-accent);
    opacity: 0.5;
  }

  .doubtful-field {
    font-size: 13px;
    color: var(--tune-text);
  }

  .doubtful-warn {
    color: #f59e0b;
    font-weight: 600;
  }

  .doubtful-hint {
    font-size: 11px;
    color: var(--tune-accent);
    margin-left: 4px;
  }

  .doubtful-reasons {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .doubtful-tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 600;
    font-family: var(--font-label);
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.25);
    white-space: nowrap;
  }

  .track-source {
    font-size: 11px;
    color: var(--tune-text-muted);
    font-family: var(--font-label);
    text-transform: uppercase;
  }

  .doubtful-actions {
    display: flex;
    gap: 4px;
    align-items: center;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .btn-doubtful-ok, .btn-doubtful-edit {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-doubtful-ok {
    background: rgba(34, 197, 94, 0.12);
    color: #22c55e;
    border-color: rgba(34, 197, 94, 0.25);
  }
  .btn-doubtful-ok:hover {
    background: rgba(34, 197, 94, 0.25);
    border-color: #22c55e;
  }

  .btn-doubtful-edit {
    background: rgba(59, 130, 246, 0.12);
    color: #3b82f6;
    border-color: rgba(59, 130, 246, 0.25);
  }
  .btn-doubtful-edit:hover {
    background: rgba(59, 130, 246, 0.25);
    border-color: #3b82f6;
  }

  .doubtful-input {
    width: 100%;
    background: var(--tune-bg);
    border: 1px solid var(--tune-accent);
    border-radius: 4px;
    padding: 4px 8px;
    color: var(--tune-text);
    font-size: 13px;
    font-family: var(--font-body);
    outline: none;
  }

  .doubtful-input:focus {
    border-color: var(--tune-accent);
    box-shadow: 0 0 0 2px rgba(87, 198, 185, 0.2);
  }

  .doubtful-input-year {
    width: 60px;
  }

  .doubtful-cover-cell {
    padding: 4px 6px !important;
  }

  .doubtful-cover {
    width: 32px;
    height: 32px;
    border-radius: 4px;
    object-fit: cover;
    display: block;
    cursor: zoom-in;
    transition: transform 0.15s;
  }

  .doubtful-cover:hover {
    transform: scale(1.2);
  }

  .cover-zoom-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: zoom-out;
  }

  .cover-zoom-img {
    max-width: 80vw;
    max-height: 80vh;
    border-radius: 12px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
  }

  .doubtful-cover-wrapper {
    position: relative;
    width: 32px;
    height: 32px;
  }

  .doubtful-cover-placeholder {
    width: 32px;
    height: 32px;
    border-radius: 4px;
    background: var(--tune-bg);
    border: 1px dashed var(--tune-border);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--tune-text-muted);
  }

  .doubtful-cover-upload {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(109, 40, 217, 0.9);
    border: 1px solid #fff;
    color: #fff;
    display: none;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }

  .doubtful-cover-wrapper:hover .doubtful-cover-upload {
    display: flex;
  }
</style>

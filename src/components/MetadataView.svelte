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
  let filter = $state<'all' | 'no_cover' | 'no_genre' | 'no_year' | 'no_artist' | 'unknown' | 'doubtful'>('no_cover');
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

  async function handleScanDuplicates() {
    scanningDuplicates = true;
    try {
      await api.scanDuplicates();
      const d = await api.listDuplicates();
      duplicates = d;
    } catch {}
    scanningDuplicates = false;
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

  let filteredAlbums = $derived.by(() => {
    switch (filter) {
      case 'no_cover':
        return allAlbums.filter(a => !a.cover_path);
      case 'no_genre':
        return allAlbums.filter(a => !a.genre);
      case 'no_year':
        return allAlbums.filter(a => !a.year);
      case 'no_artist':
        return [];
      case 'unknown':
        return [];
      default:
        return allAlbums;
    }
  });

  // Count duplicate albums (same title, multiple entries)
  let duplicateCount = $derived.by(() => {
    const groups = new Map<string, number>();
    for (const a of allAlbums) {
      const key = (a.title ?? '').toLowerCase().trim();
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    let count = 0;
    for (const c of groups.values()) {
      if (c > 1) count += c;
    }
    return count;
  });

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

  function completionPercent(missing: number, total: number): number {
    if (total === 0) return 100;
    return Math.round(((total - missing) / total) * 100);
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

  async function handleDoubtfulCoverUpload(albumId: number, file: File) {
    try {
      const updated = await api.uploadAlbumArtwork(albumId, file);
      doubtfulAlbums = doubtfulAlbums.map(a =>
        a.id === albumId ? { ...a, cover_path: updated.cover_path } : a
      );
      api.getCompletenessStats().then(s => stats = s);
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

  function editDoubtful(album: import('../lib/api').DoubtfulAlbum) {
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
    const album = doubtfulAlbums.find(a => a.id === editingDoubtfulId);
    if (!album) return;
    if (editingDoubtfulData.artist_name !== (album.artist_name ?? '')) updates.artist_name = editingDoubtfulData.artist_name;
    if (editingDoubtfulData.title !== (album.title ?? '')) updates.title = editingDoubtfulData.title;
    if (editingDoubtfulData.genre !== (album.genre ?? '')) updates.genre = editingDoubtfulData.genre;
    const newYear = editingDoubtfulData.year ? parseInt(editingDoubtfulData.year) : null;
    if (newYear !== album.year) updates.year = newYear;
    if (Object.keys(updates).length > 0) {
      try {
        await api.updateAlbumMetadata(editingDoubtfulId, updates);
        // Update local state
        doubtfulAlbums = doubtfulAlbums.map(a => a.id === editingDoubtfulId ? { ...a, ...updates } : a);
      } catch (e) {
        console.error('Save doubtful error:', e);
      }
    }
    editingDoubtfulId = null;
  }

  function cancelDoubtful() {
    editingDoubtfulId = null;
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
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">{$t('metadata.cover')}</span>
          <span class="stat-value">{completionPercent(stats.albums_without_cover, stats.total_albums)}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {completionPercent(stats.albums_without_cover, stats.total_albums)}%"></div>
        </div>
        <span class="stat-detail">{stats.albums_without_cover} / {stats.total_albums} {$t('metadata.missingCovers').toLowerCase()}</span>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">{$t('metadata.genre')}</span>
          <span class="stat-value">{completionPercent(stats.albums_without_genre, stats.total_albums)}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {completionPercent(stats.albums_without_genre, stats.total_albums)}%"></div>
        </div>
        <span class="stat-detail">{stats.albums_without_genre} / {stats.total_albums} {$t('metadata.missingGenre').toLowerCase()}</span>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">{$t('metadata.year')}</span>
          <span class="stat-value">{completionPercent(stats.albums_without_year, stats.total_albums)}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {completionPercent(stats.albums_without_year, stats.total_albums)}%"></div>
        </div>
        <span class="stat-detail">{stats.albums_without_year} / {stats.total_albums} {$t('metadata.missingYear').toLowerCase()}</span>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">{$t('metadata.artist')}</span>
          <span class="stat-value">{completionPercent(stats.tracks_without_artist, stats.total_tracks)}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {completionPercent(stats.tracks_without_artist, stats.total_tracks)}%"></div>
        </div>
        <span class="stat-detail">{stats.tracks_without_artist} / {stats.total_tracks} {$t('metadata.missingArtist').toLowerCase()}</span>
      </div>
    </div>

    <!-- Actions row: Merge Duplicates + Enrich -->
    <div class="stats-actions">
      <button class="btn-action" onclick={mergeDuplicates} disabled={merging || duplicateCount === 0}>
        {#if merging}
          <div class="spinner small"></div>
          {$t('metadata.merging')}
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M16 3h5v5" /><path d="M8 3H3v5" /><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" /><path d="m15 9 6-6" /></svg>
          {#if duplicateCount > 0}
            {$t('metadata.mergeDuplicates').replace('{count}', String(duplicateCount))}
          {:else}
            {$t('metadata.noDuplicates')}
          {/if}
        {/if}
      </button>
      {#if mergeMessage}
        <span class="inline-message">{mergeMessage}</span>
      {/if}

      <button class="btn-action" onclick={triggerEnrich} disabled={enriching}>
        {#if enriching}
          <div class="spinner small"></div>
          {$t('metadata.enriching')}
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
          {$t('metadata.enrich')}
        {/if}
      </button>
      {#if enrichMessage}
        <span class="inline-message success">{enrichMessage}</span>
      {/if}
    </div>

    <!-- Backup / Restore -->
    <div class="section-divider">
      <h2 class="section-title">{$t('maintenance.backupRestore')}</h2>
    </div>
    <div class="backup-section">
      <div class="backup-header">
        <button class="btn-action btn-primary" onclick={createBackup} disabled={backupCreating}>
          {#if backupCreating}
            <div class="spinner small"></div>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
          {/if}
          {$t('maintenance.createBackup')}
        </button>
        {#if backupMessage}
          <span class="backup-msg" class:success={backupMessage.type === 'success'} class:error={backupMessage.type === 'error'}>
            {backupMessage.text}
          </span>
        {/if}
      </div>
      {#if backupLoading}
        <div class="loading"><div class="spinner small"></div></div>
      {:else if backups.length === 0}
        <p class="backup-empty">{$t('maintenance.noBackups')}</p>
      {:else}
        <div class="backup-list">
          {#each backups as backup}
            <div class="backup-item">
              <div class="backup-info">
                <span class="backup-name">{backup.filename}</span>
                <span class="backup-meta">{formatBackupDate(backup.created_at)} &middot; {formatFileSize(backup.size)}</span>
              </div>
              <button class="btn-restore" onclick={() => restoreBackup(backup.filename)} disabled={restoring !== null}>
                {#if restoring === backup.filename}
                  <div class="spinner small"></div>
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                {/if}
                {$t('maintenance.restore')}
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <span class="filter-label">{$t('metadata.filter')}:</span>
      <button class="filter-btn" class:active={filter === 'all'} onclick={() => filter = 'all'}>{$t('metadata.all')}</button>
      <button class="filter-btn" class:active={filter === 'no_cover'} onclick={() => filter = 'no_cover'}>{$t('metadata.missingCovers')} ({stats.albums_without_cover})</button>
      <button class="filter-btn" class:active={filter === 'no_genre'} onclick={() => filter = 'no_genre'}>{$t('metadata.missingGenre')} ({stats.albums_without_genre})</button>
      <button class="filter-btn" class:active={filter === 'no_year'} onclick={() => filter = 'no_year'}>{$t('metadata.missingYear')} ({stats.albums_without_year})</button>
      <button class="filter-btn" class:active={filter === 'no_artist'} onclick={() => filter = 'no_artist'}>{$t('metadata.missingArtist')} ({stats.tracks_without_artist})</button>
      <button class="filter-btn" class:active={filter === 'unknown'} onclick={() => filter = 'unknown'}>{$t('metadata.unknown')} ({unknownAlbums.length})</button>
      <button class="filter-btn" class:active={filter === 'doubtful'} onclick={() => filter = 'doubtful'}>{$t('metadata.doubtful')} ({stats?.doubtful_count ?? 0})</button>
    </div>

    <!-- Action Bar -->
    <div class="action-bar-grid">
      <div class="action-group">
        <span class="action-group-label">Corriger</span>
        <div class="action-group-btns">
          <button class="action-btn" onclick={handleAutoFixAlbums} disabled={fixingAlbums}>
            {fixingAlbums ? 'Albums...' : 'Auto-fix albums'}
          </button>
          <button class="action-btn" onclick={handleAutoFix}>
            {autoFixStatus === 'running' ? `En cours (${autoFixProgress})` : 'Auto-fix'}
          </button>
          <button class="action-btn" onclick={handleScanDuplicates} disabled={scanningDuplicates}>
            {scanningDuplicates ? 'Scan...' : 'Scan doublons'}
          </button>
          <button class="action-btn" onclick={handleShowSuggestions}>
            Suggestions ({suggestionCount})
          </button>
        </div>
      </div>
      <div class="action-group">
        <span class="action-group-label">Enrichir</span>
        <div class="action-group-btns">
          <button class="action-btn action-btn-fix" onclick={() => handleFixYears('musicbrainz')} disabled={!!fixYearsRunning}>
            {fixYearsRunning === 'musicbrainz' ? '...' : 'Années MusicBrainz'}
          </button>
          <button class="action-btn action-btn-fix" onclick={() => handleFixYears('discogs')} disabled={!!fixYearsRunning}>
            {fixYearsRunning === 'discogs' ? '...' : 'Années Discogs'}
          </button>
          <button class="action-btn action-btn-fix" onclick={() => handleFixYears('tidal')} disabled={!!fixYearsRunning}>
            {fixYearsRunning === 'tidal' ? '...' : 'Années Tidal'}
          </button>
          <button class="action-btn action-btn-fix" onclick={handleFixGenres} disabled={fixGenresRunning}>
            {fixGenresRunning ? '...' : 'Genres Last.fm'}
          </button>
        </div>
      </div>
      <div class="action-group">
        <span class="action-group-label">Graver sur disque</span>
        <div class="action-group-btns">
          <button class="action-btn action-btn-write" onclick={handleWriteTags} disabled={writingTags}>
            {writingTags ? 'Écriture...' : 'Tags dans fichiers'}
          </button>
          <button class="action-btn action-btn-write" onclick={handleWriteCovers} disabled={writingCovers}>
            {writingCovers ? 'Écriture...' : 'Covers dans dossiers'}
          </button>
        </div>
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
        <h3>Doublons détectés ({duplicates.length})</h3>
        {#each duplicates as d}
          <div class="duplicate-row">
            <span class="dup-track">{d.track_a_title}</span>
            <span class="dup-vs">vs</span>
            <span class="dup-track">{d.track_b_title}</span>
            <span class="dup-hash">{d.audio_hash?.substring(0, 8)}</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Content -->
    {#if filter === 'no_artist'}
      {#if tracksWithoutArtist.length === 0}
        <div class="empty">{$t('metadata.noMissingArtist')}</div>
      {:else}
        <div class="tracks-list">
          <div class="track-row track-row-header">
            <span class="track-col-header">{$t('common.title')}</span>
            <span class="track-col-header">{$t('common.artist')}</span>
            <span class="track-col-header">{$t('common.album')}</span>
            <span class="track-col-header">{$t('metadata.filePath')}</span>
          </div>
          {#each tracksWithoutArtist as track (track.id)}
            <div class="track-row">
              <span class="track-title">{track.title}</span>
              <span class="track-artist">{track.artist_name ?? ''}</span>
              <span class="track-album">{track.album_title ?? ''}</span>
              <span class="track-path">{track.file_path ?? ''}</span>
            </div>
          {/each}
        </div>
      {/if}
    {:else if filter === 'doubtful'}
      {#if doubtfulAlbums.length === 0}
        <div class="empty">{$t('metadata.noDoubtful')}</div>
      {:else}
        <div class="doubtful-container" style="overflow-x:auto; border:1px solid var(--tune-border); border-radius:var(--radius-md); max-width:100%;">
          <table class="doubtful-table">
            <colgroup>
              {#each doubtfulColWidths as w, i}
                <col style="width:{w}px; min-width:50px;">
              {/each}
            </colgroup>
            <thead class="doubtful-thead">
              <tr class="doubtful-tr">
                <th class="doubtful-th"></th>
                <th class="doubtful-th">{$t('common.artist')}<span class="resize-handle" onmousedown={(e) => onResizeStart(e, 1)}></span></th>
                <th class="doubtful-th">{$t('common.album')}<span class="resize-handle" onmousedown={(e) => onResizeStart(e, 2)}></span></th>
                <th class="doubtful-th">{$t('metadata.genre')}<span class="resize-handle" onmousedown={(e) => onResizeStart(e, 3)}></span></th>
                <th class="doubtful-th">{$t('metadata.year')}<span class="resize-handle" onmousedown={(e) => onResizeStart(e, 4)}></span></th>
                <th class="doubtful-th">{$t('metadata.doubtful')}<span class="resize-handle" onmousedown={(e) => onResizeStart(e, 5)}></span></th>
                <th class="doubtful-th"></th>
              </tr>
            </thead>
            <tbody class="doubtful-tbody">
              {#each doubtfulAlbums as album (album.id)}
                <tr class="doubtful-tr">
                  <td class="doubtful-td doubtful-cover-cell"
                      ondragover={(e) => e.preventDefault()}
                      ondrop={(e) => onDoubtfulCoverDrop(e, album.id)}>
                    <div class="doubtful-cover-wrapper">
                      {#if album.cover_path}
                        <img class="doubtful-cover" src={api.artworkUrl(album.cover_path)} alt=""
                             onclick={() => doubtfulZoomCover = api.artworkUrl(album.cover_path)}
                             onerror={(e) => (e.target as HTMLImageElement).style.display='none'} />
                      {:else}
                        <div class="doubtful-cover-placeholder">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                        </div>
                      {/if}
                      <label class="doubtful-cover-upload" title="Changer la cover">
                        <input type="file" accept="image/*" style="display:none"
                               onchange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleDoubtfulCoverUpload(album.id, f); }} />
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      </label>
                    </div>
                  </td>
                  {#if editingDoubtfulId === album.id}
                    <td class="doubtful-td"><input class="doubtful-input" bind:value={editingDoubtfulData.artist_name} onkeydown={(e) => { if (e.key === 'Enter') saveDoubtful(); if (e.key === 'Escape') cancelDoubtful(); }} /></td>
                    <td class="doubtful-td"><input class="doubtful-input" bind:value={editingDoubtfulData.title} onkeydown={(e) => { if (e.key === 'Enter') saveDoubtful(); if (e.key === 'Escape') cancelDoubtful(); }} /></td>
                    <td class="doubtful-td"><input class="doubtful-input" bind:value={editingDoubtfulData.genre} onkeydown={(e) => { if (e.key === 'Enter') saveDoubtful(); if (e.key === 'Escape') cancelDoubtful(); }} /></td>
                    <td class="doubtful-td"><input class="doubtful-input doubtful-input-year" bind:value={editingDoubtfulData.year} onkeydown={(e) => { if (e.key === 'Enter') saveDoubtful(); if (e.key === 'Escape') cancelDoubtful(); }} /></td>
                    <td class="doubtful-td"></td>
                    <td class="doubtful-td">
                      <span class="doubtful-actions">
                        <button class="btn-doubtful-ok" title="Enregistrer" onclick={saveDoubtful}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
                        </button>
                        <button class="btn-doubtful-edit" title="Annuler" onclick={cancelDoubtful}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </span>
                    </td>
                  {:else}
                    <td class="doubtful-td doubtful-field" class:doubtful-warn={album.reasons.some(r => r.startsWith('artist'))}>
                      {album.artist_name ?? ''}
                      {#if album.artist_resolved && album.artist_resolved !== album.artist_name}
                        <span class="doubtful-hint">→ {album.artist_resolved}</span>
                      {/if}
                    </td>
                    <td class="doubtful-td track-title">{album.title}</td>
                    <td class="doubtful-td doubtful-field" class:doubtful-warn={album.reasons.includes('genre_placeholder')}>
                      {album.genre ?? ''}
                    </td>
                    <td class="doubtful-td doubtful-field" class:doubtful-warn={album.reasons.includes('year_suspicious')}>
                      {album.year ?? ''}
                    </td>
                    <td class="doubtful-td">
                      <span class="doubtful-reasons">
                        {#each album.reasons as reason}
                          <span class="doubtful-tag">{REASON_LABELS[reason] ?? reason}</span>
                        {/each}
                      </span>
                    </td>
                    <td class="doubtful-td">
                      <span class="doubtful-actions">
                        <button class="btn-doubtful-ok" title="Valider" onclick={() => validateDoubtful(album)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
                        </button>
                        <button class="btn-doubtful-edit" title="Éditer" onclick={() => editDoubtful(album)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                      </span>
                    </td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {#if doubtfulZoomCover}
      <div class="cover-zoom-overlay" onclick={() => doubtfulZoomCover = null} onkeydown={(e) => { if (e.key === 'Escape') doubtfulZoomCover = null; }} role="button" tabindex="-1">
        <img class="cover-zoom-img" src={doubtfulZoomCover} alt="" />
      </div>
    {/if}
    {:else if filter === 'unknown'}
      {#if unknownTracksLoading}
        <div class="loading"><div class="spinner"></div></div>
      {:else if unknownTracksByAlbum.length === 0}
        <div class="empty">{$t('common.noResult')}</div>
      {:else}
        {#each unknownTracksByAlbum as group (group.album.id)}
          <div class="album-group">
            <div class="album-group-header">
              <input
                type="checkbox"
                checked={isAlbumSelected(group.album.id)}
                indeterminate={isAlbumPartial(group.album.id)}
                onclick={(e) => e.stopPropagation()}
                onchange={() => toggleAlbumTracks(group.album.id)}
              />
              {#if editingAlbumId === group.album.id}
                <input
                  class="inline-edit"
                  type="text"
                  bind:value={editingAlbumTitle}
                  onkeydown={(e) => { if (e.key === 'Enter') saveAlbumTitle(); if (e.key === 'Escape') editingAlbumId = null; }}
                  onblur={saveAlbumTitle}
                  autofocus
                  onclick={(e) => e.stopPropagation()}
                />
              {:else}
                <span class="album-group-title editable" onclick={(e) => { e.stopPropagation(); startEditAlbum(group.album); }}>{group.album.title}</span>
              {/if}
              <span class="album-group-artist">{group.album.artist_name ?? 'Unknown Artist'}</span>
              <span class="album-group-count">{group.tracks.length} {group.tracks.length > 1 ? 'tracks' : 'track'}</span>
            </div>
            <div class="tracks-list">
              <div class="track-row track-row-4col track-row-header">
                <span></span>
                <span class="track-col-header">{$t('common.title')}</span>
                <span class="track-col-header">{$t('common.artist')}</span>
                <span class="track-col-header">{$t('metadata.filePath')}</span>
              </div>
              {#each group.tracks as track (track.id)}
                <div class="track-row track-row-4col" class:selected={selectedTrackIds.has(track.id!)}>
                  <input
                    type="checkbox"
                    checked={selectedTrackIds.has(track.id!)}
                    onchange={() => toggleTrack(track.id!)}
                  />
                  {#if editingTrackId === track.id}
                    <input
                      class="inline-edit"
                      type="text"
                      bind:value={editingTrackTitle}
                      onkeydown={(e) => { if (e.key === 'Enter') saveTrackTitle(); if (e.key === 'Escape') editingTrackId = null; }}
                      onblur={saveTrackTitle}
                      autofocus
                    />
                  {:else}
                    <span class="track-title editable" onclick={() => startEditTrack(track)}>{track.title}</span>
                  {/if}
                  <span class="track-artist">{track.artist_name ?? ''}</span>
                  <span class="track-path">{track.file_path ?? ''}</span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
        {#if selectedTrackIds.size > 0}
          <div class="action-bar">
            <span class="action-count">{selectedTrackIds.size} {selectedTrackIds.size > 1 ? 'tracks' : 'track'}</span>
            <div class="artist-picker">
              <input
                type="text"
                placeholder={artists.length === 0 ? 'Chargement…' : 'Rechercher un artiste…'}
                disabled={artists.length === 0}
                bind:value={artistSearch}
                onfocus={() => artistDropdownOpen = true}
                oninput={() => { selectedArtistId = null; artistDropdownOpen = true; }}
              />
              {#if artistDropdownOpen && (filteredArtists.length > 0 || artistSearch.trim().length > 0)}
                <div class="artist-dropdown">
                  {#each filteredArtists as artist (artist.id)}
                    <button class="artist-option" onclick={() => selectArtist(artist)}>
                      {artist.name}
                    </button>
                  {/each}
                  {#if artistSearch.trim().length > 0 && !artists.some(a => a.name.toLowerCase() === artistSearch.trim().toLowerCase())}
                    <button class="artist-option artist-create" onclick={createAndSelectArtist}>
                      + Créer « {artistSearch.trim()} »
                    </button>
                  {/if}
                </div>
              {/if}
            </div>
            <button class="btn-action btn-primary" onclick={applyArtist} disabled={!selectedArtistId || applying}>
              {#if applying}
                <div class="spinner small"></div>
              {/if}
              Appliquer artiste
            </button>
            <span style="color: var(--tune-text-muted); margin: 0 4px;">|</span>
            <input
              type="text"
              placeholder="Nom de l'album..."
              bind:value={albumNameInput}
              class="album-input"
            />
            <button class="btn-action btn-primary" onclick={applyAlbumName} disabled={!albumNameInput.trim() || applying}>
              Appliquer album
            </button>
          </div>
        {/if}
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
      <!-- Batch toolbar for no_genre / no_year -->
      {#if filter === 'no_genre' || filter === 'no_year'}
        <div class="batch-toolbar">
          <label class="batch-select-all">
            <input type="checkbox" checked={batchAllSelected} onchange={toggleBatchSelectAll} />
            {$t('metadata.selectAll')} ({filteredAlbums.length})
          </label>
          {#if filter === 'no_genre'}
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
                {#if batchApplying}
                  <div class="spinner small"></div>
                {/if}
                {#if batchProgress}
                  {$t('metadata.applyingBatch').replace('{current}', String(batchProgress.current)).replace('{total}', String(batchProgress.total))}
                {:else}
                  {$t('metadata.batchGenre')} ({batchSelectedIds.size})
                {/if}
              </button>
            </div>
          {:else}
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
                {#if batchApplying}
                  <div class="spinner small"></div>
                {/if}
                {#if batchProgress}
                  {$t('metadata.applyingBatch').replace('{current}', String(batchProgress.current)).replace('{total}', String(batchProgress.total))}
                {:else}
                  {$t('metadata.batchYear')} ({batchSelectedIds.size})
                {/if}
              </button>
            </div>
          {/if}
          {#if batchMessage}
            <span class="inline-message success">{batchMessage}</span>
          {/if}
        </div>
      {/if}

      <div class="albums-grid">
        {#each filteredAlbums as album (album.id)}
          <button class="album-card" onclick={() => editAlbum = album}>
            {#if filter === 'no_genre' || filter === 'no_year'}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="album-card-checkbox" onclick={(e) => { e.stopPropagation(); toggleBatchSelect(album.id!); }}>
                <input type="checkbox" checked={batchSelectedIds.has(album.id!)} tabindex="-1" />
              </div>
            {/if}
            <div class="album-card-art">
              <AlbumArt coverPath={album.cover_path} size={140} />
              {#if !album.cover_path}
                <div class="no-cover-badge">{$t('metadata.noCover')}</div>
              {/if}
            </div>
            <span class="album-card-title">{album.title}</span>
            <span class="album-card-artist">{album.artist_name ?? ''}</span>
            <div class="album-card-tags">
              {#if !album.genre}
                <span class="tag missing">{$t('metadata.genre')}</span>
              {/if}
              {#if !album.year}
                <span class="tag missing">{$t('metadata.year')}</span>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    {/if}
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
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
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
  .duplicates-panel h3 { font-size: 15px; font-weight: 600; color: #F59E0B; margin-bottom: 12px; }
  .duplicate-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; }
  .dup-track { color: var(--tune-text); }
  .dup-vs { color: var(--tune-text-muted); font-size: 11px; }
  .dup-hash { font-size: 10px; color: var(--tune-text-muted); font-family: monospace; }
  .album-input { background: var(--tune-surface); border: 1px solid var(--tune-border); border-radius: 6px; padding: 6px 12px; color: var(--tune-text); font-size: 13px; width: 200px; }
  .album-input:focus { border-color: var(--tune-accent); outline: none; }

  .action-bar-grid {
    display: flex;
    gap: 12px;
    padding: 12px 16px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .action-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-right: 12px;
    border-right: 1px solid var(--tune-border);
  }

  .action-group:last-child {
    border-right: none;
    padding-right: 0;
  }

  .action-group-label {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--tune-text-muted);
  }

  .action-group-btns {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .action-btn-fix {
    font-size: 11px !important;
    padding: 5px 10px !important;
    background: rgba(109, 40, 217, 0.08) !important;
    border-color: rgba(109, 40, 217, 0.2) !important;
    color: #c4b5fd !important;
  }

  .action-btn-fix:hover:not(:disabled) {
    background: rgba(109, 40, 217, 0.18) !important;
    border-color: rgba(109, 40, 217, 0.4) !important;
  }

  .action-btn-write {
    font-size: 11px !important;
    padding: 5px 10px !important;
    background: rgba(234, 88, 12, 0.08) !important;
    border-color: rgba(234, 88, 12, 0.2) !important;
    color: #fb923c !important;
  }

  .action-btn-write:hover:not(:disabled) {
    background: rgba(234, 88, 12, 0.18) !important;
    border-color: rgba(234, 88, 12, 0.4) !important;
  }

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

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
  let filter = $state<'all' | 'no_cover' | 'no_genre' | 'no_year' | 'no_artist' | 'unknown'>('no_cover');

  let editAlbum = $state<Album | null>(null);
  let rescanningAll = $state(false);

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

  $effect(() => {
    if (filter === 'no_artist') {
      loadTracksWithoutArtist();
    }
    // Track unknownAlbums.length so effect re-runs when allAlbums loads
    if (filter === 'unknown' && unknownAlbums.length > 0) {
      loadUnknownTracks();
    }
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
    </div>

    <!-- Content -->
    {#if filter === 'no_artist'}
      {#if tracksWithoutArtist.length === 0}
        <div class="empty">{$t('metadata.noMissingArtist')}</div>
      {:else}
        <div class="tracks-list">
          {#each tracksWithoutArtist as track (track.id)}
            <div class="track-row">
              <span class="track-title">{track.title}</span>
              <span class="track-album">{track.album_title ?? ''}</span>
              <span class="track-path">{track.file_path ?? ''}</span>
            </div>
          {/each}
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
              Appliquer
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
      <div class="albums-grid">
        {#each filteredAlbums as album (album.id)}
          <button class="album-card" onclick={() => editAlbum = album}>
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
    grid-template-columns: 1fr 1fr 2fr;
    gap: 12px;
    padding: 10px 14px;
    background: var(--tune-surface);
    align-items: center;
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
</style>

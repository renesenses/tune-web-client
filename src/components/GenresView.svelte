<script lang="ts">
  import { albums, genres } from '../lib/stores/library';
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import * as api from '../lib/api';
  import { formatTime, formatDuration, formatAudioBadge } from '../lib/utils';
  import AlbumArt from './AlbumArt.svelte';
  import type { Album, Track } from '../lib/types';
  import { t as tr } from '../lib/i18n';

  interface Props {
    onAddToPlaylist?: (track: import('../lib/types').Track) => void;
  }
  let { onAddToPlaylist }: Props = $props();

  type GenreLevel = 'list' | 'genre' | 'album';
  let level = $state<GenreLevel>('list');
  let selectedParent = $state<string | null>(null);
  let selectedGenreName = $state<string | null>(null);
  let selectedAlbum = $state<Album | null>(null);
  let genreAlbumTracks = $state<Track[]>([]);
  let loading = $state(false);
  let tree = $state<Record<string, string[]>>({});

  let zone = $derived($currentZone);

  // Reactive parent lookup — even if the tree loads AFTER the user already
  // clicked a subgenre chip, the breadcrumb stays correct.
  let displayParent = $derived.by(() => {
    if (selectedGenreName) {
      for (const [p, kids] of Object.entries(tree)) {
        if (p.toLowerCase() === selectedGenreName.toLowerCase()) return null;
        if (kids.some(c => c.toLowerCase() === selectedGenreName!.toLowerCase())) return p;
      }
    }
    return selectedParent;
  });

  // Build a fast lookup: lower(name) → list of genre names belonging to
  // the same branch when the user clicks a parent.
  let branchOf = $derived.by(() => {
    const map = new Map<string, string[]>();
    for (const [parent, children] of Object.entries(tree)) {
      const all = [parent, ...children];
      map.set(parent.toLowerCase(), all);
    }
    return map;
  });

  // Genres mentioned anywhere in the tree (parents + children) so we can
  // detect "orphan" genres in the user's library that aren't classified
  // and show them in their own section at the bottom.
  let knownTreeGenres = $derived.by(() => {
    const set = new Set<string>();
    for (const [p, kids] of Object.entries(tree)) {
      set.add(p.toLowerCase());
      for (const k of kids) set.add(k.toLowerCase());
    }
    return set;
  });

  let orphanGenres = $derived.by(() => {
    return $genres.filter(g => !knownTreeGenres.has(g.name.toLowerCase()));
  });

  // Aggregate count per parent: sum of albums whose genre is the parent
  // OR any of its children. Lets the user see "Jazz: 480 albums" before
  // diving in.
  let parentCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    const byName: Record<string, number> = {};
    for (const g of $genres) byName[g.name.toLowerCase()] = g.count;
    for (const [parent, children] of Object.entries(tree)) {
      let total = (byName[parent.toLowerCase()] || 0);
      for (const c of children) total += (byName[c.toLowerCase()] || 0);
      counts[parent] = total;
    }
    return counts;
  });

  // genreAlbums depends on the current selection:
  //   - subgenre selected → strict match
  //   - parent only → all albums whose genre is the parent or a child
  let genreAlbums = $derived.by(() => {
    if (selectedGenreName) {
      // Subgenre or orphan — exact match.
      return $albums.filter(a => a.genre === selectedGenreName);
    }
    if (selectedParent) {
      const branch = branchOf.get(selectedParent.toLowerCase()) ?? [selectedParent];
      const lower = new Set(branch.map(b => b.toLowerCase()));
      return $albums.filter(a => a.genre && lower.has(a.genre.toLowerCase()));
    }
    return [];
  });

  let albumTotalDuration = $derived(
    genreAlbumTracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0)
  );

  let tracksByDisc = $derived.by(() => {
    const map = new Map<number, Track[]>();
    for (const t of genreAlbumTracks) {
      const disc = t.disc_number ?? 1;
      if (!map.has(disc)) map.set(disc, []);
      map.get(disc)!.push(t);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  });

  let hasMultipleDiscs = $derived(tracksByDisc.length > 1);

  function selectGenre(name: string) {
    // Leaf / orphan — strict subgenre filter. Find which branch it belongs
    // to so the breadcrumb shows the path.
    selectedGenreName = name;
    selectedParent = null;
    for (const [parent, children] of Object.entries(tree)) {
      if (parent.toLowerCase() === name.toLowerCase()) {
        // The user clicked the parent name directly from a chip — treat
        // it as "browse the whole branch".
        selectedParent = parent;
        selectedGenreName = null;
        break;
      }
      if (children.some(c => c.toLowerCase() === name.toLowerCase())) {
        selectedParent = parent;
        break;
      }
    }
    selectedAlbum = null;
    genreAlbumTracks = [];
    level = 'genre';
  }

  function selectParentBranch(parent: string) {
    selectedParent = parent;
    selectedGenreName = null;
    selectedAlbum = null;
    genreAlbumTracks = [];
    level = 'genre';
  }

  function selectChild(child: string) {
    // From within a parent branch, narrow to a specific subgenre.
    selectedGenreName = child;
    selectedAlbum = null;
    genreAlbumTracks = [];
  }

  async function selectAlbumDetail(album: Album) {
    if (!album.id) return;
    selectedAlbum = album;
    level = 'album';
    loading = true;
    try {
      genreAlbumTracks = await api.getAlbumTracks(album.id);
    } catch (e) {
      console.error('Load album tracks error:', e);
    }
    loading = false;
  }

  function goToList() {
    level = 'list';
    selectedParent = null;
    selectedGenreName = null;
    selectedAlbum = null;
    genreAlbumTracks = [];
  }

  function goToParent() {
    // Drop the subgenre filter, keep the branch view.
    selectedGenreName = null;
    selectedAlbum = null;
    genreAlbumTracks = [];
    level = 'genre';
  }

  function goToGenre() {
    level = 'genre';
    selectedAlbum = null;
    genreAlbumTracks = [];
  }

  async function playAlbum(albumId: number) {
    if (!zone?.id) return;
    try {
      await playAndSync(zone.id, { album_id: albumId });
    } catch (e) {
      console.error('Play album error:', e);
    }
  }

  async function playTrack(trackId: number) {
    if (!zone?.id) return;
    try {
      const idx = genreAlbumTracks.findIndex(t => t.id === trackId);
      if (idx >= 0) {
        const ids = genreAlbumTracks.slice(idx).map(t => t.id).filter(Boolean) as number[];
        await playAndSync(zone.id, { track_ids: ids });
      } else {
        await playAndSync(zone.id, { track_id: trackId });
      }
    } catch (e) {
      console.error('Play track error:', e);
    }
  }

  async function addTrackToQueue(track: Track) {
    if (!zone?.id) return;
    try {
      if (track.id) {
        await api.addToQueue(zone.id, { track_id: track.id });
      } else if (track.source && track.source_id) {
        await api.addToQueue(zone.id, { source: track.source, source_id: track.source_id });
      }
    } catch (e) {
      console.error('Add to queue error:', e);
    }
  }

  // Auto-load albums if not yet loaded
  $effect(() => {
    if ($albums.length === 0) {
      api.getAlbums(500).then(result => albums.set(result)).catch(e => console.error('Load albums error:', e));
    }
  });

  // Load the genre tree once.
  $effect(() => {
    api.getGenreTree().then(r => tree = r.tree ?? {}).catch(e => console.error('Load genre tree error:', e));
  });
</script>

<div class="genres-view">
  {#if level === 'list'}
    <!-- Genre list — branches first, then orphan genres -->
    <div class="view-header">
      <h2>{$tr('nav.genres')}</h2>
    </div>
    {#if Object.keys(tree).length > 0}
      <div class="branches">
        {#each Object.keys(tree).sort((a, b) => (parentCounts[b] ?? 0) - (parentCounts[a] ?? 0)) as parent (parent)}
          {@const total = parentCounts[parent] ?? 0}
          {#if total > 0}
            <div class="branch-row">
              <button class="branch-card" onclick={() => selectParentBranch(parent)}>
                <span class="branch-name">{parent}</span>
                <span class="branch-count">{total} {total > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
              </button>
              <div class="branch-children">
                {#each tree[parent] as child}
                  {@const c = ($genres.find(g => g.name.toLowerCase() === child.toLowerCase())?.count ?? 0)}
                  {#if c > 0}
                    <button class="child-chip" onclick={() => selectGenre(child)}>
                      {child} <span class="child-count">{c}</span>
                    </button>
                  {/if}
                {/each}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}

    {#if orphanGenres.length > 0}
      <h3 class="section-title">Hors arbre</h3>
      <div class="genres-grid">
        {#each orphanGenres as g}
          <button class="genre-card" onclick={() => selectGenre(g.name)}>
            <span class="genre-card-name">{g.name}</span>
            <span class="genre-card-count">{g.count} {g.count > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if $genres.length === 0}
      <div class="empty">{$tr('library.noGenres')}</div>
    {/if}

  {:else if level === 'genre' && (displayParent || selectedGenreName)}
    <!-- Genre albums (parent branch OR specific subgenre) -->
    <div class="view-header">
      <nav class="breadcrumbs">
        <button class="breadcrumb-link" onclick={goToList}>{$tr('nav.genres')}</button>
        {#if displayParent}
          <span class="breadcrumb-sep">/</span>
          {#if selectedGenreName}
            <button class="breadcrumb-link" onclick={() => { selectedParent = displayParent; goToParent(); }}>{displayParent}</button>
          {:else}
            <span class="breadcrumb-current">{displayParent}</span>
          {/if}
        {/if}
        {#if selectedGenreName}
          <span class="breadcrumb-sep">/</span>
          <span class="breadcrumb-current">{selectedGenreName}</span>
        {/if}
      </nav>
      <span class="genre-count">{genreAlbums.length} {genreAlbums.length > 1 ? $tr('library.albumPlural') : $tr('library.album')}</span>
    </div>

    <!-- Sub-genre chips when on a parent branch (lets user narrow without going back) -->
    {#if displayParent && tree[displayParent]}
      <div class="subchips">
        {#if selectedGenreName}
          <button class="subchip" onclick={() => { selectedParent = displayParent; goToParent(); }}>Tous</button>
        {:else}
          <button class="subchip subchip-all" disabled>Tous</button>
        {/if}
        {#each tree[displayParent] as child}
          {@const c = ($genres.find(g => g.name.toLowerCase() === child.toLowerCase())?.count ?? 0)}
          {#if c > 0}
            <button class="subchip" class:active={selectedGenreName === child} onclick={() => selectChild(child)}>
              {child} <span class="subchip-count">{c}</span>
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
            <AlbumArt coverPath={album.cover_path} size={160} alt={album.title} />
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
      {#if genreAlbums.length === 0}
        <div class="empty">{$tr('library.noAlbums')}</div>
      {/if}
    </div>

  {:else if level === 'album' && selectedAlbum}
    <!-- Album detail -->
    <div class="view-header">
      <nav class="breadcrumbs">
        <button class="breadcrumb-link" onclick={goToList}>{$tr('nav.genres')}</button>
        {#if displayParent}
          <span class="breadcrumb-sep">/</span>
          <button class="breadcrumb-link" onclick={() => { selectedParent = displayParent; goToParent(); }}>{displayParent}</button>
        {/if}
        {#if selectedGenreName}
          <span class="breadcrumb-sep">/</span>
          <button class="breadcrumb-link" onclick={goToGenre}>{selectedGenreName}</button>
        {/if}
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-current">{selectedAlbum.title}</span>
      </nav>
    </div>
    <div class="album-detail">
      <div class="album-detail-header">
        <AlbumArt coverPath={selectedAlbum.cover_path} size={320} alt={selectedAlbum.title} />
        <div class="album-detail-info">
          <h2>{selectedAlbum.title}</h2>
          {#if selectedAlbum.artist_name}
            <p class="detail-artist">{selectedAlbum.artist_name}</p>
          {/if}
          <div class="detail-meta">
            {#if selectedAlbum.year}
              <span>{selectedAlbum.year}</span>
            {/if}
            {#if selectedAlbum.genre}
              <span>{selectedAlbum.genre}</span>
            {/if}
            {#if genreAlbumTracks.length > 0}
              <span>{genreAlbumTracks.length} {$tr('common.tracks')}</span>
            {/if}
            {#if albumTotalDuration > 0}
              <span>{formatDuration(albumTotalDuration)}</span>
            {/if}
          </div>
          {#if selectedAlbum.source && selectedAlbum.source !== 'local'}
            <span class="source-badge">{selectedAlbum.source}</span>
          {/if}
          <button class="play-all-btn" onclick={() => selectedAlbum?.id && playAlbum(selectedAlbum.id)}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z" /></svg>
            {$tr('library.playAlbum')}
          </button>
        </div>
      </div>
      {#if loading}
        <div class="loading">
          <div class="spinner"></div>
          {$tr('common.loading')}
        </div>
      {:else if hasMultipleDiscs}
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
                <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); addTrackToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
                {#if onAddToPlaylist && (t.id || t.source_id)}
                  <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={$tr('nowplaying.addToPlaylist')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" /><line x1="16" y1="3" x2="16" y2="11" /><line x1="12" y1="7" x2="20" y2="7" /></svg>
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      {:else}
        <div class="track-list">
          {#each genreAlbumTracks as t, index}
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
              <button class="add-queue-btn" onclick={(e) => { e.stopPropagation(); addTrackToQueue(t); }} title={$tr('queue.addToQueue')}>+</button>
              {#if onAddToPlaylist && (t.id || t.source_id)}
                <button class="add-playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(t); }} title={$tr('nowplaying.addToPlaylist')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" /><line x1="16" y1="3" x2="16" y2="11" /><line x1="12" y1="7" x2="20" y2="7" /></svg>
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .genres-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
  }

  .view-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
    flex-wrap: wrap;
  }

  .view-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  /* Breadcrumbs */
  .breadcrumbs {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-body);
    font-size: 15px;
  }

  .breadcrumb-link {
    background: none;
    border: none;
    color: var(--tune-accent);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 15px;
    padding: 0;
    transition: color 0.12s;
  }

  .breadcrumb-link:hover {
    color: var(--tune-accent-hover);
    text-decoration: underline;
  }

  .breadcrumb-sep {
    color: var(--tune-text-muted);
    user-select: none;
  }

  .breadcrumb-current {
    font-weight: 600;
    color: var(--tune-text);
  }

  .genre-count {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
    margin-left: auto;
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

  /* Branches (genre tree on the list view) */
  .branches {
    display: flex; flex-direction: column;
    gap: var(--space-md);
    margin-bottom: var(--space-xl);
  }
  .branch-row {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    padding: var(--space-md) var(--space-lg);
    display: flex; flex-direction: column; gap: var(--space-sm);
  }
  .branch-card {
    display: flex; justify-content: space-between; align-items: baseline;
    background: none; border: none; padding: 0;
    color: var(--tune-text); cursor: pointer; text-align: left;
  }
  .branch-name {
    font-family: var(--font-label);
    font-size: 18px; font-weight: 700;
  }
  .branch-card:hover .branch-name { color: var(--tune-accent); }
  .branch-count {
    font-family: var(--font-body);
    font-size: 13px; color: var(--tune-text-muted);
  }
  .branch-children {
    display: flex; flex-wrap: wrap; gap: 6px;
  }
  .child-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px;
    background: rgba(var(--tune-accent-rgb,99,102,241),0.10);
    color: var(--tune-text);
    border: 1px solid rgba(var(--tune-accent-rgb,99,102,241),0.18);
    border-radius: 14px; font-size: 12px; cursor: pointer;
    transition: background 0.12s;
  }
  .child-chip:hover { background: rgba(var(--tune-accent-rgb,99,102,241),0.22); }
  .child-count {
    color: var(--tune-text-muted); font-size: 11px;
  }

  .section-title {
    font-family: var(--font-label);
    font-size: 13px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--tune-text-muted);
    margin: var(--space-md) 0 var(--space-sm);
  }

  /* Subgenre chips above the album grid in branch view */
  .subchips {
    display: flex; flex-wrap: wrap; gap: 6px;
    margin-bottom: var(--space-md);
  }
  .subchip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 10px;
    background: var(--tune-bg);
    color: var(--tune-text-muted);
    border: 1px solid var(--tune-border);
    border-radius: 14px; font-size: 12px; cursor: pointer;
  }
  .subchip:hover { color: var(--tune-text); border-color: var(--tune-accent); }
  .subchip.active { background: var(--tune-accent); color: white; border-color: var(--tune-accent); }
  .subchip-all { background: rgba(var(--tune-accent-rgb,99,102,241),0.15); color: var(--tune-accent); cursor: default; }
  .subchip-count {
    color: inherit; opacity: 0.7; font-size: 11px;
  }

  /* Albums grid */
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
  }

  .album-card:hover {
    transform: translateY(-2px);
  }

  .album-card-art {
    position: relative;
    border-radius: var(--radius-lg);
    overflow: hidden;
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

  .album-card-title {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    max-width: 160px;
  }

  .album-card-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    max-width: 160px;
  }

  /* Album detail */
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
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-md);
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
  }

  .detail-meta span:not(:last-child)::after {
    content: '\00b7';
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

  /* Track list */
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

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty {
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    text-align: center;
    padding: var(--space-2xl);
    grid-column: 1 / -1;
  }
</style>

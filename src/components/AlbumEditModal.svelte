<script lang="ts">
  import * as api from '../lib/api';
  import { artworkUrl } from '../lib/api';
  import type { Album, Artist, Track } from '../lib/types';
  import { t } from '../lib/i18n';
  import TrackTagsDrawer from './TrackTagsDrawer.svelte';

  interface Props {
    album: Album;
    onClose: () => void;
    onSaved?: (album: Album) => void;
    availableGenres?: string[];
  }
  let { album, onClose, onSaved, availableGenres = [] }: Props = $props();

  let title = $state(album.title);
  let year = $state<number | null>(album.year ?? null);
  let genre = $state(album.genre ?? '');
  let artistId = $state<number | null>(album.artist_id ?? null);
  let artistInput = $state<string>(album.artist_name ?? '');
  let coverPath = $state(album.cover_path ?? null);
  let label = $state(album.label ?? '');
  let catalogNumber = $state(album.catalog_number ?? '');

  let artists = $state<Artist[]>([]);
  let saving = $state(false);
  let success = $state(false);
  let error = $state<string | null>(null);

  // Tracks list (collapsible) + per-track all-tags drawer
  let tracks = $state<Track[]>([]);
  let tracksLoaded = $state(false);
  let tracksOpen = $state(false);
  let editingTrackId = $state<number | null>(null);

  async function loadTracks() {
    if (!album.id || tracksLoaded) return;
    try {
      tracks = await api.getAlbumTracks(album.id);
      tracksLoaded = true;
    } catch (e) {
      console.error('Load tracks error:', e);
    }
  }

  async function toggleTracks() {
    tracksOpen = !tracksOpen;
    if (tracksOpen && !tracksLoaded) await loadTracks();
  }

  // Cover upload/search state
  let uploading = $state(false);
  let searching = $state(false);
  let coverMessage = $state<string | null>(null);
  let dragOver = $state(false);
  let fileInput: HTMLInputElement;

  async function loadArtists() {
    try {
      // Fetch the entire artist catalog so the autocomplete works for
      // every name in the library (not just the alphabetical first 500).
      // 5000 is the server's cap and ample for any realistic music
      // library — Bertrand's largest is ~1300 artists.
      artists = await api.getArtists(5000, 0);
    } catch (e) {
      console.error('Load artists error:', e);
    }
  }

  function resolveArtistByName(name: string): number | null {
    const target = (name || '').trim().toLowerCase();
    if (!target) return null;
    // Exact (case-insensitive) match wins; otherwise no match → keep
    // current artistId so we don't accidentally rewrite to a wrong one.
    const hit = artists.find(a => (a.name || '').toLowerCase() === target);
    return hit?.id ?? null;
  }

  let writingTags = $state(false);
  let writeTagsResult = $state<string | null>(null);
  let hasSaved = $state(false);

  async function saveAlbum() {
    if (!album.id) return;
    saving = true;
    error = null;
    try {
      const data: Record<string, any> = {};
      if (title !== album.title) data.title = title;
      if (year !== (album.year ?? null)) data.year = year;
      if (genre !== (album.genre ?? '')) data.genre = genre || null;
      if (artistId !== (album.artist_id ?? null)) data.artist_id = artistId;
      if (label !== (album.label ?? '')) data.label = label || null;
      if (catalogNumber !== (album.catalog_number ?? '')) data.catalog_number = catalogNumber || null;

      if (Object.keys(data).length > 0) {
        const updated = await api.updateAlbum(album.id, data);
        onSaved?.(updated);
      }
      success = true;
      hasSaved = true;
    } catch (e) {
      console.error('Save album error:', e);
      error = $t('metadata.saveError');
    }
    saving = false;
  }

  async function writeAlbumTags() {
    if (!album.id) return;
    writingTags = true;
    writeTagsResult = null;
    try {
      const result = await api.writeAlbumTags(album.id);
      writeTagsResult = `Tags gravés : ${result.success}/${result.tracks_processed} pistes`;
    } catch (e: any) {
      writeTagsResult = `Erreur : ${e?.message || e}`;
    }
    writingTags = false;
  }

  async function handleUpload(file: File) {
    if (!album.id) return;
    uploading = true;
    coverMessage = null;
    try {
      const updated = await api.uploadAlbumArtwork(album.id, file);
      coverPath = updated.cover_path ?? null;
      coverMessage = $t('metadata.coverFound');
      onSaved?.(updated);
    } catch (e) {
      console.error('Upload cover error:', e);
      coverMessage = $t('metadata.saveError');
    }
    uploading = false;
  }

  async function searchCover() {
    if (!album.id) return;
    searching = true;
    coverMessage = null;
    try {
      const result = await api.rescanAlbumArtwork(album.id);
      if (result.status === 'found') {
        coverPath = result.cover_path;
        coverMessage = $t('metadata.coverFound');
      } else {
        coverMessage = $t('metadata.coverNotFound');
      }
    } catch (e) {
      console.error('Search cover error:', e);
      coverMessage = $t('metadata.saveError');
    }
    searching = false;
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.[0]) {
      handleUpload(input.files[0]);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file?.type.startsWith('image/')) {
      handleUpload(file);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  $effect(() => {
    loadArtists();
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdropClick} onkeydown={handleKeydown}>
  <div class="modal">
    {#if success}
      <div class="success-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><polyline points="20 6 9 17 4 12" /></svg>
        <p>{$t('metadata.saved')}</p>
      </div>
    {:else}
      <div class="modal-header">
        <h3>{$t('metadata.editAlbum')}</h3>
        <button class="close-btn" onclick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <div class="modal-body">
        <!-- Cover section -->
        <div class="cover-section">
          <div
            class="cover-area"
            class:drag-over={dragOver}
            ondrop={handleDrop}
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
            role="button"
            tabindex="0"
            onclick={() => fileInput.click()}
            onkeydown={(e) => e.key === 'Enter' && fileInput.click()}
          >
            {#if coverPath}
              <img src={artworkUrl(coverPath)} alt="Album cover" class="cover-preview" />
            {:else}
              <div class="cover-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span class="drop-hint">{$t('metadata.dropImageHere')}</span>
                <span class="drop-sub">{$t('metadata.orClickToUpload')}</span>
              </div>
            {/if}
            {#if uploading}
              <div class="cover-overlay"><div class="spinner"></div></div>
            {/if}
          </div>
          <input
            bind:this={fileInput}
            type="file"
            accept="image/*"
            class="file-input"
            onchange={handleFileSelect}
          />
          <div class="cover-actions">
            <button class="btn-secondary" onclick={() => fileInput.click()} disabled={uploading}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              {$t('metadata.uploadCover')}
            </button>
            <button class="btn-secondary" onclick={searchCover} disabled={searching}>
              {#if searching}
                <div class="spinner small"></div>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              {/if}
              {$t('metadata.searchCover')}
            </button>
          </div>
          {#if coverMessage}
            <p class="cover-message" class:found={coverMessage === $t('metadata.coverFound')}>{coverMessage}</p>
          {/if}
        </div>

        <!-- Fields -->
        <div class="fields">
          <label class="field">
            <span class="field-label">{$t('metadata.albumTitle')}</span>
            <input type="text" bind:value={title} />
          </label>

          <label class="field">
            <span class="field-label">{$t('metadata.artist')}</span>
            <input
              type="text"
              bind:value={artistInput}
              list="artist-suggestions"
              autocomplete="off"
              onblur={() => {
                const resolved = resolveArtistByName(artistInput);
                if (resolved) artistId = resolved;
                // If no exact match, leave artistId unchanged (we don't
                // create new artists from this drawer; use a dedicated
                // 'New artist' flow if needed).
              }}
              placeholder="Tape pour chercher (autocomplétion)…"
            />
            <datalist id="artist-suggestions">
              {#each artists as a (a.id)}
                <option value={a.name}></option>
              {/each}
            </datalist>
            {#if artistInput && !resolveArtistByName(artistInput) && artistInput.trim().toLowerCase() !== (album.artist_name ?? '').toLowerCase()}
              <span class="hint-warn">Aucun artiste exact ne correspond — choisis dans la liste.</span>
            {/if}
          </label>

          <div class="field-row">
            <label class="field">
              <span class="field-label">{$t('metadata.year')}</span>
              <input type="number" bind:value={year} min="1900" max="2100" />
            </label>

            <label class="field">
              <span class="field-label">{$t('metadata.genre')}</span>
              <input type="text" bind:value={genre} list="genre-suggestions" autocomplete="off" />
              {#if availableGenres.length > 0}
                <datalist id="genre-suggestions">
                  {#each availableGenres as g}
                    <option value={g}>{g}</option>
                  {/each}
                </datalist>
              {/if}
            </label>
          </div>

          <label class="field">
            <span class="field-label">Label</span>
            <input type="text" bind:value={label} placeholder="Blue Note, ECM, …" />
          </label>

          <label class="field">
            <span class="field-label">Catalogue</span>
            <input type="text" bind:value={catalogNumber} placeholder="N° de catalogue" />
          </label>
        </div>

        <!-- Tracks (collapsible). Click a track to open all-tags drawer. -->
        <div class="tracks-section">
          <button class="tracks-toggle" onclick={toggleTracks}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" style="transform: rotate({tracksOpen ? 90 : 0}deg); transition: transform 0.15s">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            Pistes {tracksLoaded ? `(${tracks.length})` : ''}
            <span class="tracks-hint">— clic = tous les champs</span>
          </button>
          {#if tracksOpen}
            <div class="tracks-list">
              {#each tracks as t}
                <button class="track-row" onclick={() => editingTrackId = t.id} disabled={!t.id}>
                  <span class="track-num">{t.track_number ?? '—'}</span>
                  <span class="track-title">{t.title}</span>
                  <span class="track-meta">{t.duration_ms ? Math.floor(t.duration_ms / 60000) + ':' + String(Math.floor(t.duration_ms / 1000) % 60).padStart(2, '0') : ''}</span>
                </button>
              {/each}
              {#if tracks.length === 0 && tracksLoaded}
                <div class="state-empty">Aucune piste.</div>
              {/if}
            </div>
          {/if}
        </div>

        {#if error}
          <p class="error-msg">{error}</p>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" onclick={onClose}>{$t('common.cancel')}</button>
        {#if !album.source || album.source === 'local'}
          <button class="btn-write-tags" onclick={writeAlbumTags} disabled={writingTags || !hasSaved}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /></svg>
            {writingTags ? 'Gravure...' : 'Graver tags'}
          </button>
        {/if}
        <button class="btn-save" onclick={saveAlbum} disabled={saving}>
          {#if saving}
            <div class="spinner small"></div>
          {:else}
            {$t('metadata.save')}
          {/if}
        </button>
      </div>
      {#if writeTagsResult}
        <div class="write-tags-result">{writeTagsResult}</div>
      {/if}
      {#if success}
        <div class="write-tags-result" style="color:#86efac">{$t('metadata.saved')}</div>
      {/if}
    {/if}
  </div>
</div>

{#if editingTrackId !== null}
  <TrackTagsDrawer trackId={editingTrackId} onClose={() => editingTrackId = null} />
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    justify-content: flex-end;
    z-index: 200;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal {
    background: var(--tune-surface);
    border-left: 1px solid var(--tune-border);
    width: 420px;
    max-width: 92vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    animation: slideInRight 0.22s cubic-bezier(0.2, 0.7, 0.2, 1);
    overflow: hidden;
    box-shadow: -8px 0 32px rgba(0, 0, 0, 0.25);
  }

  @keyframes slideInRight {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  @media (max-width: 600px) {
    .modal { width: 100%; }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--tune-border);
  }

  .modal-header h3 {
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
  }

  .close-btn:hover { color: var(--tune-text); }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Cover section */
  .cover-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }

  .cover-area {
    width: 180px;
    height: 180px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--tune-grey2);
    cursor: pointer;
    position: relative;
    border: 2px dashed transparent;
    transition: border-color 0.15s;
  }

  .cover-area:hover, .cover-area.drag-over {
    border-color: var(--tune-accent);
  }

  .cover-preview {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--tune-text-muted);
  }

  .drop-hint {
    font-family: var(--font-body);
    font-size: 12px;
  }

  .drop-sub {
    font-family: var(--font-body);
    font-size: 11px;
    opacity: 0.6;
  }

  .cover-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .file-input { display: none; }

  .cover-actions {
    display: flex;
    gap: 8px;
  }

  .cover-message {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .cover-message.found {
    color: var(--tune-success, #4ade80);
  }

  /* Fields */
  .fields {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-label {
    font-family: var(--font-label);
    font-size: 12px;
    color: var(--tune-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .field input, .field select {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .field input:focus, .field select:focus {
    border-color: var(--tune-accent);
  }

  .field-row {
    display: flex;
    gap: 12px;
  }

  .field-row .field {
    flex: 1;
  }

  .error-msg {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-danger, #f87171);
  }

  /* Footer */
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid var(--tune-border);
  }

  .btn-secondary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--tune-grey2);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    color: var(--tune-text);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 12px;
    transition: all 0.12s;
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--tune-surface-hover);
    border-color: var(--tune-accent);
  }

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .btn-cancel {
    padding: 8px 16px;
    background: none;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    color: var(--tune-text);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
  }

  .btn-cancel:hover { background: var(--tune-surface-hover); }

  .btn-save {
    padding: 8px 20px;
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-save:disabled { opacity: 0.5; cursor: default; }

  .btn-write-tags {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: rgba(234, 88, 12, 0.1);
    border: 1px solid rgba(234, 88, 12, 0.3);
    border-radius: var(--radius-sm);
    color: #fb923c;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 500;
    transition: all 0.12s;
  }

  .btn-write-tags:hover:not(:disabled) {
    background: rgba(234, 88, 12, 0.2);
    border-color: #fb923c;
  }

  .btn-write-tags:disabled { opacity: 0.5; cursor: wait; }

  .write-tags-result {
    padding: 6px 12px;
    margin-top: 8px;
    font-size: 13px;
    color: #fb923c;
    text-align: center;
  }

  .success-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 40px 20px;
    color: var(--tune-success, #4ade80);
  }

  .success-state p {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text);
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

  .hint-warn {
    font-size: 11px;
    color: #fdba74;
    margin-top: 4px;
  }

  /* Tracks section (collapsible) */
  .tracks-section {
    margin-top: 8px;
    border-top: 1px solid var(--tune-border);
    padding-top: 12px;
  }
  .tracks-toggle {
    display: flex; align-items: center; gap: 6px;
    background: none; border: none;
    color: var(--tune-text); font-size: 12px;
    font-family: var(--font-label); font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em;
    cursor: pointer; padding: 0; margin: 0;
  }
  .tracks-hint { color: var(--tune-text-muted); font-weight: 400; text-transform: none; letter-spacing: 0; font-size: 11px; }
  .tracks-list {
    margin-top: 6px;
    display: flex; flex-direction: column;
    gap: 1px; max-height: 240px; overflow-y: auto;
  }
  .track-row {
    display: grid; grid-template-columns: 32px 1fr 50px;
    gap: 8px; align-items: center;
    padding: 6px 8px;
    background: var(--tune-bg);
    border: none; color: var(--tune-text);
    text-align: left; cursor: pointer;
    border-radius: 4px;
    font-size: 12px;
  }
  .track-row:hover { background: var(--tune-surface-hover, rgba(255,255,255,0.05)); }
  .track-row:disabled { opacity: 0.5; cursor: default; }
  .track-num { color: var(--tune-text-muted); font-family: var(--font-label); text-align: right; }
  .track-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .track-meta { color: var(--tune-text-muted); text-align: right; font-family: var(--font-label); font-size: 11px; }
  .state-empty {
    padding: 12px; text-align: center;
    color: var(--tune-text-muted); font-size: 12px;
  }
</style>

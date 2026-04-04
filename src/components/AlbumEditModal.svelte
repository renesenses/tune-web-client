<script lang="ts">
  import * as api from '../lib/api';
  import { artworkUrl } from '../lib/api';
  import type { Album, Artist } from '../lib/types';
  import { t } from '../lib/i18n';

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
  let coverPath = $state(album.cover_path ?? null);

  let artists = $state<Artist[]>([]);
  let saving = $state(false);
  let success = $state(false);
  let error = $state<string | null>(null);

  // Cover upload/search state
  let uploading = $state(false);
  let searching = $state(false);
  let coverMessage = $state<string | null>(null);
  let dragOver = $state(false);
  let fileInput: HTMLInputElement;

  async function loadArtists() {
    try {
      artists = await api.getArtists(500, 0);
    } catch (e) {
      console.error('Load artists error:', e);
    }
  }

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

      if (Object.keys(data).length > 0) {
        const updated = await api.updateAlbum(album.id, data);
        onSaved?.(updated);
      }
      success = true;
      setTimeout(() => onClose(), 600);
    } catch (e) {
      console.error('Save album error:', e);
      error = $t('metadata.saveError');
    }
    saving = false;
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
            <select bind:value={artistId}>
              <option value={null}>--</option>
              {#each artists as a}
                <option value={a.id}>{a.name}</option>
              {/each}
            </select>
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
        </div>

        {#if error}
          <p class="error-msg">{error}</p>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" onclick={onClose}>{$t('common.cancel')}</button>
        <button class="btn-save" onclick={saveAlbum} disabled={saving}>
          {#if saving}
            <div class="spinner small"></div>
          {:else}
            {$t('metadata.save')}
          {/if}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    width: 440px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.2s ease-out;
    overflow: hidden;
  }

  @keyframes slideUp {
    from { transform: translateY(16px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
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
</style>

<script lang="ts">
  import * as api from '../lib/api';
  import { artworkUrl } from '../lib/api';
  import type { Artist } from '../lib/types';
  import { t } from '../lib/i18n';

  interface Props {
    artist: Artist;
    onClose: () => void;
    onSaved?: (artist: Artist) => void;
  }
  let { artist, onClose, onSaved }: Props = $props();

  let name = $state(artist.name);
  let sortName = $state(artist.sort_name ?? '');
  let bio = $state(artist.bio ?? '');
  let imagePath = $state(artist.image_path ?? null);

  let saving = $state(false);
  let success = $state(false);
  let error = $state<string | null>(null);

  let uploading = $state(false);
  let dragOver = $state(false);
  let coverMessage = $state<string | null>(null);
  let coverOk = $state(false);
  let fileInput: HTMLInputElement;
  let fileDialogOpen = $state(false);

  function openFileDialog() {
    fileDialogOpen = true;
    fileInput.click();
    // When the OS file picker closes, the window regains focus.
    // Wait a tick after that to clear the guard so any phantom click
    // dispatched by the browser is ignored by handleBackdropClick.
    window.addEventListener('focus', () => {
      setTimeout(() => { fileDialogOpen = false; }, 300);
    }, { once: true });
  }

  async function handleUpload(file: File) {
    if (!artist.id) return;
    uploading = true;
    coverMessage = null;
    coverOk = false;
    try {
      const updated = await api.uploadArtistImage(artist.id, file);
      imagePath = updated.image_path ?? null;
      coverMessage = $t('artistEdit.imageUpdated');
      coverOk = true;
    } catch (e) {
      console.error('Upload artist image error:', e);
      coverMessage = $t('artistEdit.uploadError');
    }
    uploading = false;
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.[0]) handleUpload(input.files[0]);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file?.type.startsWith('image/')) handleUpload(file);
  }

  function handleDragOver(e: DragEvent) { e.preventDefault(); dragOver = true; }
  function handleDragLeave() { dragOver = false; }

  function handleBackdropClick(e: MouseEvent) {
    if (fileDialogOpen) return;
    if (e.target === e.currentTarget) onClose();
  }
  function preventDrop(e: DragEvent) { e.preventDefault(); }
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  function initials(n: string): string {
    return n.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }

  async function saveArtist() {
    if (!artist.id || saving) return;
    saving = true;
    error = null;
    try {
      await api.updateArtist(artist.id, {
        name: name.trim() || artist.name,
        sort_name: sortName.trim() || undefined,
        bio: bio.trim() || undefined,
      });
      success = true;
      onSaved?.({
        ...artist,
        name: name.trim() || artist.name,
        sort_name: sortName.trim() || null,
        bio: bio.trim() || null,
        image_path: imagePath,
      });
      setTimeout(onClose, 800);
    } catch (e: any) {
      error = e?.message || String(e);
    }
    saving = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdropClick} onkeydown={handleKeydown} ondragover={preventDrop} ondrop={preventDrop}>
  <div class="modal">
    {#if success}
      <div class="success-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><polyline points="20 6 9 17 4 12" /></svg>
        <p>{$t('artistEdit.saved')}</p>
      </div>
    {:else}
      <div class="modal-header">
        <h3>{$t('artistEdit.title')}</h3>
        <button class="close-btn" onclick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <div class="modal-body">
        <!-- Image section -->
        <div class="cover-section">
          <div
            class="cover-area round"
            class:drag-over={dragOver}
            ondrop={handleDrop}
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
            role="button"
            tabindex="0"
            onclick={() => openFileDialog()}
            onkeydown={(e) => e.key === 'Enter' && openFileDialog()}
          >
            {#if imagePath}
              <img src={artworkUrl(imagePath)} alt={artist.name} class="cover-preview round" />
            {:else}
              <div class="cover-placeholder round">
                <span class="artist-initials">{initials(name)}</span>
                <span class="drop-hint">{$t('artistEdit.dragImage')}</span>
                <span class="drop-sub">{$t('artistEdit.orClickUpload')}</span>
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
            <button class="btn-secondary" onclick={() => openFileDialog()} disabled={uploading}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              {$t('artistEdit.uploadImage')}
            </button>
          </div>
          {#if coverMessage}
            <p class="cover-message" class:found={coverOk}>{coverMessage}</p>
          {/if}
        </div>

        <!-- Fields -->
        <div class="fields">
          <label class="field">
            <span class="field-label">{$t('artistEdit.name')}</span>
            <input type="text" bind:value={name} placeholder={artist.name} />
          </label>

          <label class="field">
            <span class="field-label">{$t('artistEdit.sortName')}</span>
            <input type="text" bind:value={sortName} placeholder={$t('artistEdit.sortNamePlaceholder')} />
          </label>

          <label class="field">
            <span class="field-label">{$t('artistEdit.biography')}</span>
            <textarea bind:value={bio} rows="6" placeholder={$t('artistEdit.bioPlaceholder')}></textarea>
          </label>
        </div>

        {#if error}
          <p class="error-msg">{error}</p>
        {/if}
      </div>

      <div class="modal-footer">
        <button type="button" class="btn-cancel" onclick={onClose}>{$t('common.cancel')}</button>
        <button class="btn-save" onclick={saveArtist} disabled={saving}>
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
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    justify-content: flex-end;
    z-index: 200;
    animation: fadeIn 0.15s ease-out;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .modal {
    background: var(--tune-surface);
    border-left: 1px solid var(--tune-border);
    width: 420px;
    max-width: 92vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    animation: slideInRight 0.22s cubic-bezier(0.2, 0.7, 0.2, 1);
    overflow-y: auto;
    box-shadow: -8px 0 32px rgba(0, 0, 0, 0.25);
  }
  @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
  @media (max-width: 600px) { .modal { width: 100%; } }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--tune-border);
  }
  .modal-header h3 { font-family: var(--font-label); font-size: 16px; font-weight: 600; }

  .close-btn {
    background: none; border: none;
    color: var(--tune-text-muted); cursor: pointer;
    padding: 4px; border-radius: var(--radius-sm);
    display: flex; align-items: center;
  }
  .close-btn:hover { color: var(--tune-text); }

  .modal-body { padding: 16px 20px; flex: 1; overflow-y: auto; }

  .success-state {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 12px; height: 100%;
    color: #86efac; font-size: 16px;
  }

  .cover-section { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 16px; }

  .cover-area {
    width: 160px; height: 160px;
    border: 2px dashed var(--tune-border);
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; position: relative; overflow: hidden;
    transition: border-color 0.15s;
  }
  .cover-area.round { border-radius: 50%; }
  .cover-area.drag-over { border-color: var(--tune-accent); background: rgba(var(--tune-accent-rgb, 99,102,241), 0.08); }

  .cover-preview { width: 100%; height: 100%; object-fit: cover; }
  .cover-preview.round { border-radius: 50%; }

  .cover-placeholder {
    display: flex; flex-direction: column; align-items: center;
    gap: 4px; color: var(--tune-text-muted); text-align: center; padding: 12px;
  }
  .cover-placeholder.round { border-radius: 50%; }

  .artist-initials {
    font-size: 48px; font-weight: 700;
    color: var(--tune-text-muted); opacity: 0.5;
    line-height: 1;
  }
  .drop-hint { font-size: 11px; }
  .drop-sub { font-size: 10px; opacity: 0.6; }

  .cover-overlay {
    position: absolute; inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
  }

  .file-input { display: none; }

  .cover-actions { display: flex; gap: 8px; }

  .btn-secondary {
    background: var(--tune-surface-alt, var(--tune-bg));
    border: 1px solid var(--tune-border);
    color: var(--tune-text);
    padding: 6px 12px; border-radius: var(--radius-sm);
    font-size: 12px; cursor: pointer;
    display: flex; align-items: center; gap: 4px;
  }
  .btn-secondary:hover { border-color: var(--tune-accent); }
  .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

  .cover-message { font-size: 12px; color: var(--tune-text-muted); margin: 0; }
  .cover-message.found { color: #86efac; }

  .fields { display: flex; flex-direction: column; gap: 12px; }

  .field { display: flex; flex-direction: column; gap: 4px; }
  .field-label { font-size: 12px; color: var(--tune-text-muted); font-weight: 500; }
  .field input, .field textarea {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    color: var(--tune-text);
    padding: 8px 10px; border-radius: var(--radius-sm);
    font-size: 13px; font-family: inherit;
  }
  .field textarea { resize: vertical; line-height: 1.5; }
  .field input:focus, .field textarea:focus {
    outline: none; border-color: var(--tune-accent);
  }

  .error-msg { color: #ef4444; font-size: 12px; margin-top: 8px; }

  .modal-footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid var(--tune-border);
  }

  .btn-cancel {
    background: none; border: 1px solid var(--tune-border);
    color: var(--tune-text-muted); padding: 8px 16px;
    border-radius: var(--radius-sm); font-size: 13px; cursor: pointer;
  }
  .btn-cancel:hover { color: var(--tune-text); }

  .btn-save {
    background: var(--tune-accent);
    border: none; color: #fff;
    padding: 8px 20px; border-radius: var(--radius-sm);
    font-size: 13px; font-weight: 600; cursor: pointer;
    display: flex; align-items: center; gap: 6px;
  }
  .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

  .spinner { width: 16px; height: 16px; border: 2px solid transparent; border-top-color: currentColor; border-radius: 50%; animation: spin 0.6s linear infinite; }
  .spinner.small { width: 14px; height: 14px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>

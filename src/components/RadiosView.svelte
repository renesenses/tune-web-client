<script lang="ts">
  import { currentZoneId } from '../lib/stores/zones';
  import { t } from '../lib/i18n';
  import * as api from '../lib/api';
  import type { RadioStation } from '../lib/types';

  let radios = $state<RadioStation[]>([]);
  let loading = $state(true);
  let filterGenre = $state<string | null>(null);
  let filterFavorite = $state(false);
  let genres = $derived([...new Set(radios.map(r => r.genre).filter(Boolean))].sort());

  let filtered = $derived.by(() => {
    let list = radios;
    if (filterFavorite) list = list.filter(r => r.favorite);
    if (filterGenre) list = list.filter(r => r.genre === filterGenre);
    return list;
  });

  let showAdd = $state(false);
  let newName = $state('');
  let newUrl = $state('');
  let newGenre = $state('');
  let importMessage = $state('');

  // Edit modal state
  let editRadio = $state<RadioStation | null>(null);
  let editName = $state('');
  let editUrl = $state('');
  let editGenre = $state('');
  let editDragOver = $state(false);
  let editUploading = $state(false);
  let editCoverMsg = $state('');

  function openEdit(radio: RadioStation) {
    editRadio = radio;
    editName = radio.name;
    editUrl = radio.stream_url;
    editGenre = radio.genre || '';
    editCoverMsg = '';
  }

  function closeEdit() {
    editRadio = null;
    editCoverMsg = '';
    editUploading = false;
    editDragOver = false;
  }

  async function saveEdit() {
    if (!editRadio?.id) return;
    try {
      const updated = await api.updateRadio(editRadio.id, {
        name: editName.trim(),
        stream_url: editUrl.trim(),
        genre: editGenre.trim() || undefined,
      });
      radios = radios.map(r => r.id === updated.id ? updated : r);
      editRadio = updated;
    } catch (e) {
      console.error('Update radio error:', e);
    }
  }

  async function handleCoverUpload(file: File) {
    if (!editRadio?.id) return;
    editUploading = true;
    editCoverMsg = '';
    try {
      const updated = await api.uploadRadioCover(editRadio.id, file);
      radios = radios.map(r => r.id === updated.id ? updated : r);
      editRadio = updated;
      editCoverMsg = 'ok';
      setTimeout(() => editCoverMsg = '', 3000);
    } catch (e) {
      console.error('Upload cover error:', e);
      editCoverMsg = 'error';
    }
    editUploading = false;
  }

  function onEditDrop(e: DragEvent) {
    e.preventDefault();
    editDragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) handleCoverUpload(file);
  }

  function onEditFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) handleCoverUpload(file);
    input.value = '';
  }

  function coverUrl(radio: RadioStation): string {
    if (!radio.logo_url) return '';
    return api.artworkUrl(radio.logo_url);
  }

  async function loadRadios() {
    loading = true;
    try {
      radios = await api.getRadios();
    } catch (e) {
      console.error('Load radios error:', e);
    }
    loading = false;
  }

  async function playRadio(radio: RadioStation) {
    if (!radio.id || !$currentZoneId) return;
    try {
      await api.playRadio(radio.id, $currentZoneId);
    } catch (e) {
      console.error('Play radio error:', e);
    }
  }

  async function toggleFavorite(radio: RadioStation) {
    if (!radio.id) return;
    try {
      const updated = await api.updateRadio(radio.id, { favorite: !radio.favorite });
      radios = radios.map(r => r.id === updated.id ? updated : r);
    } catch (e) {
      console.error('Toggle favorite error:', e);
    }
  }

  async function deleteRadio(radio: RadioStation) {
    if (!radio.id) return;
    if (!confirm($t('radio.deleteConfirm'))) return;
    try {
      await api.deleteRadio(radio.id);
      radios = radios.filter(r => r.id !== radio.id);
      if (editRadio?.id === radio.id) closeEdit();
    } catch (e) {
      console.error('Delete radio error:', e);
    }
  }

  async function addRadio() {
    if (!newName.trim() || !newUrl.trim()) return;
    try {
      const created = await api.createRadio({
        name: newName.trim(),
        stream_url: newUrl.trim(),
        genre: newGenre.trim() || undefined,
      });
      radios = [...radios, created];
      newName = '';
      newUrl = '';
      newGenre = '';
      showAdd = false;
    } catch (e) {
      console.error('Add radio error:', e);
    }
  }

  async function handleImport(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = await api.importRadios(file);
      importMessage = `${result.imported} importées, ${result.skipped} ignorées`;
      await loadRadios();
      setTimeout(() => importMessage = '', 4000);
    } catch (err) {
      console.error('Import error:', err);
    }
    input.value = '';
  }

  loadRadios();
</script>

<div class="radios-view">
  <header class="radios-header">
    <h2>{$t('radio.title')}</h2>
    <div class="header-actions">
      <button class="btn-add" onclick={() => showAdd = !showAdd}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        {$t('radio.addRadio')}
      </button>
      <label class="btn-import">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
        {$t('radio.import')}
        <input type="file" accept=".m3u,.m3u8,.pls" onchange={handleImport} hidden />
      </label>
    </div>
  </header>

  {#if importMessage}
    <div class="import-toast">{importMessage}</div>
  {/if}

  {#if showAdd}
    <div class="add-form">
      <input type="text" placeholder={$t('radio.name')} bind:value={newName} />
      <input type="url" placeholder={$t('radio.streamUrl')} bind:value={newUrl} />
      <input type="text" placeholder={$t('radio.genre')} bind:value={newGenre} />
      <button class="btn-confirm" onclick={addRadio}>{$t('common.create')}</button>
      <button class="btn-cancel" onclick={() => showAdd = false}>{$t('common.cancel')}</button>
    </div>
  {/if}

  <div class="filters">
    <button class="filter-chip" class:active={!filterFavorite && !filterGenre} onclick={() => { filterGenre = null; filterFavorite = false; }}>
      {$t('radio.allGenres')}
    </button>
    <button class="filter-chip" class:active={filterFavorite} onclick={() => { filterFavorite = !filterFavorite; filterGenre = null; }}>
      <svg viewBox="0 0 24 24" fill={filterFavorite ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" width="12" height="12"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
      {$t('radio.favorites')}
    </button>
    {#each genres as g}
      <button class="filter-chip" class:active={filterGenre === g} onclick={() => { filterGenre = filterGenre === g ? null : g; filterFavorite = false; }}>
        {g}
      </button>
    {/each}
  </div>

  {#if loading}
    <div class="empty-state">{$t('common.loading')}</div>
  {:else if filtered.length === 0}
    <div class="empty-state">{$t('radio.noRadios')}</div>
  {:else}
    <div class="radios-grid">
      {#each filtered as radio}
        <div class="radio-card">
          <button class="radio-icon" onclick={() => openEdit(radio)} title={$t('radio.editRadio')}>
            {#if coverUrl(radio)}
              <img src={coverUrl(radio)} alt={radio.name} />
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"></path><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5"></path><line x1="12" y1="19" x2="12" y2="22"></line><path d="M8 22h8"></path></svg>
            {/if}
          </button>
          <div class="radio-info">
            <button class="radio-name-btn" onclick={() => openEdit(radio)}>{radio.name}</button>
            {#if radio.genre}
              <span class="radio-genre">{radio.genre}</span>
            {/if}
            <span class="radio-url">{radio.stream_url}</span>
          </div>
          <div class="radio-actions">
            <button class="action-btn favorite-btn" class:is-favorite={radio.favorite} onclick={() => toggleFavorite(radio)} title={$t('radio.favorite')}>
              <svg viewBox="0 0 24 24" fill={radio.favorite ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
            </button>
            <button class="action-btn play-btn" onclick={() => playRadio(radio)} title={$t('radio.play')} disabled={!$currentZoneId}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            </button>
            <button class="action-btn edit-btn" onclick={() => openEdit(radio)} title={$t('radio.editRadio')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            </button>
            <button class="action-btn delete-btn" onclick={() => deleteRadio(radio)} title={$t('common.delete')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if editRadio}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={closeEdit} onkeydown={(e) => e.key === 'Escape' && closeEdit()}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>{$t('radio.editRadio')}</h3>
          <button class="modal-close" onclick={closeEdit}>&times;</button>
        </div>

        <div class="modal-body">
          <!-- Cover zone -->
          <div
            class="cover-zone"
            class:drag-over={editDragOver}
            ondragover={(e) => { e.preventDefault(); editDragOver = true; }}
            ondragleave={() => editDragOver = false}
            ondrop={onEditDrop}
          >
            {#if coverUrl(editRadio)}
              <img class="cover-preview" src={coverUrl(editRadio)} alt={editRadio.name} />
              <div class="cover-overlay">
                <label class="cover-change-btn">
                  {$t('radio.cover')}
                  <input type="file" accept="image/*" onchange={onEditFileSelect} hidden />
                </label>
              </div>
            {:else}
              <div class="cover-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                <span>{$t('radio.dropImageHere')}</span>
                <label class="cover-upload-btn">
                  {$t('radio.orClickToUpload')}
                  <input type="file" accept="image/*" onchange={onEditFileSelect} hidden />
                </label>
              </div>
            {/if}
            {#if editUploading}
              <div class="cover-loading">{$t('radio.uploadingCover')}</div>
            {/if}
          </div>

          {#if editCoverMsg === 'ok'}
            <div class="cover-toast success">{$t('radio.coverUploaded')}</div>
          {:else if editCoverMsg === 'error'}
            <div class="cover-toast error">{$t('common.error')}</div>
          {/if}

          <!-- Fields -->
          <div class="edit-fields">
            <label class="edit-label">
              {$t('radio.name')}
              <input type="text" bind:value={editName} />
            </label>
            <label class="edit-label">
              {$t('radio.streamUrl')}
              <input type="url" bind:value={editUrl} />
            </label>
            <label class="edit-label">
              {$t('radio.genre')}
              <input type="text" bind:value={editGenre} />
            </label>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-cancel" onclick={closeEdit}>{$t('common.cancel')}</button>
          <button class="btn-confirm" onclick={saveEdit}>{$t('common.apply')}</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .radios-view {
    padding: var(--space-lg);
    max-width: 900px;
  }

  .radios-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-lg);
  }

  .radios-header h2 {
    font-family: var(--font-label);
    font-size: 24px;
    font-weight: 700;
    color: var(--tune-text);
  }

  .header-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .btn-add, .btn-import {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.12s ease-out;
  }

  .btn-add:hover, .btn-import:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .import-toast {
    padding: var(--space-sm) var(--space-md);
    background: var(--tune-surface);
    border: 1px solid var(--tune-accent);
    border-radius: var(--radius-md);
    color: var(--tune-accent);
    font-family: var(--font-body);
    font-size: 13px;
    margin-bottom: var(--space-md);
  }

  .add-form {
    display: flex;
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
    flex-wrap: wrap;
  }

  .add-form input {
    flex: 1;
    min-width: 150px;
    padding: 8px 12px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    outline: none;
  }

  .add-form input:focus {
    border-color: var(--tune-accent);
  }

  .btn-confirm {
    padding: 8px 18px;
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
  }

  .btn-cancel {
    padding: 8px 14px;
    background: none;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
  }

  .filters {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: var(--space-lg);
  }

  .filter-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 20px;
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.12s ease-out;
  }

  .filter-chip:hover {
    border-color: var(--tune-accent);
    color: var(--tune-text);
  }

  .filter-chip.active {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
  }

  .radios-grid {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .radio-card {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 10px 16px;
    background: var(--tune-surface);
    border-radius: var(--radius-md);
    transition: background 0.12s ease-out;
  }

  .radio-card:hover {
    background: var(--tune-surface-hover);
  }

  .radio-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: var(--tune-bg);
    border-radius: var(--radius-md);
    color: var(--tune-text-muted);
    flex-shrink: 0;
    overflow: hidden;
    border: none;
    padding: 0;
    cursor: pointer;
    transition: opacity 0.12s ease-out;
  }

  .radio-icon:hover {
    opacity: 0.8;
  }

  .radio-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .radio-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .radio-name-btn {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 500;
    color: var(--tune-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }

  .radio-name-btn:hover {
    color: var(--tune-accent);
  }

  .radio-genre {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .radio-url {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
    opacity: 0.6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 400px;
  }

  .radio-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 6px;
    border-radius: var(--radius-sm);
    transition: all 0.12s ease-out;
  }

  .action-btn:hover {
    color: var(--tune-text);
    background: var(--tune-bg);
  }

  .action-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .play-btn:hover {
    color: var(--tune-accent);
  }

  .favorite-btn.is-favorite {
    color: #f59e0b;
  }

  .delete-btn:hover {
    color: var(--tune-danger, #ef4444);
  }

  .edit-btn:hover {
    color: var(--tune-accent);
  }

  .empty-state {
    padding: var(--space-xl, 40px) var(--space-md);
    text-align: center;
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 14px;
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
  }

  .modal {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg, 12px);
    width: 420px;
    max-width: 90vw;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--tune-border);
  }

  .modal-header h3 {
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
    color: var(--tune-text);
    margin: 0;
  }

  .modal-close {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    font-size: 22px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .modal-close:hover {
    color: var(--tune-text);
  }

  .modal-body {
    padding: 20px;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
    padding: 12px 20px;
    border-top: 1px solid var(--tune-border);
  }

  /* Cover zone */
  .cover-zone {
    position: relative;
    width: 160px;
    height: 160px;
    margin: 0 auto 16px;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--tune-bg);
    border: 2px dashed var(--tune-border);
    transition: border-color 0.15s ease-out;
  }

  .cover-zone.drag-over {
    border-color: var(--tune-accent);
    background: color-mix(in srgb, var(--tune-accent) 10%, var(--tune-bg));
  }

  .cover-preview {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s ease-out;
  }

  .cover-zone:hover .cover-overlay {
    opacity: 1;
  }

  .cover-change-btn {
    padding: 6px 14px;
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: var(--radius-md);
    color: white;
    font-family: var(--font-body);
    font-size: 12px;
    cursor: pointer;
  }

  .cover-change-btn:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  .cover-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 12px;
  }

  .cover-upload-btn {
    color: var(--tune-accent);
    cursor: pointer;
    font-size: 12px;
  }

  .cover-upload-btn:hover {
    text-decoration: underline;
  }

  .cover-loading {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-family: var(--font-body);
    font-size: 13px;
  }

  .cover-toast {
    text-align: center;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    font-family: var(--font-body);
    font-size: 12px;
    margin-bottom: 12px;
  }

  .cover-toast.success {
    color: var(--tune-accent);
  }

  .cover-toast.error {
    color: var(--tune-danger, #ef4444);
  }

  /* Edit fields */
  .edit-fields {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .edit-label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .edit-label input {
    padding: 8px 12px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    outline: none;
  }

  .edit-label input:focus {
    border-color: var(--tune-accent);
  }
</style>

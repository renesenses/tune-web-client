<script lang="ts">
  import * as api from '../lib/api';
  import type { Track, Album, Artist } from '../lib/types';
  import { t } from '../lib/i18n';

  interface Props {
    track: Track;
    onClose: () => void;
    onSaved?: (track: Track) => void;
  }
  let { track, onClose, onSaved }: Props = $props();

  // svelte-ignore state_referenced_locally
  let title = $state(track.title);
  // svelte-ignore state_referenced_locally
  let trackNumber = $state<number | null>(track.track_number ?? null);
  // svelte-ignore state_referenced_locally
  let discNumber = $state<number | null>(track.disc_number ?? null);
  // svelte-ignore state_referenced_locally
  let artistId = $state<number | null>(track.artist_id ?? null);
  // svelte-ignore state_referenced_locally
  let albumId = $state<number | null>(track.album_id ?? null);
  // svelte-ignore state_referenced_locally
  let genre = $state(track.genre ?? '');
  // svelte-ignore state_referenced_locally
  let year = $state(track.year?.toString() ?? '');

  let artists = $state<Artist[]>([]);
  let albums = $state<Album[]>([]);
  let saving = $state(false);
  let success = $state(false);
  let error = $state<string | null>(null);

  async function loadData() {
    try {
      [artists, albums] = await Promise.all([
        api.getArtists(500, 0),
        api.getAlbums(500, 0),
      ]);
    } catch (e) {
      console.error('Load data error:', e);
    }
  }

  async function saveTrack() {
    if (!track.id) return;
    saving = true;
    error = null;
    try {
      const data: Record<string, any> = {};
      if (title !== track.title) data.title = title;
      if (trackNumber !== (track.track_number ?? null)) data.track_number = trackNumber;
      if (discNumber !== (track.disc_number ?? null)) data.disc_number = discNumber;
      if (artistId !== (track.artist_id ?? null)) data.artist_id = artistId;
      if (albumId !== (track.album_id ?? null)) data.album_id = albumId;
      if (genre !== (track.genre ?? '')) data.genre = genre || undefined;
      if (year !== (track.year?.toString() ?? '')) data.year = year || undefined;

      if (Object.keys(data).length > 0) {
        const updated = await api.updateTrack(track.id, data);
        onSaved?.(updated);
      }
      success = true;
      setTimeout(() => onClose(), 600);
    } catch (e) {
      console.error('Save track error:', e);
      error = $t('metadata.saveError');
    }
    saving = false;
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  $effect(() => {
    loadData();
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
        <h3>{$t('metadata.editTrack')}</h3>
        <button class="close-btn" onclick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="fields">
          <label class="field">
            <span class="field-label">{$t('metadata.trackTitle')}</span>
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

          <label class="field">
            <span class="field-label">{$t('metadata.albumTitle')}</span>
            <select bind:value={albumId}>
              <option value={null}>--</option>
              {#each albums as al}
                <option value={al.id}>{al.title}{al.artist_name ? ` - ${al.artist_name}` : ''}</option>
              {/each}
            </select>
          </label>

          <div class="field-row">
            <label class="field">
              <span class="field-label">{$t('metadata.genre')}</span>
              <input type="text" bind:value={genre} placeholder="Rock, Jazz, Electronic..." />
            </label>

            <label class="field">
              <span class="field-label">{$t('metadata.year')}</span>
              <input type="text" bind:value={year} placeholder="2024" />
            </label>
          </div>

          <div class="field-row">
            <label class="field">
              <span class="field-label">{$t('metadata.trackNumber')}</span>
              <input type="number" bind:value={trackNumber} min="0" max="999" />
            </label>

            <label class="field">
              <span class="field-label">{$t('metadata.discNumber')}</span>
              <input type="number" bind:value={discNumber} min="1" max="99" />
            </label>
          </div>
        </div>

        {#if error}
          <p class="error-msg">{error}</p>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" onclick={onClose}>{$t('common.cancel')}</button>
        <button class="btn-save" onclick={saveTrack} disabled={saving}>
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
    width: 400px;
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

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid var(--tune-border);
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

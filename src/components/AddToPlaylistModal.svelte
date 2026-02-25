<script lang="ts">
  import * as api from '../lib/api';
  import type { Playlist } from '../lib/types';

  interface Props {
    trackId: number;
    onClose: () => void;
  }
  let { trackId, onClose }: Props = $props();

  let playlists = $state<Playlist[]>([]);
  let loading = $state(true);
  let adding = $state<number | null>(null);
  let showCreate = $state(false);
  let newName = $state('');
  let success = $state<string | null>(null);

  async function loadPlaylists() {
    loading = true;
    try {
      playlists = await api.getPlaylists();
    } catch (e) {
      console.error('Load playlists error:', e);
    }
    loading = false;
  }

  async function addToPlaylist(playlist: Playlist) {
    if (!playlist.id) return;
    adding = playlist.id;
    try {
      await api.addPlaylistTracks(playlist.id, [trackId]);
      success = playlist.name;
      setTimeout(() => onClose(), 800);
    } catch (e) {
      console.error('Add to playlist error:', e);
      adding = null;
    }
  }

  async function createAndAdd() {
    if (!newName.trim()) return;
    try {
      const pl = await api.createPlaylist(newName.trim());
      if (pl.id) {
        await api.addPlaylistTracks(pl.id, [trackId]);
        success = pl.name;
        setTimeout(() => onClose(), 800);
      }
    } catch (e) {
      console.error('Create playlist error:', e);
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  $effect(() => {
    loadPlaylists();
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdropClick} onkeydown={handleKeydown}>
  <div class="modal">
    {#if success}
      <div class="success-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><polyline points="20 6 9 17 4 12" /></svg>
        <p>Ajoutee a <strong>{success}</strong></p>
      </div>
    {:else}
      <div class="modal-header">
        <h3>Ajouter a une playlist</h3>
        <button class="close-btn" onclick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <div class="modal-body">
        {#if loading}
          <div class="loading"><div class="spinner"></div></div>
        {:else}
          <div class="playlist-list">
            {#each playlists as pl}
              <button
                class="playlist-option"
                disabled={adding !== null}
                onclick={() => addToPlaylist(pl)}
              >
                <div class="pl-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><path d="M9 18V5l12-2v13M9 18c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
                </div>
                <div class="pl-info">
                  <span class="pl-name">{pl.name}</span>
                  <span class="pl-count">{pl.track_count ?? 0} pistes</span>
                </div>
                {#if adding === pl.id}
                  <div class="spinner small"></div>
                {/if}
              </button>
            {/each}
          </div>

          {#if playlists.length === 0}
            <p class="empty-hint">Aucune playlist existante</p>
          {/if}
        {/if}
      </div>

      <div class="modal-footer">
        {#if showCreate}
          <div class="create-row">
            <input
              type="text"
              placeholder="Nom de la playlist..."
              bind:value={newName}
              onkeydown={(e) => e.key === 'Enter' && createAndAdd()}
            />
            <button class="create-confirm" onclick={createAndAdd} disabled={!newName.trim()}>Creer</button>
            <button class="create-cancel" onclick={() => { showCreate = false; newName = ''; }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        {:else}
          <button class="new-playlist-btn" onclick={() => showCreate = true}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Nouvelle playlist
          </button>
        {/if}
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
    width: 360px;
    max-height: 480px;
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

  .close-btn:hover {
    color: var(--tune-text);
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .playlist-list {
    display: flex;
    flex-direction: column;
  }

  .playlist-option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s;
    width: 100%;
  }

  .playlist-option:hover:not(:disabled) {
    background: var(--tune-surface-hover);
  }

  .playlist-option:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .pl-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tune-grey2);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    color: var(--tune-text-muted);
  }

  .pl-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .pl-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
  }

  .pl-count {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .empty-hint {
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 13px;
    text-align: center;
    padding: 16px;
  }

  .modal-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--tune-border);
  }

  .new-playlist-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    background: none;
    border: 1px dashed var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text-secondary);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s;
  }

  .new-playlist-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .create-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .create-row input {
    flex: 1;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 6px 10px;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    outline: none;
  }

  .create-row input:focus {
    border-color: var(--tune-accent);
  }

  .create-confirm {
    padding: 6px 12px;
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }

  .create-confirm:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .create-cancel {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
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

  .loading {
    display: flex;
    justify-content: center;
    padding: 24px;
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

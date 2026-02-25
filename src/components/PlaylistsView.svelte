<script lang="ts">
  import { currentZone } from '../lib/stores/zones';
  import * as api from '../lib/api';
  import { formatTime } from '../lib/utils';
  import AlbumArt from './AlbumArt.svelte';
  import type { Playlist, Track } from '../lib/types';

  let zone = $derived($currentZone);

  let playlists: Playlist[] = $state([]);
  let selectedPlaylist: Playlist | null = $state(null);
  let playlistTracks: Track[] = $state([]);
  let loading = $state(false);

  // Create dialog
  let showCreate = $state(false);
  let newName = $state('');
  let newDescription = $state('');

  async function loadPlaylists() {
    loading = true;
    try {
      playlists = await api.getPlaylists();
    } catch (e) {
      console.error('Load playlists error:', e);
    }
    loading = false;
  }

  async function selectPlaylist(pl: Playlist) {
    if (!pl.id) return;
    selectedPlaylist = pl;
    loading = true;
    try {
      playlistTracks = await api.getPlaylistTracks(pl.id);
    } catch (e) {
      console.error('Load playlist tracks error:', e);
    }
    loading = false;
  }

  function goBack() {
    selectedPlaylist = null;
    playlistTracks = [];
  }

  async function createPlaylist() {
    if (!newName.trim()) return;
    try {
      await api.createPlaylist(newName.trim(), newDescription.trim() || undefined);
      showCreate = false;
      newName = '';
      newDescription = '';
      await loadPlaylists();
    } catch (e) {
      console.error('Create playlist error:', e);
    }
  }

  async function deletePlaylist(id: number) {
    try {
      await api.deletePlaylist(id);
      if (selectedPlaylist?.id === id) goBack();
      await loadPlaylists();
    } catch (e) {
      console.error('Delete playlist error:', e);
    }
  }

  async function playPlaylist(playlistId: number) {
    if (!zone?.id) return;
    try {
      await api.play(zone.id, { playlist_id: playlistId });
    } catch (e) {
      console.error('Play playlist error:', e);
    }
  }

  async function playTrack(trackId: number) {
    if (!zone?.id) return;
    try {
      await api.play(zone.id, { track_id: trackId });
    } catch (e) {
      console.error('Play track error:', e);
    }
  }

  async function removeTrack(trackId: number) {
    if (!selectedPlaylist?.id) return;
    try {
      await api.removePlaylistTrack(selectedPlaylist.id, trackId);
      playlistTracks = playlistTracks.filter((t) => t.id !== trackId);
    } catch (e) {
      console.error('Remove track error:', e);
    }
  }

  $effect(() => {
    if (playlists.length === 0) loadPlaylists();
  });
</script>

<div class="playlists-view">
  {#if selectedPlaylist}
    <div class="detail-header">
      <button class="back-btn" onclick={goBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        Retour
      </button>
      <div class="playlist-detail-info">
        <h2>{selectedPlaylist.name}</h2>
        {#if selectedPlaylist.description}
          <p class="playlist-desc">{selectedPlaylist.description}</p>
        {/if}
        <span class="playlist-count">{playlistTracks.length} pistes</span>
      </div>
      <button class="play-all-btn" onclick={() => selectedPlaylist?.id && playPlaylist(selectedPlaylist.id)}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z" /></svg>
        Lire
      </button>
    </div>

    {#if loading}
      <div class="loading"><div class="spinner"></div>Chargement...</div>
    {:else}
      <div class="track-list">
        {#each playlistTracks as t, index}
          <div class="track-item">
            <button class="track-play" onclick={() => t.id && playTrack(t.id)}>
              <span class="track-num">{index + 1}</span>
              <div class="track-info">
                <span class="track-title truncate">{t.title}</span>
                <span class="track-artist truncate">{t.artist_name ?? ''}</span>
              </div>
              <span class="track-duration">{formatTime(t.duration_ms)}</span>
            </button>
            <button class="remove-btn" onclick={() => t.id && removeTrack(t.id)} title="Retirer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}

  {:else}
    <div class="playlists-header">
      <h2>Playlists</h2>
      <button class="create-btn" onclick={() => showCreate = true}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        Nouvelle playlist
      </button>
    </div>

    {#if showCreate}
      <div class="create-form">
        <input type="text" placeholder="Nom de la playlist" bind:value={newName} />
        <input type="text" placeholder="Description (optionnel)" bind:value={newDescription} />
        <div class="form-actions">
          <button class="cancel-btn" onclick={() => showCreate = false}>Annuler</button>
          <button class="confirm-btn" onclick={createPlaylist}>Creer</button>
        </div>
      </div>
    {/if}

    {#if loading}
      <div class="loading"><div class="spinner"></div>Chargement...</div>
    {:else if playlists.length === 0}
      <div class="empty">Aucune playlist</div>
    {:else}
      <div class="playlist-list">
        {#each playlists as pl}
          <div class="playlist-item">
            <button class="playlist-btn" onclick={() => selectPlaylist(pl)}>
              <div class="playlist-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13M9 18c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>
              </div>
              <div class="playlist-info">
                <span class="playlist-name">{pl.name}</span>
                <span class="playlist-meta">{pl.track_count ?? 0} pistes</span>
              </div>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
            <button class="delete-btn" onclick={() => pl.id && deletePlaylist(pl.id)} title="Supprimer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .playlists-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
  }

  .playlists-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
  }

  .playlists-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  .create-btn {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: background 0.12s ease-out;
  }

  .create-btn:hover {
    background: var(--tune-accent-hover);
  }

  .create-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-md);
    background: var(--tune-grey2);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-lg);
  }

  .create-form input {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
    outline: none;
  }

  .create-form input:focus {
    border-color: var(--tune-accent);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
  }

  .cancel-btn {
    padding: var(--space-xs) var(--space-md);
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
  }

  .confirm-btn {
    padding: var(--space-xs) var(--space-md);
    background: var(--tune-accent);
    border: none;
    color: white;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
  }

  .detail-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
    flex-wrap: wrap;
  }

  .detail-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
  }

  .playlist-detail-info {
    flex: 1;
  }

  .playlist-desc {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
  }

  .playlist-count {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
  }

  .back-btn:hover {
    border-color: var(--tune-text-muted);
    color: var(--tune-text);
  }

  .play-all-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-lg);
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
  }

  .play-all-btn:hover {
    background: var(--tune-accent-hover);
  }

  .playlist-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .playlist-item {
    display: flex;
    align-items: center;
  }

  .playlist-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 28px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease-out;
  }

  .playlist-btn:hover {
    background: var(--tune-surface-hover);
  }

  .playlist-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tune-grey2);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .playlist-icon svg {
    width: 24px;
    height: 24px;
    color: var(--tune-text-muted);
  }

  .playlist-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .playlist-name {
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 700;
  }

  .playlist-meta {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
  }

  .chevron {
    color: var(--tune-text-muted);
  }

  .delete-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 8px;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all 0.12s ease-out;
  }

  .playlist-item:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    color: var(--tune-warning);
  }

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
    gap: 0;
  }

  .track-play {
    flex: 1;
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

  .track-play:hover {
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

  .remove-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 8px;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all 0.12s ease-out;
  }

  .track-item:hover .remove-btn {
    opacity: 1;
  }

  .remove-btn:hover {
    color: var(--tune-warning);
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
  }
</style>

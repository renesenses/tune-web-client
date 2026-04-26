<script lang="ts">
  import * as api from '../lib/api';
  import { notifications } from '../lib/stores/notifications';
  import { selectedAlbum, albumTracks, libraryTab } from '../lib/stores/library';
  import { activeView } from '../lib/stores/navigation';
  import AlbumArt from './AlbumArt.svelte';
  import type { Album } from '../lib/types';

  let collections: any[] = $state([]);
  let loading = $state(true);
  let selectedCollection: any = $state(null);
  let collectionAlbums: any[] = $state([]);
  let detailLoading = $state(false);

  // Create form
  let showCreate = $state(false);
  let newName = $state('');
  let newColor = $state('#6366f1');

  async function loadCollections() {
    loading = true;
    try {
      collections = await api.getCollections();
    } catch (e) {
      console.error('Load collections error:', e);
    }
    loading = false;
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const col = await api.createCollection(newName.trim(), undefined, undefined, newColor);
      collections = [...collections, col];
      newName = '';
      showCreate = false;
      notifications.success('Collection creee');
    } catch (e) {
      console.error('Create collection error:', e);
      notifications.error('Erreur creation');
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.deleteCollection(id);
      collections = collections.filter(c => c.id !== id);
      if (selectedCollection?.id === id) {
        selectedCollection = null;
        collectionAlbums = [];
      }
      notifications.success('Collection supprimee');
    } catch (e) {
      console.error('Delete collection error:', e);
      notifications.error('Erreur suppression');
    }
  }

  async function selectCollection(col: any) {
    selectedCollection = col;
    detailLoading = true;
    try {
      collectionAlbums = await api.getCollectionAlbums(col.id);
    } catch (e) {
      console.error('Load collection albums error:', e);
      collectionAlbums = [];
    }
    detailLoading = false;
  }

  async function removeAlbum(albumId: number) {
    if (!selectedCollection) return;
    try {
      await api.removeAlbumFromCollection(selectedCollection.id, albumId);
      collectionAlbums = collectionAlbums.filter(a => a.id !== albumId);
      notifications.success('Album retire');
    } catch (e) {
      console.error('Remove album error:', e);
    }
  }

  function navigateToAlbum(album: any) {
    selectedAlbum.set(album);
    api.getAlbumTracks(album.id).then(tracks => {
      albumTracks.set(tracks);
      libraryTab.set('albums');
      activeView.set('library');
    });
  }

  $effect(() => {
    loadCollections();
  });
</script>

<div class="collections-view">
  {#if selectedCollection}
    <div class="detail-header">
      <button class="back-btn" onclick={() => { selectedCollection = null; collectionAlbums = []; }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        Retour
      </button>
    </div>
    <div class="collection-detail">
      <div class="collection-detail-header">
        {#if selectedCollection.color}
          <span class="col-color-big" style="background:{selectedCollection.color}"></span>
        {/if}
        <h2>{selectedCollection.name}</h2>
        {#if selectedCollection.description}
          <p class="col-desc">{selectedCollection.description}</p>
        {/if}
        <span class="col-count">{collectionAlbums.length} albums</span>
      </div>
      {#if detailLoading}
        <div class="loading"><div class="spinner"></div></div>
      {:else if collectionAlbums.length === 0}
        <p class="empty-msg">Aucun album dans cette collection</p>
      {:else}
        <div class="albums-grid">
          {#each collectionAlbums as album}
            <div class="album-card">
              <button class="album-cover" onclick={() => navigateToAlbum(album)}>
                <AlbumArt coverPath={album.cover_path} albumId={album.id} size={160} alt={album.title} />
              </button>
              <span class="album-title truncate">{album.title}</span>
              <span class="album-artist truncate">{album.artist_name ?? ''}</span>
              <button class="remove-btn" onclick={() => removeAlbum(album.id)} title="Retirer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <div class="collections-header">
      <h1>Collections</h1>
      <button class="create-btn" onclick={() => showCreate = !showCreate}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        Nouvelle collection
      </button>
    </div>

    {#if showCreate}
      <div class="create-form">
        <input type="text" placeholder="Nom de la collection" bind:value={newName} onkeydown={(e) => e.key === 'Enter' && handleCreate()} />
        <input type="color" bind:value={newColor} class="color-picker" />
        <button class="confirm-btn" onclick={handleCreate}>Creer</button>
      </div>
    {/if}

    {#if loading}
      <div class="loading"><div class="spinner"></div></div>
    {:else if collections.length === 0}
      <p class="empty-msg">Aucune collection. Creez-en une pour organiser vos albums.</p>
    {:else}
      <div class="collections-list">
        {#each collections as col}
          <div class="collection-card">
            <button class="collection-btn" onclick={() => selectCollection(col)}>
              {#if col.color}
                <span class="col-color" style="background:{col.color}"></span>
              {/if}
              <div class="col-info">
                <span class="col-name">{col.name}</span>
                <span class="col-meta">{col.album_count ?? 0} albums</span>
              </div>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
            <button class="delete-col-btn" onclick={() => handleDelete(col.id)} title="Supprimer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .collections-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-xl) 32px;
    overflow-y: auto;
    gap: var(--space-lg);
  }

  .collections-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .collections-header h1 {
    font-family: var(--font-display);
    font-size: 32px;
    font-weight: 600;
    color: var(--tune-text);
  }

  .create-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    padding: 8px 16px;
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    transition: opacity 0.12s;
  }

  .create-btn:hover { opacity: 0.85; }

  .create-form {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .create-form input[type="text"] {
    flex: 1;
    max-width: 300px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 8px 12px;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    outline: none;
  }

  .create-form input[type="text"]:focus { border-color: var(--tune-accent); }

  .color-picker {
    width: 36px;
    height: 36px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 2px;
    cursor: pointer;
    background: none;
  }

  .confirm-btn {
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    padding: 8px 16px;
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
  }

  .collections-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .collection-card {
    display: flex;
    align-items: center;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    transition: border-color 0.12s;
  }

  .collection-card:hover {
    border-color: var(--tune-accent);
  }

  .collection-btn {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex: 1;
    padding: var(--space-md) var(--space-lg);
    background: none;
    border: none;
    cursor: pointer;
    color: var(--tune-text);
    text-align: left;
  }

  .col-color {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .col-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .col-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
  }

  .col-meta {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }

  .chevron {
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  .delete-col-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 8px 12px;
    opacity: 0;
    transition: opacity 0.12s, color 0.12s;
  }

  .collection-card:hover .delete-col-btn { opacity: 1; }
  .delete-col-btn:hover { color: var(--tune-error); }

  /* Detail */
  .detail-header {
    display: flex;
    align-items: center;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
  }

  .back-btn:hover { color: var(--tune-accent); }

  .collection-detail-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .col-color-big {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .collection-detail-header h2 {
    font-family: var(--font-display);
    font-size: 28px;
    font-weight: 600;
    color: var(--tune-text);
  }

  .col-desc {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
    width: 100%;
  }

  .col-count {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .albums-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--space-md);
  }

  .album-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    position: relative;
  }

  .album-cover {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .album-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text);
  }

  .album-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }

  .remove-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    border: none;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.12s;
  }

  .album-card:hover .remove-btn { opacity: 1; }

  .empty-msg {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
    padding: var(--space-lg);
    text-align: center;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl);
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>

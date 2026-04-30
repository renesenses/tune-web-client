<script lang="ts">
  import { t } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import * as api from '../lib/api';

  interface RadioFav { id: number; title: string; artist: string; station_name: string; cover_url?: string; stream_url?: string; saved_at: string; }
  let savedTracks = $state<RadioFav[]>([]);
  let loading = $state(true);

  // Create playlist modal
  let showCreatePlaylist = $state(false);
  let playlistService = $state('tidal');
  let playlistName = $state('Mes favoris radio');
  let creating = $state(false);
  let createResult = $state<any>(null);

  async function load() {
    loading = true;
    try {
      savedTracks = await api.apiFetch('/radio-favorites?limit=500');
    } catch { savedTracks = []; }
    loading = false;
  }

  async function remove(fav: RadioFav) {
    try {
      await api.apiDelete(`/radio-favorites/${fav.id}`);
      savedTracks = savedTracks.filter(f => f.id !== fav.id);
    } catch (e) { console.error('Delete radio fav:', e); }
  }

  async function clearAll() {
    if (!confirm('Supprimer tous les favoris radio ?')) return;
    try {
      await api.apiDelete('/radio-favorites');
      savedTracks = [];
    } catch (e) { console.error('Clear radio favs:', e); }
  }

  async function createPlaylist() {
    creating = true;
    createResult = null;
    try {
      const r = await api.createPlaylistFromRadioFavorites(playlistService, playlistName, savedTracks.length);
      createResult = r;
      notifications.success(`Playlist creee : ${r.matched || 0} titres trouves`);
    } catch (e: any) {
      notifications.error(e?.message || 'Erreur creation playlist');
    }
    creating = false;
  }

  function formatDate(iso: string): string {
    try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  }

  $effect(() => { load(); });
</script>

<div class="radio-favorites">
  <header class="view-header">
    <h2>Favoris Radio</h2>
    {#if savedTracks.length > 0}
      <div class="actions">
        <span class="count">{savedTracks.length} titre{savedTracks.length > 1 ? 's' : ''}</span>
        <button class="btn accent" onclick={() => { showCreatePlaylist = true; createResult = null; }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
          Créer playlist
        </button>
        <a class="btn" href="/api/v1/radio-favorites/export" download="radio_favorites.csv">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          Export CSV
        </a>
        <button class="btn danger" onclick={clearAll}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          Tout supprimer
        </button>
      </div>
    {/if}
  </header>

  {#if loading}
    <div class="empty">Chargement...</div>
  {:else if savedTracks.length === 0}
    <div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
      <p>Aucun favori radio</p>
      <p class="hint">Appuyez sur le coeur pendant l'écoute d'une radio pour sauvegarder le titre en cours</p>
    </div>
  {:else}
    <div class="list">
      {#each savedTracks as fav}
        <div class="row">
          <div class="cover">
            {#if fav.cover_url}
              <img src={api.artworkUrl(fav.cover_url)} alt="" />
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" /></svg>
            {/if}
          </div>
          <div class="info">
            <span class="title">{fav.title}</span>
            <span class="artist">{fav.artist}</span>
            <span class="station">{fav.station_name} · {formatDate(fav.saved_at)}</span>
          </div>
          <button class="remove-btn" onclick={() => remove(fav)} title="Retirer">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          </button>
        </div>
      {/each}
    </div>
  {/if}

  {#if showCreatePlaylist}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-overlay" onclick={() => showCreatePlaylist = false}>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="modal-card" onclick={(e) => e.stopPropagation()}>
        <h3>Créer une playlist streaming</h3>
        <p class="modal-hint">Convertir vos {savedTracks.length} favoris radio en playlist sur un service de streaming</p>
        <div class="modal-field">
          <label>Service</label>
          <select bind:value={playlistService}>
            <option value="tidal">TIDAL</option>
            <option value="qobuz">Qobuz</option>
            <option value="spotify">Spotify</option>
          </select>
        </div>
        <div class="modal-field">
          <label>Nom de la playlist</label>
          <input type="text" bind:value={playlistName} />
        </div>
        {#if createResult}
          <div class="create-result">
            <div class="result-stat good">{createResult.matched || 0} trouves</div>
            <div class="result-stat warn">{createResult.approximate || 0} approximatifs</div>
            <div class="result-stat bad">{createResult.not_found || 0} non trouves</div>
            {#if createResult.playlist_id}
              <p class="result-ok">Playlist creee avec succes !</p>
            {/if}
          </div>
        {/if}
        <div class="modal-actions">
          <button class="btn" onclick={() => showCreatePlaylist = false}>Fermer</button>
          <button class="btn accent" onclick={createPlaylist} disabled={creating}>
            {creating ? 'Création...' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .radio-favorites { padding: 0 24px 100px; }
  .view-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
  .view-header h2 { font-size: 1.4rem; color: var(--tune-text); margin: 0; }
  .actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }
  .count { font-size: 0.85rem; color: var(--tune-text2); }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--tune-border); background: var(--tune-surface); color: var(--tune-text2); font-size: 0.8rem; cursor: pointer; text-decoration: none; }
  .btn:hover { background: var(--tune-surface2); }
  .btn.danger { border-color: #e74c3c55; color: #e74c3c; }
  .btn.danger:hover { background: #e74c3c22; }

  .empty { text-align: center; padding: 60px 20px; color: var(--tune-text3); }
  .empty p { margin: 8px 0; }
  .empty .hint { font-size: 0.85rem; opacity: 0.7; }

  .list { display: flex; flex-direction: column; gap: 2px; }
  .row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; background: var(--tune-surface); }
  .row:hover { background: var(--tune-surface2); }
  .cover { width: 44px; height: 44px; border-radius: 6px; overflow: hidden; background: var(--tune-surface2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .cover img { width: 100%; height: 100%; object-fit: cover; }
  .cover svg { color: var(--tune-text3); }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .title { font-size: 0.95rem; color: var(--tune-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .artist { font-size: 0.85rem; color: var(--tune-text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .station { font-size: 0.75rem; color: var(--tune-text3); }
  .remove-btn { background: none; border: none; cursor: pointer; color: #e74c3c; opacity: 0.5; padding: 8px; border-radius: 50%; }
  .remove-btn:hover { opacity: 1; background: #e74c3c22; }

  .btn.accent { border-color: var(--tune-accent); color: var(--tune-accent); }
  .btn.accent:hover { background: var(--tune-accent); color: white; }

  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 300; display: flex; align-items: center; justify-content: center; }
  .modal-card { background: var(--tune-surface); border: 1px solid var(--tune-border); border-radius: 16px; padding: 28px; width: 420px; max-width: 90vw; }
  .modal-card h3 { margin: 0 0 8px; font-size: 1.1rem; color: var(--tune-text); }
  .modal-hint { font-size: 0.85rem; color: var(--tune-text-muted); margin: 0 0 20px; }
  .modal-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
  .modal-field label { font-size: 0.8rem; color: var(--tune-text-muted); }
  .modal-field select, .modal-field input {
    padding: 8px 12px; border: 1px solid var(--tune-border); border-radius: 8px;
    background: var(--tune-bg); color: var(--tune-text); font-size: 0.9rem; outline: none;
  }
  .modal-field select:focus, .modal-field input:focus { border-color: var(--tune-accent); }
  .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }

  .create-result { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .result-stat { padding: 4px 10px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; }
  .result-stat.good { background: rgba(16, 185, 129, 0.15); color: #10b981; }
  .result-stat.warn { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
  .result-stat.bad { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
  .result-ok { font-size: 0.85rem; color: var(--tune-success); margin: 8px 0 0; width: 100%; }
</style>

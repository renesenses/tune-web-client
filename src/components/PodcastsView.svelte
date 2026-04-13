<script lang="ts">
  import { onMount } from 'svelte';
  import * as api from '../lib/api';
  import { currentZoneId } from '../lib/stores/zones';
  import { get } from 'svelte/store';

  let searchQuery = $state('');
  let searchResults = $state<any[]>([]);
  let radioFrancePodcasts = $state<any[]>([]);
  let selectedPodcast = $state<any | null>(null);
  let episodes = $state<any[]>([]);
  let isSearching = $state(false);
  let isLoadingEpisodes = $state(false);
  let activeTab = $state<'radiofrance' | 'search'>('radiofrance');
  let errorMessage = $state<string | null>(null);

  // Load Radio France podcasts on mount
  onMount(() => {
    loadRadioFrance();
  });

  async function loadRadioFrance() {
    errorMessage = null;
    try {
      radioFrancePodcasts = await api.getRadioFrancePodcasts();
    } catch (e) {
      console.error('Load Radio France podcasts error:', e);
      errorMessage = 'Impossible de charger les podcasts Radio France';
    }
  }

  async function searchPodcasts() {
    if (!searchQuery.trim()) return;
    isSearching = true;
    errorMessage = null;
    try {
      searchResults = await api.searchPodcasts(searchQuery);
    } catch (e) {
      console.error('Search podcasts error:', e);
      errorMessage = 'Erreur lors de la recherche de podcasts';
    } finally {
      isSearching = false;
    }
  }

  async function selectPodcast(podcast: any) {
    selectedPodcast = podcast;
    isLoadingEpisodes = true;
    errorMessage = null;
    try {
      episodes = await api.getPodcastEpisodes(podcast.feed_url, 30, podcast.show_url);
    } catch (e) {
      console.error('Load podcast episodes error:', e);
      errorMessage = 'Impossible de charger les épisodes';
    } finally {
      isLoadingEpisodes = false;
    }
  }

  function goBack() {
    selectedPodcast = null;
    episodes = [];
  }

  async function playEpisode(episode: any) {
    const zoneId = get(currentZoneId);
    if (!zoneId) return;
    try {
      await api.play(zoneId, {
        file_path: episode.audio_url,
        title: episode.title,
        artist_name: selectedPodcast?.name,
        cover_path: episode.cover_url || selectedPodcast?.cover_url,
        duration_ms: episode.duration_ms,
      });
    } catch (e) {
      console.error('Play podcast error:', e);
    }
  }

  function formatDuration(ms: number): string {
    if (!ms) return '';
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h > 0) return `${h}h${m.toString().padStart(2, '0')}`;
    return `${m} min`;
  }

  function formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return ''; }
  }
</script>

<div class="podcasts-view">
  {#if errorMessage}
    <div class="error-banner">{errorMessage}</div>
  {/if}

  {#if selectedPodcast}
    <!-- Episode list -->
    <div class="episode-header">
      <button class="back-btn" onclick={goBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polyline points="15 18 9 12 15 6" /></svg>
      </button>
      <div class="podcast-info">
        {#if selectedPodcast.cover_url}
          <img src={selectedPodcast.cover_url} alt="" class="podcast-cover-lg" />
        {/if}
        <div>
          <h2>{selectedPodcast.name}</h2>
          <p class="podcast-artist">{selectedPodcast.artist}</p>
          {#if selectedPodcast.description}
            <p class="podcast-desc">{selectedPodcast.description}</p>
          {/if}
        </div>
      </div>
    </div>

    {#if isLoadingEpisodes}
      <div class="loading">Chargement des épisodes…</div>
    {:else if episodes.length === 0}
      <div class="empty">Aucun épisode trouvé</div>
    {:else}
      <div class="episodes-list">
        {#each episodes as episode, i}
          <button class="episode-item" onclick={() => playEpisode(episode)}>
            <span class="episode-num">{i + 1}</span>
            <div class="episode-info">
              <span class="episode-title">{episode.title}</span>
              <span class="episode-meta">
                {formatDate(episode.published)}
                {#if episode.duration_ms} · {formatDuration(episode.duration_ms)}{/if}
              </span>
            </div>
            <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          </button>
        {/each}
      </div>
    {/if}
  {:else}
    <!-- Podcast catalog -->
    <div class="tabs">
      <button class="tab" class:active={activeTab === 'radiofrance'} onclick={() => activeTab = 'radiofrance'}>Radio France</button>
      <button class="tab" class:active={activeTab === 'search'} onclick={() => activeTab = 'search'}>Rechercher</button>
    </div>

    {#if activeTab === 'search'}
      <div class="search-bar">
        <input type="text" bind:value={searchQuery} placeholder="Rechercher un podcast…" onkeydown={(e) => e.key === 'Enter' && searchPodcasts()} />
        <button onclick={searchPodcasts} disabled={isSearching}>
          {isSearching ? '…' : 'Rechercher'}
        </button>
      </div>

      <div class="podcast-grid">
        {#each searchResults as podcast}
          <button class="podcast-card" onclick={() => selectPodcast(podcast)} disabled={!podcast.feed_url}>
            {#if podcast.cover_url}
              <img src={podcast.cover_url} alt="" class="podcast-cover" />
            {:else}
              <div class="podcast-cover placeholder">🎙️</div>
            {/if}
            <span class="podcast-name">{podcast.name}</span>
            <span class="podcast-artist-sm">{podcast.artist}</span>
            {#if !podcast.feed_url}
              <span class="no-feed">Pas de flux RSS</span>
            {/if}
          </button>
        {/each}
      </div>
    {:else}
      <div class="podcast-grid">
        {#each radioFrancePodcasts as podcast}
          <button class="podcast-card" onclick={() => selectPodcast(podcast)}>
            {#if podcast.cover_url}
              <img src={podcast.cover_url} alt="" class="podcast-cover" />
            {:else}
              <div class="podcast-cover placeholder">🎙️</div>
            {/if}
            <span class="podcast-name">{podcast.name}</span>
            <span class="podcast-artist-sm">{podcast.artist}</span>
            {#if podcast.description}
              <span class="podcast-desc-sm">{podcast.description}</span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .podcasts-view {
    height: 100%;
    overflow-y: auto;
    padding: 20px;
  }

  .tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
  }

  .tab {
    padding: 8px 20px;
    border: 1px solid var(--tune-border, #333);
    border-radius: 20px;
    background: transparent;
    color: var(--tune-text-secondary, #999);
    cursor: pointer;
    font-size: 14px;
  }

  .tab.active {
    background: var(--tune-accent, #6C5CE7);
    color: white;
    border-color: var(--tune-accent, #6C5CE7);
  }

  .search-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
  }

  .search-bar input {
    flex: 1;
    padding: 10px 14px;
    border: 1px solid var(--tune-border, #333);
    border-radius: 8px;
    background: var(--tune-surface, #1a1a1a);
    color: var(--tune-text, white);
    font-size: 14px;
  }

  .search-bar button {
    padding: 10px 20px;
    background: var(--tune-accent, #6C5CE7);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
  }

  .podcast-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 16px;
  }

  .podcast-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: var(--tune-surface, #1a1a1a);
    border: 1px solid var(--tune-border, #333);
    border-radius: 12px;
    cursor: pointer;
    text-align: center;
    transition: border-color 0.2s;
  }

  .podcast-card:hover {
    border-color: var(--tune-accent, #6C5CE7);
  }

  .podcast-card:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .podcast-cover {
    width: 120px;
    height: 120px;
    border-radius: 10px;
    object-fit: cover;
  }

  .podcast-cover.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tune-border, #333);
    font-size: 40px;
  }

  .podcast-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text, white);
    line-height: 1.3;
  }

  .podcast-artist-sm {
    font-size: 11px;
    color: var(--tune-text-secondary, #999);
  }

  .podcast-desc-sm {
    font-size: 11px;
    color: var(--tune-text-secondary, #666);
    line-height: 1.3;
  }

  .no-feed {
    font-size: 10px;
    color: var(--tune-text-secondary, #666);
    font-style: italic;
  }

  /* Episode view */
  .episode-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 24px;
  }

  .back-btn {
    background: var(--tune-surface, #1a1a1a);
    border: 1px solid var(--tune-border, #333);
    border-radius: 8px;
    padding: 8px;
    color: var(--tune-text, white);
    cursor: pointer;
    flex-shrink: 0;
  }

  .podcast-info {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  .podcast-cover-lg {
    width: 100px;
    height: 100px;
    border-radius: 12px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .podcast-info h2 {
    font-size: 20px;
    color: var(--tune-text, white);
    margin: 0 0 4px;
  }

  .podcast-artist {
    color: var(--tune-text-secondary, #999);
    font-size: 14px;
    margin: 0 0 4px;
  }

  .podcast-desc {
    color: var(--tune-text-secondary, #666);
    font-size: 12px;
    line-height: 1.4;
    margin: 0;
    max-width: 500px;
  }

  .episodes-list {
    display: flex;
    flex-direction: column;
  }

  .episode-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 8px;
    border: none;
    background: transparent;
    border-bottom: 1px solid var(--tune-border, #222);
    cursor: pointer;
    text-align: left;
    color: var(--tune-text, white);
    transition: background 0.15s;
  }

  .episode-item:hover {
    background: var(--tune-surface, #1a1a1a);
  }

  .episode-num {
    font-size: 13px;
    color: var(--tune-text-secondary, #666);
    width: 24px;
    text-align: center;
    flex-shrink: 0;
  }

  .episode-info {
    flex: 1;
    min-width: 0;
  }

  .episode-title {
    display: block;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .episode-meta {
    display: block;
    font-size: 12px;
    color: var(--tune-text-secondary, #999);
    margin-top: 2px;
  }

  .play-icon {
    color: var(--tune-accent, #6C5CE7);
    flex-shrink: 0;
    opacity: 0.7;
  }

  .episode-item:hover .play-icon {
    opacity: 1;
  }

  .loading, .empty {
    text-align: center;
    color: var(--tune-text-secondary, #999);
    padding: 40px;
    font-size: 14px;
  }

  .error-banner {
    background: #2A1A1A;
    border: 1px solid #6B2D2D;
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 16px;
    color: #E8A0A0;
    font-size: 13px;
  }

</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import * as api from '../lib/api';
  import { currentZoneId } from '../lib/stores/zones';
  import { get } from 'svelte/store';

  let searchQuery = $state('');
  let searchResults = $state<any[]>([]);
  let radioFrancePodcasts = $state<any[]>([]);
  let subscriptions = $state<any[]>([]);
  let selectedPodcast = $state<any | null>(null);
  let episodes = $state<any[]>([]);
  let isSearching = $state(false);
  let isLoadingEpisodes = $state(false);
  let activeTab = $state<'subscriptions' | 'radiofrance' | 'search'>('subscriptions');
  let errorMessage = $state<string | null>(null);
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;
  let playingEpisodeUrl = $state<string | null>(null);

  onMount(() => {
    loadSubscriptions();
    loadRadioFrance();
  });

  async function loadSubscriptions() {
    try {
      subscriptions = await api.getPodcastSubscriptions();
    } catch { subscriptions = []; }
  }

  async function subscribe(podcast: any) {
    try {
      await api.subscribePodcast({
        title: podcast.name || podcast.title,
        feed_url: podcast.feed_url,
        author: podcast.artist || podcast.author,
        image_url: podcast.cover_url || podcast.image_url,
        description: podcast.description,
      });
      await loadSubscriptions();
    } catch (e) {
      console.error('Subscribe error:', e);
      errorMessage = 'Erreur lors de l\'abonnement';
    }
  }

  async function unsubscribe(id: number) {
    try {
      await api.unsubscribePodcast(id);
      await loadSubscriptions();
    } catch (e) {
      console.error('Unsubscribe error:', e);
      errorMessage = 'Erreur lors du desabonnement';
    }
  }

  function isSubscribed(feedUrl: string): boolean {
    return subscriptions.some(s => s.feed_url === feedUrl);
  }

  async function loadRadioFrance() {
    errorMessage = null;
    try {
      radioFrancePodcasts = await api.getRadioFrancePodcasts();
    } catch (e) {
      console.error('Load Radio France podcasts error:', e);
      errorMessage = 'Impossible de charger les podcasts Radio France';
    }
  }

  function handleSearchInput() {
    if (searchTimeout) clearTimeout(searchTimeout);
    if (!searchQuery.trim()) {
      searchResults = [];
      return;
    }
    searchTimeout = setTimeout(() => {
      searchPodcasts();
    }, 400);
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
    episodes = [];
    try {
      episodes = await api.getPodcastEpisodes(podcast.feed_url, 50);
    } catch (e) {
      console.error('Load podcast episodes error:', e);
      errorMessage = 'Impossible de charger les episodes';
    } finally {
      isLoadingEpisodes = false;
    }
  }

  function goBack() {
    selectedPodcast = null;
    episodes = [];
    errorMessage = null;
  }

  async function playEpisode(episode: any) {
    const zoneId = get(currentZoneId);
    if (!zoneId) {
      errorMessage = 'Aucune zone selectionnee';
      return;
    }
    playingEpisodeUrl = episode.audio_url;
    try {
      await api.playPodcastEpisode(zoneId, {
        audio_url: episode.audio_url,
        title: episode.title,
        podcast_name: selectedPodcast?.name || selectedPodcast?.title,
        cover_url: episode.cover_url || selectedPodcast?.cover_url || selectedPodcast?.image_url,
        duration_ms: episode.duration_ms,
      });
    } catch (e) {
      console.error('Play podcast error:', e);
      errorMessage = 'Erreur de lecture';
    } finally {
      setTimeout(() => { playingEpisodeUrl = null; }, 2000);
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

  function truncate(text: string, max: number): string {
    if (!text || text.length <= max) return text || '';
    return text.slice(0, max) + '...';
  }
</script>

<div class="podcasts-view">
  {#if errorMessage}
    <div class="error-banner">
      <span>{errorMessage}</span>
      <button class="error-close" onclick={() => errorMessage = null}>&times;</button>
    </div>
  {/if}

  {#if selectedPodcast}
    <!-- Episode detail view -->
    <div class="episode-header">
      <button class="back-btn" onclick={goBack} aria-label="Retour">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polyline points="15 18 9 12 15 6" /></svg>
      </button>
      <div class="podcast-info">
        {#if selectedPodcast.cover_url || selectedPodcast.image_url}
          <img src={selectedPodcast.cover_url || selectedPodcast.image_url} alt="" class="podcast-cover-lg" />
        {:else}
          <div class="podcast-cover-lg placeholder-lg">P</div>
        {/if}
        <div class="podcast-info-text">
          <h2>{selectedPodcast.name || selectedPodcast.title}</h2>
          <p class="podcast-artist">{selectedPodcast.artist || selectedPodcast.author || ''}</p>
          {#if selectedPodcast.description}
            <p class="podcast-desc">{truncate(selectedPodcast.description, 300)}</p>
          {/if}
          {#if !isSubscribed(selectedPodcast.feed_url)}
            <button class="sub-btn-lg" onclick={() => subscribe(selectedPodcast)}>+ S'abonner</button>
          {:else}
            <span class="sub-badge-lg">Abonne</span>
          {/if}
        </div>
      </div>
    </div>

    {#if isLoadingEpisodes}
      <div class="loading">Chargement des episodes...</div>
    {:else if episodes.length === 0}
      <div class="empty">Aucun episode trouve</div>
    {:else}
      <div class="episodes-count">{episodes.length} episode{episodes.length > 1 ? 's' : ''}</div>
      <div class="episodes-list">
        {#each episodes as episode, i}
          <button
            class="episode-item"
            class:playing={playingEpisodeUrl === episode.audio_url}
            onclick={() => playEpisode(episode)}
          >
            <span class="episode-num">{i + 1}</span>
            <div class="episode-info">
              <span class="episode-title">{episode.title}</span>
              <span class="episode-meta">
                {formatDate(episode.published)}
                {#if episode.duration_ms} · {formatDuration(episode.duration_ms)}{/if}
              </span>
              {#if episode.description}
                <span class="episode-desc">{truncate(episode.description, 120)}</span>
              {/if}
            </div>
            <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          </button>
        {/each}
      </div>
    {/if}
  {:else}
    <!-- Podcast catalog with tabs -->
    <div class="view-tabs">
      <button class="view-tab" class:active={activeTab === 'subscriptions'} onclick={() => activeTab = 'subscriptions'}>Abonnements</button>
      <button class="view-tab" class:active={activeTab === 'radiofrance'} onclick={() => activeTab = 'radiofrance'}>Decouvrir</button>
      <button class="view-tab" class:active={activeTab === 'search'} onclick={() => activeTab = 'search'}>Recherche</button>
    </div>

    {#if activeTab === 'subscriptions'}
      {#if subscriptions.length === 0}
        <div class="empty">
          <div class="empty-icon">P</div>
          <p>Aucun abonnement</p>
          <p class="empty-hint">Explorez l'onglet Decouvrir ou Recherche pour vous abonner a des podcasts.</p>
        </div>
      {:else}
        <div class="podcast-grid">
          {#each subscriptions as podcast}
            <div
              class="podcast-card"
              role="button"
              tabindex="0"
              onclick={() => selectPodcast({ ...podcast, name: podcast.title, cover_url: podcast.image_url, artist: podcast.author })}
              onkeydown={(e) => e.key === 'Enter' && selectPodcast({ ...podcast, name: podcast.title, cover_url: podcast.image_url, artist: podcast.author })}
            >
              {#if podcast.image_url}
                <img src={podcast.image_url} alt="" class="podcast-cover" loading="lazy" />
              {:else}
                <div class="podcast-cover placeholder">P</div>
              {/if}
              <span class="podcast-name">{podcast.title}</span>
              {#if podcast.author}
                <span class="podcast-artist-sm">{podcast.author}</span>
              {/if}
              <button class="unsub-btn" onclick={(e: MouseEvent) => { e.stopPropagation(); unsubscribe(podcast.id); }}>Se desabonner</button>
            </div>
          {/each}
        </div>
      {/if}

    {:else if activeTab === 'search'}
      <div class="search-bar">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Rechercher un podcast..."
          oninput={handleSearchInput}
          onkeydown={(e) => e.key === 'Enter' && searchPodcasts()}
        />
        <button onclick={searchPodcasts} disabled={isSearching || !searchQuery.trim()}>
          {isSearching ? '...' : 'Rechercher'}
        </button>
      </div>

      {#if isSearching}
        <div class="loading">Recherche en cours...</div>
      {:else if searchResults.length > 0}
        <div class="podcast-grid">
          {#each searchResults as podcast}
            <div
              class="podcast-card"
              class:disabled={!podcast.feed_url}
              role="button"
              tabindex="0"
              onclick={() => podcast.feed_url && selectPodcast(podcast)}
              onkeydown={(e) => e.key === 'Enter' && podcast.feed_url && selectPodcast(podcast)}
            >
              {#if podcast.cover_url}
                <img src={podcast.cover_url} alt="" class="podcast-cover" loading="lazy" />
              {:else}
                <div class="podcast-cover placeholder">P</div>
              {/if}
              <span class="podcast-name">{podcast.name}</span>
              {#if podcast.artist}
                <span class="podcast-artist-sm">{podcast.artist}</span>
              {/if}
              {#if !podcast.feed_url}
                <span class="no-feed">Pas de flux RSS</span>
              {:else if isSubscribed(podcast.feed_url)}
                <span class="sub-badge">Abonne</span>
              {:else}
                <button class="sub-btn" onclick={(e: MouseEvent) => { e.stopPropagation(); subscribe(podcast); }}>+ S'abonner</button>
              {/if}
            </div>
          {/each}
        </div>
      {:else if searchQuery.trim()}
        <div class="empty">Aucun resultat pour "{searchQuery}"</div>
      {/if}

    {:else}
      <!-- Decouvrir / Radio France -->
      {#if radioFrancePodcasts.length === 0}
        <div class="loading">Chargement...</div>
      {:else}
        <div class="podcast-grid">
          {#each radioFrancePodcasts as podcast}
            <div
              class="podcast-card"
              role="button"
              tabindex="0"
              onclick={() => selectPodcast(podcast)}
              onkeydown={(e) => e.key === 'Enter' && selectPodcast(podcast)}
            >
              {#if podcast.cover_url}
                <img src={podcast.cover_url} alt="" class="podcast-cover" loading="lazy" />
              {:else}
                <div class="podcast-cover placeholder">P</div>
              {/if}
              <span class="podcast-name">{podcast.name}</span>
              {#if podcast.artist}
                <span class="podcast-artist-sm">{podcast.artist}</span>
              {/if}
              {#if podcast.description}
                <span class="podcast-desc-sm">{truncate(podcast.description, 80)}</span>
              {/if}
              {#if isSubscribed(podcast.feed_url)}
                <span class="sub-badge">Abonne</span>
              {:else}
                <button class="sub-btn" onclick={(e: MouseEvent) => { e.stopPropagation(); subscribe(podcast); }}>+ S'abonner</button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .podcasts-view {
    height: 100%;
    overflow-y: auto;
    padding: 20px;
  }

  /* Tabs — match .view-tabs / .view-tab from the app */
  .view-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 20px;
    border-bottom: 1px solid var(--tune-border, #333);
    padding-bottom: 0;
  }

  .view-tab {
    padding: 10px 20px;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--tune-text-secondary, #999);
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: color 0.2s, border-color 0.2s;
  }

  .view-tab:hover {
    color: var(--tune-text, white);
  }

  .view-tab.active {
    color: var(--tune-accent, #6C5CE7);
    border-bottom-color: var(--tune-accent, #6C5CE7);
  }

  /* Search bar */
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
    outline: none;
  }

  .search-bar input:focus {
    border-color: var(--tune-accent, #6C5CE7);
  }

  .search-bar input::placeholder {
    color: var(--tune-text-secondary, #666);
  }

  .search-bar button {
    padding: 10px 20px;
    background: var(--tune-accent, #6C5CE7);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
    transition: opacity 0.2s;
  }

  .search-bar button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Podcast grid */
  .podcast-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 16px;
  }

  .podcast-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px;
    background: var(--tune-surface, #1a1a1a);
    border: 1px solid var(--tune-border, #333);
    border-radius: 12px;
    cursor: pointer;
    text-align: center;
    transition: border-color 0.2s, transform 0.15s;
  }

  .podcast-card:hover {
    border-color: var(--tune-accent, #6C5CE7);
    transform: translateY(-2px);
  }

  .podcast-card.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .podcast-cover {
    width: 150px;
    height: 150px;
    border-radius: 10px;
    object-fit: cover;
  }

  .podcast-cover.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tune-border, #333);
    font-size: 36px;
    color: var(--tune-text-secondary, #666);
    font-weight: 700;
    width: 150px;
    height: 150px;
    border-radius: 10px;
  }

  .podcast-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text, white);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .podcast-artist-sm {
    font-size: 11px;
    color: var(--tune-text-secondary, #999);
  }

  .podcast-desc-sm {
    font-size: 11px;
    color: var(--tune-text-secondary, #666);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .no-feed {
    font-size: 10px;
    color: var(--tune-text-secondary, #666);
    font-style: italic;
  }

  /* Subscribe / Unsubscribe buttons */
  .sub-btn {
    font-size: 11px;
    padding: 4px 12px;
    border-radius: 12px;
    border: 1px solid var(--tune-accent, #6C5CE7);
    background: transparent;
    color: var(--tune-accent, #6C5CE7);
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
    margin-top: 4px;
  }
  .sub-btn:hover { background: var(--tune-accent, #6C5CE7); color: white; }

  .sub-badge { font-size: 10px; color: #10b981; font-weight: 600; margin-top: 4px; }

  .unsub-btn {
    font-size: 11px;
    padding: 4px 12px;
    border-radius: 12px;
    border: 1px solid var(--tune-border, #444);
    background: transparent;
    color: var(--tune-text-secondary, #999);
    cursor: pointer;
    margin-top: 4px;
    transition: border-color 0.2s, color 0.2s;
  }
  .unsub-btn:hover { border-color: #e74c3c; color: #e74c3c; }

  .sub-btn-lg {
    font-size: 13px;
    padding: 6px 16px;
    border-radius: 16px;
    border: 1px solid var(--tune-accent, #6C5CE7);
    background: transparent;
    color: var(--tune-accent, #6C5CE7);
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
    margin-top: 8px;
  }
  .sub-btn-lg:hover { background: var(--tune-accent, #6C5CE7); color: white; }
  .sub-badge-lg { font-size: 12px; color: #10b981; font-weight: 600; margin-top: 8px; display: inline-block; }

  /* Episode detail view */
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
    transition: border-color 0.2s;
  }

  .back-btn:hover {
    border-color: var(--tune-accent, #6C5CE7);
  }

  .podcast-info {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }

  .podcast-info-text {
    display: flex;
    flex-direction: column;
  }

  .podcast-cover-lg {
    width: 120px;
    height: 120px;
    border-radius: 12px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .placeholder-lg {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tune-border, #333);
    font-size: 40px;
    color: var(--tune-text-secondary, #666);
    font-weight: 700;
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

  .episodes-count {
    font-size: 12px;
    color: var(--tune-text-secondary, #666);
    margin-bottom: 8px;
    padding-left: 8px;
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
    width: 100%;
  }

  .episode-item:hover {
    background: var(--tune-surface, #1a1a1a);
  }

  .episode-item.playing {
    background: rgba(108, 92, 231, 0.1);
  }

  .episode-num {
    font-size: 13px;
    color: var(--tune-text-secondary, #666);
    width: 28px;
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

  .episode-desc {
    display: block;
    font-size: 11px;
    color: var(--tune-text-secondary, #555);
    margin-top: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .play-icon {
    color: var(--tune-accent, #6C5CE7);
    flex-shrink: 0;
    opacity: 0.5;
    transition: opacity 0.15s;
  }

  .episode-item:hover .play-icon {
    opacity: 1;
  }

  .episode-item.playing .play-icon {
    opacity: 1;
  }

  /* Loading / empty states */
  .loading, .empty {
    text-align: center;
    color: var(--tune-text-secondary, #999);
    padding: 40px;
    font-size: 14px;
  }

  .empty-icon {
    font-size: 48px;
    color: var(--tune-text-secondary, #444);
    margin-bottom: 12px;
    font-weight: 700;
  }

  .empty-hint {
    font-size: 12px;
    color: var(--tune-text-secondary, #666);
    margin-top: 4px;
  }

  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #2A1A1A;
    border: 1px solid #6B2D2D;
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 16px;
    color: #E8A0A0;
    font-size: 13px;
  }

  .error-close {
    background: none;
    border: none;
    color: #E8A0A0;
    font-size: 18px;
    cursor: pointer;
    padding: 0 4px;
    opacity: 0.7;
  }

  .error-close:hover {
    opacity: 1;
  }

  /* Responsive */
  @media (max-width: 600px) {
    .podcast-grid {
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 10px;
    }
    .podcast-cover {
      width: 120px;
      height: 120px;
    }
    .podcast-cover.placeholder {
      width: 120px;
      height: 120px;
    }
    .podcast-info {
      flex-direction: column;
    }
    .podcast-cover-lg {
      width: 80px;
      height: 80px;
    }
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import * as api from '../lib/api';
  import { currentZoneId } from '../lib/stores/zones';
  import { get } from 'svelte/store';
  import { t } from '../lib/i18n';

  // --- State ---
  let activeTab = $state<'subscriptions' | 'discover' | 'search'>('discover');
  let errorMessage = $state<string | null>(null);

  // Subscriptions
  let subscriptions = $state<any[]>([]);
  let newEpisodes = $state<any[]>([]);
  let isLoadingNewEpisodes = $state(false);

  // Discover
  let topPodcasts = $state<any[]>([]);
  let radioFrancePodcasts = $state<any[]>([]);
  let isLoadingTop = $state(false);
  let isLoadingRadioFrance = $state(false);

  // Radio France GraphQL
  let rfStations = ['FRANCEINTER', 'FRANCECULTURE', 'FRANCEMUSIQUE', 'FIP', 'MOUV', 'FRANCEINFO'];
  let rfStationLabels: Record<string, string> = { FRANCEINTER: 'France Inter', FRANCECULTURE: 'France Culture', FRANCEMUSIQUE: 'France Musique', FIP: 'FIP', MOUV: "Mouv'", FRANCEINFO: 'franceinfo' };
  let rfSelectedStation = $state('FRANCEINTER');
  let rfShows = $state<any[]>([]);
  let rfShowsLoading = $state(false);
  let rfSearchQuery = $state('');
  let rfSearchResults = $state<any[]>([]);
  let rfSearching = $state(false);
  let rfHasApiKey = $state(false);
  let selectedGenre = $state<number | null>(null);
  const genreCache = new Map<string, any[]>();

  // Country & language selectors
  const countries = [
    { code: 'fr', flag: '🇫🇷', label: 'France' },
    { code: 'us', flag: '🇺🇸', label: 'USA' },
    { code: 'gb', flag: '🇬🇧', label: 'UK' },
    { code: 'de', flag: '🇩🇪', label: 'Deutschland' },
    { code: 'es', flag: '🇪🇸', label: 'España' },
    { code: 'it', flag: '🇮🇹', label: 'Italia' },
    { code: 'be', flag: '🇧🇪', label: 'Belgique' },
    { code: 'ch', flag: '🇨🇭', label: 'Suisse' },
    { code: 'ca', flag: '🇨🇦', label: 'Canada' },
    { code: 'jp', flag: '🇯🇵', label: '日本' },
    { code: 'kr', flag: '🇰🇷', label: '한국' },
    { code: 'br', flag: '🇧🇷', label: 'Brasil' },
    { code: 'au', flag: '🇦🇺', label: 'Australia' },
    { code: 'nl', flag: '🇳🇱', label: 'Nederland' },
    { code: 'pt', flag: '🇵🇹', label: 'Portugal' },
    { code: 'se', flag: '🇸🇪', label: 'Sverige' },
    { code: 'no', flag: '🇳🇴', label: 'Norge' },
  ];
  const languages = [
    { code: 'fr', label: 'Français' },
    { code: 'en', label: 'English' },
    { code: 'de', label: 'Deutsch' },
    { code: 'es', label: 'Español' },
    { code: 'it', label: 'Italiano' },
    { code: 'pt', label: 'Português' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
    { code: 'zh', label: '中文' },
    { code: 'nl', label: 'Nederlands' },
    { code: 'sv', label: 'Svenska' },
  ];
  let podcastCountry = $state(api.podcastCountry());
  let podcastLang = $state(navigator.language?.split('-')[0] || 'fr');

  // Search
  let searchQuery = $state('');
  let searchResults = $state<any[]>([]);
  let isSearching = $state(false);
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Detail (episodes)
  let selectedPodcast = $state<any | null>(null);
  let episodes = $state<any[]>([]);
  let isLoadingEpisodes = $state(false);
  let playingEpisodeUrl = $state<string | null>(null);

  const genres = [
    { id: null, label: 'Tous' },
    { id: 1311, label: 'Actualites' },
    { id: 1324, label: 'Societe' },
    { id: 1301, label: 'Arts & Culture' },
    { id: 1310, label: 'Musique' },
    { id: 1303, label: 'Comedie' },
    { id: 1315, label: 'Science' },
    { id: 1326, label: 'Histoire' },
    { id: 1325, label: 'True Crime' },
    { id: 1304, label: 'Education' },
    { id: 1321, label: 'Business' },
    { id: 1318, label: 'Tech' },
    { id: 1316, label: 'Sport' },
    { id: 1401, label: 'Fiction' },
  ];

  let selectedGenreLabel = $derived(genres.find(g => g.id === selectedGenre)?.label || 'Tous');
  let topTen = $derived(topPodcasts.slice(0, 10));
  let topGrid = $derived(topPodcasts.slice(0, 50));

  onMount(() => {
    loadSubscriptions();
    loadRadioFrance();
    loadTopPodcasts();
  });

  // --- Subscriptions ---

  async function loadSubscriptions() {
    try {
      subscriptions = await api.getPodcastSubscriptions();
      if (subscriptions.length > 0) loadNewEpisodes();
    } catch { subscriptions = []; }
  }

  async function loadNewEpisodes() {
    isLoadingNewEpisodes = true;
    try {
      const allEpisodes: any[] = [];
      const promises = subscriptions.slice(0, 10).map(async (sub) => {
        try {
          const eps = await api.getPodcastEpisodes(sub.feed_url, 3, undefined, sub.id);
          return eps.map((e: any) => ({ ...e, podcast_name: sub.title, podcast_image: sub.image_url, podcast_feed_url: sub.feed_url }));
        } catch { return []; }
      });
      const results = await Promise.all(promises);
      for (const eps of results) allEpisodes.push(...eps);
      allEpisodes.sort((a, b) => {
        const da = a.published ? new Date(a.published).getTime() : 0;
        const db = b.published ? new Date(b.published).getTime() : 0;
        return db - da;
      });
      newEpisodes = allEpisodes.slice(0, 20);
    } catch {
      newEpisodes = [];
    } finally {
      isLoadingNewEpisodes = false;
    }
  }

  async function subscribe(podcast: any) {
    try {
      await api.subscribePodcast({
        title: podcast.name || podcast.title || podcast.collectionName,
        feed_url: podcast.feed_url || podcast.feedUrl || '',
        author: podcast.artist || podcast.author || podcast.artistName,
        image_url: podcast.cover_url || podcast.image_url || podcast.artworkUrl600,
        description: podcast.description,
        source_id: podcast.source_id,
      });
      await loadSubscriptions();
    } catch (e) {
      console.error('Subscribe error:', e);
      errorMessage = get(t)('podcasts.subscribeError');
    }
  }

  async function unsubscribe(id: number) {
    try {
      await api.unsubscribePodcast(id);
      await loadSubscriptions();
    } catch (e) {
      console.error('Unsubscribe error:', e);
      errorMessage = get(t)('podcasts.unsubscribeError');
    }
  }

  function isSubscribed(feedUrl: string): boolean {
    if (!feedUrl) return false;
    return subscriptions.some(s => s.feed_url === feedUrl);
  }

  function getSubscriptionId(feedUrl: string): number | null {
    const sub = subscriptions.find(s => s.feed_url === feedUrl);
    return sub ? sub.id : null;
  }

  // --- Discover ---

  function changeCountry(cc: string) {
    podcastCountry = cc;
    genreCache.clear();
    loadTopPodcasts(selectedGenre);
  }

  async function loadTopPodcasts(genreId?: number | null) {
    const cacheKey = `${podcastCountry}-${genreId ?? 'all'}`;
    const cached = genreCache.get(cacheKey);
    if (cached) {
      topPodcasts = cached;
      return;
    }
    isLoadingTop = true;
    try {
      topPodcasts = await api.getTopPodcasts(genreId, 50, podcastCountry);
      genreCache.set(cacheKey, topPodcasts);
    } catch (e) {
      console.error('Load top podcasts error:', e);
      topPodcasts = [];
    } finally {
      isLoadingTop = false;
    }
  }

  async function loadRadioFrance() {
    isLoadingRadioFrance = true;
    try {
      radioFrancePodcasts = await api.getRadioFrancePodcasts();
    } catch (e) {
      console.error('Load Radio France podcasts error:', e);
      radioFrancePodcasts = [];
    } finally {
      isLoadingRadioFrance = false;
    }
    // Try GraphQL API (requires api key)
    loadRfShows(rfSelectedStation);
  }

  async function loadRfShows(station: string) {
    rfShowsLoading = true;
    try {
      const data = await api.getRadioFranceShows(station);
      rfShows = data.shows ?? [];
      rfHasApiKey = true;
    } catch {
      rfShows = [];
      rfHasApiKey = false;
    } finally {
      rfShowsLoading = false;
    }
  }

  async function searchRfShows() {
    if (!rfSearchQuery.trim()) { rfSearchResults = []; return; }
    rfSearching = true;
    try {
      const data = await api.searchRadioFranceShows(rfSearchQuery);
      rfSearchResults = data.shows ?? [];
    } catch { rfSearchResults = []; }
    finally { rfSearching = false; }
  }

  async function openRfShow(show: any) {
    try {
      const data = await api.getRadioFranceEpisodes(show.url, 30);
      const episodes = (data.episodes ?? []).map((ep: any) => ({
        title: ep.title,
        description: ep.description,
        audio_url: ep.audio_url,
        duration_ms: (ep.duration_secs ?? 0) * 1000,
        published: ep.published_date,
        cover_url: ep.cover_url || show.cover_url || '',
      }));
      selectedPodcast = { name: show.title, artist: show.station || 'Radio France', feed_url: show.rss_url || '', cover_url: show.cover_url || '', description: show.description, episode_count: episodes.length, source_id: show.id };
      selectedEpisodes = episodes;
    } catch (e) {
      console.error('Load RF episodes error:', e);
    }
  }

  function selectGenre(genreId: number | null) {
    selectedGenre = genreId;
    loadTopPodcasts(genreId);
  }

  // --- Search ---

  function handleSearchInput() {
    if (searchTimeout) clearTimeout(searchTimeout);
    if (!searchQuery.trim()) {
      searchResults = [];
      return;
    }
    searchTimeout = setTimeout(() => searchPodcasts(), 400);
  }

  async function searchPodcasts() {
    if (!searchQuery.trim()) return;
    isSearching = true;
    errorMessage = null;
    try {
      searchResults = await api.searchPodcasts(searchQuery, 20, podcastCountry, podcastLang);
    } catch (e) {
      console.error('Search podcasts error:', e);
      errorMessage = get(t)('podcasts.searchError');
    } finally {
      isSearching = false;
    }
  }

  // --- Podcast detail ---

  async function selectPodcast(podcast: any) {
    selectedPodcast = podcast;
    isLoadingEpisodes = true;
    errorMessage = null;
    episodes = [];
    try {
      const feedUrl = podcast.feed_url || podcast.feedUrl;
      // Apple top-chart (Discover) podcasts have NO feed_url, only a source_id
      // ("apple-…"); passing it lets the server resolve the feed so episodes
      // preview without subscribing first — otherwise the content was blank
      // unless you subscribed or searched (Bilou, #1000 / rc3 regression #1121).
      // A subscribed podcast also passes its id so the server resolves feed_url
      // from the subscription DB when the stored feed_url is empty/stale.
      episodes = await api.getPodcastEpisodes(feedUrl, 50, undefined, podcast.subscription_id, podcast.source_id);
    } catch (e) {
      console.error('Load podcast episodes error:', e);
      errorMessage = get(t)('podcasts.loadEpisodesError');
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
      errorMessage = get(t)('podcasts.noZone');
      return;
    }
    playingEpisodeUrl = episode.audio_url;
    try {
      await api.playPodcastEpisode(zoneId, {
        audio_url: episode.audio_url,
        title: episode.title,
        podcast_name: selectedPodcast?.name || selectedPodcast?.title || selectedPodcast?.collectionName,
        cover_url: episode.cover_url || selectedPodcast?.cover_url || selectedPodcast?.image_url || selectedPodcast?.artworkUrl600,
        duration_ms: episode.duration_ms,
      });
    } catch (e) {
      console.error('Play podcast error:', e);
      errorMessage = get(t)('podcasts.playError');
    } finally {
      setTimeout(() => { playingEpisodeUrl = null; }, 2000);
    }
  }

  async function playNewEpisode(episode: any) {
    const zoneId = get(currentZoneId);
    if (!zoneId) {
      errorMessage = get(t)('podcasts.noZone');
      return;
    }
    playingEpisodeUrl = episode.audio_url;
    try {
      await api.playPodcastEpisode(zoneId, {
        audio_url: episode.audio_url,
        title: episode.title,
        podcast_name: episode.podcast_name,
        cover_url: episode.cover_url || episode.podcast_image,
        duration_ms: episode.duration_ms,
      });
    } catch (e) {
      console.error('Play podcast error:', e);
      errorMessage = get(t)('podcasts.playError');
    } finally {
      setTimeout(() => { playingEpisodeUrl = null; }, 2000);
    }
  }

  // --- Helpers ---

  function podcastCover(p: any): string | null {
    return p?.cover_url || p?.image_url || p?.artworkUrl600 || p?.artworkUrl100 || null;
  }

  function podcastName(p: any): string {
    return p?.name || p?.title || p?.collectionName || 'Podcast';
  }

  function podcastArtist(p: any): string {
    return p?.artist || p?.author || p?.artistName || '';
  }

  function podcastFeed(p: any): string {
    return p?.feed_url || p?.feedUrl || '';
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
    <!-- ====== PODCAST DETAIL / EPISODES ====== -->
    <div class="detail-view">
      <button class="back-btn" onclick={goBack} aria-label={$t('common.back')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polyline points="15 18 9 12 15 6" /></svg>
        <span>{$t('common.back')}</span>
      </button>

      <div class="detail-header">
        {#if podcastCover(selectedPodcast)}
          <img src={podcastCover(selectedPodcast)} alt="" class="detail-cover" />
        {:else}
          <div class="detail-cover detail-cover-placeholder">
            <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
          </div>
        {/if}
        <div class="detail-info">
          <h2 class="detail-title">{podcastName(selectedPodcast)}</h2>
          <p class="detail-artist">{podcastArtist(selectedPodcast)}</p>
          {#if selectedPodcast.description}
            <p class="detail-desc">{truncate(selectedPodcast.description, 300)}</p>
          {/if}
          <div class="detail-actions">
            {#if isSubscribed(podcastFeed(selectedPodcast))}
              <button class="btn-subscribed" onclick={() => { const id = getSubscriptionId(podcastFeed(selectedPodcast)); if (id) unsubscribe(id); }}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                {$t('podcasts.subscribed')}
              </button>
            {:else}
              <button class="btn-subscribe" onclick={() => subscribe(selectedPodcast)}>{$t('podcasts.subscribe')}</button>
            {/if}
          </div>
        </div>
      </div>

      {#if isLoadingEpisodes}
        <div class="loading-state">
          <div class="spinner"></div>
          <span>{$t('podcasts.loadingEpisodes')}</span>
        </div>
      {:else if episodes.length === 0}
        <div class="empty-state">{$t('podcasts.noEpisodes')}</div>
      {:else}
        <div class="episodes-header">{$t('podcasts.episodeCount').replace('{n}', String(episodes.length))}</div>
        <div class="episodes-list">
          {#each episodes as episode, i}
            <button
              class="episode-row"
              class:playing={playingEpisodeUrl === episode.audio_url}
              onclick={() => playEpisode(episode)}
            >
              <span class="episode-num">{i + 1}</span>
              {#if episode.cover_url}
                <img src={episode.cover_url} alt="" class="episode-thumb" loading="lazy" />
              {:else if podcastCover(selectedPodcast)}
                <img src={podcastCover(selectedPodcast)} alt="" class="episode-thumb" loading="lazy" />
              {:else}
                <div class="episode-thumb episode-thumb-placeholder">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                </div>
              {/if}
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
              <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            </button>
          {/each}
        </div>
      {/if}
    </div>

  {:else}
    <!-- ====== TABS ====== -->
    <div class="view-tabs">
      <button class="view-tab" class:active={activeTab === 'discover'} onclick={() => activeTab = 'discover'}>{$t('podcasts.discover')}</button>
      <button class="view-tab" class:active={activeTab === 'subscriptions'} onclick={() => activeTab = 'subscriptions'}>{$t('podcasts.subscriptions')}</button>
      <button class="view-tab" class:active={activeTab === 'search'} onclick={() => activeTab = 'search'}>{$t('podcasts.search')}</button>
      <div class="country-selector">
        <select class="country-select" value={podcastLang} onchange={(e) => { podcastLang = (e.target as HTMLSelectElement).value; }}>
          {#each languages as l}
            <option value={l.code}>{l.label}</option>
          {/each}
        </select>
        <select class="country-select" value={podcastCountry} onchange={(e) => changeCountry((e.target as HTMLSelectElement).value)}>
          {#each countries as c}
            <option value={c.code}>{c.flag} {c.label}</option>
          {/each}
        </select>
      </div>
    </div>

    <!-- ====== ABONNEMENTS ====== -->
    {#if activeTab === 'subscriptions'}
      {#if subscriptions.length === 0}
        <div class="empty-state-full">
          <svg viewBox="0 0 24 24" fill="currentColor" width="56" height="56" class="empty-icon-svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
          <h3>{$t('podcasts.noSubscriptions')}</h3>
          <p>{$t('podcasts.noSubscriptionsHint')}</p>
        </div>
      {:else}
        <section class="section">
          <h3 class="section-title">{$t('podcasts.myPodcasts')}</h3>
          <div class="podcast-grid">
            {#each subscriptions as podcast}
              <div
                class="podcast-card"
                role="button"
                tabindex="0"
                onclick={() => selectPodcast({ ...podcast, name: podcast.title, cover_url: podcast.image_url, artist: podcast.author, subscription_id: podcast.id })}
                onkeydown={(e) => e.key === 'Enter' && selectPodcast({ ...podcast, name: podcast.title, cover_url: podcast.image_url, artist: podcast.author, subscription_id: podcast.id })}
              >
                <div class="card-cover-wrap">
                  {#if podcast.image_url}
                    <img src={podcast.image_url} alt="" class="card-cover" loading="lazy" />
                  {:else}
                    <div class="card-cover card-cover-placeholder">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                    </div>
                  {/if}
                </div>
                <span class="card-title">{podcast.title}</span>
                {#if podcast.author}
                  <span class="card-artist">{podcast.author}</span>
                {/if}
                <button class="btn-unsub" onclick={(e: MouseEvent) => { e.stopPropagation(); unsubscribe(podcast.id); }} title={$t('podcasts.unsubscribe')}>
                  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  {$t('podcasts.subscribed')}
                </button>
              </div>
            {/each}
          </div>
        </section>

        <!-- Nouveaux episodes -->
        <section class="section">
          <h3 class="section-title">{$t('podcasts.newEpisodes')}</h3>
          {#if isLoadingNewEpisodes}
            <div class="loading-state">
              <div class="spinner"></div>
              <span>{$t('common.loading')}</span>
            </div>
          {:else if newEpisodes.length === 0}
            <p class="empty-hint">{$t('podcasts.noNewEpisodes')}</p>
          {:else}
            <div class="new-episodes-list">
              {#each newEpisodes as episode}
                <button
                  class="new-episode-row"
                  class:playing={playingEpisodeUrl === episode.audio_url}
                  onclick={() => playNewEpisode(episode)}
                >
                  {#if episode.cover_url || episode.podcast_image}
                    <img src={episode.cover_url || episode.podcast_image} alt="" class="new-ep-cover" loading="lazy" />
                  {:else}
                    <div class="new-ep-cover new-ep-cover-placeholder">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    </div>
                  {/if}
                  <div class="new-ep-info">
                    <span class="new-ep-title">{episode.title}</span>
                    <span class="new-ep-podcast">{episode.podcast_name}</span>
                    <span class="new-ep-meta">
                      {formatDate(episode.published)}
                      {#if episode.duration_ms} · {formatDuration(episode.duration_ms)}{/if}
                    </span>
                  </div>
                  <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                </button>
              {/each}
            </div>
          {/if}
        </section>
      {/if}

    <!-- ====== DECOUVRIR ====== -->
    {:else if activeTab === 'discover'}
      <!-- Category chips -->
      <div class="genre-chips-wrapper">
        <div class="genre-chips">
          {#each genres as genre}
            <button
              class="genre-chip"
              class:active={selectedGenre === genre.id}
              onclick={() => selectGenre(genre.id)}
            >
              {genre.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Tendances France -->
      <section class="section">
        <h3 class="section-title">
          {#if selectedGenre === null}
            {$t('podcasts.trendingFrance')}
          {:else}
            Top {selectedGenreLabel}
          {/if}
        </h3>
        {#if isLoadingTop}
          <div class="loading-state">
            <div class="spinner"></div>
            <span>{$t('common.loading')}</span>
          </div>
        {:else if topTen.length > 0}
          <div class="trending-scroll-wrapper">
            <div class="trending-scroll">
              {#each topTen as podcast, i}
                <div
                  class="trending-card"
                  role="button"
                  tabindex="0"
                  onclick={() => selectPodcast(podcast)}
                  onkeydown={(e) => e.key === 'Enter' && selectPodcast(podcast)}
                >
                  <div class="trending-rank">#{i + 1}</div>
                  <div class="trending-cover-wrap">
                    {#if podcastCover(podcast)}
                      <img src={podcastCover(podcast)} alt="" class="trending-cover" loading="lazy" />
                    {:else}
                      <div class="trending-cover trending-cover-placeholder">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="40" height="40"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                      </div>
                    {/if}
                  </div>
                  <span class="trending-title">{podcastName(podcast)}</span>
                  <span class="trending-artist">{podcastArtist(podcast)}</span>
                  {#if isSubscribed(podcastFeed(podcast))}
                    <span class="card-badge-subscribed">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    </span>
                  {:else}
                    <button class="btn-sub-sm" onclick={(e: MouseEvent) => { e.stopPropagation(); subscribe(podcast); }}>{$t('podcasts.subscribe')}</button>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <p class="empty-hint">{$t('podcasts.noPodcasts')}</p>
        {/if}
      </section>

      <!-- Top grid -->
      {#if topGrid.length > 10}
        <section class="section">
          <h3 class="section-title">
            {#if selectedGenre === null}
              Top France
            {:else}
              {selectedGenreLabel}
            {/if}
          </h3>
          <div class="podcast-grid podcast-grid-4col">
            {#each topGrid.slice(10) as podcast, i}
              <div
                class="podcast-card"
                role="button"
                tabindex="0"
                onclick={() => selectPodcast(podcast)}
                onkeydown={(e) => e.key === 'Enter' && selectPodcast(podcast)}
              >
                <div class="card-cover-wrap">
                  <span class="card-rank">#{i + 11}</span>
                  {#if podcastCover(podcast)}
                    <img src={podcastCover(podcast)} alt="" class="card-cover" loading="lazy" />
                  {:else}
                    <div class="card-cover card-cover-placeholder">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                    </div>
                  {/if}
                </div>
                <span class="card-title">{podcastName(podcast)}</span>
                <span class="card-artist">{podcastArtist(podcast)}</span>
                {#if isSubscribed(podcastFeed(podcast))}
                  <span class="card-badge-subscribed">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  </span>
                {:else}
                  <button class="btn-sub-sm" onclick={(e: MouseEvent) => { e.stopPropagation(); subscribe(podcast); }}>{$t('podcasts.subscribe')}</button>
                {/if}
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Radio France -->
      <section class="section">
        <h3 class="section-title">Radio France</h3>

        {#if rfHasApiKey}
          <!-- GraphQL API mode: station tabs + search -->
          <div class="rf-station-tabs">
            {#each rfStations as st}
              <button class="rf-tab" class:active={rfSelectedStation === st} onclick={() => { rfSelectedStation = st; loadRfShows(st); }}>{rfStationLabels[st]}</button>
            {/each}
          </div>
          <div class="rf-search-row">
            <input type="text" class="rf-search-input" placeholder="Rechercher une emission..." bind:value={rfSearchQuery} onkeydown={(e) => e.key === 'Enter' && searchRfShows()} />
            <button class="rf-search-btn" onclick={searchRfShows} disabled={rfSearching}>{rfSearching ? '...' : 'Rechercher'}</button>
          </div>

          {#if rfSearchResults.length > 0}
            <div class="rf-results-label">{rfSearchResults.length} resultat{rfSearchResults.length > 1 ? 's' : ''}</div>
            <div class="podcast-grid">
              {#each rfSearchResults as show}
                <div class="podcast-card" role="button" tabindex="0" onclick={() => openRfShow(show)} onkeydown={(e) => e.key === 'Enter' && openRfShow(show)}>
                  <div class="card-cover card-cover-placeholder">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                  </div>
                  <span class="card-title">{show.title}</span>
                  <span class="card-artist">{show.station}</span>
                </div>
              {/each}
            </div>
          {:else if rfShowsLoading}
            <div class="loading-state"><div class="spinner"></div><span>{$t('common.loading')}</span></div>
          {:else if rfShows.length > 0}
            <div class="podcast-grid">
              {#each rfShows as show}
                <div class="podcast-card" role="button" tabindex="0" onclick={() => openRfShow(show)} onkeydown={(e) => e.key === 'Enter' && openRfShow(show)}>
                  <div class="card-cover card-cover-placeholder">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                  </div>
                  <span class="card-title">{show.title}</span>
                  <span class="card-artist">{show.station}</span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="empty-hint">Aucune emission trouvee</p>
          {/if}

        {:else}
          <!-- Fallback: curated hardcoded list (no API key) -->
          {#if isLoadingRadioFrance}
            <div class="loading-state"><div class="spinner"></div><span>{$t('common.loading')}</span></div>
          {:else if radioFrancePodcasts.length === 0}
            <p class="empty-hint">{$t('podcasts.noRadioFrance')}</p>
          {:else}
            <div class="podcast-grid">
              {#each radioFrancePodcasts as podcast}
                <div class="podcast-card" role="button" tabindex="0" onclick={() => selectPodcast(podcast)} onkeydown={(e) => e.key === 'Enter' && selectPodcast(podcast)}>
                  <div class="card-cover-wrap">
                    {#if podcastCover(podcast)}
                      <img src={podcastCover(podcast)} alt="" class="card-cover" loading="lazy" />
                    {:else}
                      <div class="card-cover card-cover-placeholder">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                      </div>
                    {/if}
                  </div>
                  <span class="card-title">{podcastName(podcast)}</span>
                  <span class="card-artist">{podcastArtist(podcast)}</span>
                  {#if isSubscribed(podcastFeed(podcast))}
                    <span class="card-badge-subscribed">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    </span>
                  {:else}
                    <button class="btn-sub-sm" onclick={(e: MouseEvent) => { e.stopPropagation(); subscribe(podcast); }}>{$t('podcasts.subscribe')}</button>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </section>

    <!-- ====== RECHERCHE ====== -->
    {:else if activeTab === 'search'}
      <div class="search-bar">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder={$t('podcasts.searchPlaceholder')}
          oninput={handleSearchInput}
        />
        {#if searchQuery}
          <button class="search-clear" onclick={() => { searchQuery = ''; searchResults = []; }}>&times;</button>
        {/if}
      </div>

      {#if isSearching}
        <div class="loading-state">
          <div class="spinner"></div>
          <span>{$t('podcasts.searching')}</span>
        </div>
      {:else if searchResults.length > 0}
        <div class="podcast-grid">
          {#each searchResults as podcast}
            <div
              class="podcast-card"
              class:disabled={!podcastFeed(podcast)}
              role="button"
              tabindex="0"
              onclick={() => podcastFeed(podcast) && selectPodcast(podcast)}
              onkeydown={(e) => e.key === 'Enter' && podcastFeed(podcast) && selectPodcast(podcast)}
            >
              <div class="card-cover-wrap">
                {#if podcastCover(podcast)}
                  <img src={podcastCover(podcast)} alt="" class="card-cover" loading="lazy" />
                {:else}
                  <div class="card-cover card-cover-placeholder">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                  </div>
                {/if}
              </div>
              <span class="card-title">{podcastName(podcast)}</span>
              <span class="card-artist">{podcastArtist(podcast)}</span>
              {#if !podcastFeed(podcast)}
                <span class="no-feed">{$t('podcasts.noRss')}</span>
              {:else if isSubscribed(podcastFeed(podcast))}
                <span class="card-badge-subscribed">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  {$t('podcasts.subscribed')}
                </span>
              {:else}
                <button class="btn-sub-sm" onclick={(e: MouseEvent) => { e.stopPropagation(); subscribe(podcast); }}>{$t('podcasts.subscribe')}</button>
              {/if}
            </div>
          {/each}
        </div>
      {:else if searchQuery.trim()}
        <div class="empty-state">{$t('podcasts.noResults').replace('{query}', searchQuery)}</div>
      {:else}
        <div class="search-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" class="search-placeholder-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <p>{$t('podcasts.searchHint')}</p>
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .podcasts-view {
    height: 100%;
    overflow-y: auto;
    padding: 20px 24px;
  }

  /* ===== TABS ===== */
  .view-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 20px;
    border-bottom: 1px solid var(--tune-border, #333);
    padding-bottom: 0;
  }

  .country-selector {
    margin-left: auto;
    padding-bottom: 6px;
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .country-select {
    background: var(--tune-surface, #1a1a1a);
    color: var(--tune-text, white);
    border: 1px solid var(--tune-border, #333);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 13px;
    cursor: pointer;
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

  .view-tab:hover { color: var(--tune-text, white); }
  .view-tab.active {
    color: var(--tune-accent, #6C5CE7);
    border-bottom-color: var(--tune-accent, #6C5CE7);
  }

  /* ===== SECTIONS ===== */
  .section {
    margin-bottom: 32px;
  }

  .section-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--tune-text, white);
    margin-bottom: 16px;
    font-family: var(--font-body, sans-serif);
  }

  /* ===== GENRE CHIPS ===== */
  .genre-chips-wrapper {
    overflow-x: auto;
    margin-bottom: 24px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .genre-chips-wrapper::-webkit-scrollbar { display: none; }

  .genre-chips {
    display: flex;
    gap: 8px;
    padding: 2px 0;
    white-space: nowrap;
  }

  .genre-chip {
    padding: 7px 16px;
    border-radius: 20px;
    border: 1px solid var(--tune-border, #333);
    background: transparent;
    color: var(--tune-text-secondary, #999);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .genre-chip:hover {
    border-color: var(--tune-text-secondary, #999);
    color: var(--tune-text, white);
  }

  .genre-chip.active {
    background: var(--tune-accent, #6C5CE7);
    border-color: var(--tune-accent, #6C5CE7);
    color: white;
  }

  /* ===== TRENDING HORIZONTAL SCROLL ===== */
  .trending-scroll-wrapper {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    margin: 0 -24px;
    padding: 0 24px;
  }
  .trending-scroll-wrapper::-webkit-scrollbar { display: none; }

  .trending-scroll {
    display: flex;
    gap: 16px;
    padding: 4px 0 12px;
  }

  .trending-card {
    flex-shrink: 0;
    width: 180px;
    display: flex;
    flex-direction: column;
    cursor: pointer;
    position: relative;
    transition: transform 0.15s;
  }

  .trending-card:hover { transform: translateY(-3px); }

  .trending-rank {
    position: absolute;
    top: 8px;
    left: 8px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    font-size: 12px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 8px;
    z-index: 2;
    backdrop-filter: blur(4px);
  }

  .trending-cover-wrap {
    position: relative;
    width: 180px;
    height: 180px;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 10px;
    box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.4));
  }

  .trending-cover {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .trending-cover-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tune-grey2, #2A2A2A);
    color: var(--tune-text-secondary, #666);
  }

  .trending-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text, white);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 2px;
  }

  .trending-artist {
    font-size: 12px;
    color: var(--tune-text-secondary, #999);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 6px;
  }

  /* ===== RADIO FRANCE TABS ===== */
  .rf-station-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  .rf-tab { background: var(--tune-bg-hover, rgba(255,255,255,0.08)); border: 1px solid transparent; border-radius: 16px; padding: 5px 14px; font-size: 13px; color: var(--tune-text-muted); cursor: pointer; transition: all 0.15s; }
  .rf-tab.active { background: var(--tune-accent); color: white; border-color: var(--tune-accent); }
  .rf-tab:hover:not(.active) { background: var(--tune-bg-hover, rgba(255,255,255,0.12)); }
  .rf-search-row { display: flex; gap: 8px; margin-bottom: 16px; }
  .rf-search-input { flex: 1; background: var(--tune-bg-secondary, rgba(255,255,255,0.06)); border: 1px solid var(--tune-border, rgba(255,255,255,0.1)); border-radius: 8px; padding: 8px 12px; color: var(--tune-text); font-size: 14px; }
  .rf-search-input::placeholder { color: var(--tune-text-muted); }
  .rf-search-btn { background: var(--tune-accent); color: white; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .rf-search-btn:disabled { opacity: 0.5; }
  .rf-results-label { font-size: 13px; color: var(--tune-text-muted); margin-bottom: 8px; }

  /* ===== PODCAST GRID (cards) ===== */
  .podcast-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 20px;
  }

  .podcast-grid-4col {
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  }

  .podcast-card {
    display: flex;
    flex-direction: column;
    cursor: pointer;
    position: relative;
    transition: transform 0.15s;
  }

  .podcast-card:hover { transform: translateY(-3px); }
  .podcast-card.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
  .podcast-card.disabled:hover { transform: none; }

  .card-cover-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 10px;
    box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.4));
    background: var(--tune-grey2, #2A2A2A);
  }

  .card-cover {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .card-cover-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tune-grey2, #2A2A2A);
    color: var(--tune-text-secondary, #666);
  }

  .card-rank {
    position: absolute;
    top: 8px;
    left: 8px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 6px;
    z-index: 2;
    backdrop-filter: blur(4px);
  }

  .card-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text, white);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 2px;
  }

  .card-artist {
    font-size: 12px;
    color: var(--tune-text-secondary, #999);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 6px;
  }

  /* ===== SUBSCRIBE BUTTONS ===== */
  .btn-sub-sm {
    align-self: flex-start;
    font-size: 11px;
    padding: 4px 12px;
    border-radius: 14px;
    border: 1px solid var(--tune-accent, #6C5CE7);
    background: transparent;
    color: var(--tune-accent, #6C5CE7);
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
    white-space: nowrap;
  }
  .btn-sub-sm:hover {
    background: var(--tune-accent, #6C5CE7);
    color: white;
  }

  .card-badge-subscribed {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--tune-success, #10b981);
    font-weight: 600;
    align-self: flex-start;
  }

  .btn-unsub {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    align-self: flex-start;
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 14px;
    border: 1px solid var(--tune-success, #10b981);
    background: transparent;
    color: var(--tune-success, #10b981);
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }
  .btn-unsub:hover {
    border-color: var(--tune-error, #e74c3c);
    color: var(--tune-error, #e74c3c);
  }

  .btn-subscribe {
    padding: 8px 20px;
    border-radius: 20px;
    border: 1px solid var(--tune-accent, #6C5CE7);
    background: transparent;
    color: var(--tune-accent, #6C5CE7);
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: background 0.2s, color 0.2s;
    margin-top: 4px;
  }
  .btn-subscribe:hover { background: var(--tune-accent, #6C5CE7); color: white; }

  .btn-subscribed {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 20px;
    border-radius: 20px;
    border: 1px solid var(--tune-success, #10b981);
    background: transparent;
    color: var(--tune-success, #10b981);
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: border-color 0.2s, color 0.2s;
    margin-top: 4px;
  }
  .btn-subscribed:hover { border-color: var(--tune-error, #e74c3c); color: var(--tune-error, #e74c3c); }

  .no-feed {
    font-size: 10px;
    color: var(--tune-text-secondary, #666);
    font-style: italic;
    align-self: flex-start;
  }

  /* ===== SEARCH BAR ===== */
  .search-bar {
    display: flex;
    align-items: center;
    gap: 0;
    margin-bottom: 24px;
    position: relative;
    background: var(--tune-surface, #1a1a1a);
    border: 1px solid var(--tune-border, #333);
    border-radius: 12px;
    padding: 0 14px;
    transition: border-color 0.2s;
  }

  .search-bar:focus-within {
    border-color: var(--tune-accent, #6C5CE7);
  }

  .search-icon {
    flex-shrink: 0;
    color: var(--tune-text-secondary, #666);
  }

  .search-bar input {
    flex: 1;
    padding: 12px 10px;
    border: none;
    background: transparent;
    color: var(--tune-text, white);
    font-size: 14px;
    outline: none;
  }

  .search-bar input::placeholder {
    color: var(--tune-text-secondary, #666);
  }

  .search-clear {
    background: none;
    border: none;
    color: var(--tune-text-secondary, #999);
    font-size: 20px;
    cursor: pointer;
    padding: 4px 8px;
    line-height: 1;
  }
  .search-clear:hover { color: var(--tune-text, white); }

  .search-placeholder {
    text-align: center;
    padding: 60px 20px;
    color: var(--tune-text-secondary, #666);
  }
  .search-placeholder-icon {
    margin-bottom: 12px;
    opacity: 0.4;
  }
  .search-placeholder p { font-size: 14px; }

  /* ===== NEW EPISODES LIST ===== */
  .new-episodes-list {
    display: flex;
    flex-direction: column;
  }

  .new-episode-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 8px;
    border: none;
    background: transparent;
    border-bottom: 1px solid var(--tune-border, rgba(77, 78, 81, 0.15));
    cursor: pointer;
    text-align: left;
    color: var(--tune-text, white);
    transition: background 0.15s;
    width: 100%;
    border-radius: 4px;
  }
  .new-episode-row:hover { background: var(--tune-surface-hover, rgba(60, 60, 63, 0.3)); }
  .new-episode-row.playing { background: rgba(108, 92, 231, 0.1); }

  .new-ep-cover {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .new-ep-cover-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tune-grey2, #2A2A2A);
    color: var(--tune-text-secondary, #666);
  }

  .new-ep-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .new-ep-title {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .new-ep-podcast {
    font-size: 12px;
    color: var(--tune-accent, #6C5CE7);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .new-ep-meta {
    font-size: 11px;
    color: var(--tune-text-secondary, #999);
  }

  /* ===== DETAIL VIEW ===== */
  .detail-view {
    max-width: 800px;
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: var(--tune-text-secondary, #999);
    cursor: pointer;
    font-size: 13px;
    padding: 4px 0;
    margin-bottom: 20px;
    transition: color 0.2s;
  }
  .back-btn:hover { color: var(--tune-text, white); }

  .detail-header {
    display: flex;
    gap: 24px;
    align-items: flex-start;
    margin-bottom: 32px;
  }

  .detail-cover {
    width: 160px;
    height: 160px;
    border-radius: 14px;
    object-fit: cover;
    flex-shrink: 0;
    box-shadow: var(--shadow-lg, 0 10px 30px rgba(0, 0, 0, 0.5));
  }

  .detail-cover-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tune-grey2, #2A2A2A);
    color: var(--tune-text-secondary, #666);
  }

  .detail-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .detail-title {
    font-size: 22px;
    font-weight: 700;
    color: var(--tune-text, white);
    margin-bottom: 4px;
    font-family: var(--font-body, sans-serif);
  }

  .detail-artist {
    color: var(--tune-text-secondary, #999);
    font-size: 14px;
    margin-bottom: 8px;
  }

  .detail-desc {
    color: var(--tune-text-muted, #888);
    font-size: 13px;
    line-height: 1.5;
    max-width: 500px;
    margin-bottom: 8px;
  }

  .detail-actions {
    margin-top: 4px;
  }

  /* ===== EPISODES LIST ===== */
  .episodes-header {
    font-size: 12px;
    color: var(--tune-text-secondary, #666);
    margin-bottom: 8px;
    padding-left: 4px;
  }

  .episodes-list {
    display: flex;
    flex-direction: column;
  }

  .episode-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 8px;
    border: none;
    background: transparent;
    border-bottom: 1px solid var(--tune-border, rgba(77, 78, 81, 0.15));
    cursor: pointer;
    text-align: left;
    color: var(--tune-text, white);
    transition: background 0.15s;
    width: 100%;
    border-radius: 4px;
  }

  .episode-row:hover { background: var(--tune-surface-hover, rgba(60, 60, 63, 0.3)); }
  .episode-row.playing { background: rgba(108, 92, 231, 0.1); }

  .episode-num {
    font-size: 13px;
    color: var(--tune-text-secondary, #666);
    width: 24px;
    text-align: center;
    flex-shrink: 0;
  }

  .episode-thumb {
    width: 44px;
    height: 44px;
    border-radius: 6px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .episode-thumb-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tune-grey2, #2A2A2A);
    color: var(--tune-text-secondary, #666);
  }

  .episode-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .episode-title {
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .episode-meta {
    font-size: 12px;
    color: var(--tune-text-secondary, #999);
  }

  .episode-desc {
    font-size: 11px;
    color: var(--tune-text-muted, #888);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }

  .play-icon {
    color: var(--tune-accent, #6C5CE7);
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .episode-row:hover .play-icon,
  .episode-row.playing .play-icon,
  .new-episode-row:hover .play-icon,
  .new-episode-row.playing .play-icon {
    opacity: 1;
  }

  /* ===== STATES ===== */
  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 40px;
    color: var(--tune-text-secondary, #999);
    font-size: 14px;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--tune-border, #333);
    border-top-color: var(--tune-accent, #6C5CE7);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    text-align: center;
    color: var(--tune-text-secondary, #999);
    padding: 40px;
    font-size: 14px;
  }

  .empty-state-full {
    text-align: center;
    padding: 60px 20px;
    color: var(--tune-text-secondary, #999);
  }

  .empty-icon-svg {
    opacity: 0.3;
    margin-bottom: 16px;
  }

  .empty-state-full h3 {
    font-size: 18px;
    color: var(--tune-text, white);
    margin-bottom: 8px;
    font-weight: 600;
  }

  .empty-state-full p {
    font-size: 13px;
    color: var(--tune-text-secondary, #666);
    max-width: 300px;
    margin: 0 auto;
    line-height: 1.5;
  }

  .empty-hint {
    color: var(--tune-text-secondary, #666);
    font-size: 13px;
    padding: 12px 0;
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
  .error-close:hover { opacity: 1; }

  /* ===== RESPONSIVE ===== */
  @media (max-width: 768px) {
    .podcasts-view { padding: 16px; }
    .trending-scroll-wrapper { margin: 0 -16px; padding: 0 16px; }
    .trending-card { width: 150px; }
    .trending-cover-wrap { width: 150px; height: 150px; }
    .podcast-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
    .detail-header { flex-direction: column; gap: 16px; }
    .detail-cover { width: 120px; height: 120px; }
    .detail-title { font-size: 18px; }
  }

  @media (max-width: 480px) {
    .podcast-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .trending-card { width: 130px; }
    .trending-cover-wrap { width: 130px; height: 130px; }
  }
</style>

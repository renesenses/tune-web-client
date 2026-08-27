<script lang="ts">
  /**
   * Les classements et statistiques d'écoute, sortis de l'accueil.
   *
   * Ils y occupaient tout ce qui suivait « Nouveautés dans votre bibliothèque »
   * sans jamais pouvoir être datés : « les plus écoutés » de QUAND ? Le Tableau
   * de bord, lui, porte déjà un sélecteur de période — ces sections y prennent
   * enfin un sens.
   *
   * Composant plutôt que copier-coller dans `DashboardView` : l'accueil n'a
   * ainsi qu'une suppression, et le tableau de bord qu'un import. Le diff reste
   * lisible, et la logique de périodes du tableau de bord n'est pas entrelacée
   * avec ces six chargements indépendants.
   */
  import { onMount } from 'svelte';
  import { activeView } from '../lib/stores/navigation';
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import { playFromHere } from '../lib/playback';
  import { formatNumber } from '../lib/utils';
  import { t } from '../lib/i18n';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import ServiceBadge from './ServiceBadge.svelte';
  import type { Track, Source, TopTrack, TopArtist } from '../lib/types';
  import {
    ouvrirAlbum as navigateToAlbum,
    ouvrirArtiste as navigateToArtist,
    ouvrirArtisteParNom as navigateArtistByName,
    ouvrirBibliotheque as goToLibrary,
  } from '../lib/libraryNavigation';

  let zone = $derived($currentZone);

  let stats: { tracks: number; albums: number; artists: number } | null = $state(null);
  let topArtists: TopArtist[] = $state([]);
  let topArtistsLoaded = $state(false);
  let topTracks: TopTrack[] = $state([]);
  let topTracksLoaded = $state(false);
  let topMixes: any[] = $state([]);
  let topMixesLoaded = $state(false);
  let radioPicks: any[] = $state([]);
  let radioPicksLoaded = $state(false);
  let dashboard: any = $state(null);
  let dashboardLoaded = $state(false);

  async function loadStats() {
    try {
      stats = await api.getLibraryStats();
    } catch (e) {
      console.error('Load stats error:', e);
    }
  }

  async function loadTopArtists() {
    try {
      const raw = await api.getTopArtists(12);
      topArtists = raw.filter((a: TopArtist) => a.name !== 'Live Radio' && a.name !== 'Various Artists' && a.name !== 'Artistes divers').slice(0, 10);
      topArtistsLoaded = true;
    } catch (e) {
      console.error('Load top artists error:', e);
      topArtistsLoaded = true;
    }
  }

  async function loadTopTracks() {
    try {
      topTracks = await api.getTopTracks(10);
      topTracksLoaded = true;
    } catch (e) {
      console.error('Load top tracks error:', e);
      topTracksLoaded = true;
    }
  }

  async function loadTopMixes() {
    try {
      topMixes = await api.getTopMixes();
      topMixesLoaded = true;
    } catch (e) {
      console.error('Load top mixes error:', e);
      topMixesLoaded = true;
    }
  }

  async function loadRadioPicks() {
    try {
      radioPicks = await api.getRadioPicks();
      radioPicksLoaded = true;
    } catch (e) {
      console.error('Load radio picks error:', e);
      radioPicksLoaded = true;
    }
  }

  async function loadDashboard() {
    try {
      // Endpoint borné (topN) plutôt que getHistoryDashboard, qui rend un jeu
      // non borné sur les grandes bibliothèques.
      const raw = await api.getDashboard('30d', { topN: 10 });
      dashboard = {
        ...raw,
        total_hours: raw.totals?.listening_ms ? Math.round(raw.totals.listening_ms / 3600000 * 10) / 10 : 0,
        new_artists: raw.totals?.unique_artists ?? 0,
        peak_hour: raw.hourly?.length ? raw.hourly.reduce((a: any, b: any) => a.plays > b.plays ? a : b).hour : null,
        daily: ((raw as any).daily || raw.trend || []).map((d: any) => ({ ...d, date: d.day, count: d.plays })),
        genres: ((raw as any).genres || (raw as any).by_genre || []).map((g: any) => ({ ...g, name: g.genre, count: g.plays })),
      };
      dashboardLoaded = true;
    } catch (e) {
      console.error('Load dashboard error:', e);
      dashboardLoaded = true;
    }
  }

  async function playTopTrack(track: TopTrack) {
    if (!zone?.id) return;
    try {
      if (track.track_id && (!track.source || track.source === 'local')) {
        await playAndSync(zone.id, { track_id: track.track_id });
      } else if (track.source && track.source !== 'local') {
        const results = await api.searchStreaming(track.source as Source, `${track.title} ${track.artist_name ?? ''}`, 5);
        const match = results.tracks?.find((t: any) => t.title === track.title);
        if (match?.source_id) {
          await playAndSync(zone.id, { source: track.source as Source, source_id: match.source_id });
        }
      } else {
        const results = await api.searchLibrary(`${track.title} ${track.artist_name ?? ''}`, 5);
        const match = results.tracks?.find((t: Track) => t.title === track.title);
        if (match?.id) {
          await playAndSync(zone.id, { track_id: match.id });
        }
      }
    } catch (e) {
      console.error('Play top track error:', e);
    }
  }

  async function playRadioEntry(radio: any) {
    if (!zone?.id) return;
    try {
      if (radio.id) {
        await api.playRadio(radio.id, zone.id);
      } else if (radio.url) {
        await api.apiPost(`/zones/${zone.id}/play`, { url: radio.url });
      }
    } catch (e) {
      console.error('Play radio error:', e);
    }
  }

  async function playMix(mix: any) {
    if (!zone?.id) return;
    try {
      if (mix.playlist_id) {
        await api.apiPost(`/zones/${zone.id}/play`, { playlist_id: mix.playlist_id });
      } else if (mix.tracks && mix.tracks.length > 0) {
        await playAndSync(zone.id, { track_id: mix.tracks[0].id });
      }
    } catch (e) {
      console.error('Play mix error:', e);
    }
  }

  onMount(() => {
    loadStats();
    loadTopArtists();
    loadTopTracks();
    loadTopMixes();
    loadRadioPicks();
    loadDashboard();
  });
</script>

<div class="dashboard-highlights">
  <!-- Top Artists -->
  {#if topArtistsLoaded && topArtists.length > 0}
    <div class="top-section">
      <h2 class="section-title">{$t('home.topArtists')}</h2>
      <div class="top-artists-row">
        {#each topArtists as artist, i}
          <button class="artist-card" onclick={() => artist.artist_id ? navigateToArtist(artist.artist_id) : navigateArtistByName(artist.name)}>
            <span class="artist-rank">#{i + 1}</span>
            <span class="artist-card-name">{artist.name}</span>
            <span class="play-count-badge">{artist.plays} {$t('home.plays')}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Top Tracks -->
  {#if topTracksLoaded && topTracks.length > 0}
    <div class="top-section">
      <h2 class="section-title">{$t('home.topTracks')}</h2>
      <div class="top-tracks-list">
        {#each topTracks as track, i}
          <div class="top-track-row">
            <span class="track-rank">{i + 1}</span>
            <button class="top-track-play-zone" type="button" onclick={() => playTopTrack(track)}>
              <div class="top-track-art">
                <!-- Pas d'albumId ici : TopTrack ne porte qu'un `track_id`, et le
                     passer en albumId faisait résoudre la pochette via
                     /library/albums/<track_id> — 404 dans le meilleur des cas,
                     pochette d'un tout autre album si l'id existe côté albums.
                     Sans cover_path, on affiche le placeholder. -->
                <AlbumArt coverPath={track.cover_path} size={44} alt={track.title} />
              </div>
              <span class="top-track-title truncate" title={track.title}>{track.title}</span>
            </button>
            {#if track.artist_name}
              <button class="top-track-artist-btn truncate" type="button" onclick={() => navigateArtistByName(track.artist_name)} title={track.artist_name}>{track.artist_name}</button>
            {/if}
            <ServiceBadge source={track.source} compact />
            <span class="play-count-badge">{track.plays}</span>
            {#if typeof track.track_id === 'number'}
              <button class="play-from-here-btn" type="button" onclick={(e) => { e.stopPropagation(); playFromHere(topTracks.map(t => ({ id: t.track_id })), i); }} title={$t('common.playFromHere')} aria-label={$t('common.playFromHere')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="3" y1="6" x2="14" y2="6" /><line x1="3" y1="12" x2="14" y2="12" /><line x1="3" y1="18" x2="10" y2="18" /><path d="M16 8v8l6-4z" fill="currentColor" stroke="none" /></svg>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Top Mixes by Genre -->
  {#if topMixesLoaded && topMixes.length > 0}
    <div class="top-section">
      <h2 class="section-title">{$t('home.mixByGenre')}</h2>
      <div class="mixes-row">
        {#each topMixes as mix}
          <button class="mix-card" onclick={() => playMix(mix)}>
            <div class="mix-cover" style="background: linear-gradient(135deg, {mix.color ?? 'var(--tune-accent)'}, {mix.color_end ?? 'rgba(99, 102, 241, 0.4)'})">
              <span class="mix-genre">{mix.genre ?? mix.name ?? ''}</span>
              {#if mix.track_count}
                <span class="mix-count">{mix.track_count} {$t('home.tracks').toLowerCase()}</span>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Radio Picks -->
  {#if radioPicksLoaded && radioPicks.length > 0}
    <div class="top-section">
      <h2 class="section-title">{$t('home.favoriteRadios')}</h2>
      <div class="recs-carousel">
        {#each radioPicks as radio}
          <button class="rec-card radio-card" onclick={() => playRadioEntry(radio)}>
            {#if radio.logo_url || radio.cover_url}
              <img src={api.artworkUrl(radio.logo_url ?? radio.cover_url)} alt={radio.name ?? ''} class="radio-logo" loading="lazy" />
            {:else}
              <div class="radio-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5" />
                </svg>
              </div>
            {/if}
            <span class="rec-title truncate" title={radio.name ?? ''}>{radio.name ?? ''}</span>
            {#if radio.genre}
              <span class="rec-artist truncate" title={radio.genre}>{radio.genre}</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Listening Dashboard empty state: show library stats + quick links when no history -->
  {#if dashboardLoaded && !dashboard && stats}
    <div class="top-section">
      <h2 class="section-title">{$t('home.statistics')}</h2>
      <div class="dash-empty-state">
        <p class="dash-empty-hint">{$t('home.emptyState.hint')}</p>
        <div class="dash-empty-library">
          <span class="dash-empty-label">{$t('home.emptyState.libraryStats')}</span>
          <div class="dash-empty-stats">
            <button class="dash-big-stat clickable" onclick={() => goToLibrary('albums')}>
              <span class="dash-big-number">{formatNumber(stats.albums)}</span>
              <span class="dash-big-label">{$t('common.albums')}</span>
            </button>
            <button class="dash-big-stat clickable" onclick={() => goToLibrary('artists')}>
              <span class="dash-big-number">{formatNumber(stats.artists)}</span>
              <span class="dash-big-label">{$t('common.artists')}</span>
            </button>
            <button class="dash-big-stat clickable" onclick={() => goToLibrary('tracks')}>
              <span class="dash-big-number">{formatNumber(stats.tracks)}</span>
              <span class="dash-big-label">{$t('home.tracks').toLowerCase()}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Listening Dashboard -->
  {#if dashboardLoaded && dashboard}
    <div class="top-section">
      <h2 class="section-title">{$t('home.statistics')}</h2>
      <div class="dash-stats">
        {#if dashboard.total_plays != null}
          <button class="dash-big-stat clickable" onclick={() => activeView.set('history')}>
            <span class="dash-big-number">{formatNumber(dashboard.total_plays)}</span>
            <span class="dash-big-label">{$t('home.playbacks')}</span>
          </button>
        {/if}
        {#if dashboard.total_hours != null}
          <button class="dash-big-stat clickable" onclick={() => activeView.set('history')}>
            <span class="dash-big-number">{dashboard.total_hours < 1 ? dashboard.total_hours.toFixed(1) : Math.round(dashboard.total_hours)}</span>
            <span class="dash-big-label">{$t('home.hoursListened')}</span>
          </button>
        {/if}
        {#if dashboard.new_artists != null}
          <button class="dash-big-stat clickable" onclick={() => activeView.set('library')}>
            <span class="dash-big-number">{dashboard.new_artists}</span>
            <span class="dash-big-label">{$t('home.newArtists')}</span>
          </button>
        {/if}
        {#if dashboard.peak_hour != null}
          <button class="dash-big-stat clickable" onclick={() => activeView.set('history')}>
            <span class="dash-big-number">{dashboard.peak_hour}h</span>
            <span class="dash-big-label">{$t('home.peakHour')}</span>
          </button>
        {/if}
      </div>

      {#if dashboard.daily && Array.isArray(dashboard.daily) && dashboard.daily.length > 0}
        {@const last7 = dashboard.daily.slice(-7)}
        {@const maxPlays = Math.max(...last7.map((d: any) => d.plays ?? d.count ?? 0), 1)}
        <div class="dash-chart">
          <span class="dash-chart-label">{$t('home.listens7days')}</span>
          <div class="dash-bars">
            {#each last7 as day}
              {@const plays = day.plays ?? day.count ?? 0}
              {@const dayName = day.date ? new Date(day.date + 'T00:00').toLocaleDateString('fr', { weekday: 'short' }) : ''}
              <div class="dash-bar-col">
                <span class="dash-bar-count">{plays}</span>
                <div class="dash-bar" style="height: {Math.max(6, (plays / maxPlays) * 80)}px"></div>
                <span class="dash-bar-label">{dayName}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if dashboard.genres && Array.isArray(dashboard.genres) && dashboard.genres.length > 0}
        <div class="dash-genres">
          {#each dashboard.genres.slice(0, 8) as g}
            <span class="genre-pill">{g.genre ?? g.name ?? g} <span class="genre-count">{g.count ?? g.plays ?? ''}</span></span>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Top sections */
  .top-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .section-title {
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text);
    margin: 0;
  }

  /* Top Artists */
  .top-artists-row {
    display: flex;
    gap: var(--space-sm);
    overflow-x: auto;
    padding: var(--space-xs) 0;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .top-artists-row::-webkit-scrollbar { display: none; }

  .artist-card {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.12s ease-out;
    flex-shrink: 0;
    color: var(--tune-text);
  }

  .artist-card:hover {
    border-color: var(--tune-accent);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }

  .artist-rank {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 700;
    color: var(--tune-accent);
    min-width: 20px;
  }

  .artist-card-name {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }

  .play-count-badge {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    color: var(--tune-accent);
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.12);
    padding: 2px 8px;
    border-radius: 10px;
    white-space: nowrap;
  }

  /* Top Tracks */
  .top-tracks-list {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .top-track-row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    cursor: pointer;
    transition: background 0.12s;
  }

  .top-track-row:hover {
    background: var(--tune-surface-hover);
  }

  .top-track-row + .top-track-row {
    border-top: 1px solid var(--tune-border);
  }

  .play-from-here-btn {
    width: 28px;
    height: 28px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s ease-out;
    opacity: 0;
    flex-shrink: 0;
  }

  .top-track-row:hover .play-from-here-btn {
    opacity: 1;
  }

  .play-from-here-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .track-rank {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 700;
    color: var(--tune-text-muted);
    min-width: 24px;
    text-align: right;
  }

  .top-track-art {
    flex-shrink: 0;
  }

  .top-track-play-zone {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    min-width: 0;
    flex: 1;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
    color: inherit;
  }

  .top-track-play-zone:hover .top-track-title {
    color: var(--tune-accent);
  }

  .top-track-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text);
    transition: color 0.12s;
  }

  .top-track-artist-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    transition: color 0.12s;
  }

  .top-track-artist-btn:hover {
    color: var(--tune-accent);
  }

  /* Recommendations carousel */
  /* Cartes en carrousel — partagees par « Radio Picks ». Les
     « Recommandations » les utilisaient aussi avant leur depart vers l'accueil
     (RecommendationsSection.svelte) ; elles restent donc ici. */
  .recs-carousel {
    display: flex;
    gap: var(--space-md);
    overflow-x: auto;
    padding: var(--space-xs) 0;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .recs-carousel::-webkit-scrollbar { display: none; }

  .rec-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    flex-shrink: 0;
    width: 140px;
    min-height: 210px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--tune-text);
  }

  .rec-card:hover .rec-title { color: var(--tune-accent); }

  .rec-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    max-width: 140px;
    transition: color 0.12s;
  }

  .rec-artist {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    max-width: 140px;
  }

  /* Dashboard */
  .dash-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-md);
  }

  .dash-big-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 20px 16px;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(99, 102, 241, 0.04));
    border: 1px solid rgba(99, 102, 241, 0.15);
    border-radius: 16px;
    min-height: 90px;
  }

  .dash-big-number {
    font-family: var(--font-display);
    font-size: 36px;
    font-weight: 700;
    color: var(--tune-text);
    line-height: 1;
  }

  .dash-big-label {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    text-align: center;
  }

  .dash-big-stat.clickable {
    cursor: pointer;
    transition: all 0.15s ease-out;
  }

  .dash-big-stat.clickable:hover {
    transform: translateY(-2px);
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(99, 102, 241, 0.08));
    border-color: rgba(99, 102, 241, 0.3);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
  }

  .dash-chart {
    margin-top: var(--space-lg);
    padding: 20px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 16px;
  }

  .dash-chart-label {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    letter-spacing: 0.3px;
    margin-bottom: var(--space-sm);
    display: block;
  }

  .dash-bars {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    height: 120px;
    padding-top: var(--space-sm);
  }

  .dash-bar-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 36px;
  }

  .dash-bar {
    width: 100%;
    max-width: 36px;
    background: linear-gradient(to top, var(--tune-accent), rgba(99, 102, 241, 0.6));
    border-radius: 6px 6px 0 0;
    min-height: 6px;
    transition: height 0.4s ease-out;
  }

  .dash-bar-count {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 700;
    color: var(--tune-text);
  }

  .dash-bar-label {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
    text-transform: capitalize;
  }

  .dash-genres {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: var(--space-lg);
  }

  .genre-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-body);
    font-size: 13px;
    padding: 6px 14px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--tune-text);
    transition: all 0.12s;
  }

  .genre-pill:hover {
    background: rgba(99, 102, 241, 0.1);
    border-color: rgba(99, 102, 241, 0.2);
  }

  .genre-count {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 700;
    color: var(--tune-accent);
  }

  /* Top Mixes */
  .mixes-row {
    display: flex;
    gap: var(--space-md);
    overflow-x: auto;
    padding: var(--space-xs) 0;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .mixes-row::-webkit-scrollbar { display: none; }

  .mix-card {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--tune-text);
  }

  .mix-cover {
    width: 160px;
    height: 100px;
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    transition: transform 0.15s ease-out, box-shadow 0.15s ease-out;
  }

  .mix-card:hover .mix-cover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .mix-genre {
    font-family: var(--font-label);
    font-size: 15px;
    font-weight: 700;
    color: white;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  }

  .mix-count {
    font-family: var(--font-body);
    font-size: 11px;
    color: rgba(255, 255, 255, 0.8);
  }

  /* Radio picks */
  .radio-card {
    width: 140px;
  }

  .radio-logo {
    width: 140px;
    height: 140px;
    object-fit: cover;
    border-radius: var(--radius-sm);
    background: var(--tune-surface);
  }

  .radio-placeholder {
    width: 140px;
    height: 140px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    color: var(--tune-text-muted);
  }

  /* Dashboard empty state */
  .dash-empty-state {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .dash-empty-hint {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
    margin: 0;
  }

  .dash-empty-library {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .dash-empty-label {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--tune-text-muted);
  }

  .dash-empty-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-md);
  }

  .dashboard-highlights { display: contents; }
</style>

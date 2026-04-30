<script lang="ts">
  import { onMount } from 'svelte';
  import * as api from '../lib/api';
  import type { DashboardData, DashboardPeriod } from '../lib/api';
  import { t } from '../lib/i18n';
  import { activeView } from '../lib/stores/navigation';
  import { selectedAlbum, selectedArtist, libraryTab, albumTracks } from '../lib/stores/library';
  import { artworkUrl } from '../lib/api';

  let tree = $state<Record<string, string[]>>({});

  $effect(() => {
    api.getGenreTree().then(r => tree = r.tree ?? {}).catch(() => {});
  });

  // Roll up by_genre into branches using the user's genre tree. A genre
  // that's a child in the tree contributes to its parent's bucket; one
  // that's a parent contributes to its own; an orphan contributes to
  // "Hors arbre".
  let genreBranches = $derived.by(() => {
    if (!data?.by_genre?.length) return [];
    const childToParent = new Map<string, string>();
    const parentSet = new Set<string>();
    for (const [parent, kids] of Object.entries(tree)) {
      parentSet.add(parent.toLowerCase());
      for (const k of kids) childToParent.set(k.toLowerCase(), parent);
    }
    const buckets = new Map<string, { plays: number; listening_ms: number }>();
    for (const g of data.by_genre) {
      const lower = (g.genre || '').toLowerCase();
      const branch = parentSet.has(lower)
        ? g.genre
        : (childToParent.get(lower) ?? 'Hors arbre');
      const cur = buckets.get(branch) ?? { plays: 0, listening_ms: 0 };
      cur.plays += g.plays;
      cur.listening_ms += g.listening_ms;
      buckets.set(branch, cur);
    }
    return [...buckets.entries()]
      .map(([branch, v]) => ({ branch, ...v }))
      .sort((a, b) => b.plays - a.plays);
  });

  let genreBranchMax = $derived(genreBranches.length ? Math.max(...genreBranches.map(b => b.plays)) : 0);

  // Click → navigate. We look the artist up in the cached full list to
  // avoid bouncing back through the search endpoint.
  let _allArtists: any[] = [];
  async function openArtist(name: string) {
    if (!name) return;
    try {
      if (_allArtists.length === 0) {
        _allArtists = await api.getArtists(5000, 0);
      }
      const hit = _allArtists.find(a => (a.name || '').toLowerCase() === name.toLowerCase());
      if (hit) {
        selectedArtist.set(hit);
        libraryTab.set('artists');
        activeView.set('library');
      }
    } catch {}
  }

  async function openAlbum(title: string, artist: string) {
    try {
      const list = await api.getAllAlbums();
      const hit = list.find(a =>
        (a.title || '').toLowerCase() === (title || '').toLowerCase()
        && (a.artist_name || '').toLowerCase() === (artist || '').toLowerCase()
      );
      if (hit?.id) {
        selectedAlbum.set(hit);
        const tracks = await api.getAlbumTracks(hit.id);
        albumTracks.set(tracks);
        libraryTab.set('albums');
        activeView.set('library');
      }
    } catch {}
  }

  function openTrack(trackId: number | null, title: string, artist: string) {
    // Without a per-track view we land on the album.
    if (trackId) openAlbum(title, artist);
  }

  let period = $state<DashboardPeriod>('30d');
  let data = $state<DashboardData | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function load() {
    loading = true;
    error = null;
    try {
      data = await api.getDashboard(period);
    } catch (e: any) {
      error = e?.message ?? 'Failed to load dashboard';
    } finally {
      loading = false;
    }
  }

  onMount(load);

  $effect(() => {
    void period;
    load();
  });

  function formatMs(ms: number): string {
    if (!ms) return '0';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  let trendMax = $derived(data?.trend?.length ? Math.max(...data.trend.map(d => d.plays)) : 0);
  let hourlyMax = $derived(data?.hourly?.length ? Math.max(...data.hourly.map(h => h.plays)) : 0);

  // Build a 7×24 lookup: cellAt(weekday, hour) → plays. Weekday is
  // ISO 1=Mon … 7=Sun (already remapped server-side). Empty cells are
  // 0 — heatmap shows them at minimum opacity so the grid stays full.
  let weekdayHourlyGrid = $derived.by(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const cell of data?.weekday_hourly ?? []) {
      const row = (cell.weekday - 1);  // 0..6
      const col = cell.hour;           // 0..23
      if (row >= 0 && row < 7 && col >= 0 && col < 24) {
        grid[row][col] = cell.plays;
      }
    }
    return grid;
  });
  let weekdayHourlyMax = $derived(
    Math.max(0, ...weekdayHourlyGrid.flat())
  );

  const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
</script>

<section class="dashboard">
  <header class="dashboard-header">
    <h1>{$t('dashboard.title')}</h1>
    <div class="period-chips">
      {#each ['today', '7d', '30d', 'all'] as p}
        <button
          class="chip"
          class:active={period === p}
          onclick={() => period = p as DashboardPeriod}
        >{$t(`dashboard.period.${p}`)}</button>
      {/each}
    </div>
  </header>

  {#if loading && !data}
    <div class="state">…</div>
  {:else if error}
    <div class="state error">{error}</div>
  {:else if data && data.totals.plays === 0}
    <div class="state">{$t('dashboard.empty')}</div>
  {:else if data}
    <!-- Totals -->
    <div class="totals">
      <div class="total-card">
        <div class="total-num">{data.totals.plays.toLocaleString()}</div>
        <div class="total-label">{$t('dashboard.totals.plays')}</div>
      </div>
      <div class="total-card">
        <div class="total-num">{formatMs(data.totals.listening_ms)}</div>
        <div class="total-label">{$t('dashboard.totals.listening_time')}</div>
      </div>
      <div class="total-card">
        <div class="total-num">{data.totals.unique_tracks.toLocaleString()}</div>
        <div class="total-label">{$t('dashboard.totals.unique_tracks')}</div>
      </div>
      <div class="total-card">
        <div class="total-num">{data.totals.unique_artists.toLocaleString()}</div>
        <div class="total-label">{$t('dashboard.totals.unique_artists')}</div>
      </div>
    </div>

    <!-- Trend -->
    {#if data.trend.length > 0}
      <div class="card">
        <h3>{$t('dashboard.section.trend')}</h3>
        <div class="trend-bars">
          {#each data.trend as d}
            <div
              class="trend-bar"
              title="{d.day} — {d.plays} plays"
              style:height="{trendMax ? (d.plays / trendMax) * 100 : 0}%"
            ></div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Two-column grid -->
    <div class="grid">
      {#if data.top_artists.length > 0}
        <div class="card">
          <h3>{$t('dashboard.section.top_artists')}</h3>
          <ol class="rank-list">
            {#each data.top_artists as a}
              <li>
                <button class="rank-name rank-link" onclick={() => openArtist(a.artist_name)} title="Voir l'artiste">{a.artist_name}</button>
                <span class="rank-meta">{a.plays} · {formatMs(a.listening_ms)}</span>
              </li>
            {/each}
          </ol>
        </div>
      {/if}

      {#if data.top_albums.length > 0}
        <div class="card">
          <h3>{$t('dashboard.section.top_albums')}</h3>
          <ol class="rank-list rank-list-with-cover">
            {#each data.top_albums as a}
              <li>
                {#if a.cover_path}
                  <img class="rank-cover" src={artworkUrl(a.cover_path, 80)} alt="" loading="lazy" />
                {:else}
                  <div class="rank-cover-empty"></div>
                {/if}
                <button class="rank-name rank-link" onclick={() => openAlbum(a.album_title, a.artist_name)} title="Voir l'album">
                  {a.album_title}<span class="rank-sub"> — {a.artist_name}</span>
                </button>
                <span class="rank-meta">{a.plays}</span>
              </li>
            {/each}
          </ol>
        </div>
      {/if}

      {#if data.top_tracks.length > 0}
        <div class="card">
          <h3>{$t('dashboard.section.top_tracks')}</h3>
          <ol class="rank-list">
            {#each data.top_tracks as t}
              <li>
                <button class="rank-name rank-link" onclick={() => openTrack(t.track_id, t.title, t.artist_name)} title="Voir la piste">
                  {t.title}<span class="rank-sub"> — {t.artist_name}</span>
                </button>
                <span class="rank-meta">{t.plays}</span>
              </li>
            {/each}
          </ol>
        </div>
      {/if}
    </div>

    <!-- Streak + On this day -->
    <div class="grid">
      {#if data.streak && (data.streak.best > 0 || data.streak.current > 0)}
        <div class="card streak-card">
          <h3>Streak</h3>
          <div class="streak-row">
            <div>
              <div class="streak-num">{data.streak.current}</div>
              <div class="streak-label">jour{data.streak.current > 1 ? 's' : ''} consécutif{data.streak.current > 1 ? 's' : ''}</div>
            </div>
            <div class="streak-best">
              <div class="streak-best-num">{data.streak.best}</div>
              <div class="streak-best-label">record perso</div>
            </div>
          </div>
        </div>
      {/if}

      {#if data.on_this_day && data.on_this_day.length > 0}
        <div class="card otd-card">
          <h3>📅 Il y a quelques années…</h3>
          <ul class="otd-list">
            {#each data.on_this_day.slice(0, 8) as t}
              <li>
                <span class="otd-year">{t.year ?? '?'}</span>
                <span class="otd-title">
                  {t.track_title ?? '?'}
                  {#if t.artist_name}<span class="otd-sub"> — {t.artist_name}</span>{/if}
                </span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>

    <!-- Genres par branche (rolled up via le genre tree) -->
    {#if genreBranches.length > 0}
      <div class="card">
        <h3>Écoutes par branche genre</h3>
        <ul class="bar-list">
          {#each genreBranches as b}
            <li>
              <div class="bar-label">{b.branch}</div>
              <div class="bar-track"><div class="bar-fill" style:width="{(b.plays / genreBranchMax) * 100}%"></div></div>
              <div class="bar-value">{b.plays}</div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- Weekday × Hour heatmap (7 rows × 24 cols) -->
    {#if weekdayHourlyMax > 0}
      <div class="card">
        <h3>{$t('dashboard.section.weekday_hourly') ?? 'Quand tu écoutes (semaine × heure)'}</h3>
        <div class="wh-wrap">
          <div class="wh-hours">
            <div class="wh-day-label"></div>
            {#each Array(24) as _, h}
              <div class="wh-hour-label">{h % 3 === 0 ? h : ''}</div>
            {/each}
          </div>
          {#each WEEKDAY_LABELS as day, row}
            <div class="wh-row">
              <div class="wh-day-label">{day}</div>
              {#each weekdayHourlyGrid[row] as plays, col}
                {@const intensity = plays / weekdayHourlyMax}
                <div
                  class="wh-cell"
                  class:wh-cell-empty={plays === 0}
                  style:opacity={plays === 0 ? 0.06 : 0.18 + intensity * 0.82}
                  title="{day} {col}h — {plays} plays"
                ></div>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Hourly heatmap (24h aggregate, all days combined) -->
    {#if data.hourly.length > 0}
      <div class="card">
        <h3>{$t('dashboard.section.hourly')}</h3>
        <div class="hourly-row">
          {#each Array(24) as _, h}
            {@const cell = data.hourly.find(x => x.hour === h)}
            {@const intensity = hourlyMax && cell ? cell.plays / hourlyMax : 0}
            <div
              class="hourly-cell"
              title="{h}h — {cell?.plays ?? 0} plays"
              style:opacity={0.15 + intensity * 0.85}
            >
              <span class="hourly-h">{h}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- By zone & by source -->
    <div class="grid">
      {#if data.by_zone.length > 0}
        <div class="card">
          <h3>{$t('dashboard.section.by_zone')}</h3>
          <ul class="bar-list">
            {#each data.by_zone as z}
              {@const max = Math.max(...data.by_zone.map(x => x.plays))}
              <li>
                <div class="bar-label">{z.zone_name ?? `Zone #${z.zone_id}`}</div>
                <div class="bar-track"><div class="bar-fill" style:width="{(z.plays / max) * 100}%"></div></div>
                <div class="bar-value">{z.plays}</div>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if data.by_source.length > 0}
        <div class="card">
          <h3>{$t('dashboard.section.by_source')}</h3>
          <ul class="bar-list">
            {#each data.by_source as s}
              {@const max = Math.max(...data.by_source.map(x => x.plays))}
              <li>
                <div class="bar-label">{s.source ?? '—'}</div>
                <div class="bar-track"><div class="bar-fill" style:width="{(s.plays / max) * 100}%"></div></div>
                <div class="bar-value">{s.plays}</div>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>

    <!-- Completion -->
    {#if data.completion.completed + data.completion.skipped > 0}
      <div class="card">
        <h3>{$t('dashboard.section.completion')}</h3>
        <div class="completion-bar">
          <div class="completion-completed" style:width="{(data.completion.completed / (data.completion.completed + data.completion.skipped)) * 100}%"></div>
          <div class="completion-skipped"  style:width="{(data.completion.skipped   / (data.completion.completed + data.completion.skipped)) * 100}%"></div>
        </div>
        <div class="completion-legend">
          <span><span class="dot dot-completed"></span>{$t('dashboard.completion.completed')} · {data.completion.completed}</span>
          <span><span class="dot dot-skipped"></span>{$t('dashboard.completion.skipped')} · {data.completion.skipped}</span>
        </div>
      </div>
    {/if}
  {/if}
</section>

<style>
  .dashboard { padding: 1.5rem; max-width: 1100px; margin: 0 auto; }
  .dashboard-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
  .dashboard-header h1 { margin: 0; font-size: 1.5rem; color: var(--tune-text); }
  .period-chips { display: flex; gap: 0.4rem; }
  .chip {
    padding: 0.35rem 0.85rem;
    font-size: 0.85rem;
    border-radius: 999px;
    border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.4);
    background: transparent;
    color: var(--tune-text);
    cursor: pointer;
  }
  .chip.active { background: var(--tune-accent, #6366f1); color: white; border-color: var(--tune-accent, #6366f1); }
  .state { padding: 4rem 2rem; text-align: center; color: var(--tune-text-muted); }
  .state.error { color: #dc2626; }

  .totals { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.8rem; margin-bottom: 1.2rem; }
  .total-card {
    padding: 1rem; border-radius: 12px;
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.08);
  }
  .total-num { font-size: 1.6rem; font-weight: 700; color: var(--tune-text); }
  .total-label { font-size: 0.8rem; color: var(--tune-text-muted); margin-top: 0.2rem; }

  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 1.2rem; }
  .card { background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.04); border-radius: 12px; padding: 1rem 1.2rem; margin-bottom: 1rem; }
  .card h3 { margin: 0 0 0.8rem 0; font-size: 0.95rem; color: var(--tune-text); }

  .rank-list { list-style: none; padding: 0; margin: 0; counter-reset: rank; }
  .rank-list li { display: flex; align-items: center; gap: 0.6rem; padding: 0.3rem 0; counter-increment: rank; }
  .rank-list li::before { content: counter(rank); font-size: 0.8rem; color: var(--tune-text-muted); width: 1.5rem; }
  .rank-name { flex: 1; font-size: 0.9rem; color: var(--tune-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rank-link {
    background: none; border: none; padding: 0; text-align: left;
    cursor: pointer; color: inherit; font: inherit;
  }
  .rank-link:hover { color: var(--tune-accent); }
  .rank-sub { color: var(--tune-text-muted); font-size: 0.8rem; }
  .rank-meta { font-size: 0.8rem; color: var(--tune-text-muted); }
  .rank-list-with-cover li { gap: 0.5rem; }
  .rank-cover {
    width: 32px; height: 32px; border-radius: 4px;
    object-fit: cover; flex-shrink: 0;
  }
  .rank-cover-empty {
    width: 32px; height: 32px; border-radius: 4px;
    background: var(--tune-grey2, rgba(255,255,255,0.05)); flex-shrink: 0;
  }

  .trend-bars { display: flex; align-items: flex-end; gap: 2px; height: 80px; }
  .trend-bar { flex: 1; min-width: 4px; background: var(--tune-accent, #6366f1); border-radius: 2px 2px 0 0; transition: opacity 0.2s; }
  .trend-bar:hover { opacity: 0.7; }

  .wh-wrap { display: flex; flex-direction: column; gap: 2px; }
  .wh-hours, .wh-row {
    display: grid;
    grid-template-columns: 30px repeat(24, 1fr);
    gap: 2px;
    align-items: center;
  }
  .wh-day-label {
    font-size: 0.7rem; color: var(--tune-text-muted);
    font-family: var(--font-label); text-align: right;
    padding-right: 4px;
  }
  .wh-hour-label {
    font-size: 0.55rem; color: var(--tune-text-muted);
    text-align: center;
  }
  .wh-cell {
    aspect-ratio: 1;
    background: var(--tune-accent, #6366f1);
    border-radius: 2px;
    transition: transform 0.1s;
  }
  .wh-cell-empty { background: var(--tune-bg, rgba(255,255,255,0.04)); }
  .wh-cell:hover { transform: scale(1.4); z-index: 1; }

  .hourly-row { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; }
  .hourly-cell { aspect-ratio: 1; background: var(--tune-accent, #6366f1); border-radius: 3px; display: flex; align-items: center; justify-content: center; }
  .hourly-h { font-size: 0.55rem; color: white; opacity: 0.7; }

  .bar-list { list-style: none; padding: 0; margin: 0; }
  .bar-list li { display: flex; align-items: center; gap: 0.6rem; padding: 0.3rem 0; }
  .bar-label { width: 80px; font-size: 0.85rem; color: var(--tune-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { flex: 1; height: 8px; background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.1); border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; background: var(--tune-accent, #6366f1); border-radius: 4px; }
  .bar-value { width: 40px; text-align: right; font-size: 0.8rem; color: var(--tune-text-muted); }

  .streak-card { display: flex; flex-direction: column; }
  .streak-row {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 1rem; margin-top: 0.4rem;
  }
  .streak-num {
    font-size: 2.6rem; font-weight: 800; color: var(--tune-accent, #6366f1);
    line-height: 1; font-variant-numeric: tabular-nums;
  }
  .streak-label { font-size: 0.85rem; color: var(--tune-text-muted); }
  .streak-best { text-align: right; }
  .streak-best-num { font-size: 1.4rem; font-weight: 700; color: var(--tune-text); }
  .streak-best-label { font-size: 0.75rem; color: var(--tune-text-muted); }

  .otd-list { list-style: none; padding: 0; margin: 0.4rem 0 0; }
  .otd-list li { display: flex; gap: 0.6rem; padding: 0.25rem 0; }
  .otd-year {
    font-size: 0.78rem; color: var(--tune-accent);
    font-variant-numeric: tabular-nums; min-width: 38px;
  }
  .otd-title {
    flex: 1; font-size: 0.85rem; color: var(--tune-text);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .otd-sub { color: var(--tune-text-muted); font-size: 0.75rem; }

  .completion-bar { display: flex; height: 12px; border-radius: 6px; overflow: hidden; margin-bottom: 0.6rem; }
  .completion-completed { background: #10b981; }
  .completion-skipped { background: #f59e0b; }
  .completion-legend { display: flex; gap: 1.2rem; font-size: 0.8rem; color: var(--tune-text-muted); }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 0.3rem; vertical-align: middle; }
  .dot-completed { background: #10b981; }
  .dot-skipped { background: #f59e0b; }

  @media (max-width: 700px) {
    .totals { grid-template-columns: repeat(2, 1fr); }
  }
</style>

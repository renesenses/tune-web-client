<script lang="ts">
  import { onMount } from 'svelte';
  import * as api from '../lib/api';
  import type { DashboardData, DashboardPeriod, SlotTrack } from '../lib/api';
  import { t } from '../lib/i18n';
  import { activeView } from '../lib/stores/navigation';
  import { selectedAlbum, selectedArtist, libraryTab, albumTracks, artistAlbums } from '../lib/stores/library';
  import { artworkUrl } from '../lib/api';
  import { currentZone, playAndSync } from '../lib/stores/zones';

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

  let showAllGenres = $state(false);
  let visibleGenreBranches = $derived(showAllGenres ? genreBranches : genreBranches.slice(0, 20));
  let genreBranchMax = $derived(visibleGenreBranches.length ? Math.max(...visibleGenreBranches.map(b => b.plays)) : 0);

  // Click → navigate. Use search to find the artist instead of loading all.
  async function openArtist(name: string) {
    if (!name) return;
    try {
      const results = await api.searchLibrary(name, 5);
      const hit = results.artists?.find((a: any) => (a.name || '').toLowerCase() === name.toLowerCase());
      if (hit?.id) {
        selectedAlbum.set(null);
        albumTracks.set([]);
        selectedArtist.set(hit);
        const albums = await api.getArtistAlbums(hit.id);
        artistAlbums.set(albums);
        libraryTab.set('artists');
        activeView.set('library');
      }
    } catch {}
  }

  async function openAlbum(title: string, artist: string) {
    try {
      // Try search by title only (more reliable than title+artist combined)
      const results = await api.searchLibrary(title, 20);
      const hit = results.albums?.find((a: any) =>
        (a.title || '').toLowerCase() === (title || '').toLowerCase()
      ) || results.albums?.find((a: any) =>
        (a.title || '').toLowerCase().includes((title || '').toLowerCase())
      );
      if (hit?.id) {
        selectedArtist.set(null);
        selectedAlbum.set(hit);
        const tracks = await api.getAlbumTracks(hit.id);
        albumTracks.set(tracks);
        libraryTab.set('albums');
        activeView.set('library');
      }
    } catch {}
  }

  async function openTrack(trackId: number | null, title: string, artist: string) {
    if (!trackId) return;
    try {
      const results = await api.searchLibrary(title, 20);
      const hit = results.tracks?.find((t: any) => t.id === trackId)
        || results.tracks?.find((t: any) =>
          (t.title || '').toLowerCase() === (title || '').toLowerCase());
      if (hit?.album_id) {
        const album = results.albums?.find((a: any) => a.id === hit.album_id)
          || { id: hit.album_id, title: hit.album_title, artist_name: hit.artist_name };
        selectedArtist.set(null);
        selectedAlbum.set(album);
        const tracks = await api.getAlbumTracks(hit.album_id);
        albumTracks.set(tracks);
        libraryTab.set('albums');
        activeView.set('library');
        return;
      }
      openAlbum(title, artist);
    } catch {
      openAlbum(title, artist);
    }
  }

  async function getZoneId(): Promise<number | null> {
    const zone = $currentZone;
    if (zone?.id) return zone.id;
    try {
      const allZones = await api.getZones();
      const online = allZones.find((z: any) => z.online && z.state !== 'error');
      if (online?.id) return online.id;
      if (allZones[0]?.id) return allZones[0].id;
    } catch {}
    return null;
  }

  async function playTrack(trackId: number | null) {
    if (!trackId) return;
    const zoneId = await getZoneId();
    if (!zoneId) return;
    try { await playAndSync(zoneId, { track_id: trackId }); } catch (e) { console.error('Dashboard playTrack error:', e); }
  }

  async function playAlbumById(albumId: number) {
    const zoneId = await getZoneId();
    if (!zoneId) return;
    try { await playAndSync(zoneId, { album_id: albumId }); } catch (e) { console.error('Dashboard playAlbum error:', e); }
  }

  async function playRadioById(radioId: number) {
    const zoneId = await getZoneId();
    if (!zoneId) return;
    try { await api.playRadio(radioId, zoneId); } catch (e) { console.error('Dashboard playRadio error:', e); }
  }

  async function playStreamingItem(source?: string | null, sourceId?: string | null) {
    if (!source || source === 'local' || !sourceId) return;
    const zoneId = await getZoneId();
    if (!zoneId) return;
    try {
      await playAndSync(zoneId, { source: source as any, source_id: sourceId });
    } catch (e) {
      console.error('Dashboard playStreamingItem error:', e);
    }
  }

  // Dashboard top items may be streaming (Qobuz/Tidal/YouTube) with no local
  // id: local library navigation/search silently fails for those. Play them
  // directly via source+source_id instead so the click always does something.
  async function playTopTrack(tk: { track_id: number | null; source?: string | null; source_id?: string | null }) {
    if (tk.track_id) { await playTrack(tk.track_id); return; }
    await playStreamingItem(tk.source, tk.source_id);
  }

  async function openTopTrack(tk: { track_id: number | null; title: string; artist_name: string; source?: string | null; source_id?: string | null }) {
    if (tk.track_id) { await openTrack(tk.track_id, tk.title, tk.artist_name); return; }
    await playStreamingItem(tk.source, tk.source_id);
  }

  async function playTopAlbum(a: { album_id?: number | null; source?: string | null; source_id?: string | null }) {
    if (a.album_id) { await playAlbumById(a.album_id); return; }
    await playStreamingItem(a.source, a.source_id);
  }

  async function openTopAlbum(a: { album_id?: number | null; album_title: string; artist_name: string; source?: string | null; source_id?: string | null }) {
    if (a.album_id || (!a.source || a.source === 'local')) { await openAlbum(a.album_title, a.artist_name); return; }
    await playStreamingItem(a.source, a.source_id);
  }

  let period = $state<DashboardPeriod>('30d');
  let data = $state<DashboardData | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function load() {
    loading = true;
    error = null;
    try {
      data = await api.getDashboard(period, { topN: 20 });
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

  // One bar per day of the selected period, filling days with no plays as zero
  // so the bar count equals the number of days studied (Elie: today / 7 / 30).
  // 'all' falls back to the days actually returned, capped at 90 (DOM overload).
  let visibleTrend = $derived.by(() => {
    const raw = data?.trend ?? [];
    const byDay = new Map(raw.map((d) => [d.day, d]));
    const n =
      period === 'today' ? 1 : period === '7d' ? 7 : period === '30d' ? 30 : Math.min(Math.max(raw.length, 1), 90);
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const out: Array<{ day: string; plays: number; listening_ms: number }> = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push(byDay.get(key) ?? { day: key, plays: 0, listening_ms: 0 });
    }
    return out;
  });
  let trendMax = $derived(visibleTrend.length ? Math.max(...visibleTrend.map(d => d.plays)) : 0);
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

  const WEEKDAY_LABELS = $derived([
    $t('alarms.dayMon'), $t('alarms.dayTue'), $t('alarms.dayWed'),
    $t('alarms.dayThu'), $t('alarms.dayFri'), $t('alarms.daySat'), $t('alarms.daySun'),
  ]);

  // Heatmap drill-down (Elie): click a weekday×hour cell → what was played then.
  let slotOpen = $state(false);
  let slotLoading = $state(false);
  let slotRow = $state(0);
  let slotHour = $state(0);
  let slotTracks = $state<SlotTrack[]>([]);

  async function openSlot(row: number, col: number) {
    slotRow = row; slotHour = col; slotOpen = true; slotLoading = true; slotTracks = [];
    try {
      const res = await api.getHistoryAtSlot(period, row + 1, col, 100);
      slotTracks = res.tracks ?? [];
    } catch (e) {
      console.error('Slot tracks error:', e);
      slotTracks = [];
    }
    slotLoading = false;
  }
  function closeSlot() { slotOpen = false; }
</script>

<section class="dashboard">
  <header class="dashboard-header">
    <h2>{$t('dashboard.title')}</h2>
    <div class="period-chips">
      {#each ['today', '7d', '30d', 'all'] as p}
        <button
          class="chip"
          class:active={period === p}
          onclick={() => period = p as DashboardPeriod}
        >{$t(`dashboard.period.${p}`)}</button>
      {/each}
      <button
        class="chip export-chip"
        onclick={() => {
          const a = document.createElement('a');
          a.href = `/api/v1/history/export?limit=10000`;
          a.download = 'tune-history.csv';
          a.click();
        }}
        title="Export CSV"
      >⬇ CSV</button>
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
    {#if visibleTrend.length > 0}
      <div class="card">
        <h3>{$t('dashboard.section.trend')}</h3>
        <div class="trend-bars">
          {#each visibleTrend as d}
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
          <ol class="rank-list rank-list-with-cover">
            {#each data.top_artists as a}
              <li>
                {#if a.cover_path}
                  <img class="rank-cover rank-clickable" src={artworkUrl(a.cover_path, 80)} alt="" loading="lazy" onclick={() => openArtist(a.artist_name)} />
                {:else}
                  <div class="rank-cover-empty rank-clickable" onclick={() => openArtist(a.artist_name)}>🎤</div>
                {/if}
                <button class="rank-name rank-link" onclick={() => openArtist(a.artist_name)} title={$t('dashboard.viewArtist')}>{a.artist_name}</button>
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
                <div class="rank-cover-wrap" onclick={() => playTopAlbum(a)}>
                  {#if a.cover_path}
                    <img class="rank-cover rank-clickable" src={artworkUrl(a.cover_path, 80)} alt="" loading="lazy" />
                  {:else}
                    <div class="rank-cover-empty rank-clickable">💿</div>
                  {/if}
                </div>
                <span class="rank-info">
                  <button class="rank-name rank-link" onclick={() => openTopAlbum(a)} title={$t('dashboard.viewAlbum')}>{a.album_title}</button>
                  <button class="rank-artist-link" onclick={() => openArtist(a.artist_name)} title={$t('dashboard.viewArtist')}>{a.artist_name}</button>
                </span>
                <span class="rank-meta">{a.plays}</span>
              </li>
            {/each}
          </ol>
        </div>
      {/if}

      {#if data.top_tracks.length > 0}
        <div class="card">
          <h3>{$t('dashboard.section.top_tracks')}</h3>
          <ol class="rank-list rank-list-with-cover">
            {#each data.top_tracks as tk}
              <li>
                <div class="rank-cover-wrap" onclick={() => playTopTrack(tk)}>
                  {#if tk.cover_path}
                    <img class="rank-cover rank-clickable" src={artworkUrl(tk.cover_path, 80)} alt="" loading="lazy" />
                  {:else}
                    <div class="rank-cover-empty rank-clickable">🎵</div>
                  {/if}
                </div>
                <span class="rank-info">
                  <button class="rank-name rank-link" onclick={() => openTopTrack(tk)} title={$t('dashboard.viewTrack')}>{tk.title}</button>
                  <button class="rank-artist-link" onclick={() => openArtist(tk.artist_name)} title={$t('dashboard.viewArtist')}>{tk.artist_name}</button>
                </span>
                <span class="rank-meta">{tk.plays}</span>
              </li>
            {/each}
          </ol>
        </div>
      {/if}
      {#if data.top_radios && data.top_radios.length > 0}
        <div class="card">
          <h3>{$t('dashboard.topRadios')}</h3>
          <ol class="rank-list rank-list-with-cover">
            {#each data.top_radios as r}
              <li>
                <div class="rank-cover-wrap" onclick={() => r.radio_id && playRadioById(r.radio_id)}>
                  {#if r.cover_path}
                    <img class="rank-cover rank-clickable" src={artworkUrl(r.cover_path, 80)} alt="" loading="lazy" />
                  {:else if r.cover_url}
                    <img class="rank-cover rank-clickable" src={r.cover_url} alt="" loading="lazy" />
                  {:else}
                    <div class="rank-cover-empty rank-clickable">📻</div>
                  {/if}
                </div>
                <span class="rank-name">{r.station_name}</span>
                <span class="rank-meta">{r.plays} · {formatMs(r.listening_ms)}</span>
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
              <div class="streak-label">{$t('dashboard.consecutiveDays')}</div>
            </div>
            <div class="streak-best">
              <div class="streak-best-num">{data.streak.best}</div>
              <div class="streak-best-label">{$t('dashboard.personalRecord')}</div>
            </div>
          </div>
        </div>
      {/if}

      {#if data.on_this_day && data.on_this_day.length > 0}
        <div class="card otd-card">
          <h3>📅 {$t('dashboard.onThisDay')}</h3>
          <ul class="otd-list">
            {#each data.on_this_day.slice(0, 8) as t}
              <li class="otd-clickable" onclick={() => openTrack(null, t.track_title ?? '', t.artist_name ?? '')}>
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
    {#if visibleGenreBranches.length > 0}
      <div class="card">
        <h3>{$t('dashboard.genreBranches')}</h3>
        <ul class="bar-list">
          {#each visibleGenreBranches as b}
            <li>
              <div class="bar-label">{b.branch}</div>
              <div class="bar-track"><div class="bar-fill" style:width="{(b.plays / genreBranchMax) * 100}%"></div></div>
              <div class="bar-value">{b.plays}</div>
            </li>
          {/each}
        </ul>
        {#if genreBranches.length > 20}
          <button class="show-more-btn" onclick={() => showAllGenres = !showAllGenres}>
            {showAllGenres ? $t('dashboard.showLess') : $t('dashboard.showMoreGenres').replace('{n}', String(genreBranches.length - 20))}
          </button>
        {/if}
      </div>
    {/if}

    <!-- Weekday × Hour heatmap (7 rows × 24 cols) -->
    {#if weekdayHourlyMax > 0}
      <div class="card">
        <h3>{$t('dashboard.section.weekday_hourly')}</h3>
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
                  style:cursor={plays > 0 ? 'pointer' : 'default'}
                  title="{day} {col}h — {plays} plays"
                  role="button"
                  tabindex={plays > 0 ? 0 : -1}
                  onclick={() => plays > 0 && openSlot(row, col)}
                  onkeydown={(e) => { if (plays > 0 && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openSlot(row, col); } }}
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

{#if slotOpen}
  <div class="slot-overlay" onclick={closeSlot} role="presentation">
    <div class="slot-modal" role="dialog" aria-modal="true">
      <div class="slot-modal-head">
        <h3>{WEEKDAY_LABELS[slotRow]} · {slotHour}h–{slotHour + 1}h</h3>
        <button class="slot-close" onclick={closeSlot} aria-label="Close">×</button>
      </div>
      {#if slotLoading}
        <div class="slot-empty">…</div>
      {:else if slotTracks.length === 0}
        <div class="slot-empty">{$t('dashboard.slot.empty')}</div>
      {:else}
        <div class="slot-list">
          {#each slotTracks as tk}
            <button class="slot-item" onclick={() => playTopTrack(tk)} title={$t('dashboard.slot.play')}>
              <span class="slot-title">{tk.title ?? '—'}</span>
              <span class="slot-sub">{tk.artist_name ?? ''}{tk.album_title ? ' · ' + tk.album_title : ''}</span>
              {#if tk.plays > 1}<span class="slot-plays">×{tk.plays}</span>{/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .slot-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 16px; }
  .slot-modal { background: var(--tune-bg, #1a1a1a); border: 1px solid var(--tune-border, rgba(255,255,255,0.12)); border-radius: 12px; width: 100%; max-width: 480px; max-height: 70vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 12px 40px rgba(0,0,0,0.4); }
  .slot-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--tune-border, rgba(255,255,255,0.12)); }
  .slot-modal-head h3 { margin: 0; font-size: 1rem; }
  .slot-close { background: none; border: none; color: inherit; font-size: 1.4rem; line-height: 1; cursor: pointer; padding: 0 4px; }
  .slot-empty { padding: 24px; text-align: center; opacity: 0.6; }
  .slot-list { overflow-y: auto; padding: 6px; }
  .slot-item { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; text-align: left; background: none; border: none; color: inherit; padding: 8px 12px; border-radius: 8px; cursor: pointer; position: relative; }
  .slot-item:hover { background: var(--tune-hover, rgba(255,255,255,0.06)); }
  .slot-title { font-weight: 600; font-size: 0.9rem; }
  .slot-sub { font-size: 0.78rem; opacity: 0.65; }
  .slot-plays { position: absolute; right: 12px; top: 10px; font-size: 0.75rem; opacity: 0.6; }

  .dashboard { padding: var(--space-lg) 28px; max-width: 1100px; margin: 0 auto; }
  .dashboard-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 16px; }
  .dashboard-header h2 { margin: 0; font-family: var(--font-label); font-size: 28px; font-weight: 600; letter-spacing: -0.8px; color: var(--tune-text); }
  .period-chips { display: flex; gap: 0.4rem; }
  .chip {
    padding: 0.35rem 0.85rem;
    font-size: 14px;
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
    padding: 1rem; border-radius: var(--radius-xl);
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.08);
  }
  .total-num { font-size: 26px; font-weight: 700; color: var(--tune-text); }
  .total-label { font-size: 13px; color: var(--tune-text-muted); margin-top: 0.2rem; }

  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 1.2rem; }
  .card { background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.04); border-radius: var(--radius-xl); padding: 1rem 1.2rem; margin-bottom: 1rem; }
  .card h3 { margin: 0 0 0.8rem 0; font-size: 15px; color: var(--tune-text); }

  .rank-list { list-style: none; padding: 0; margin: 0; counter-reset: rank; }
  .rank-list li { display: flex; align-items: center; gap: 0.6rem; padding: 0.3rem 0; counter-increment: rank; }
  .rank-list li::before { content: counter(rank); font-size: 13px; color: var(--tune-text-muted); width: 24px; }
  .rank-icon { font-size: 14px; flex-shrink: 0; width: 20px; text-align: center; }
  .rank-clickable { cursor: pointer; }
  .rank-info { flex: 1; display: flex; flex-direction: column; gap: 1px; overflow: hidden; min-width: 0; }
  .rank-info .rank-name { text-align: left; }
  .rank-artist-link { background: none; border: none; padding: 0; font: inherit; font-size: 12px; color: var(--tune-text-muted, #888); cursor: pointer; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rank-artist-link:hover { color: var(--tune-accent); }
  .rank-name { flex: 1; font-size: 14px; color: var(--tune-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rank-link {
    background: none; border: none; padding: 0; text-align: left;
    cursor: pointer; color: inherit; font: inherit;
  }
  .rank-link:hover { color: var(--tune-accent); }
  .rank-sub { color: var(--tune-text-muted); font-size: 13px; }
  .rank-meta { font-size: 13px; color: var(--tune-text-muted); }
  .rank-list-with-cover li { gap: 0.5rem; }
  .rank-cover {
    width: 32px; height: 32px; border-radius: var(--radius-sm);
    object-fit: cover; flex-shrink: 0;
  }
  .rank-cover-empty {
    width: 32px; height: 32px; border-radius: var(--radius-sm);
    background: var(--tune-grey2, rgba(255,255,255,0.05)); flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 14px;
  }
  .rank-cover-wrap {
    position: relative; flex-shrink: 0; cursor: pointer;
    width: 32px; height: 32px;
  }
  .rank-cover-wrap .rank-cover, .rank-cover-wrap .rank-cover-empty { width: 100%; height: 100%; }
  .rank-play-btn {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.5); color: white; border: none; border-radius: var(--radius-sm);
    font-size: 12px; cursor: pointer; opacity: 0; transition: opacity 0.15s;
  }
  .rank-cover-wrap:hover .rank-play-btn { opacity: 1; }

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
    font-size: 11px; color: var(--tune-text-muted);
    font-family: var(--font-label); text-align: right;
    padding-right: 4px;
  }
  .wh-hour-label {
    font-size: 9px; color: var(--tune-text-muted);
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
  .hourly-h { font-size: 9px; color: white; opacity: 0.7; }

  .bar-list { list-style: none; padding: 0; margin: 0; }
  .bar-list li { display: flex; align-items: center; gap: 0.6rem; padding: 0.3rem 0; }
  .bar-label { width: 80px; font-size: 14px; color: var(--tune-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { flex: 1; height: 8px; background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.1); border-radius: var(--radius-sm); overflow: hidden; }
  .bar-fill { height: 100%; background: var(--tune-accent, #6366f1); border-radius: var(--radius-sm); }
  .bar-value { width: 40px; text-align: right; font-size: 13px; color: var(--tune-text-muted); }

  .streak-card { display: flex; flex-direction: column; }
  .streak-row {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 1rem; margin-top: 0.4rem;
  }
  .streak-num {
    font-size: 42px; font-weight: 800; color: var(--tune-accent, #6366f1);
    line-height: 1; font-variant-numeric: tabular-nums;
  }
  .streak-label { font-size: 14px; color: var(--tune-text-muted); }
  .streak-best { text-align: right; }
  .streak-best-num { font-size: 22px; font-weight: 700; color: var(--tune-text); }
  .streak-best-label { font-size: 12px; color: var(--tune-text-muted); }

  .otd-list { list-style: none; padding: 0; margin: 0.4rem 0 0; }
  .otd-list li { display: flex; gap: 0.6rem; padding: 0.25rem 0; }
  .otd-year {
    font-size: 12px; color: var(--tune-accent);
    font-variant-numeric: tabular-nums; min-width: 38px;
  }
  .otd-title {
    flex: 1; font-size: 14px; color: var(--tune-text);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .otd-sub { color: var(--tune-text-muted); font-size: 12px; }
  .otd-clickable { cursor: pointer; border-radius: 4px; padding: 2px 4px; transition: background 0.15s; }
  .otd-clickable:hover { background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.12); }

  .completion-bar { display: flex; height: 12px; border-radius: var(--radius-md); overflow: hidden; margin-bottom: 0.6rem; }
  .completion-completed { background: #10b981; }
  .completion-skipped { background: #f59e0b; }
  .completion-legend { display: flex; gap: 1.2rem; font-size: 13px; color: var(--tune-text-muted); }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 0.3rem; vertical-align: middle; }
  .dot-completed { background: #10b981; }
  .dot-skipped { background: #f59e0b; }

  .show-more-btn {
    margin-top: 0.5rem;
    background: none;
    border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.3);
    color: var(--tune-text-muted);
    border-radius: 999px;
    padding: 0.3rem 0.8rem;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .show-more-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-text);
  }

  @media (max-width: 700px) {
    .totals { grid-template-columns: repeat(2, 1fr); }
  }
</style>

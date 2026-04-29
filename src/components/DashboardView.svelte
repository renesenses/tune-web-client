<script lang="ts">
  import { onMount } from 'svelte';
  import * as api from '../lib/api';
  import type { DashboardData, DashboardPeriod } from '../lib/api';
  import { t } from '../lib/i18n';

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
                <span class="rank-name">{a.artist_name}</span>
                <span class="rank-meta">{a.plays} · {formatMs(a.listening_ms)}</span>
              </li>
            {/each}
          </ol>
        </div>
      {/if}

      {#if data.top_albums.length > 0}
        <div class="card">
          <h3>{$t('dashboard.section.top_albums')}</h3>
          <ol class="rank-list">
            {#each data.top_albums as a}
              <li>
                <span class="rank-name">{a.album_title}<span class="rank-sub"> — {a.artist_name}</span></span>
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
                <span class="rank-name">{t.title}<span class="rank-sub"> — {t.artist_name}</span></span>
                <span class="rank-meta">{t.plays}</span>
              </li>
            {/each}
          </ol>
        </div>
      {/if}
    </div>

    <!-- Hourly heatmap -->
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
  .rank-list li { display: flex; align-items: baseline; gap: 0.6rem; padding: 0.3rem 0; counter-increment: rank; }
  .rank-list li::before { content: counter(rank); font-size: 0.8rem; color: var(--tune-text-muted); width: 1.5rem; }
  .rank-name { flex: 1; font-size: 0.9rem; color: var(--tune-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rank-sub { color: var(--tune-text-muted); font-size: 0.8rem; }
  .rank-meta { font-size: 0.8rem; color: var(--tune-text-muted); }

  .trend-bars { display: flex; align-items: flex-end; gap: 2px; height: 80px; }
  .trend-bar { flex: 1; min-width: 4px; background: var(--tune-accent, #6366f1); border-radius: 2px 2px 0 0; transition: opacity 0.2s; }
  .trend-bar:hover { opacity: 0.7; }

  .hourly-row { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; }
  .hourly-cell { aspect-ratio: 1; background: var(--tune-accent, #6366f1); border-radius: 3px; display: flex; align-items: center; justify-content: center; }
  .hourly-h { font-size: 0.55rem; color: white; opacity: 0.7; }

  .bar-list { list-style: none; padding: 0; margin: 0; }
  .bar-list li { display: flex; align-items: center; gap: 0.6rem; padding: 0.3rem 0; }
  .bar-label { width: 80px; font-size: 0.85rem; color: var(--tune-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { flex: 1; height: 8px; background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.1); border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; background: var(--tune-accent, #6366f1); border-radius: 4px; }
  .bar-value { width: 40px; text-align: right; font-size: 0.8rem; color: var(--tune-text-muted); }

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

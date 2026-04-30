<script lang="ts">
  import { t } from '../lib/i18n';
  import type { CompletenessStats } from '../lib/types';

  type Filter = 'all' | 'no_cover' | 'no_genre' | 'no_year' | 'no_artist' | 'unknown' | 'duplicates' | 'doubtful';

  interface Props {
    stats: CompletenessStats;
    filter: Filter;
    onFilter: (f: Filter) => void;
  }

  let { stats, filter, onFilter }: Props = $props();

  function pct(missing: number, total: number): string {
    if (total === 0 || missing === 0) return '100';
    return (((total - missing) / total) * 100).toFixed(2);
  }
</script>

<div class="stats-grid">
  <button class="stat-card" class:stat-active={filter === 'no_cover'} onclick={() => onFilter('no_cover')}>
    <div class="stat-header">
      <span class="stat-label">{$t('metadata.cover')}</span>
      <span class="stat-value">{pct(stats.albums_without_cover, stats.total_albums)}%</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width: {pct(stats.albums_without_cover, stats.total_albums)}%"></div>
    </div>
    <span class="stat-detail">{stats.albums_without_cover} / {stats.total_albums} {$t('metadata.missingCovers').toLowerCase()}</span>
  </button>

  <button class="stat-card" class:stat-active={filter === 'no_genre'} onclick={() => onFilter('no_genre')}>
    <div class="stat-header">
      <span class="stat-label">{$t('metadata.genre')}</span>
      <span class="stat-value">{pct(stats.albums_without_genre, stats.total_albums)}%</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width: {pct(stats.albums_without_genre, stats.total_albums)}%"></div>
    </div>
    <span class="stat-detail">{stats.albums_without_genre} / {stats.total_albums} {$t('metadata.missingGenre').toLowerCase()}</span>
  </button>

  <button class="stat-card" class:stat-active={filter === 'no_year'} onclick={() => onFilter('no_year')}>
    <div class="stat-header">
      <span class="stat-label">{$t('metadata.year')}</span>
      <span class="stat-value">{pct(stats.albums_without_year, stats.total_albums)}%</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width: {pct(stats.albums_without_year, stats.total_albums)}%"></div>
    </div>
    <span class="stat-detail">{stats.albums_without_year} / {stats.total_albums} {$t('metadata.missingYear').toLowerCase()}</span>
  </button>

  <button class="stat-card" class:stat-active={filter === 'no_artist'} onclick={() => onFilter('no_artist')}>
    <div class="stat-header">
      <span class="stat-label">{$t('metadata.artist')}</span>
      <span class="stat-value">{pct(stats.tracks_without_artist, stats.total_tracks)}%</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width: {pct(stats.tracks_without_artist, stats.total_tracks)}%"></div>
    </div>
    <span class="stat-detail">{stats.tracks_without_artist} / {stats.total_tracks} {$t('metadata.missingArtist').toLowerCase()}</span>
  </button>
</div>

<style>
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }
  .stat-card {
    background: var(--tune-bg-secondary, rgba(255,255,255,0.04));
    border: 1px solid var(--tune-border, rgba(255,255,255,0.1));
    border-radius: 10px;
    padding: 12px 14px;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .stat-card:hover { border-color: var(--tune-accent, #00bcd4); }
  .stat-active { border-color: var(--tune-accent, #00bcd4); background: rgba(0,188,212,0.08); }
  .stat-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
  .stat-label { font-size: 0.85rem; color: var(--tune-text-secondary, rgba(255,255,255,0.7)); }
  .stat-value { font-size: 1.2rem; font-weight: 600; }
  .progress-bar { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; margin-bottom: 6px; }
  .progress-fill { height: 100%; background: var(--tune-accent, #00bcd4); transition: width 0.3s; }
  .stat-detail { font-size: 0.75rem; color: var(--tune-text-secondary, rgba(255,255,255,0.55)); }
</style>

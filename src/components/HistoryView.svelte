<script lang="ts">
  import { playbackHistory, type HistoryEntry } from '../lib/stores/history';
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import { formatTime, formatAudioBadge } from '../lib/utils';
  import { t } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';

  let playingIndex = $state<number | null>(null);

  let zone = $derived($currentZone);

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "a l'instant";
    if (minutes < 60) return `il y a ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    return `il y a ${days}j`;
  }

  async function replay(entry: HistoryEntry, index: number) {
    if (!zone?.id) {
      notifications.error('Aucune zone selectionnee');
      return;
    }
    playingIndex = index;
    try {
      if (entry.track.id) {
        await playAndSync(zone.id, { track_id: entry.track.id });
        notifications.success(`Lecture : ${entry.track.title}`);
      } else if (entry.track.source && entry.track.source !== 'local' && entry.track.source_id) {
        await playAndSync(zone.id, { source: entry.track.source, source_id: entry.track.source_id });
        notifications.success(`Lecture : ${entry.track.title}`);
      } else {
        const title = entry.track.album_title || entry.track.title;
        if (title) {
          const results = await api.searchLibrary(title);
          if (results.tracks && results.tracks.length > 0) {
            const match = results.tracks.find((t: any) => t.album_id);
            if (match?.album_id) {
              await playAndSync(zone.id, { album_id: match.album_id });
              notifications.success(`Lecture : ${title}`);
              return;
            }
            if (results.tracks[0].id) {
              await playAndSync(zone.id, { track_id: results.tracks[0].id });
              notifications.success(`Lecture : ${results.tracks[0].title}`);
              return;
            }
          }
        }
        if (entry.track.file_path) {
          await playAndSync(zone.id, { file_path: entry.track.file_path });
          notifications.success(`Lecture : ${entry.track.title}`);
        } else {
          notifications.error('Impossible de relancer cette piste');
        }
      }
    } catch (e) {
      console.error('Replay error:', e);
      notifications.error('Erreur de lecture');
    }
    playingIndex = null;
  }
</script>

<div class="history-view">
  <div class="history-header">
    <h2>{$t('history.title')}</h2>
    <span class="history-count">{$playbackHistory.length} {$t('history.plays')}</span>
    {#if $playbackHistory.length > 0}
      <button class="clear-btn" onclick={() => playbackHistory.clear()}>{$t('history.clear')}</button>
    {/if}
  </div>

  {#if $playbackHistory.length === 0}
    <div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
      <p>{$t('history.noHistory')}</p>
    </div>
  {:else}
    <div class="history-list">
      {#each $playbackHistory as entry, i}
        <button class="history-item" class:loading={playingIndex === i} onclick={() => replay(entry, i)}>
          <div class="history-play-icon">
            {#if playingIndex === i}
              <div class="spinner-sm"></div>
            {:else}
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5,3 19,12 5,21" /></svg>
            {/if}
          </div>
          <AlbumArt coverPath={entry.track.cover_path} albumId={entry.track.album_id} size={44} alt={entry.track.title} />
          <div class="history-info">
            <span class="history-title truncate">{entry.track.title}</span>
            <span class="history-artist truncate">{entry.track.artist_name ?? ''}</span>
          </div>
          <div class="history-meta">
            <span class="history-zone truncate">{entry.zoneName}</span>
            <span class="history-time">{relativeTime(entry.playedAt)}</span>
          </div>
          {#if entry.track.format}<span class="audio-format">{formatAudioBadge(entry.track)}</span>{/if}
          <span class="history-duration">{formatTime(entry.track.duration_ms)}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .history-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
  }

  .history-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .history-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  .history-count {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    flex: 1;
  }

  .clear-btn {
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 12px;
    transition: all 0.12s ease-out;
  }

  .clear-btn:hover {
    border-color: var(--tune-warning);
    color: var(--tune-warning);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-2xl);
    color: var(--tune-text-muted);
    text-align: center;
  }

  .empty svg {
    opacity: 0.3;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    overflow-y: auto;
  }

  .history-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 8px 24px;
    background: none;
    border: none;
    border-radius: 0;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease-out;
  }

  .history-item:hover {
    background: var(--tune-surface-hover);
  }

  .history-item.loading {
    opacity: 0.6;
    pointer-events: none;
  }

  .history-play-icon {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--tune-text-muted);
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.12s;
  }

  .history-item:hover .history-play-icon {
    opacity: 1;
    color: var(--tune-accent);
  }

  .history-item.loading .history-play-icon {
    opacity: 1;
  }

  .spinner-sm {
    width: 14px; height: 14px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .history-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .history-title {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
  }

  .history-artist {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
  }

  .history-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }

  .history-zone {
    font-family: var(--font-label);
    font-size: 10px;
    color: var(--tune-text-muted);
    max-width: 100px;
  }

  .history-time {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
  }

  .history-duration {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
    min-width: 36px;
    text-align: right;
  }

  .audio-format {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-text-muted);
    letter-spacing: 0.3px;
    flex-shrink: 0;
  }
</style>

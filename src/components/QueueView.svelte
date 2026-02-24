<script lang="ts">
  import { queueTracks, queuePosition } from '../lib/stores/queue';
  import { currentZone } from '../lib/stores/zones';
  import { currentTrack } from '../lib/stores/nowPlaying';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';

  let zone = $derived($currentZone);
  let track = $derived($currentTrack);

  function isCurrent(index: number): boolean {
    return index === $queuePosition;
  }

  async function playFromPosition(index: number) {
    if (!zone?.id) return;
    try {
      await api.jumpInQueue(zone.id, index);
    } catch (e) {
      console.error('Jump in queue error:', e);
    }
  }

  function formatTime(ms: number | undefined): string {
    if (!ms || ms < 0) return '';
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
</script>

<div class="queue-view">
  <div class="queue-header">
    <h2>File d'attente</h2>
    {#if zone}
      <span class="queue-zone">{zone.name}</span>
    {/if}
    <span class="queue-count">{$queueTracks.length} pistes</span>
  </div>

  {#if $queueTracks.length === 0}
    <div class="empty">
      <p>La file d'attente est vide</p>
    </div>
  {:else}
    <div class="queue-list">
      {#each $queueTracks as queueTrack, index}
        <button class="queue-item" class:current={isCurrent(index)} onclick={() => playFromPosition(index)}>
          {#if isCurrent(index)}
            <span class="current-bar"></span>
          {/if}
          <span class="queue-index">{index + 1}</span>
          <AlbumArt coverPath={queueTrack.cover_path} size={40} alt={queueTrack.title} />
          <div class="queue-info">
            <span class="queue-title truncate">{queueTrack.title}</span>
            <span class="queue-artist truncate">{queueTrack.artist_name ?? ''}</span>
          </div>
          <span class="queue-duration">{formatTime(queueTrack.duration_ms)}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .queue-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 24px;
  }

  .queue-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .queue-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  .queue-zone {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
  }

  .queue-count {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    margin-left: auto;
  }

  .empty {
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    text-align: center;
    padding: var(--space-2xl);
  }

  .queue-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    overflow-y: auto;
  }

  .queue-item {
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
    position: relative;
  }

  .queue-item:hover {
    background: var(--tune-surface-hover);
  }

  .queue-item.current {
    background: rgba(107, 110, 217, 0.08);
  }

  .queue-item.current:hover {
    background: rgba(107, 110, 217, 0.14);
  }

  .current-bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--tune-accent);
    border-radius: 0 2px 2px 0;
  }

  .queue-index {
    width: 28px;
    text-align: center;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .queue-item.current .queue-index {
    color: var(--tune-accent);
  }

  .queue-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .queue-title {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
  }

  .queue-item.current .queue-title {
    color: var(--tune-accent);
  }

  .queue-artist {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
  }

  .queue-duration {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
  }
</style>

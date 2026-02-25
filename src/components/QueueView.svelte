<script lang="ts">
  import { queueTracks, queuePosition } from '../lib/stores/queue';
  import { currentZone } from '../lib/stores/zones';
  import { currentTrack } from '../lib/stores/nowPlaying';
  import * as api from '../lib/api';
  import { formatTime } from '../lib/utils';
  import AlbumArt from './AlbumArt.svelte';

  interface Props {
    onAddToPlaylist?: (trackId: number) => void;
  }
  let { onAddToPlaylist }: Props = $props();

  let zone = $derived($currentZone);
  let track = $derived($currentTrack);

  // Drag state
  let dragIndex = $state<number | null>(null);
  let dropIndex = $state<number | null>(null);

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

  async function removeFromQueue(index: number) {
    if (!zone?.id) return;
    try {
      await api.removeFromQueue(zone.id, index);
    } catch (e) {
      console.error('Remove from queue error:', e);
    }
  }

  function handleDragStart(e: DragEvent, index: number) {
    dragIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    }
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    if (dragIndex !== null && index !== dragIndex) {
      dropIndex = index;
    }
  }

  function handleDragLeave() {
    dropIndex = null;
  }

  async function handleDrop(e: DragEvent, toIndex: number) {
    e.preventDefault();
    const fromIndex = dragIndex;
    dragIndex = null;
    dropIndex = null;

    if (fromIndex === null || fromIndex === toIndex || !zone?.id) return;

    // Optimistic update
    const tracks = [...$queueTracks];
    const [moved] = tracks.splice(fromIndex, 1);
    tracks.splice(toIndex, 0, moved);
    queueTracks.set(tracks);

    // Adjust queue position optimistically
    const pos = $queuePosition;
    let newPos = pos;
    if (fromIndex === pos) {
      newPos = toIndex;
    } else if (fromIndex < pos && toIndex >= pos) {
      newPos = pos - 1;
    } else if (fromIndex > pos && toIndex <= pos) {
      newPos = pos + 1;
    }
    if (newPos !== pos) queuePosition.set(newPos);

    try {
      await api.moveInQueue(zone.id, fromIndex, toIndex);
    } catch (e) {
      console.error('Move in queue error:', e);
      // Refresh on error
      try {
        const qs = await api.getQueue(zone.id);
        queueTracks.set(qs.tracks);
        queuePosition.set(qs.position);
      } catch {}
    }
  }

  function handleDragEnd() {
    dragIndex = null;
    dropIndex = null;
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
        <div
          class="queue-item"
          class:current={isCurrent(index)}
          class:dragging={dragIndex === index}
          class:drop-above={dropIndex === index && dragIndex !== null && dragIndex > index}
          class:drop-below={dropIndex === index && dragIndex !== null && dragIndex < index}
          draggable="true"
          ondragstart={(e) => handleDragStart(e, index)}
          ondragover={(e) => handleDragOver(e, index)}
          ondragleave={handleDragLeave}
          ondrop={(e) => handleDrop(e, index)}
          ondragend={handleDragEnd}
          role="listitem"
        >
          {#if isCurrent(index)}
            <span class="current-bar"></span>
          {/if}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span class="drag-handle" onclick={(e) => e.stopPropagation()}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
              <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
            </svg>
          </span>
          <button class="queue-item-play" onclick={() => playFromPosition(index)}>
            <span class="queue-index">{index + 1}</span>
            <AlbumArt albumId={queueTrack.album_id} size={40} alt={queueTrack.title} />
            <div class="queue-info">
              <span class="queue-title truncate">{queueTrack.title}</span>
              <span class="queue-artist truncate">{queueTrack.artist_name ?? ''}</span>
            </div>
            <span class="queue-duration">{formatTime(queueTrack.duration_ms)}</span>
          </button>
          {#if onAddToPlaylist && queueTrack.id}
            <button class="action-btn playlist-btn" onclick={(e) => { e.stopPropagation(); onAddToPlaylist!(queueTrack.id!); }} title="Ajouter a une playlist">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
          {/if}
          <button class="action-btn remove-btn" onclick={(e) => { e.stopPropagation(); removeFromQueue(index); }} title="Retirer de la file">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
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
    gap: 0;
    padding: 0;
    background: none;
    border: none;
    border-radius: 0;
    color: var(--tune-text);
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

  .queue-item.dragging {
    opacity: 0.4;
  }

  .queue-item.drop-above {
    box-shadow: inset 0 2px 0 0 var(--tune-accent);
  }

  .queue-item.drop-below {
    box-shadow: inset 0 -2px 0 0 var(--tune-accent);
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

  .drag-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    flex-shrink: 0;
    color: var(--tune-text-muted);
    cursor: grab;
    opacity: 0;
    transition: opacity 0.12s;
    padding: 4px 0 4px 8px;
  }

  .queue-item:hover .drag-handle {
    opacity: 0.6;
  }

  .drag-handle:hover {
    opacity: 1 !important;
    color: var(--tune-text);
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .queue-item-play {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 8px 8px 8px 4px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    min-width: 0;
  }

  .queue-index {
    width: 28px;
    text-align: center;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
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
    flex-shrink: 0;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all 0.12s ease-out;
    flex-shrink: 0;
  }

  .queue-item:hover .action-btn {
    opacity: 1;
  }

  .action-btn.playlist-btn:hover {
    color: var(--tune-accent);
  }

  .action-btn.remove-btn {
    margin-right: 8px;
  }

  .action-btn.remove-btn:hover {
    color: var(--tune-warning);
  }
</style>

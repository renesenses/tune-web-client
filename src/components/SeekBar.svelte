<script lang="ts">
  import { currentZone } from '../lib/stores/zones';
  import * as api from '../lib/api';

  interface Props {
    positionMs: number;
    durationMs: number;
    enabled?: boolean;
  }

  let { positionMs = 0, durationMs = 0, enabled = true }: Props = $props();

  let isDragging = $state(false);
  let dragPositionMs = $state(0);

  let zone = $derived($currentZone);

  $effect(() => {
    if (!isDragging) {
      dragPositionMs = positionMs;
    }
  });

  function formatTime(ms: number): string {
    if (!ms || ms < 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function handleClick(e: MouseEvent) {
    if (!enabled || !durationMs || !zone?.id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newPos = Math.floor(pct * durationMs);
    api.seek(zone.id, newPos);
  }

  function handleMouseDown(e: MouseEvent) {
    if (!enabled || !durationMs) return;
    isDragging = true;
    updateDragPosition(e);

    function onMove(ev: MouseEvent) {
      updateDragPosition(ev);
    }

    function onUp() {
      isDragging = false;
      if (zone?.id) {
        api.seek(zone.id, dragPositionMs);
      }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function updateDragPosition(e: MouseEvent) {
    const bar = document.querySelector('.seek-track') as HTMLElement;
    if (!bar || !durationMs) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    dragPositionMs = Math.floor(pct * durationMs);
  }

  let displayPositionMs = $derived(isDragging ? dragPositionMs : positionMs);
  let progress = $derived(durationMs > 0 ? (displayPositionMs / durationMs) * 100 : 0);
</script>

<div class="seek-bar" class:disabled={!enabled}>
  <span class="time">{formatTime(displayPositionMs)}</span>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="seek-track" onclick={handleClick} onmousedown={handleMouseDown}>
    <div class="seek-fill" style="width: {progress}%"></div>
    <div class="seek-thumb" style="left: {progress}%"></div>
  </div>
  <span class="time">{formatTime(durationMs)}</span>
</div>

<style>
  .seek-bar {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
  }

  .seek-bar.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .time {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    min-width: 40px;
    font-variant-numeric: tabular-nums;
  }

  .time:last-child {
    text-align: right;
  }

  .seek-track {
    flex: 1;
    height: 4px;
    background: rgba(77, 78, 81, 0.5);
    border-radius: 2px;
    position: relative;
    cursor: pointer;
  }

  .seek-track:hover {
    height: 6px;
  }

  .seek-fill {
    height: 100%;
    background: var(--tune-accent);
    border-radius: 2px;
    transition: width 0.1s linear;
  }

  .seek-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--tune-accent);
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    opacity: 0;
    transition: opacity 0.2s;
  }

  .seek-track:hover .seek-thumb {
    opacity: 1;
  }
</style>

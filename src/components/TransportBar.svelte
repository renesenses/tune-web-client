<script lang="ts">
  import { currentZone } from '../lib/stores/zones';
  import { currentTrack, playbackState, shuffleEnabled, repeatMode, zoneVolume } from '../lib/stores/nowPlaying';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import type { RepeatMode } from '../lib/types';

  let zone = $derived($currentZone);
  let track = $derived($currentTrack);
  let state = $derived($playbackState);

  async function togglePlayPause() {
    if (!zone?.id) return;
    if (state === 'playing') {
      await api.pause(zone.id);
    } else {
      await api.resume(zone.id);
    }
  }

  async function handlePrevious() {
    if (!zone?.id) return;
    await api.previous(zone.id);
  }

  async function handleNext() {
    if (!zone?.id) return;
    await api.next(zone.id);
  }

  async function toggleShuffle() {
    if (!zone?.id) return;
    const result = await api.setShuffle(zone.id, !$shuffleEnabled);
    shuffleEnabled.set(result.shuffle);
  }

  async function cycleRepeat() {
    if (!zone?.id) return;
    const modes: RepeatMode[] = ['off', 'one', 'all'];
    const idx = modes.indexOf($repeatMode);
    const next = modes[(idx + 1) % modes.length];
    const result = await api.setRepeat(zone.id, next);
    repeatMode.set(result.repeat);
  }

  async function handleVolume(e: Event) {
    if (!zone?.id) return;
    const target = e.target as HTMLInputElement;
    await api.setVolume(zone.id, Number(target.value));
  }
</script>

<div class="transport-bar">
  <div class="transport-left">
    {#if track}
      <AlbumArt albumId={track.album_id} size={56} alt={track.title} />
      <div class="track-mini">
        <span class="mini-title truncate">{track.title}</span>
        <span class="mini-artist truncate">{track.artist_name ?? ''}</span>
      </div>
    {/if}
  </div>

  <div class="transport-controls">
    <button
      class="control-btn small"
      class:active={$shuffleEnabled}
      onclick={toggleShuffle}
      title="Shuffle"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" />
      </svg>
    </button>

    <button
      class="control-btn"
      disabled={state === 'stopped'}
      onclick={handlePrevious}
      title="Precedent"
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
      </svg>
    </button>

    <button
      class="control-btn play-btn"
      onclick={togglePlayPause}
      title={state === 'playing' ? 'Pause' : 'Lecture'}
    >
      {#if state === 'playing'}
        <svg viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      {/if}
    </button>

    <button
      class="control-btn"
      disabled={state === 'stopped'}
      onclick={handleNext}
      title="Suivant"
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z" />
      </svg>
    </button>

    <button
      class="control-btn small"
      class:active={$repeatMode !== 'off'}
      onclick={cycleRepeat}
      title="Repeter"
    >
      {#if $repeatMode === 'one'}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
          <text x="12" y="14" text-anchor="middle" font-size="8" fill="currentColor" stroke="none" font-weight="bold">1</text>
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      {/if}
    </button>
  </div>

  <div class="transport-right">
    <div class="volume-control">
      <button class="volume-btn" title="Volume">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      </button>
      <input
        type="range"
        class="volume-slider"
        min="0"
        max="1"
        step="0.01"
        value={$zoneVolume}
        oninput={handleVolume}
      />
      <span class="volume-value">{Math.round($zoneVolume * 100)}</span>
    </div>
  </div>
</div>

<style>
  .transport-bar {
    grid-column: 1 / -1;
    grid-row: 2;
    background: var(--tune-footer);
    border-top: 1px solid var(--tune-border);
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0 var(--space-lg);
    gap: var(--space-lg);
  }

  .transport-left {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    min-width: 0;
  }

  .track-mini {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .mini-title {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    color: var(--tune-text);
  }

  .mini-artist {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
  }

  .transport-controls {
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .control-btn {
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    padding: 0;
    border-radius: 50%;
    transition: all 0.12s ease-out;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
  }

  .control-btn svg {
    width: 20px;
    height: 20px;
  }

  .control-btn:hover:not(:disabled) {
    background: var(--tune-surface-hover);
  }

  .control-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .control-btn.small {
    width: 32px;
    height: 32px;
    opacity: 0.5;
  }

  .control-btn.small svg {
    width: 16px;
    height: 16px;
  }

  .control-btn.small.active {
    opacity: 1;
    color: var(--tune-accent);
  }

  .play-btn {
    background: var(--tune-accent) !important;
    color: white !important;
    width: 44px;
    height: 44px;
  }

  .play-btn svg {
    width: 22px;
    height: 22px;
  }

  .play-btn:hover {
    background: var(--tune-accent-hover) !important;
  }

  .transport-right {
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }

  .volume-control {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .volume-btn {
    background: none;
    border: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: color 0.12s ease-out;
  }

  .volume-btn:hover {
    color: var(--tune-text);
  }

  .volume-btn svg {
    width: 18px;
    height: 18px;
  }

  .volume-slider {
    width: 100px;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--tune-border);
    border-radius: 2px;
    outline: none;
  }

  .volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--tune-accent);
    cursor: pointer;
  }

  .volume-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--tune-accent);
    border: none;
    cursor: pointer;
  }

  .volume-value {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    min-width: 24px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 768px) {
    .transport-bar {
      grid-template-columns: 1fr;
      padding: var(--space-sm) var(--space-md);
    }

    .transport-left,
    .transport-right {
      display: none;
    }
  }
</style>

<script lang="ts">
  import { zones, currentZone, currentZoneId } from '../lib/stores/zones';
  import { currentTrack, playbackState, shuffleEnabled, repeatMode } from '../lib/stores/nowPlaying';
  import { ytPlayerState, ytLoading, pauseVideo, resumeVideo } from '../lib/stores/ytPlayer';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import VolumeControl from './VolumeControl.svelte';
  import { t } from '../lib/i18n';
  import type { RepeatMode } from '../lib/types';
  import { activeView } from '../lib/stores/navigation';

  let zone = $derived($currentZone);
  let track = $derived($currentTrack);
  let state = $derived($playbackState);
  let showZoneDropdown = $state(false);

  // YouTube IFrame state — for badge display and fallback when no zone
  let ytActive = $derived($ytPlayerState.active);
  let ytPlaying = $derived($ytPlayerState.playing);
  let ytTrack = $derived($ytPlayerState.track);
  // True while yt-dlp is resolving the audio URL (before DLNA zone starts)
  let ytLoadingState = $derived($ytLoading);

  // Show zone track when available; fall back to IFrame track while yt-dlp is loading
  let displayTrack = $derived(track ?? (ytActive ? ytTrack : null));
  let isPlaying = $derived(state === 'playing' || (ytActive && ytPlaying && state === 'stopped'));

  async function togglePlayPause() {
    if (zone?.id && state !== 'stopped') {
      // Zone has an active track — backend controls DLNA, WS events will sync IFrame
      if (ytActive) ytLoading.set(true);
      if (state === 'playing') await api.pause(zone.id);
      else await api.resume(zone.id);
    } else if (zone?.id && state === 'stopped' && track) {
      // Zone stopped but has a current track (e.g. DLNA write failed) — resume playback
      await api.play(zone.id);
    } else if (zone?.id && state === 'stopped' && ytActive && ytTrack?.source_id) {
      // Zone stopped but IFrame has a YT track — restart via API
      ytLoading.set(true);
      await api.play(zone.id, { source: ytTrack.source as any, source_id: ytTrack.source_id });
    } else if (ytActive) {
      // No zone at all — control IFrame directly as fallback
      if (ytPlaying) pauseVideo(); else resumeVideo();
    }
  }

  async function handlePrevious() {
    if (!zone?.id) return;
    if (ytActive) ytLoading.set(true);
    await api.previous(zone.id);
  }

  async function handleNext() {
    if (!zone?.id) return;
    if (ytActive) ytLoading.set(true);
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
</script>

<div class="transport-bar">
  <div class="transport-left">
    {#if displayTrack}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="track-mini-clickable" onclick={() => activeView.set('nowplaying')}>
        <AlbumArt coverPath={displayTrack.cover_path} albumId={displayTrack.album_id} size={56} alt={displayTrack.title} />
        <div class="track-mini">
          <span class="mini-title truncate">
            {displayTrack.title}
            {#if displayTrack.source === 'radio'}
              <span class="live-badge"><span class="live-dot"></span>LIVE</span>
            {/if}
          </span>
          <span class="mini-artist truncate">
            {#if ytActive}<span class="yt-badge">YT</span>{/if}
            {#if displayTrack.source === 'radio'}
              <span class="radio-antenna">&#x1F4E1;</span>
              {displayTrack.album_title || 'Live Radio'}
            {:else}
              {displayTrack.artist_name ?? ''}
            {/if}
          </span>
        </div>
      </div>
    {/if}
  </div>

  <div class="transport-controls">
    <button
      class="control-btn small"
      class:active={$shuffleEnabled}
      onclick={toggleShuffle}
      title={$t('transport.shuffle')}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" />
      </svg>
    </button>

    <button
      class="control-btn"
      disabled={state === 'stopped' && !ytActive && !track}
      onclick={handlePrevious}
      title={$t('transport.previous')}
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
      </svg>
    </button>

    <button
      class="control-btn play-btn"
      class:loading={ytLoadingState}
      onclick={togglePlayPause}
      title={isPlaying ? $t('common.pause') : $t('common.play')}
    >
      {#if ytLoadingState}
        <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="9" stroke-opacity="0.25" />
          <path d="M12 3a9 9 0 0 1 9 9" />
        </svg>
      {:else if isPlaying}
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
      disabled={state === 'stopped' && !ytActive && !track}
      onclick={handleNext}
      title={$t('transport.next')}
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z" />
      </svg>
    </button>

    <button
      class="control-btn small"
      class:active={$repeatMode !== 'off'}
      onclick={cycleRepeat}
      title={$t('transport.repeat')}
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
    <div class="zone-selector">
      <button class="zone-selector-btn" onclick={() => showZoneDropdown = !showZoneDropdown} title={$t('zone.switchZone')}>
        <span class="truncate">{zone?.name ?? $t('zone.noZone')}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {#if showZoneDropdown}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="zone-dropdown-backdrop" onclick={() => showZoneDropdown = false}></div>
        <div class="zone-dropdown">
          {#each $zones as z}
            <button
              class="zone-dropdown-item"
              class:active={z.id === $currentZoneId}
              onclick={() => { if (z.id !== null) currentZoneId.set(z.id); showZoneDropdown = false; }}
            >
              <span class="truncate">{z.name}</span>
              {#if z.state === 'playing'}
                <span class="zone-playing-indicator">
                  <svg viewBox="0 0 10 12" fill="currentColor" width="8" height="10"><polygon points="0,0 10,6 0,12" /></svg>
                </span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <VolumeControl />
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

  .track-mini-clickable {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    min-width: 0;
    cursor: pointer;
    border-radius: var(--radius-md);
    padding: 4px;
    margin: -4px;
    transition: background 0.12s ease-out;
  }

  .track-mini-clickable:hover {
    background: var(--tune-surface-hover);
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
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .yt-badge {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    background: #ff0000;
    color: white;
    flex-shrink: 0;
    letter-spacing: 0.3px;
  }

  .live-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-label);
    font-size: 9px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 3px;
    background: var(--tune-warning);
    color: white;
    flex-shrink: 0;
    letter-spacing: 0.5px;
    margin-left: 6px;
    vertical-align: middle;
  }

  .live-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: white;
    animation: live-pulse 1.5s ease-in-out infinite;
  }

  @keyframes live-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .radio-antenna {
    font-size: 11px;
    flex-shrink: 0;
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

  .play-btn.loading {
    opacity: 0.8;
    cursor: wait;
  }

  .spin {
    animation: spin-anim 0.8s linear infinite;
  }

  @keyframes spin-anim {
    to { transform: rotate(360deg); }
  }

  .transport-right {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--space-md);
  }

  .zone-selector {
    position: relative;
  }

  .zone-selector-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    padding: 4px 10px;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 12px;
    max-width: 140px;
    transition: all 0.12s ease-out;
  }

  .zone-selector-btn:hover {
    border-color: var(--tune-text-muted);
    color: var(--tune-text);
  }

  .zone-dropdown-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .zone-dropdown {
    position: absolute;
    bottom: calc(100% + 6px);
    right: 0;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    min-width: 180px;
    max-height: 240px;
    overflow-y: auto;
    z-index: 100;
    display: flex;
    flex-direction: column;
    padding: 4px 0;
  }

  .zone-dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    padding: 8px 14px;
    background: none;
    border: none;
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .zone-dropdown-item:hover {
    background: var(--tune-surface-hover);
    color: var(--tune-text);
  }

  .zone-dropdown-item.active {
    color: var(--tune-accent);
  }

  .zone-playing-indicator {
    color: var(--tune-success);
    display: flex;
    align-items: center;
    flex-shrink: 0;
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

<script lang="ts">
  import { zones, currentZone, currentZoneId } from '../lib/stores/zones';
  import { currentTrack, playbackState, shuffleEnabled, repeatMode, seekPositionMs } from '../lib/stores/nowPlaying';
  import { ytPlayerState, ytLoading, pauseVideo, resumeVideo } from '../lib/stores/ytPlayer';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import VolumeControl from './VolumeControl.svelte';
  import { t } from '../lib/i18n';
  import type { RepeatMode } from '../lib/types';
  import { activeView, mobileNowPlayingOpen } from '../lib/stores/navigation';

  let isFavorite = $state(false);
  let favChecking = $state(false);

  // Check if current radio track is a favorite
  $effect(() => {
    const track = $currentTrack;
    if (track?.source === 'radio' && track.title && track.artist_name) {
      checkFavorite(track.title, track.artist_name);
    } else {
      isFavorite = false;
    }
  });

  async function checkFavorite(title: string, artist: string) {
    try {
      const res = await api.apiFetch(`/radio-favorites/is-favorite?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`);
      isFavorite = res.is_favorite;
    } catch { isFavorite = false; }
  }

  async function toggleFavorite() {
    if (favChecking) return;
    favChecking = true;
    try {
      if (isFavorite) {
        // Find and delete
        const favs = await api.apiFetch('/radio-favorites?limit=500');
        const track = $currentTrack;
        const match = favs.find((f: any) => f.title === track?.title && f.artist === track?.artist_name);
        if (match) await api.apiDelete(`/radio-favorites/${match.id}`);
        isFavorite = false;
      } else {
        await api.apiPost('/radio-favorites/save-current');
        isFavorite = true;
      }
    } catch {}
    favChecking = false;
  }

  function handleBarClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.control-btn')) return;
    if ((e.target as HTMLElement).closest('.zone-dropdown')) return;
    if (window.innerWidth <= 768) {
      mobileNowPlayingOpen.set(true);
    }
  }

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

  let showSignalPath = $state(false);

  const detailTranslations: Record<string, string> = {
    'Renderer fetches audio directly from source — zero processing': 'signal.directUrlDetail',
    'DSD stream served bit-perfect to DSD-capable renderer': 'signal.nativeDsdDetail',
    'Native format streamed without re-encoding': 'signal.filePassthroughDetail',
    'Local file': 'signal.localFile',
    'Live radio stream': 'signal.liveRadio',
    'Network': 'signal.network',
    'Dlna': 'DLNA',
    'Local': 'Local',
    'Airplay': 'AirPlay',
  };

  const descTranslations: Record<string, string> = {
    'Direct URL Passthrough': 'signal.directUrl',
    'Native DSD Passthrough': 'signal.nativeDsd',
    'File Passthrough': 'signal.filePassthrough',
  };

  function trDetail(text: string | null | undefined): string {
    if (!text) return '';
    const key = detailTranslations[text];
    if (key && key.startsWith('signal.')) return $t(key as any);
    if (key) return key;
    return text;
  }

  function trDesc(text: string): string {
    const key = descTranslations[text];
    if (key) return $t(key as any);
    // Translate "Streaming CDN (Tidal)" etc.
    if (text.startsWith('Streaming CDN')) return text.replace('Streaming CDN', $t('signal.streamingCdn' as any));
    return text;
  }

  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  let progressPercent = $derived(
    displayTrack?.duration_ms ? Math.min(100, ($seekPositionMs / displayTrack.duration_ms) * 100) : 0
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="transport-bar" onclick={handleBarClick}>
  {#if displayTrack && displayTrack.source !== 'radio' && displayTrack.duration_ms}
    <div class="transport-progress">
      <span class="progress-time">{formatTime($seekPositionMs)}</span>
      <div class="progress-track">
        <div class="progress-fill" style="width: {progressPercent}%"></div>
      </div>
      <span class="progress-time">{formatTime(displayTrack.duration_ms)}</span>
    </div>
  {/if}
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
              {displayTrack.artist_name && displayTrack.artist_name !== displayTrack.album_title
                ? displayTrack.artist_name
                : displayTrack.album_title || 'Live Radio'}
              <span class="radio-station-sep">·</span>
              <span class="radio-antenna">&#x1F4E1;</span>{displayTrack.album_title || 'Radio'}
            {:else}
              {displayTrack.artist_name ?? ''}
            {/if}
          </span>
        </div>
      </div>
      {#if displayTrack.source === 'radio'}
        <button class="fav-btn control-btn" class:is-fav={isFavorite} onclick={toggleFavorite} title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
          <svg viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      {/if}
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
    <button class="signal-dot-btn" class:bit-perfect={zone?.signal_path?.bit_perfect} class:visible={zone?.signal_path && zone.state === 'playing'} onclick={(e) => { e.stopPropagation(); if (zone?.signal_path) showSignalPath = !showSignalPath; }} title="{zone?.signal_path?.summary ?? ''}">
      <span class="signal-dot-indicator"></span>
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

{#if showSignalPath && zone?.signal_path}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="sp-overlay" onclick={() => showSignalPath = false}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="sp-card" onclick={(e) => e.stopPropagation()}>
      <div class="sp-header">
        <h3>{$t('signal.title')} : <span class:sp-good={zone.signal_path.bit_perfect} class:sp-lossy={!zone.signal_path.bit_perfect}>{zone.signal_path.bit_perfect ? $t('signal.lossless') : $t('signal.lossy')}</span></h3>
        <button class="sp-x" onclick={() => showSignalPath = false}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <div class="sp-body">
        {#each zone.signal_path.steps as step, i}
          <div class="sp-row">
            <div class="sp-icon-col">
              <div class="sp-icon" class:bp={zone.signal_path.bit_perfect}>
                {#if step.stage === 'source'}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /><line x1="12" y1="2" x2="12" y2="5" /></svg>
                {:else if step.stage === 'transport' || step.stage === 'decode'}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 010 14.14" /><path d="M15.54 8.46a5 5 0 010 7.07" /></svg>
                {/if}
              </div>
              {#if i < zone.signal_path.steps.length - 1}
                <div class="sp-line" class:bp={zone.signal_path.bit_perfect}></div>
              {/if}
            </div>
            <div class="sp-info">
              <span class="sp-name">{trDesc(step.description)} <span class="sp-ndot" class:bp={zone.signal_path.bit_perfect}></span></span>
              {#if step.sample_rate}
                <span class="sp-detail">{step.format} {step.sample_rate/1000}kHz {step.channels}ch {step.bit_depth}bit</span>
              {:else if step.detail}
                <span class="sp-detail">{trDetail(step.detail)}</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      {#if zone.signal_path.checksum}
        <div class="sp-checksum">
          <span class="sp-cs-icon" class:verified={zone.signal_path.checksum_verified}>
            {#if zone.signal_path.checksum_verified}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            {/if}
          </span>
          <span class="sp-cs-text">
            {$t('signal.checksum')} : <code>{zone.signal_path.checksum.substring(0, 12)}...</code>
            {#if zone.signal_path.checksum_verified}
              <span class="sp-cs-ok">{$t('signal.verified')}</span>
            {/if}
          </span>
        </div>
      {/if}

      {#if zone.signal_path.decisions && zone.signal_path.decisions.length > 0}
        <details class="sp-decisions">
          <summary>{$t('signal.decisions')} ({zone.signal_path.decisions.length})</summary>
          <ul>
            {#each zone.signal_path.decisions as d}
              <li>{d}</li>
            {/each}
          </ul>
        </details>
      {/if}
    </div>
  </div>
{/if}

<style>
  .transport-bar {
    grid-column: 1 / -1;
    grid-row: 2;
    background: var(--tune-footer);
    border-top: 1px solid var(--tune-border);
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 4px var(--space-lg) 0;
    gap: 2px var(--space-lg);
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
    opacity: 0.6;
  }

  .radio-station-sep {
    margin: 0 4px;
    opacity: 0.4;
  }

  .fav-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    margin-left: 4px;
    flex-shrink: 0;
    transition: color 0.2s, transform 0.15s;
  }

  .fav-btn:hover {
    color: var(--tune-text);
    transform: scale(1.15);
  }

  .fav-btn.is-fav {
    color: #e74c6f;
  }

  .transport-controls {
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .transport-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    grid-column: 1 / -1;
    padding: 0 16px;
  }

  .progress-time {
    font-size: 11px;
    color: var(--tune-text-secondary, #888);
    min-width: 36px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .progress-track {
    flex: 1;
    height: 18px;
    background: transparent;
    position: relative;
    display: flex;
    align-items: center;
  }

  .progress-track::before {
    content: '';
    position: absolute;
    left: 0; right: 0;
    height: 4px;
    background: var(--tune-border, #333);
    border-radius: 2px;
  }

  .progress-track:hover::before {
    height: 6px;
  }

  .progress-fill {
    height: 4px;
    background: var(--tune-accent, #7c3aed);
    border-radius: 2px;
    position: relative;
    z-index: 1;
  }

  .progress-track:hover .progress-fill {
    height: 6px;
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

  .signal-dot-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s;
  }

  .signal-dot-btn.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .signal-dot-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #f59e0b;
    box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
    transition: background 0.3s, box-shadow 0.3s, transform 0.15s;
  }

  .signal-dot-btn.bit-perfect .signal-dot-indicator {
    background: #4ade80;
    box-shadow: 0 0 6px rgba(74, 222, 128, 0.5);
  }

  .signal-dot-btn:hover .signal-dot-indicator {
    transform: scale(1.3);
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

  /* Signal Path Modal */
  .sp-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: spIn 0.15s ease-out;
  }
  @keyframes spIn { from { opacity: 0; } to { opacity: 1; } }

  .sp-card {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 12px;
    width: 340px;
    max-height: 80vh;
    overflow-y: auto;
    animation: spUp 0.2s ease-out;
  }
  @keyframes spUp { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  .sp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--tune-border);
  }
  .sp-header h3 {
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 400;
    color: var(--tune-text);
    margin: 0;
  }
  .sp-good { color: #4ade80; font-weight: 600; }
  .sp-lossy { color: #f59e0b; font-weight: 600; }
  .sp-x {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    display: flex;
  }
  .sp-x:hover { color: var(--tune-text); }

  .sp-body { padding: 16px 20px 20px; }

  .sp-row { display: flex; gap: 14px; }

  .sp-icon-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 36px;
    flex-shrink: 0;
  }

  .sp-icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(245, 158, 11, 0.1);
    border: 1.5px solid rgba(245, 158, 11, 0.3);
    color: #f59e0b;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .sp-icon.bp {
    background: rgba(74, 222, 128, 0.1);
    border-color: rgba(74, 222, 128, 0.3);
    color: #4ade80;
  }

  .sp-line {
    width: 2px;
    flex: 1;
    min-height: 16px;
    background: rgba(245, 158, 11, 0.25);
    margin: 4px 0;
  }
  .sp-line.bp { background: rgba(74, 222, 128, 0.25); }

  .sp-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 6px;
    padding-bottom: 8px;
    min-width: 0;
  }

  .sp-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 500;
    color: var(--tune-text);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sp-ndot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #f59e0b;
    flex-shrink: 0;
  }
  .sp-ndot.bp { background: #4ade80; }

  .sp-detail {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-accent);
  }

  .sp-checksum {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--tune-border);
  }
  .sp-cs-icon { display: flex; color: var(--tune-text-muted); }
  .sp-cs-icon.verified { color: #4ade80; }
  .sp-cs-text {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
  }
  .sp-cs-text code {
    background: rgba(255,255,255,0.06);
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 10px;
  }
  .sp-cs-ok {
    color: #4ade80;
    font-weight: 600;
    margin-left: 4px;
  }

  .sp-decisions {
    margin-top: 8px;
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
  }
  .sp-decisions summary {
    cursor: pointer;
    padding: 4px 0;
  }
  .sp-decisions summary:hover { color: var(--tune-text); }
  .sp-decisions ul {
    margin: 4px 0 0 0;
    padding-left: 16px;
    list-style: none;
  }
  .sp-decisions li {
    padding: 2px 0;
    font-size: 10px;
    font-family: monospace;
    color: var(--tune-text-muted);
  }
  .sp-decisions li::before {
    content: "→ ";
    color: var(--tune-accent);
  }

  @media (max-width: 768px) {
    .transport-bar {
      grid-template-columns: 1fr auto;
      padding: var(--space-xs) var(--space-md);
      gap: var(--space-sm);
      height: var(--mini-player-height);
      cursor: pointer;
      margin-bottom: var(--tab-bar-height);
    }

    .transport-left {
      display: flex;
      min-width: 0;
    }

    .transport-left :global(.album-art) {
      width: 40px !important;
      height: 40px !important;
      min-width: 40px !important;
      min-height: 40px !important;
    }

    .transport-controls {
      gap: 4px;
    }

    /* Mini-player: seulement play/pause + next */
    .transport-controls .control-btn.small { display: none; }

    .transport-controls .play-btn {
      width: 36px;
      height: 36px;
    }

    .transport-controls .play-btn svg {
      width: 18px;
      height: 18px;
    }

    .transport-right {
      display: none;
    }
  }
</style>

<script lang="ts">
  import { currentZone } from '../lib/stores/zones';
  import { seekPositionMs, currentTrack, playbackState, shuffleEnabled, repeatMode } from '../lib/stores/nowPlaying';
  import { upNextTracks } from '../lib/stores/queue';
  import { formatTime, formatAudioBadge } from '../lib/utils';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import SeekBar from './SeekBar.svelte';
  import { t } from '../lib/i18n';
  import type { RepeatMode, Track } from '../lib/types';
  import { ytPlayerState, ytVideoRect, showYTVideo, hideYTVideo } from '../lib/stores/ytPlayer';
  import { onDestroy } from 'svelte';

  interface Props {
    onAddToPlaylist?: (track: Track) => void;
  }
  let { onAddToPlaylist }: Props = $props();

  let zone = $derived($currentZone);
  let track = $derived($currentTrack);
  let state = $derived($playbackState);
  let isRadio = $derived(track?.source === 'radio' || (track == null && $ytPlayerState.track?.source === 'radio'));

  // Fallback to ytPlayer track when zone has no current_track (yt-dlp loading phase)
  let ytState = $derived($ytPlayerState);
  let displayTrack = $derived(track ?? (ytState.active ? ytState.track : null));
  // Zone playing OR IFrame playing while yt-dlp loads
  let isEffectivePlaying = $derived(
    state === 'playing' || (ytState.active && ytState.playing && state === 'stopped')
  );

  let containerWidth = $state(0);
  let isWide = $derived(containerWidth > 700);

  // YouTube video overlay
  let artworkEl = $state<HTMLElement | null>(null);
  let ytActive = $derived(ytState.active && displayTrack?.source === 'youtube');
  let ytShowVideo = $derived(ytState.showVideo);

  function handleShowVideo() {
    if (!artworkEl) return;
    const rect = artworkEl.getBoundingClientRect();
    showYTVideo({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  }

  onDestroy(() => {
    hideYTVideo();
  });

  // Resolve cover path for blurred background
  let resolvedCoverUrl = $state('');
  $effect(() => {
    if (displayTrack?.cover_path) {
      resolvedCoverUrl = api.artworkUrl(displayTrack.cover_path);
    } else if (displayTrack?.album_id) {
      api.getAlbumCoverPath(displayTrack.album_id).then((path) => {
        resolvedCoverUrl = path ? api.artworkUrl(path) : '';
      });
    } else {
      resolvedCoverUrl = '';
    }
  });

  // Recording state
  let isRecording = $state(false);

  async function toggleRecording() {
    if (!zone?.id) return;
    try {
      if (isRecording) {
        await api.stopRecording(zone.id);
        isRecording = false;
      } else {
        await api.startRecording(zone.id);
        isRecording = true;
      }
    } catch (e) {
      console.error('Toggle recording error:', e);
    }
  }

  // Check recording status on zone change
  $effect(() => {
    if (zone?.id) {
      api.getRecordingStatus(zone.id).then(s => {
        isRecording = s.state === 'recording';
      }).catch(() => {});
    }
  });

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

  async function jumpToUpNext(trackItem: Track, index: number) {
    if (!zone?.id) return;
    try {
      // upNext starts at queuePosition + 1, so real index is queuePosition + 1 + index
      const { queuePosition } = await import('../lib/stores/queue');
      const { get } = await import('svelte/store');
      const pos = get(queuePosition);
      await api.jumpInQueue(zone.id, pos + 1 + index);
    } catch (e) {
      console.error('Jump to up next error:', e);
    }
  }
</script>

<div class="now-playing" class:wide={isWide} bind:clientWidth={containerWidth}>
  {#if resolvedCoverUrl}
    <div class="bg-blur" style="background-image: url({resolvedCoverUrl})"></div>
  {/if}

  {#if zone && displayTrack}
    <div class="content-layout" class:wide={isWide}>
      <div class="artwork-container" bind:this={artworkEl}>
        {#if ytShowVideo}
          <!-- Placeholder keeping layout while IFrame is rendered on top via position:fixed -->
          <div class="yt-placeholder"></div>
        {:else}
          <AlbumArt coverPath={displayTrack.cover_path} albumId={displayTrack.album_id} size={isWide ? 360 : 400} alt={displayTrack.title} />
          {#if ytActive}
            <button class="eye-btn" onclick={handleShowVideo} title={$t('youtube.showVideo')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          {/if}
        {/if}
        {#if isRadio}
          <div class="art-live-badge"><span class="art-live-dot"></span>LIVE</div>
        {/if}
      </div>

      <div class="info-column">
        <div class="track-info" class:center={!isWide}>
          {#if isRadio}
            <div class="radio-live-label">
              <svg class="radio-antenna-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
                <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" />
                <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" />
                <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
                <circle cx="12" cy="12" r="2" fill="currentColor" />
              </svg>
              EN DIRECT
            </div>
            <p class="radio-station-name truncate">{displayTrack.album_title || zone?.name || 'Radio'}</p>
          {/if}
          <h2 class="track-title truncate">{displayTrack.title}</h2>
          {#if displayTrack.artist_name && displayTrack.artist_name !== 'Radio'}
            <p class="track-artist truncate">{displayTrack.artist_name}</p>
          {:else if !isRadio && displayTrack.artist_name}
            <p class="track-artist truncate">{displayTrack.artist_name}</p>
          {/if}
          {#if !isRadio && displayTrack.album_title}
            <p class="track-album truncate">{displayTrack.album_title}</p>
          {/if}
          {#if displayTrack.format || displayTrack.sample_rate || displayTrack.bit_depth}
            <p class="audio-badge">{formatAudioBadge(displayTrack)}</p>
          {/if}
        </div>

        {#if !isRadio}
        <div class="seek-container">
          <SeekBar
            positionMs={$seekPositionMs}
            durationMs={displayTrack.duration_ms ?? 0}
            enabled={isEffectivePlaying}
          />
        </div>
        {/if}

        <!-- Settings row: shuffle, repeat -->
        <div class="settings-row" class:center={!isWide}>
          <button class="setting-btn" class:active={$shuffleEnabled} onclick={toggleShuffle} title={$t('transport.shuffle')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" />
            </svg>
          </button>
          <button class="setting-btn" class:active={$repeatMode !== 'off'} onclick={cycleRepeat} title={$t('transport.repeat')}>
            {#if $repeatMode === 'one'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                <text x="12" y="14" text-anchor="middle" font-size="8" fill="currentColor" stroke="none" font-weight="bold">1</text>
              </svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            {/if}
          </button>

          <button class="setting-btn record-btn" class:recording={isRecording} onclick={toggleRecording} title={isRecording ? 'Arrêter l\'enregistrement' : 'Enregistrer'}>
            <span class="rec-circle" class:active={isRecording}></span>
          </button>

          {#if onAddToPlaylist && (displayTrack?.id || displayTrack?.source_id)}
            <button class="setting-btn" onclick={() => onAddToPlaylist!(displayTrack!)} title={$t('nowplaying.addToPlaylist')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" /><line x1="16" y1="3" x2="16" y2="11" /><line x1="12" y1="7" x2="20" y2="7" />
              </svg>
            </button>
          {/if}

          <div class="setting-spacer"></div>

          <span class="zone-label">{zone.name}</span>
          <span class="playback-indicator" class:playing={isEffectivePlaying} class:paused={state === 'paused' && !isEffectivePlaying}>
            {#if isEffectivePlaying}
              <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M8 5v14l11-7z" /></svg>
            {:else if state === 'paused'}
              <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
            {/if}
          </span>
        </div>

        <!-- Up Next -->
        {#if $upNextTracks.length > 0}
          <div class="up-next">
            <span class="up-next-label">{$t('nowplaying.upNext')}</span>
            <div class="up-next-list">
              {#each $upNextTracks as nextTrack, i}
                <button class="up-next-item" onclick={() => jumpToUpNext(nextTrack, i)}>
                  <AlbumArt coverPath={nextTrack.cover_path} albumId={nextTrack.album_id} size={32} alt={nextTrack.title} />
                  <div class="up-next-info">
                    <span class="up-next-title truncate">{nextTrack.title}</span>
                    <span class="up-next-artist truncate">{nextTrack.artist_name ?? ''}</span>
                  </div>
                  <span class="up-next-duration">{formatTime(nextTrack.duration_ms)}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64">
          <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      </div>
      <p>{$t('nowplaying.noPlayback')}</p>
      {#if !zone}
        <p class="hint">{$t('nowplaying.waitingServer')}</p>
      {/if}
    </div>
  {/if}
</div>

<!-- Video controls rendered in root stacking context (z-index > IFrame) -->
{#if ytShowVideo && $ytVideoRect}
  <div
    class="yt-video-controls-fixed"
    style="bottom: {window.innerHeight - $ytVideoRect.top - $ytVideoRect.height + 10}px; right: {window.innerWidth - $ytVideoRect.left - $ytVideoRect.width + 10}px;"
  >
    <button class="yt-ctrl-btn" onclick={hideYTVideo} title={$t('youtube.hideVideo')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    </button>
    {#if $ytPlayerState.videoId}
      <a
        class="yt-ctrl-btn"
        href="https://www.youtube.com/watch?v={$ytPlayerState.videoId}"
        target="_blank"
        rel="noopener noreferrer"
        title={$t('youtube.openOnYouTube')}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      </a>
    {/if}
  </div>
{/if}

<style>
  .now-playing {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: var(--space-xl);
    position: relative;
    overflow: hidden;
  }

  .bg-blur {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    filter: blur(60px) brightness(0.3);
    transform: scale(1.2);
    z-index: 0;
    transition: background-image 1s ease-in-out;
  }

  .content-layout {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-lg);
    max-width: 600px;
    width: 100%;
    position: relative;
    z-index: 1;
  }

  .content-layout.wide {
    flex-direction: row;
    align-items: flex-start;
    gap: 40px;
    max-width: 960px;
  }

  .artwork-container {
    width: 100%;
    max-width: 400px;
    aspect-ratio: 1;
    flex-shrink: 0;
    position: relative;
  }

  .content-layout.wide .artwork-container {
    max-width: 360px;
  }

  .artwork-container :global(.album-art) {
    width: 100% !important;
    height: 100% !important;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }

  /* Eye button — visible on hover over artwork */
  .eye-btn {
    position: absolute;
    bottom: 10px;
    right: 10px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s ease-out, background 0.12s;
    backdrop-filter: blur(4px);
  }

  .artwork-container:hover .eye-btn {
    opacity: 1;
  }

  .eye-btn:hover {
    background: rgba(0, 0, 0, 0.8);
  }

  /* Placeholder shown when IFrame is overlaid (keeps layout intact) */
  .yt-placeholder {
    width: 100%;
    height: 100%;
    border-radius: var(--radius-lg);
    background: #000;
    position: relative;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }

  /* Controls fixed above the IFrame (in root stacking context) */
  .yt-video-controls-fixed {
    position: fixed;
    display: flex;
    gap: 6px;
    z-index: 201;
  }

  .yt-ctrl-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    transition: background 0.12s;
    backdrop-filter: blur(4px);
  }

  .yt-ctrl-btn:hover {
    background: rgba(0, 0, 0, 0.9);
  }

  .info-column {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    width: 100%;
  }

  .content-layout.wide .info-column {
    max-width: 420px;
  }

  .track-info {
    width: 100%;
  }

  .track-info.center {
    text-align: center;
  }

  .track-title {
    font-family: var(--font-display);
    font-size: 36px;
    font-weight: 600;
    color: var(--tune-text);
    margin-bottom: var(--space-xs);
    line-height: 1.15;
  }

  .track-artist {
    font-family: var(--font-display);
    font-size: 24px;
    font-weight: 400;
    color: var(--tune-text-secondary);
    margin-bottom: var(--space-xs);
    line-height: 1.2;
  }

  .track-album {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--tune-text-muted);
    margin-bottom: var(--space-xs);
  }

  .audio-badge {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-accent);
    letter-spacing: 0.5px;
    margin-top: var(--space-xs);
  }

  .seek-container {
    width: 100%;
  }

  /* Settings row */
  .settings-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .settings-row.center {
    justify-content: center;
  }

  .setting-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
    transition: all 0.12s ease-out;
  }

  .setting-btn:hover {
    opacity: 0.8;
  }

  .setting-btn.active {
    opacity: 1;
    color: var(--tune-accent);
  }

  /* Record button */
  .record-btn {
    opacity: 0.7 !important;
  }

  .record-btn:hover {
    opacity: 1 !important;
  }

  .record-btn.recording {
    opacity: 1 !important;
  }

  .rec-circle {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid #e53e3e;
    background: transparent;
    transition: background 0.2s, box-shadow 0.2s;
  }

  .rec-circle.active {
    background: #e53e3e;
    box-shadow: 0 0 8px rgba(229, 62, 62, 0.6);
    animation: rec-pulse 1.2s ease-in-out infinite;
  }

  @keyframes rec-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(0.9); }
  }

  .setting-spacer {
    flex: 1;
  }

  .zone-label {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .playback-indicator {
    display: flex;
    align-items: center;
  }

  .playback-indicator.playing {
    color: var(--tune-success);
  }

  .playback-indicator.paused {
    color: var(--tune-warning);
  }

  .playback-indicator svg {
    width: 12px;
    height: 12px;
  }

  /* Up Next */
  .up-next {
    margin-top: var(--space-sm);
  }

  .up-next-label {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--tune-text-muted);
    display: block;
    margin-bottom: var(--space-sm);
  }

  .up-next-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .up-next-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.04);
    border: none;
    border-radius: var(--radius-sm);
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s;
  }

  .up-next-item:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .up-next-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .up-next-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
  }

  .up-next-artist {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-secondary);
  }

  .up-next-duration {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
  }

  /* Radio LIVE badge on artwork */
  .art-live-badge {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 4px;
    background: var(--tune-warning);
    color: white;
    letter-spacing: 0.8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    z-index: 2;
  }

  .art-live-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: white;
    animation: live-pulse-np 1.5s ease-in-out infinite;
  }

  @keyframes live-pulse-np {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* Radio live label */
  .radio-live-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--tune-warning);
    margin-bottom: var(--space-sm);
  }

  .radio-antenna-icon {
    flex-shrink: 0;
  }

  .radio-station-name {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 400;
    color: var(--tune-text-secondary);
    margin-bottom: var(--space-xs);
    line-height: 1.2;
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    color: var(--tune-text-muted);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    position: relative;
    z-index: 1;
  }

  .empty-icon {
    opacity: 0.3;
  }

  .hint {
    font-family: var(--font-body);
    font-size: 13px;
    opacity: 0.7;
  }

  @media (max-width: 768px) {
    .now-playing {
      padding: var(--space-md);
      padding-top: 56px; /* espace pour le bouton close */
    }

    .content-layout {
      max-width: 100%;
    }

    .artwork-container {
      max-width: 280px;
    }

    .track-title {
      font-size: 24px;
    }

    .track-artist {
      font-size: 16px;
    }

    .track-album {
      font-size: 13px;
    }
  }
</style>

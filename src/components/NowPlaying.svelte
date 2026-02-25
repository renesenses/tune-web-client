<script lang="ts">
  import { currentZone } from '../lib/stores/zones';
  import { seekPositionMs, currentTrack, playbackState, shuffleEnabled, repeatMode } from '../lib/stores/nowPlaying';
  import { upNextTracks } from '../lib/stores/queue';
  import { formatTime } from '../lib/utils';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import SeekBar from './SeekBar.svelte';
  import { t } from '../lib/i18n';
  import type { RepeatMode, Track } from '../lib/types';

  interface Props {
    onAddToPlaylist?: (trackId: number) => void;
  }
  let { onAddToPlaylist }: Props = $props();

  let zone = $derived($currentZone);
  let track = $derived($currentTrack);
  let state = $derived($playbackState);

  let containerWidth = $state(0);
  let isWide = $derived(containerWidth > 700);

  // Resolve cover path for blurred background
  let resolvedCoverUrl = $state('');
  $effect(() => {
    if (track?.album_id) {
      api.getAlbumCoverPath(track.album_id).then((path) => {
        resolvedCoverUrl = path ? api.artworkUrl(path) : '';
      });
    } else {
      resolvedCoverUrl = '';
    }
  });

  function formatAudioBadge(track: any): string {
    const parts: string[] = [];
    if (track.format) parts.push(track.format.toUpperCase());
    if (track.sample_rate) parts.push(`${(track.sample_rate / 1000).toFixed(track.sample_rate % 1000 === 0 ? 0 : 1)} kHz`);
    if (track.bit_depth) parts.push(`${track.bit_depth}-bit`);
    return parts.join(' / ');
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

  {#if zone && track}
    <div class="content-layout" class:wide={isWide}>
      <div class="artwork-container">
        <AlbumArt albumId={track.album_id} size={isWide ? 360 : 400} alt={track.title} />
      </div>

      <div class="info-column">
        <div class="track-info" class:center={!isWide}>
          <h2 class="track-title truncate">{track.title}</h2>
          {#if track.artist_name}
            <p class="track-artist truncate">{track.artist_name}</p>
          {/if}
          {#if track.album_title}
            <p class="track-album truncate">{track.album_title}</p>
          {/if}
          {#if track.format || track.sample_rate || track.bit_depth}
            <p class="audio-badge">{formatAudioBadge(track)}</p>
          {/if}
        </div>

        <div class="seek-container">
          <SeekBar
            positionMs={$seekPositionMs}
            durationMs={track.duration_ms ?? 0}
            enabled={state !== 'stopped'}
          />
        </div>

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

          {#if onAddToPlaylist && track?.id}
            <button class="setting-btn" onclick={() => onAddToPlaylist!(track!.id!)} title={$t('nowplaying.addToPlaylist')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" /><line x1="16" y1="3" x2="16" y2="11" /><line x1="12" y1="7" x2="20" y2="7" />
              </svg>
            </button>
          {/if}

          <div class="setting-spacer"></div>

          <span class="zone-label">{zone.name}</span>
          <span class="playback-indicator" class:playing={state === 'playing'} class:paused={state === 'paused'}>
            {#if state === 'playing'}
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
                  <AlbumArt albumId={nextTrack.album_id} size={32} alt={nextTrack.title} />
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
  }

  .content-layout.wide .artwork-container {
    max-width: 360px;
  }

  .artwork-container :global(.album-art) {
    width: 100% !important;
    height: 100% !important;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
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
</style>

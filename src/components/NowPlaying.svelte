<script lang="ts">
  import { currentZone } from '../lib/stores/zones';
  import { seekPositionMs, currentTrack, playbackState } from '../lib/stores/nowPlaying';
  import AlbumArt from './AlbumArt.svelte';
  import SeekBar from './SeekBar.svelte';

  let zone = $derived($currentZone);
  let track = $derived($currentTrack);
  let state = $derived($playbackState);

  let containerWidth = $state(0);
  let isWide = $derived(containerWidth > 700);

  function formatAudioBadge(track: any): string {
    const parts: string[] = [];
    if (track.format) parts.push(track.format.toUpperCase());
    if (track.sample_rate) parts.push(`${(track.sample_rate / 1000).toFixed(track.sample_rate % 1000 === 0 ? 0 : 1)} kHz`);
    if (track.bit_depth) parts.push(`${track.bit_depth}-bit`);
    return parts.join(' / ');
  }
</script>

<div class="now-playing" class:wide={isWide} bind:clientWidth={containerWidth}>
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

        <div class="zone-info">
          <span class="zone-name">{zone.name}</span>
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
      </div>
    </div>
  {:else}
    <div class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64">
          <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      </div>
      <p>Aucune lecture en cours</p>
      {#if !zone}
        <p class="hint">En attente de connexion au serveur Tune...</p>
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
  }

  .content-layout {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-lg);
    max-width: 600px;
    width: 100%;
  }

  .content-layout.wide {
    flex-direction: row;
    align-items: center;
    gap: 40px;
    max-width: 900px;
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
    gap: var(--space-lg);
    width: 100%;
  }

  .content-layout.wide .info-column {
    max-width: 360px;
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

  .zone-info {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .track-info.center ~ .zone-info {
    justify-content: center;
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

  .empty-state {
    text-align: center;
    color: var(--tune-text-muted);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
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

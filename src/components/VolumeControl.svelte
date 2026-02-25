<script lang="ts">
  import { currentZone } from '../lib/stores/zones';
  import { zoneVolume, mutedVolume } from '../lib/stores/nowPlaying';
  import { preferences } from '../lib/stores/preferences';
  import { t } from '../lib/i18n';
  import * as api from '../lib/api';

  let zone = $derived($currentZone);
  let vol = $derived($zoneVolume);
  let isMuted = $derived(vol === 0 && $mutedVolume !== null);

  function volumeDisplay(v: number): string {
    if ($preferences.volumeDisplay === 'dB') {
      if (v <= 0) return '-\u221E dB';
      return `${(20 * Math.log10(v)).toFixed(1)} dB`;
    }
    return `${Math.round(v * 100)}`;
  }

  async function handleVolume(e: Event) {
    if (!zone?.id) return;
    const val = Number((e.target as HTMLInputElement).value);
    if (val > 0) mutedVolume.set(null);
    await api.setVolume(zone.id, val);
  }

  async function toggleMute() {
    if (!zone?.id) return;
    if (vol > 0) {
      mutedVolume.set(vol);
      await api.setVolume(zone.id, 0);
    } else if ($mutedVolume !== null) {
      const restore = $mutedVolume;
      mutedVolume.set(null);
      await api.setVolume(zone.id, restore);
    } else {
      await api.setVolume(zone.id, 0.5);
    }
  }
</script>

<div class="volume-control">
  <button class="volume-btn" class:muted={isMuted} onclick={toggleMute} title={$t('volume.title')}>
    {#if isMuted || vol === 0}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    {:else if vol < 0.5}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    {/if}
  </button>
  <input
    type="range"
    class="volume-slider"
    min="0"
    max="1"
    step="0.01"
    value={vol}
    oninput={handleVolume}
  />
  <span class="volume-value">{volumeDisplay(vol)}</span>
</div>

<style>
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

  .volume-btn.muted {
    color: var(--tune-warning);
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
    min-width: 36px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>

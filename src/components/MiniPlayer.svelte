<script lang="ts">
  /**
   * Compact player for a ~320px window: the Windows widget in mini mode.
   *
   * Deliberately NOT the mobile layout. A phone has room to browse; this has
   * room for one thing at a time and must never scroll. It carries exactly what
   * the standalone widget carried — zone, cover, metadata, seek, transport,
   * volume, search — so the 414-line duplicate frontend can be retired rather
   * than kept in parallel.
   *
   * Every action goes through the same stores and the same shared transport
   * helpers as the full interface. No behaviour is reimplemented here; only the
   * layout differs.
   */
  import { onMount, onDestroy } from 'svelte';
  import { zones, currentZone, currentZoneId, switchZone } from '../lib/stores/zones';
  import { currentTrack, playbackState, seekPositionMs } from '../lib/stores/nowPlaying';
  import * as controls from '../lib/playback-controls';
  import * as api from '../lib/api';
  import { connectionState } from '../lib/stores/connection';
  import { t } from '../lib/i18n';
  import AlbumArt from './AlbumArt.svelte';
  import type { Track } from '../lib/types';

  let zone = $derived($currentZone);
  let track = $derived($currentTrack);
  let playState = $derived($playbackState);
  let playing = $derived(playState === 'playing');

  let volume = $state(1);
  $effect(() => {
    if (zone?.volume != null) volume = zone.volume;
  });

  let query = $state('');
  let results = $state<Track[]>([]);
  let searching = $state(false);
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  function fmt(ms: number | null | undefined): string {
    if (ms == null || !Number.isFinite(ms)) return '0:00';
    const total = Math.floor(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  let duration = $derived(track?.duration_ms ?? 0);
  let progress = $derived(duration > 0 ? Math.min(100, ($seekPositionMs / duration) * 100) : 0);

  async function seekTo(e: MouseEvent) {
    if (!zone?.id || duration <= 0) return;
    const el = e.currentTarget as HTMLElement;
    const ratio = (e.clientX - el.getBoundingClientRect().left) / el.offsetWidth;
    await api.seek(zone.id, Math.round(duration * Math.max(0, Math.min(1, ratio))));
  }

  async function onVolume(e: Event) {
    if (!zone?.id) return;
    volume = Number((e.currentTarget as HTMLInputElement).value);
    await api.setVolume(zone.id, volume);
  }

  function onSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    const q = query.trim();
    if (q.length < 2) {
      results = [];
      return;
    }
    // Debounced: a 320px window is typed in slowly and every keystroke would
    // otherwise hit the server.
    searchTimer = setTimeout(async () => {
      searching = true;
      try {
        const r = await api.searchLibrary(q, 8);
        results = r.tracks ?? [];
      } catch {
        results = [];
      } finally {
        searching = false;
      }
    }, 250);
  }

  async function playResult(tr: Track) {
    if (!zone?.id) return;
    const body =
      tr.source && tr.source !== 'local' && tr.source_id
        ? { source: tr.source as any, source_id: tr.source_id }
        : { track_id: (tr as any).track_id ?? tr.id };
    await api.play(zone.id, body as any);
    query = '';
    results = [];
  }

  onDestroy(() => {
    if (searchTimer) clearTimeout(searchTimer);
  });
</script>

<div class="mini">
  <div class="mini-top">
    <select
      class="mini-zone"
      value={$currentZoneId ?? ''}
      onchange={(e) => switchZone(Number((e.currentTarget as HTMLSelectElement).value))}
      aria-label={$t('nav.zonemanager')}
    >
      {#each $zones as z}
        <option value={z.id}>{z.name}</option>
      {/each}
    </select>
  </div>

  <div class="mini-cover">
    <!-- `album_id` n'existe pas sur le now-playing de la zone (le serveur ne
         l'envoie pas) : meme garde que la barre de transport. -->
    <AlbumArt
      coverPath={track?.cover_path}
      albumId={track && 'album_id' in track ? (track as any).album_id : null}
      size={200}
      alt={track?.title ?? ''}
    />
  </div>

  <div class="mini-meta">
    <span class="mini-title truncate">{track?.title ?? $t('nowplaying.noPlayback')}</span>
    <span class="mini-artist truncate">{track?.artist_name ?? ''}</span>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="mini-seek" onclick={seekTo}>
    <div class="mini-seek-fill" style="width: {progress}%"></div>
  </div>
  <div class="mini-times">
    <span>{fmt($seekPositionMs)}</span>
    <span>{fmt(duration)}</span>
  </div>

  <div class="mini-controls">
    <button class="mini-btn" onclick={() => controls.skipPrevious(zone)} aria-label={$t('transport.previous')}>
      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
    </button>
    <button class="mini-btn mini-play" onclick={() => controls.togglePlayPause(zone, track, playState)} aria-label={(playing ? $t('common.pause') : $t('common.play'))}>
      {#if playing}
        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M8 5v14l11-7z" /></svg>
      {/if}
    </button>
    <button class="mini-btn" onclick={() => controls.skipNext(zone)} aria-label={$t('transport.next')}>
      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" /></svg>
    </button>
  </div>

  <div class="mini-volume">
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M3 9v6h4l5 5V4L7 9z" /></svg>
    <input type="range" min="0" max="1" step="0.01" value={volume} oninput={onVolume} aria-label={$t('zone.volume')} />
    <span class="mini-vol-value">{Math.round(volume * 100)}</span>
  </div>

  <div class="mini-search">
    <input type="search" bind:value={query} oninput={onSearchInput} placeholder={$t('search.placeholder')} />
    {#if results.length > 0}
      <ul class="mini-results">
        {#each results as r}
          <li>
            <button onclick={() => playResult(r)}>
              <span class="truncate">{r.title}</span>
              <small class="truncate">{r.artist_name ?? ''}</small>
            </button>
          </li>
        {/each}
      </ul>
    {:else if searching}
      <p class="mini-hint">{$t('common.loading')}</p>
    {/if}
  </div>

  <div class="mini-status">
    <span class="dot" class:online={$connectionState === 'connected'}></span>
    <span>{$connectionState === 'connected' ? $t('settings.connected') : $t('settings.connecting')}</span>
  </div>
</div>

<style>
  .mini {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    height: 100vh;
    box-sizing: border-box;
    overflow: hidden;
    background: var(--tune-bg);
    color: var(--tune-text);
  }
  .mini-top { display: flex; }
  .mini-zone {
    flex: 1;
    background: var(--tune-surface);
    color: var(--tune-text);
    border: 1px solid var(--tune-border);
    border-radius: 6px;
    padding: 5px 8px;
    font-size: 12px;
  }
  .mini-cover { display: flex; justify-content: center; }
  .mini-meta { display: flex; flex-direction: column; text-align: center; gap: 2px; }
  .mini-title { font-weight: 600; font-size: 14px; }
  .mini-artist { font-size: 12px; color: var(--tune-text-muted); }
  .mini-seek {
    height: 4px;
    background: var(--tune-border);
    border-radius: 2px;
    cursor: pointer;
  }
  .mini-seek-fill { height: 100%; background: var(--tune-accent); border-radius: 2px; }
  .mini-times {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--tune-text-muted);
    font-variant-numeric: tabular-nums;
  }
  .mini-controls { display: flex; align-items: center; justify-content: center; gap: 18px; }
  .mini-btn {
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 4px;
  }
  .mini-play {
    background: var(--tune-accent);
    color: #fff;
    border-radius: 50%;
    width: 42px;
    height: 42px;
  }
  .mini-volume { display: flex; align-items: center; gap: 8px; color: var(--tune-text-muted); }
  .mini-volume input { flex: 1; }
  .mini-vol-value { font-size: 11px; width: 26px; text-align: right; font-variant-numeric: tabular-nums; }
  .mini-search { position: relative; }
  .mini-search input {
    width: 100%;
    box-sizing: border-box;
    background: var(--tune-surface);
    color: var(--tune-text);
    border: 1px solid var(--tune-border);
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 12px;
  }
  .mini-results {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    max-height: 132px;
    overflow-y: auto;
    border: 1px solid var(--tune-border);
    border-radius: 6px;
  }
  .mini-results button {
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    color: var(--tune-text);
    padding: 6px 8px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
  }
  .mini-results button:hover { background: var(--tune-surface-hover); }
  .mini-results small { color: var(--tune-text-muted); font-size: 11px; }
  .mini-hint { font-size: 11px; color: var(--tune-text-muted); margin: 6px 0 0; }
  .mini-status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--tune-text-muted);
    margin-top: auto;
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--tune-text-muted); }
  .dot.online { background: var(--tune-accent); }
</style>

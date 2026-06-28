<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { zones, currentZone, currentZoneId, playAndSync, nextAndSync, previousAndSync, resumeAndSync } from '../lib/stores/zones';
  import { currentTrack, playbackState, shuffleEnabled, repeatMode, seekPositionMs, zoneVolume, mutedVolume } from '../lib/stores/nowPlaying';
  import { ytPlayerState, ytLoading, pauseVideo, resumeVideo } from '../lib/stores/ytPlayer';
  import { isBrowserZone, browserPause, browserResume, browserSetVolume, browserSeek, browserStop } from '../lib/stores/browserAudio';
  import { currentProfileId, favoriteTrackIds } from '../lib/stores/profile';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import ServiceBadge from './ServiceBadge.svelte';
  import VolumeControl from './VolumeControl.svelte';
  import AudioVisualizer from './AudioVisualizer.svelte';
  import ZoneConfigModal from './ZoneConfigModal.svelte';
  import { t } from '../lib/i18n';
  import { formatCompactQuality, getQualityTier, getQualityTierColor, formatQualityTooltip } from '../lib/utils';
  import type { OutputType, RepeatMode } from '../lib/types';
  import { activeView, mobileNowPlayingOpen } from '../lib/stores/navigation';
  import { isPremium } from '../lib/stores/license';

  function deviceTypeLabel(type?: OutputType): string {
    switch (type) {
      case 'dlna': return 'DLNA';
      case 'airplay': return 'AirPlay';
      case 'chromecast': return 'Cast';
      case 'bluos': return 'BluOS';
      case 'openhome': return 'OpenHome';
      case 'sonos': return 'Sonos';
      case 'browser': return 'Browser';
      case 'local': return '';
      default: return '';
    }
  }

  // --- Mobile Volume Popup ---
  let mobileVolumeOpen = $state(false);
  let mobileVol = $derived($zoneVolume);
  let mobileIsMuted = $derived(mobileVol === 0 && $mutedVolume !== null);

  async function handleMobileVolume(e: Event) {
    const z = $currentZone;
    if (!z?.id) return;
    const val = Number((e.target as HTMLInputElement).value);
    if (val > 0) mutedVolume.set(null);
    await api.setVolume(z.id, val);
  }

  async function mobileVolumeStep(delta: number) {
    const z = $currentZone;
    if (!z?.id) return;
    const newVal = Math.max(0, Math.min(1, mobileVol + delta));
    if (newVal > 0) mutedVolume.set(null);
    await api.setVolume(z.id, newVal);
  }

  async function toggleMobileMute() {
    const z = $currentZone;
    if (!z?.id) return;
    if (mobileVol > 0) {
      mutedVolume.set(mobileVol);
      await api.setVolume(z.id, 0);
    } else if ($mutedVolume !== null) {
      const restore = $mutedVolume;
      mutedVolume.set(null);
      await api.setVolume(z.id, restore);
    } else {
      await api.setVolume(z.id, 0.5);
    }
  }

  // --- Sleep Timer ---
  let sleepDropdownOpen = $state(false);
  let sleepActive = $state(false);
  let sleepRemainingSeconds = $state(0);
  let sleepFading = $state(false);
  let sleepPollInterval: ReturnType<typeof setInterval> | null = null;

  function formatSleepTime(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  async function setSleep(minutes: number) {
    const z = $currentZone;
    if (!z?.id) return;
    sleepDropdownOpen = false;
    try {
      await api.setSleepTimer(z.id, minutes);
      sleepActive = true;
      sleepRemainingSeconds = minutes * 60;
      sleepFading = false;
      startSleepPolling();
    } catch {}
  }

  async function cancelSleep() {
    const z = $currentZone;
    if (!z?.id) return;
    sleepDropdownOpen = false;
    try {
      await api.setSleepTimer(z.id, 0);
    } catch {}
    sleepActive = false;
    sleepRemainingSeconds = 0;
    sleepFading = false;
    stopSleepPolling();
  }

  async function pollSleepTimer() {
    const z = $currentZone;
    if (!z?.id) return;
    try {
      const res = await api.getSleepTimer(z.id);
      sleepActive = res.active;
      sleepRemainingSeconds = res.remaining_seconds ?? 0;
      sleepFading = res.fading ?? false;
      if (!res.active) stopSleepPolling();
    } catch {}
  }

  function startSleepPolling() {
    stopSleepPolling();
    sleepPollInterval = setInterval(pollSleepTimer, 10000);
  }

  function stopSleepPolling() {
    if (sleepPollInterval) {
      clearInterval(sleepPollInterval);
      sleepPollInterval = null;
    }
  }

  // --- Mini-Player (compact mode on scroll) ---
  let compact = $state(false);
  let scrollObserver: IntersectionObserver | null = null;

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (showZoneDropdown) { showZoneDropdown = false; e.stopPropagation(); }
      if (sleepDropdownOpen) { sleepDropdownOpen = false; e.stopPropagation(); }
      if (mobileVolumeOpen) { mobileVolumeOpen = false; e.stopPropagation(); }
    }
  }

  onMount(() => {
    // Initial sleep timer check
    pollSleepTimer();

    // Global Escape key handler for popovers
    document.addEventListener('keydown', handleGlobalKeydown);

    // Observe main-content scroll to switch to compact mode
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      let lastScrollTop = 0;
      mainContent.addEventListener('scroll', () => {
        const scrollTop = (mainContent as HTMLElement).scrollTop;
        compact = scrollTop > 100;
        lastScrollTop = scrollTop;
      });
    }
  });

  onDestroy(() => {
    stopSleepPolling();
    document.removeEventListener('keydown', handleGlobalKeydown);
  });

  let isFavorite = $state(false);
  let favChecking = $state(false);
  let favPulse = $state(false);

  // Determine favorite type for the current track
  type FavKind = 'radio' | 'library' | 'streaming' | 'none';

  // The numeric library id is exposed as `track_id` by /zones + WS events but as
  // `id` by the /play response. Read both so the favourite state is stable
  // across those payloads (otherwise the heart flickers on play).
  function libId(track: any): number | null {
    return (track?.track_id ?? track?.id) ?? null;
  }

  function getFavKind(track: typeof displayTrack): FavKind {
    if (!track) return 'none';
    if (track.source === 'radio') return 'radio';
    if (track.source && track.source !== 'local' && track.source !== 'radio' && track.source_id) return 'streaming';
    if (libId(track) != null) return 'library';
    return 'none';
  }

  // Check if current track is a favorite (handles all track types)
  $effect(() => {
    const track = $currentTrack;
    const kind = getFavKind(track);
    if (kind === 'radio' && track?.title && track?.artist_name) {
      checkRadioFavorite(track.title, track.artist_name);
    } else if (kind === 'library' && libId(track) != null) {
      isFavorite = $favoriteTrackIds.has(libId(track)!);
    } else if (kind === 'streaming') {
      // Streaming favorites are per-service; check via API
      checkStreamingFavorite(track!);
    } else {
      isFavorite = false;
    }
  });

  // Re-check library favorite when the set changes (optimistic updates from other views)
  $effect(() => {
    const track = $currentTrack;
    const ids = $favoriteTrackIds;
    if (libId(track) != null && getFavKind(track) === 'library') {
      isFavorite = ids.has(libId(track)!);
    }
  });

  async function checkRadioFavorite(title: string, artist: string) {
    try {
      const res = await api.apiFetch(`/radio-favorites/is-favorite?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`);
      isFavorite = res.is_favorite;
    } catch { isFavorite = false; }
  }

  async function checkStreamingFavorite(track: NonNullable<typeof displayTrack>) {
    try {
      const res = await api.getStreamingFavorites(track.source!, 'tracks');
      const favTracks: any[] = res.tracks ?? res as any ?? [];
      isFavorite = favTracks.some((f: any) => String(f.source_id ?? f.id) === String(track.source_id ?? track.id));
    } catch { isFavorite = false; }
  }

  async function toggleFavorite() {
    if (favChecking) return;
    const track = $currentTrack;
    const kind = getFavKind(track);
    if (kind === 'none') return;

    favChecking = true;
    // Trigger pulse animation
    favPulse = true;
    setTimeout(() => favPulse = false, 300);

    try {
      if (kind === 'radio') {
        if (isFavorite) {
          const favs = await api.apiFetch('/radio-favorites?limit=500');
          const match = favs.find((f: any) => f.title === track?.title && f.artist === track?.artist_name);
          if (match) await api.apiDelete(`/radio-favorites/${match.id}`);
          isFavorite = false;
        } else {
          const zid = $currentZoneId;
          if (zid != null) {
            await api.apiPost('/radio-favorites/save-current', { zone_id: zid });
            isFavorite = true;
          }
        }
      } else if (kind === 'library') {
        const pid = $currentProfileId;
        const tid = libId(track);
        if (!pid || tid == null) { favChecking = false; return; }
        if (isFavorite) {
          await api.removeFavorite(pid, { track_id: tid });
          favoriteTrackIds.update((s) => { s.delete(tid); return s; });
          isFavorite = false;
        } else {
          await api.addFavorite(pid, { track_id: tid });
          favoriteTrackIds.update((s) => { s.add(tid); return s; });
          isFavorite = true;
        }
      } else if (kind === 'streaming') {
        const itemId = String(track!.source_id ?? track!.id);
        if (isFavorite) {
          await api.removeStreamingFavorite(track!.source!, 'tracks', itemId);
          isFavorite = false;
        } else {
          await api.addStreamingFavorite(track!.source!, 'tracks', itemId);
          isFavorite = true;
        }
      }
    } catch (e) {
      console.error('toggleFavorite error:', e);
    }
    favChecking = false;
  }

  function handleBarClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.control-btn')) return;
    if ((e.target as HTMLElement).closest('.zone-selector')) return;
    if ((e.target as HTMLElement).closest('.zone-popover')) return;
    if ((e.target as HTMLElement).closest('.mobile-volume-wrapper')) return;
    if (window.innerWidth <= 768) {
      mobileNowPlayingOpen.set(true);
    }
  }

  let zone = $derived($currentZone);
  let track = $derived($currentTrack);
  let state = $derived($playbackState);
  let showZoneDropdown = $state(false);
  let configZone = $state<typeof zone | null>(null);
  let hasNoZone = $derived($zones.length === 0);

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
      if (state === 'playing') {
        await api.pause(zone.id);
        // Also pause browser audio if this is a browser zone
        if (isBrowserZone(zone)) browserPause();
      } else {
        await resumeAndSync(zone.id);
        // resumeAndSync already handles browserResume via the store
      }
    } else if (zone?.id && state === 'stopped' && track) {
      // Zone stopped but has a current track — restart it. The /play endpoint
      // needs an explicit target (an empty body returns 400), so pass the
      // track's identity: source+source_id for streaming, track_id for local.
      const trackId = (track as any).track_id ?? track.id;
      const body = (track.source && track.source !== 'local' && track.source !== 'radio' && track.source_id)
        ? { source: track.source as any, source_id: track.source_id }
        : (trackId != null ? { track_id: trackId } : undefined);
      await playAndSync(zone.id, body);
    } else if (zone?.id && state === 'stopped' && ytActive && ytTrack?.source_id) {
      // Zone stopped but IFrame has a YT track — restart via API
      ytLoading.set(true);
      await playAndSync(zone.id, { source: ytTrack.source as any, source_id: ytTrack.source_id });
    } else if (ytActive) {
      // No zone at all — control IFrame directly as fallback
      if (ytPlaying) pauseVideo(); else resumeVideo();
    }
  }

  async function handlePrevious() {
    if (!zone?.id) return;
    if (ytActive) ytLoading.set(true);
    await previousAndSync(zone.id);
  }

  async function handleNext() {
    if (!zone?.id) return;
    if (ytActive) ytLoading.set(true);
    await nextAndSync(zone.id);
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

  // Audiophile mode
  let audiophileEnabled = $state(false);
  let audiophileLoading = $state(false);
  let audiophileGeneration = 0;

  $effect(() => {
    const zoneId = $currentZoneId;
    if (zoneId) {
      const gen = ++audiophileGeneration;
      api.getAudiophileMode(zoneId).then(res => {
        if (gen === audiophileGeneration) audiophileEnabled = res.enabled;
      }).catch(() => {});
    }
  });

  async function toggleAudiophile() {
    const z = $currentZone;
    if (!z?.id || audiophileLoading) return;
    audiophileLoading = true;
    try {
      const res = await api.setAudiophileMode(z.id, !audiophileEnabled);
      audiophileEnabled = res.enabled;
    } catch {}
    audiophileLoading = false;
  }

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

  function handleProgressSeek(e: MouseEvent) {
    const zone = $currentZone;
    if (!displayTrack?.duration_ms || !zone?.id) return;
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const posMs = Math.floor(pct * displayTrack.duration_ms);
    seekPositionMs.set(posMs);
    api.seek(zone.id, posMs);
  }
</script>

<div class="transport-bar" class:compact style="--compact-progress: {progressPercent}%" onclick={handleBarClick} role="button" tabindex={0} aria-label="Transport bar">
  {#if displayTrack && displayTrack.source !== 'radio' && displayTrack.duration_ms}
    <div class="transport-progress">
      <span class="progress-time">{formatTime($seekPositionMs)}</span>
      <div class="progress-track" onclick={handleProgressSeek} role="slider" tabindex={0} aria-label="Seek" aria-valuenow={$seekPositionMs} aria-valuemin={0} aria-valuemax={displayTrack?.duration_ms ?? 0}>
        <div class="progress-fill" style="width: {progressPercent}%"></div>
      </div>
      <span class="progress-time">{formatTime(displayTrack.duration_ms)}</span>
    </div>
  {/if}
  <div class="transport-left">
    {#if displayTrack}
      <div class="track-mini-clickable" onclick={() => activeView.set('nowplaying')} role="button" tabindex={0} aria-label="Open now playing">
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
              <ServiceBadge source={displayTrack.source} compact />
              {#if displayTrack.format || zone?.signal_path}
                {@const sourceStep = zone?.signal_path?.steps?.find((s: any) => s.name === 'Source')?.description ?? ''}
                {@const spFormat = sourceStep.split(' ')[0]?.toUpperCase() || ''}
                {@const spDetail = sourceStep || ''}
                {@const hasTrackFormat = !!displayTrack.format}
                {@const miniTier = hasTrackFormat ? getQualityTier(displayTrack) : (spFormat === 'DSD' ? 'dsd' : (sourceStep.includes('24') || sourceStep.includes('88') || sourceStep.includes('96') || sourceStep.includes('176') || sourceStep.includes('192') || sourceStep.includes('352') || sourceStep.includes('384')) ? 'hires' : (spFormat === 'FLAC' || spFormat === 'WAV' || spFormat === 'ALAC' || spFormat === 'AIFF') ? 'cd' : zone?.signal_path?.bit_perfect ? 'cd' : 'lossy')}
                <span
                  class="tb-quality-badge tier-{getQualityTierColor(miniTier)}"
                  class:sp-clickable={!!zone?.signal_path}
                  role={zone?.signal_path ? 'button' : undefined}
                  tabindex={zone?.signal_path ? 0 : undefined}
                  onclick={(e) => { if (zone?.signal_path) { e.stopPropagation(); showSignalPath = true; } }}
                  onkeydown={(e) => { if (zone?.signal_path && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); showSignalPath = true; } }}
                  title={hasTrackFormat ? formatQualityTooltip(displayTrack) : (zone?.signal_path?.summary ?? '')}
                >{hasTrackFormat ? formatCompactQuality(displayTrack) : (spDetail || (zone?.signal_path?.bit_perfect ? 'Lossless' : 'Lossy'))}</span>
              {/if}
            {/if}
          </span>
        </div>
      </div>
      {#if getFavKind(displayTrack) !== 'none'}
        <button class="fav-btn control-btn" class:is-fav={isFavorite} class:fav-pulse={favPulse} onclick={(e) => { e.stopPropagation(); toggleFavorite(); }} title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
          <svg viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      {/if}
      <div class="tb-mini-viz">
        <AudioVisualizer
          playing={isPlaying}
          mode="spectrum"
          height={24}
          mini
          sampleRate={displayTrack.sample_rate}
          bitDepth={displayTrack.bit_depth}
          format={displayTrack.format}
        />
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
      disabled={hasNoZone && !ytActive}
      onclick={togglePlayPause}
      title={hasNoZone && !ytActive ? $t('zone.playDisabledNoZone' as any) : (isPlaying ? $t('common.pause') : $t('common.play'))}
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

    {#if state !== 'stopped' && zone?.id}
      <button
        class="control-btn stop-btn"
        onclick={async () => { if (zone?.id) await api.stop(zone.id); }}
        title={$t('common.stop') ?? 'Stop'}
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="1.5" />
        </svg>
      </button>
    {/if}

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

  <!-- Mobile volume button (visible only on small screens) -->
  <div class="mobile-volume-wrapper">
    <button
      class="control-btn mobile-volume-btn"
      class:muted={mobileIsMuted}
      onclick={(e) => { e.stopPropagation(); mobileVolumeOpen = !mobileVolumeOpen; }}
      title={$t('volume.title')}
    >
      {#if mobileIsMuted || mobileVol === 0}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      {:else if mobileVol < 0.5}
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
    {#if mobileVolumeOpen}
      <div class="mobile-volume-backdrop" onclick={() => mobileVolumeOpen = false} role="button" tabindex={0} aria-label="Close volume"></div>
      <div class="mobile-volume-popup">
        <button class="mobile-mute-btn" onclick={(e) => { e.stopPropagation(); toggleMobileMute(); }}>
          {#if mobileIsMuted || mobileVol === 0}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          {/if}
        </button>
        <input
          type="range"
          class="mobile-volume-slider"
          min="0"
          max="1"
          step="0.01"
          value={mobileVol}
          oninput={handleMobileVolume}
          orient="vertical"
          aria-label="Volume"
          onclick={(e) => e.stopPropagation()}
        />
        <div class="mobile-volume-steps">
          <button class="mobile-step-btn" onclick={(e) => { e.stopPropagation(); mobileVolumeStep(-0.01); }}>−</button>
          <span class="mobile-volume-value">{Math.round(mobileVol * 100)}</span>
          <button class="mobile-step-btn" onclick={(e) => { e.stopPropagation(); mobileVolumeStep(0.01); }}>+</button>
        </div>
      </div>
    {/if}
  </div>

  <div class="transport-right">
    <div class="transport-right-top">
    <!-- Sleep Timer -->
    <div class="sleep-timer-wrapper">
      <button
        class="control-btn sleep-btn"
        class:active={sleepActive}
        onclick={(e) => { e.stopPropagation(); sleepDropdownOpen = !sleepDropdownOpen; }}
        title={$t('sleep.title' as any)}
      >
        {#if sleepFading}
          <span class="sleep-countdown fading">{$t('sleep.fading' as any)}</span>
        {:else if sleepActive}
          <span class="sleep-countdown">{formatSleepTime(sleepRemainingSeconds)}</span>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        {/if}
      </button>
      {#if sleepDropdownOpen}
        <div class="sleep-backdrop" onclick={() => sleepDropdownOpen = false} role="button" tabindex={0} aria-label="Close sleep timer"></div>
        <div class="sleep-dropdown">
          <button class="sleep-option" onclick={() => setSleep(15)}>{$t('sleep.15min' as any)}</button>
          <button class="sleep-option" onclick={() => setSleep(30)}>{$t('sleep.30min' as any)}</button>
          <button class="sleep-option" onclick={() => setSleep(45)}>{$t('sleep.45min' as any)}</button>
          <button class="sleep-option" onclick={() => setSleep(60)}>{$t('sleep.1h' as any)}</button>
          <button class="sleep-option" onclick={() => setSleep(120)}>{$t('sleep.2h' as any)}</button>
          {#if sleepActive}
            <button class="sleep-option cancel" onclick={cancelSleep}>{$t('sleep.cancel' as any)}</button>
          {/if}
        </div>
      {/if}
    </div>

    {#if zone?.state === 'playing' && zone?.signal_path}
      <button
        class="signal-led"
        class:bit-perfect={zone.signal_path.bit_perfect}
        class:lossy={!zone.signal_path.bit_perfect}
        onclick={(e) => { e.stopPropagation(); showSignalPath = true; }}
        title={zone.signal_path.summary ?? ''}
      ></button>
    {/if}

    <button
      class="audiophile-btn signal-shield-btn"
      class:active={audiophileEnabled}
      class:bit-perfect={zone?.signal_path?.bit_perfect || audiophileEnabled}
      class:lossy={zone?.signal_path && zone.state === 'playing' && !zone.signal_path.bit_perfect && !audiophileEnabled}
      onclick={(e) => { e.stopPropagation(); toggleAudiophile(); }}
      title={audiophileEnabled ? $t('audiophile.enabled' as any) : $t('audiophile.disabled' as any)}
    >
      <svg viewBox="0 0 24 26" fill={audiophileEnabled ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.5" width="18" height="18">
        <path d="M12 2L4 8v7c0 4.5 3.5 8.5 8 9.5c4.5-1 8-5 8-9.5V8l-8-6z" />
      </svg>
      {#if audiophileEnabled}
        <span class="audiophile-label">{$t('audiophile.pure' as any)}</span>
      {/if}
    </button>

    <div class="zone-selector">
      <button
        class="zone-selector-btn zone-icon-btn"
        class:zone-recovering={zone?.recovery_started_at != null}
        class:zone-offline={zone?.online === false && zone?.recovery_started_at == null}
        class:zone-online={zone?.online !== false && zone?.recovery_started_at == null}
        onclick={(e) => { e.stopPropagation(); showZoneDropdown = !showZoneDropdown; }}
        oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation(); if (zone) configZone = zone; }}
        title={zone?.name ? `${zone.name} — ${$t('zone.switchZone')}` : $t('zone.switchZone')}
        aria-label={zone?.name ?? $t('zone.switchZone')}
      >
        <!-- Spotify-style "Connect to a device" icon (monitor + speaker). -->
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="2.5" y="4.5" width="13" height="10" rx="1.5" />
          <path d="M6.5 18h6" />
          <path d="M9.5 14.5V18" />
          <rect x="18" y="8.5" width="3.5" height="10" rx="1" />
        </svg>
        <span class="zone-status-pip"></span>
      </button>
      {#if showZoneDropdown}
        <div class="zone-popover-backdrop" onclick={() => showZoneDropdown = false} onkeydown={(e) => { if (e.key === 'Escape') showZoneDropdown = false; }} role="button" tabindex={0} aria-label="Close zone selector"></div>
        <div class="zone-popover">
          <div class="zone-popover-header">
            <span class="zone-popover-title">{$t('zone.zones')}</span>
            <span class="zone-popover-count">{$zones.length}</span>
          </div>
          {#each $zones.filter((z, i, arr) => arr.findIndex(x => x.output_device_id === z.output_device_id) === i).slice(0, 50) as z}
            <button
              class="zone-popover-item"
              class:active={z.id === $currentZoneId}
              onclick={() => { if (z.id !== null) currentZoneId.set(z.id); showZoneDropdown = false; }}
            >
              <span class="zone-dot" class:online={z.online !== false && z.recovery_started_at == null} class:recovering={z.recovery_started_at != null}></span>
              <span class="zone-popover-name truncate">{z.name}</span>
              <span class="zone-popover-meta">
                {#if deviceTypeLabel(z.output_type)}
                  <span class="zone-popover-badge">{deviceTypeLabel(z.output_type)}</span>
                {/if}
                {#if z.recovery_started_at != null}
                  <span class="zone-popover-badge recovering">{$t('zone.recovering')}</span>
                {:else if z.online === false}
                  <span class="zone-popover-badge offline">{$t('zone.offline')}</span>
                {:else if z.state === 'playing'}
                  <span class="zone-playing-indicator">
                    <svg viewBox="0 0 10 12" fill="currentColor" width="8" height="10"><polygon points="0,0 10,6 0,12" /></svg>
                  </span>
                {/if}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    </div>
    <VolumeControl />
  </div>
</div>

{#if showSignalPath}
  <div class="sp-overlay" onclick={() => showSignalPath = false} role="button" tabindex={0} aria-label="Close signal path">
    <div class="sp-card" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="Signal path details">
      <div class="sp-header">
        <h3>{$t('signal.title')}{#if zone?.signal_path} : <span class:sp-good={zone.signal_path.bit_perfect} class:sp-lossy={!zone.signal_path.bit_perfect}>{zone.signal_path.bit_perfect ? $t('signal.lossless') : $t('signal.lossy')}</span>{/if}</h3>
        <button class="sp-x" onclick={() => showSignalPath = false}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <!-- Audiophile on/off lives here (merged from the old separate bar icon). -->
      <div class="sp-audiophile">
        <div class="sp-ap-text">
          <span class="sp-ap-title">{$t('audiophile.title' as any)}</span>
          <span class="sp-ap-sub">{audiophileEnabled ? $t('audiophile.enabled' as any) : $t('audiophile.disabled' as any)}</span>
        </div>
        <button
          class="sp-ap-switch"
          class:on={audiophileEnabled}
          onclick={() => toggleAudiophile()}
          disabled={audiophileLoading}
          role="switch"
          aria-checked={audiophileEnabled}
          aria-label={$t('audiophile.title' as any)}
        >
          <span class="sp-ap-knob"></span>
        </button>
      </div>

      {#if zone?.signal_path}
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
      {/if}
    </div>
  </div>
{/if}

{#if configZone}
  <ZoneConfigModal
    zone={configZone}
    allZones={$zones}
    groups={[]}
    onClose={() => configZone = null}
    onDelete={() => configZone = null}
    onGroupChanged={() => {}}
    onRenamed={() => {}}
  />
{/if}

<style>
  .transport-bar {
    grid-column: 1 / -1;
    grid-row: 2;
    background: var(--tune-footer);
    border-top: 1px solid var(--tune-border);
    display: grid;
    /* Spotify-style: three equal thirds. Centre third stacks controls (row 1)
       over a centred progress bar (row 2); left (track) and right (device +
       volume) span both rows and truncate within their third. */
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: auto auto;
    align-items: center;
    padding: 6px var(--space-lg);
    padding-bottom: max(6px, env(safe-area-inset-bottom, 0));
    column-gap: var(--space-lg);
    row-gap: 2px;
    position: relative;
    overflow: visible;
    min-width: 0;
    /* Respond to the bar's OWN width, not the viewport: the sidebar steals
       ~280px, so at a wide viewport the bar can still be cramped. Without this
       the centre controls (which grow with playback state) overflow the side
       columns and the repeat icon lands on the zone name. */
    container-type: inline-size;
    container-name: tbar;
  }

  /* When the bar itself is narrow, drop the secondary centre buttons and
     tighten gaps so left (title) / centre (transport) / right (zone+volume)
     keep their lanes instead of overlapping. */
  @container tbar (max-width: 1080px) {
    .transport-controls {
      gap: 4px;
    }
    .transport-controls .signal-dot-btn,
    .transport-controls .audiophile-btn {
      display: none;
    }
    /* Decorative spectrum eats ~80-150px on the left — drop it first so the
       title and zone label keep their room. */
    .tb-mini-viz {
      display: none;
    }
    .zone-selector-btn {
      max-width: 140px;
    }
  }

  @container tbar (max-width: 980px) {
    /* Same trade-off the mobile breakpoint makes: drop the secondary
       transport buttons (shuffle/repeat) so the centre stays compact and
       can't spill its icons onto the zone chip. */
    .transport-controls .control-btn.small {
      display: none;
    }
    .zone-selector-btn .pro-pill {
      display: none;
    }
    .zone-selector-btn {
      max-width: 120px;
    }
    .transport-right :global(.volume-slider) {
      width: 100px;
    }
  }

  .transport-left {
    grid-column: 1;
    grid-row: 1 / 3;
    display: flex;
    align-items: center;
    gap: var(--space-md);
    min-width: 0;
    overflow: hidden;
  }

  .tb-mini-viz {
    width: 80px;
    flex-shrink: 0;
  }

  @media (max-width: 640px) {
    .tb-mini-viz {
      display: none;
    }
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

  .tb-quality-badge {
    font-family: var(--font-label);
    font-size: 9px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    flex-shrink: 0;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    margin-left: 2px;
  }

  /* Clickable when a signal path is available — opens the signal-path panel.
     Persistent ring + chevron so it reads as a control, not a passive label. */
  .tb-quality-badge.sp-clickable {
    cursor: pointer;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18) inset;
    transition: filter 0.12s ease-out, box-shadow 0.12s ease-out;
  }
  .tb-quality-badge.sp-clickable::after {
    content: "›";
    margin-left: 4px;
    font-weight: 700;
    opacity: 0.75;
  }
  .tb-quality-badge.sp-clickable:hover {
    filter: brightness(1.25);
    box-shadow: 0 0 0 1px currentColor inset;
  }

  .tb-quality-badge.tier-gold-max {
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.15);
  }

  .tb-quality-badge.tier-gold {
    color: #a78bfa;
    background: rgba(167, 139, 250, 0.12);
  }

  .tb-quality-badge.tier-blue {
    color: #60a5fa;
    background: rgba(96, 165, 250, 0.1);
  }

  .tb-quality-badge.tier-green {
    color: #34d399;
    background: rgba(52, 211, 153, 0.1);
  }

  .tb-quality-badge.tier-gray {
    color: #f87171;
    background: rgba(248, 113, 113, 0.08);
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
    transition: color 0.2s, transform 0.2s;
  }

  .fav-btn:hover {
    color: var(--tune-text);
    transform: scale(1.2);
  }

  .fav-btn.is-fav {
    color: #ef4444;
  }

  .fav-btn.fav-pulse {
    animation: fav-pulse-anim 0.3s ease;
  }

  @keyframes fav-pulse-anim {
    50% { transform: scale(1.3); }
  }

  .transport-controls {
    grid-column: 2;
    grid-row: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
  }

  .transport-progress {
    grid-column: 2;
    grid-row: 2;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 0;
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
    cursor: pointer;
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
    /* Never let a flex squeeze turn the round buttons (esp. play) into ovals. */
    flex-shrink: 0;
    aspect-ratio: 1;
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
    /* Always shown (even inactive); the dot colour conveys the state. */
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .signal-dot-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    /* Inactive (not playing / no signal path): muted, no glow. */
    background: var(--tune-text-muted, #666);
    box-shadow: none;
    transition: background 0.3s, box-shadow 0.3s, transform 0.15s;
  }

  /* Active but not bit-perfect (lossy/processed): amber. */
  .signal-dot-btn.visible .signal-dot-indicator {
    background: #f59e0b;
    box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
  }

  /* Bit-perfect / audiophile: green. */
  .signal-dot-btn.bit-perfect .signal-dot-indicator {
    background: #4ade80;
    box-shadow: 0 0 6px rgba(74, 222, 128, 0.5);
  }

  .signal-dot-btn:hover .signal-dot-indicator {
    transform: scale(1.3);
  }

  .transport-right {
    grid-column: 3;
    grid-row: 1 / 3;
    /* Two stacked rows (mirrors the centre): icons on top, volume below. */
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-end;
    gap: 4px;
    min-width: 0;
    /* Must stay visible: the zone popover opens below the icon and the
       audiophile icon would otherwise be clipped. */
    overflow: visible;
  }

  .transport-right-top {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-md);
  }

  .zone-selector {
    position: relative;
    flex-shrink: 0;
  }

  /* Spotify-style icon-only zone/device button. */
  .zone-icon-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    max-width: none;
    min-width: 0;
    background: none;
    border: none;
    border-radius: var(--radius-md);
    color: var(--tune-text-secondary);
    cursor: pointer;
    transition: color 0.12s ease-out, background 0.12s ease-out;
  }
  .zone-icon-btn:hover {
    color: var(--tune-text);
    background: var(--tune-surface-hover);
  }
  /* Connected → accent (like Spotify's green connect icon). */
  .zone-icon-btn.zone-online {
    color: var(--tune-accent, #1db954);
  }
  .zone-icon-btn.zone-recovering {
    color: var(--tune-warning, #f59e0b);
  }
  .zone-icon-btn.zone-offline {
    color: var(--tune-text-muted, #666);
  }
  /* Small status pip at the icon's corner. */
  .zone-status-pip {
    position: absolute;
    right: 3px;
    bottom: 3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
  .zone-icon-btn.zone-recovering .zone-status-pip {
    animation: dot-pulse 1.5s ease-in-out infinite;
  }

  .zone-selector-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    padding: 4px 10px;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    max-width: 180px;
    min-width: 0;
    overflow: hidden;
    transition: all 0.12s ease-out;
  }

  /* Keep the dot, badges and chevron at full size; only the name truncates. */
  .zone-selector-btn > :global(.zone-dot-current),
  .zone-selector-btn > :global(svg),
  .zone-selector-btn > :global(.zone-status-badge),
  .zone-selector-btn > :global(.pro-pill) {
    flex-shrink: 0;
  }
  .zone-selector-btn > :global(.truncate) {
    min-width: 0;
    flex: 0 1 auto;
  }

  .zone-selector-btn:hover {
    border-color: var(--tune-text-muted);
    color: var(--tune-text);
    background: var(--tune-surface-hover);
  }

  /* Current zone status dot in the selector button */
  .zone-dot-current {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #6b7280;
    flex-shrink: 0;
    transition: background 0.3s;
  }

  .zone-dot-current.online {
    background: #22c55e;
    box-shadow: 0 0 4px rgba(34, 197, 94, 0.4);
  }

  .zone-dot-current.recovering {
    background: #f59e0b;
    animation: dot-pulse 1.5s ease-in-out infinite;
  }

  @keyframes dot-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .pro-pill {
    font-family: var(--font-label);
    font-size: 8px;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 3px;
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.25));
    color: #f59e0b;
    letter-spacing: 0.8px;
    flex-shrink: 0;
    line-height: 1.3;
  }

  .zone-popover-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .zone-popover {
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 12px;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.05);
    min-width: 220px;
    max-width: 320px;
    max-height: 300px;
    overflow-y: auto;
    z-index: 100;
    display: flex;
    flex-direction: column;
    padding: 0;
    animation: popover-in 0.15s ease-out;
  }

  @keyframes popover-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .zone-popover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 8px;
    border-bottom: 1px solid var(--tune-border);
  }

  .zone-popover-title {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tune-text-muted);
  }

  .zone-popover-count {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    color: var(--tune-text-muted);
    background: var(--tune-bg);
    padding: 1px 6px;
    border-radius: 8px;
  }

  .zone-popover-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: none;
    border: none;
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 14px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .zone-popover-item > .zone-popover-name {
    min-width: 0;
    flex: 1 1 auto;
  }

  .zone-popover-item:hover {
    background: var(--tune-surface-hover);
    color: var(--tune-text);
  }

  .zone-popover-item.active {
    color: var(--tune-accent);
    background: rgba(124, 58, 237, 0.06);
  }

  .zone-popover-item:last-child {
    border-radius: 0 0 12px 12px;
  }

  /* Online/offline dot in the popover */
  .zone-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #6b7280;
    flex-shrink: 0;
    transition: background 0.3s;
  }

  .zone-dot.online {
    background: #22c55e;
    box-shadow: 0 0 4px rgba(34, 197, 94, 0.4);
  }

  .zone-dot.recovering {
    background: #f59e0b;
    animation: dot-pulse 1.5s ease-in-out infinite;
  }

  .zone-popover-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .zone-popover-badge {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tune-text-muted);
    background: var(--tune-bg);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .zone-playing-indicator {
    color: var(--tune-success);
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  /* Recovery / Offline states */
  .zone-selector-btn.zone-recovering {
    border-color: var(--tune-warning, #f59e0b);
  }
  .zone-selector-btn.zone-offline {
    border-color: var(--tune-danger, #ef4444);
    opacity: 0.7;
  }
  .zone-status-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .zone-status-badge.recovering {
    color: var(--tune-warning, #f59e0b);
    background: rgba(245, 158, 11, 0.15);
  }
  .zone-status-badge.offline {
    color: var(--tune-danger, #ef4444);
    background: rgba(239, 68, 68, 0.15);
  }
  .zone-popover-badge.recovering {
    color: var(--tune-warning, #f59e0b);
    background: rgba(245, 158, 11, 0.15);
  }
  .zone-popover-badge.offline {
    color: var(--tune-danger, #ef4444);
    background: rgba(239, 68, 68, 0.15);
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

  /* Audiophile mode button */
  .signal-led {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: none;
    padding: 0;
    cursor: pointer;
    flex-shrink: 0;
    margin-right: 4px;
    background: #9ca3af;
    transition: background 0.3s, box-shadow 0.3s;
  }
  .signal-led.bit-perfect {
    background: #22c55e;
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
  }
  .signal-led.lossy {
    background: #f59e0b;
    box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
  }

  .audiophile-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: var(--radius-sm);
    color: var(--tune-text-secondary);
    opacity: 1;
    transition: all 0.2s ease-out;
    font-family: var(--font-label);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .audiophile-btn:hover {
    color: var(--tune-text);
    background: var(--tune-surface-hover);
  }

  .audiophile-btn.active {
    opacity: 1;
    color: #d4a017;
    text-shadow: 0 0 8px rgba(212, 160, 23, 0.4);
  }

  .audiophile-btn.active svg {
    filter: drop-shadow(0 0 4px rgba(212, 160, 23, 0.5));
  }

  /* Merged shield = signal status + audiophile toggle.
     Colour conveys the live signal path; these override the gold .active rule. */
  .signal-shield-btn.lossy {
    color: #f59e0b;
  }
  .signal-shield-btn.lossy svg {
    filter: drop-shadow(0 0 4px rgba(245, 158, 11, 0.45));
  }
  .signal-shield-btn.bit-perfect,
  .signal-shield-btn.active.bit-perfect {
    color: #4ade80;
    text-shadow: 0 0 8px rgba(74, 222, 128, 0.4);
  }
  .signal-shield-btn.bit-perfect svg {
    filter: drop-shadow(0 0 4px rgba(74, 222, 128, 0.5));
  }

  .audiophile-label {
    color: inherit;
    pointer-events: none;
  }

  /* Audiophile toggle row inside the signal-path panel. */
  .sp-audiophile {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: 10px 12px;
    margin: 4px 0 10px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
  }
  .sp-ap-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sp-ap-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--tune-text);
  }
  .sp-ap-sub {
    font-size: 11px;
    color: var(--tune-text-muted);
  }
  .sp-ap-switch {
    flex-shrink: 0;
    width: 38px;
    height: 22px;
    border-radius: 11px;
    border: none;
    background: var(--tune-border);
    cursor: pointer;
    padding: 0;
    position: relative;
    transition: background 0.18s ease-out;
  }
  .sp-ap-switch.on {
    background: #4ade80;
  }
  .sp-ap-switch:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .sp-ap-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.18s ease-out;
  }
  .sp-ap-switch.on .sp-ap-knob {
    transform: translateX(16px);
  }

  /* --- Sleep Timer --- */
  .sleep-timer-wrapper {
    position: relative;
    flex-shrink: 0;
  }

  .sleep-btn {
    width: 36px;
    height: 36px;
    opacity: 0.5;
  }

  .sleep-btn svg {
    width: 18px;
    height: 18px;
  }

  .sleep-btn.active {
    opacity: 1;
    color: var(--tune-accent);
  }

  .sleep-countdown {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--tune-accent);
    white-space: nowrap;
  }

  .sleep-countdown.fading {
    color: var(--tune-warning);
    animation: pulse-fade 1.5s ease-in-out infinite;
  }

  @keyframes pulse-fade {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .sleep-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .sleep-dropdown {
    position: absolute;
    bottom: calc(100% + 6px);
    right: 0;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    min-width: 140px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    padding: 4px 0;
  }

  .sleep-option {
    display: flex;
    align-items: center;
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

  .sleep-option:hover {
    background: var(--tune-surface-hover);
    color: var(--tune-text);
  }

  .sleep-option.cancel {
    color: var(--tune-warning);
    border-top: 1px solid var(--tune-border);
    margin-top: 2px;
    padding-top: 10px;
  }

  /* --- Compact Mode (mini-player on scroll) --- */
  .transport-bar.compact {
    height: 48px;
    padding-top: 0;
    transition: height 0.2s ease-out, padding 0.2s ease-out;
  }

  .transport-bar.compact .transport-progress {
    display: none;
  }

  .transport-bar.compact .transport-left :global(.album-art) {
    width: 32px !important;
    height: 32px !important;
    min-width: 32px !important;
    min-height: 32px !important;
  }

  .transport-bar.compact .mini-title {
    font-size: 12px;
  }

  .transport-bar.compact .mini-artist {
    font-size: 11px;
  }

  .transport-bar.compact .control-btn.small,
  .transport-bar.compact .signal-dot-btn,
  .transport-bar.compact .audiophile-btn,
  .transport-bar.compact .stop-btn {
    display: none;
  }

  .transport-bar.compact .play-btn {
    width: 36px;
    height: 36px;
  }

  .transport-bar.compact .play-btn svg {
    width: 18px;
    height: 18px;
  }

  .transport-bar.compact .transport-controls {
    gap: 8px;
  }

  /* Thin progress bar shown below the compact bar */
  .transport-bar.compact::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background: var(--tune-accent);
    width: var(--compact-progress, 0%);
    transition: width 0.3s linear;
  }

  /* Tablet: tighter transport bar for iPad Safari (769-1024px) */
  @media (min-width: 769px) and (max-width: 1024px) {
    .transport-bar {
      padding: 4px var(--space-md) 0;
      padding-bottom: env(safe-area-inset-bottom, 0);
      gap: 2px var(--space-sm);
    }

    .transport-controls {
      gap: 8px;
    }

    .transport-controls .control-btn.small {
      width: 28px;
      height: 28px;
    }

    .transport-controls .control-btn.small svg {
      width: 14px;
      height: 14px;
    }

    .transport-controls .signal-dot-btn {
      display: none;
    }

    .transport-controls .audiophile-btn .audiophile-label {
      display: none;
    }

    .transport-right {
      gap: var(--space-sm);
      min-width: 0;
      overflow: visible;
    }

    .transport-right :global(.volume-control) {
      min-width: 0;
    }

    .transport-right :global(.volume-slider) {
      width: 90px;
    }

    .transport-right :global(.step-btn) {
      display: none;
    }

    .zone-selector-btn {
      max-width: 120px;
      min-width: 50px;
      font-size: 12px;
    }
  }

  @media (max-width: 768px) {
    .transport-bar {
      grid-template-columns: 1fr auto auto;
      padding: var(--space-xs) var(--space-md);
      padding-bottom: env(safe-area-inset-bottom, 0);
      gap: var(--space-sm);
      height: var(--mini-player-height);
      cursor: pointer;
      margin-bottom: var(--tab-bar-height);
    }

    /* Disable compact on mobile — already compact */
    .transport-bar.compact {
      height: var(--mini-player-height);
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
    .transport-controls .audiophile-btn { display: none; }

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

    .mobile-volume-wrapper {
      display: flex;
      align-items: center;
    }
  }

  /* --- Mobile Volume Popup --- */
  .mobile-volume-wrapper {
    display: none;
    position: relative;
  }

  .mobile-volume-btn {
    width: 36px;
    height: 36px;
  }

  .mobile-volume-btn svg {
    width: 18px;
    height: 18px;
  }

  .mobile-volume-btn.muted {
    color: var(--tune-warning);
  }

  .mobile-volume-backdrop {
    position: fixed;
    inset: 0;
    z-index: 199;
  }

  .mobile-volume-popup {
    position: absolute;
    bottom: calc(100% + 12px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 12px;
    padding: 14px 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    z-index: 200;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.4);
    animation: volumePopIn 0.15s ease-out;
  }

  @keyframes volumePopIn {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  .mobile-mute-btn {
    background: none;
    border: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: color 0.12s;
  }

  .mobile-mute-btn:hover {
    color: var(--tune-text);
  }

  .mobile-volume-slider {
    writing-mode: vertical-lr;
    direction: rtl;
    width: 4px;
    height: 120px;
    -webkit-appearance: slider-vertical;
    appearance: slider-vertical;
    background: var(--tune-border);
    border-radius: 2px;
    outline: none;
  }

  .mobile-volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--tune-accent);
    cursor: pointer;
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
  }

  .mobile-volume-slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--tune-accent);
    border: none;
    cursor: pointer;
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
  }

  .mobile-volume-steps {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mobile-step-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid var(--tune-border);
    background: rgba(255, 255, 255, 0.05);
    color: var(--tune-text);
    font-size: 18px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s;
  }

  .mobile-step-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .mobile-step-btn:active {
    transform: scale(0.9);
  }

  .mobile-volume-value {
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text);
    font-variant-numeric: tabular-nums;
    min-width: 28px;
    text-align: center;
  }

  /* Kiosk mode: full-width transport bar with bigger controls */
  :global([data-kiosk]) .transport-bar {
    grid-template-columns: 1fr auto 1fr;
    padding: 4px 16px 0;
    gap: 2px 16px;
    height: 80px;
    cursor: default;
    margin-bottom: 0;
  }

  :global([data-kiosk]) .transport-left :global(.album-art) {
    width: 52px !important;
    height: 52px !important;
    min-width: 52px !important;
    min-height: 52px !important;
  }

  :global([data-kiosk]) .transport-controls {
    gap: 16px;
  }

  :global([data-kiosk]) .control-btn {
    width: 48px;
    height: 48px;
  }

  :global([data-kiosk]) .control-btn svg {
    width: 24px;
    height: 24px;
  }

  :global([data-kiosk]) .play-btn {
    width: 56px;
    height: 56px;
  }

  :global([data-kiosk]) .play-btn svg {
    width: 28px;
    height: 28px;
  }

  :global([data-kiosk]) .control-btn.small {
    width: 40px;
    height: 40px;
  }

  :global([data-kiosk]) .control-btn.small svg {
    width: 20px;
    height: 20px;
  }

  /* Show all controls in kiosk (not mobile-reduced) */
  :global([data-kiosk]) .transport-right {
    display: flex;
  }

  :global([data-kiosk]) .mobile-volume-wrapper {
    display: none;
  }

  /* Progress track: thicker for touch */
  :global([data-kiosk]) .progress-track {
    height: 24px;
  }

  :global([data-kiosk]) .progress-track::before {
    height: 6px;
  }

  :global([data-kiosk]) .progress-fill {
    height: 6px;
  }

  :global([data-kiosk]) .zone-selector-btn {
    padding: 8px 14px;
    font-size: 14px;
    min-height: 44px;
  }

  :global([data-kiosk]) .mini-title {
    font-size: 13px;
  }

  :global([data-kiosk]) .mini-artist {
    font-size: 12px;
  }
</style>

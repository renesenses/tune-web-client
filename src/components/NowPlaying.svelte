<script lang="ts">
  import { currentZone } from '../lib/stores/zones';
  import { seekPositionMs, currentTrack, playbackState, shuffleEnabled, repeatMode } from '../lib/stores/nowPlaying';
  import { upNextTracks } from '../lib/stores/queue';
  import { formatTime, getQualityTier, getQualityTierLabel, getQualityTierColor, formatQualitySource, formatQualityTooltip, formatCompactQuality } from '../lib/utils';
  import * as api from '../lib/api';
  import AlbumArt from './AlbumArt.svelte';
  import SeekBar from './SeekBar.svelte';
  import NowPlayingLyrics from './NowPlayingLyrics.svelte';
  import NowPlayingEqPanel from './NowPlayingEqPanel.svelte';
  import AudioVisualizer from './AudioVisualizer.svelte';
  import { t } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import { selectedArtist, selectedAlbum, artistAlbums, libraryTab, yearFilter } from '../lib/stores/library';
  import { activeView } from '../lib/stores/navigation';
  import VolumeControl from './VolumeControl.svelte';
  import type { RepeatMode, Track, TrackCredit } from '../lib/types';

  let isFavorite = $state(false);
  let favChecking = $state(false);
  let showSignalDetail = $state(false);
  let showCredits = $state(false);
  let npCredits: TrackCredit[] = $state([]);
  let npCreditsTrackId: number | null = $state(null);
  let creditsEnriching = $state(false);
  let showLyrics = $state(false);
  let npLyrics: string | null = $state(null);
  let npSyncedRaw: string | null = $state(null);
  let npLyricsTrackId: number | null = $state(null);
  let lyricsLoading = $state(false);
  let showEq = $state(false);

  // Lightbox state for hi-res artwork zoom
  let showLightbox = $state(false);
  let currentEqPreset = $state('flat');
  let karaokeMode = $state(false);
  let syncedLines: { time: number; text: string }[] = $state([]);

  // Audio Visualizer
  let vizMode = $state<'spectrum' | 'waveform'>('spectrum');

  // Sleep Timer
  let showSleepMenu = $state(false);
  let sleepActive = $state(false);
  let sleepMinutes = $state(0);

  // Crossfade
  let crossfadeEnabled = $state(false);
  let crossfadeDuration = $state(3);

  // Normalization
  let normEnabled = $state(false);
  let normTargetLufs = $state(-14);

  // Alarm Clock
  let showAlarm = $state(false);
  let alarmTime = $state('');
  let alarmActive = $state(false);
  let alarmSetting = $state(false);

  async function handleSetAlarm() {
    if (!zone?.id || !alarmTime) return;
    alarmSetting = true;
    try {
      await api.setAlarm(zone.id, alarmTime);
      alarmActive = true;
      showAlarm = false;
      notifications.success(`Reveil programme a ${alarmTime}`);
    } catch (e) {
      console.error('Alarm error:', e);
      notifications.error('Erreur reveil');
    }
    alarmSetting = false;
  }

  async function handleCancelAlarm() {
    if (!zone?.id) return;
    try {
      await api.cancelAlarm(zone.id);
      alarmActive = false;
      alarmTime = '';
      notifications.success('Reveil annule');
    } catch (e) {
      console.error('Cancel alarm error:', e);
    }
  }

  async function loadAlarmState() {
    if (!zone?.id) return;
    try {
      const r = await api.getAlarm(zone.id);
      alarmActive = !!r.time;
      if (r.time) alarmTime = r.time;
    } catch {}
  }

  $effect(() => {
    if (zone?.id) loadAlarmState();
  });

  // DSP / Crossfeed
  let showDspMenu = $state(false);
  let currentCrossfeed = $state<string | null>(null);
  const DSP_PRESETS = [
    { value: null, label: 'Off' },
    { value: 'light', label: 'Light' },
    { value: 'medium', label: 'Medium' },
    { value: 'strong', label: 'Strong' },
  ];

  async function handleSleepTimer(minutes: number) {
    if (!zone?.id) return;
    try {
      await api.setSleepTimer(zone.id, minutes);
      sleepActive = minutes > 0;
      sleepMinutes = minutes;
      showSleepMenu = false;
      notifications.success(minutes > 0 ? `Sleep timer: ${minutes} min` : 'Sleep timer off');
    } catch (e) {
      console.error('Sleep timer error:', e);
      notifications.error('Erreur sleep timer');
    }
  }

  async function loadSleepTimer() {
    if (!zone?.id) return;
    try {
      const r = await api.getSleepTimer(zone.id);
      sleepActive = r.active;
    } catch {}
  }

  async function toggleCrossfade() {
    if (!zone?.id) return;
    try {
      const next = !crossfadeEnabled;
      await api.setCrossfade(zone.id, next, crossfadeDuration);
      crossfadeEnabled = next;
      notifications.success(next ? `Crossfade: ${crossfadeDuration}s` : 'Crossfade off');
    } catch (e) {
      console.error('Crossfade error:', e);
    }
  }

  async function toggleNormalization() {
    if (!zone?.id) return;
    try {
      const next = !normEnabled;
      await api.setNormalization(zone.id, next, normTargetLufs);
      normEnabled = next;
      notifications.success(next ? `Normalisation: ${normTargetLufs} LUFS` : 'Normalisation off');
    } catch (e) {
      console.error('Normalization error:', e);
    }
  }

  async function handleDsp(crossfeed: string | null) {
    if (!zone?.id) return;
    try {
      await api.setDSP(zone.id, crossfeed);
      currentCrossfeed = crossfeed;
      showDspMenu = false;
      notifications.success(crossfeed ? `DSP Crossfeed: ${crossfeed}` : 'DSP off');
    } catch (e) {
      console.error('DSP error:', e);
    }
  }

  // Load sleep timer state when zone changes
  $effect(() => {
    if (zone?.id) loadSleepTimer();
  });

  function parseSyncedLyrics(raw: string): { time: number; text: string }[] {
    const lines: { time: number; text: string }[] = [];
    for (const line of raw.split('\n')) {
      const m = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/);
      if (m) {
        const mins = parseInt(m[1]);
        const secs = parseInt(m[2]);
        const ms = parseInt(m[3].padEnd(3, '0'));
        lines.push({ time: mins * 60000 + secs * 1000 + ms, text: m[4] });
      }
    }
    return lines;
  }

  const EQ_PRESETS = [
    { value: 'flat', label: 'Flat' },
    { value: 'bass_boost', label: 'Bass Boost' },
    { value: 'treble_boost', label: 'Treble Boost' },
    { value: 'vocal', label: 'Vocal' },
    { value: 'rock', label: 'Rock' },
    { value: 'jazz', label: 'Jazz' },
    { value: 'classical', label: 'Classical' },
  ];

  async function setEqPreset(preset: string) {
    if (!zone?.id) return;
    try {
      await api.setEqualizer(zone.id, preset);
      currentEqPreset = preset;
    } catch (e) { console.error('EQ error:', e); }
  }

  async function handleShare() {
    if (!zone?.id) return;
    try {
      const card = await api.shareNowPlaying(zone.id);
      await navigator.clipboard.writeText(card.text);
      notifications.success('Copie dans le presse-papier !');
    } catch (e) { console.error('Share error:', e); }
  }

  async function loadNpCredits(trackId: number) {
    if (trackId === npCreditsTrackId) return;
    npCreditsTrackId = trackId;
    try {
      npCredits = await api.getTrackCredits(trackId);
    } catch {
      npCredits = [];
    }
  }

  // Stable display order — composer/lyricist top, performer bulk in the
  // middle, engineering credits last. Anything else falls through to the
  // raw role string.
  const ROLE_ORDER = [
    'composer', 'lyricist', 'arranger', 'conductor',
    'performer', 'producer', 'mixer', 'engineer',
  ];

  function formatRole(role: string): string {
    const key = `credits.${role}`;
    const localized = $t(key);
    // Fall back to title-cased raw role when the locale dict doesn't have
    // a translation (we get back the key verbatim from $t in that case).
    if (localized && localized !== key) return localized;
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  // De-dup credits by (artist_id || artist_name, role, instrument) — MB
  // enrichment can return the same triple twice when a track has two
  // identifying tags pointing at the same artist relation.
  function dedupCredits(credits: TrackCredit[]): TrackCredit[] {
    const seen = new Set<string>();
    const out: TrackCredit[] = [];
    for (const c of credits) {
      const key = `${c.artist_id ?? c.artist_name}|${c.role}|${c.instrument ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }

  // Sort role groups by ROLE_ORDER, unknown roles trail alphabetically.
  function sortedRoleEntries(credits: TrackCredit[]) {
    const groups = Object.groupBy(dedupCredits(credits), c => c.role);
    return Object.entries(groups).sort(([a], [b]) => {
      const ai = ROLE_ORDER.indexOf(a);
      const bi = ROLE_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }

  async function navigateToArtist(artistId: number | undefined, artistName: string) {
    if (!artistId) return;
    // Open the Library → Artists tab on this artist. We fetch the full
    // artist record (with bio / image_path) and the album list so the
    // detail view doesn't show an empty shell while the user gets there
    // from a credit click.
    try {
      const [artist, albums] = await Promise.all([
        api.getArtist(artistId).catch(() => null),
        api.getArtistAlbums(artistId).catch(() => []),
      ]);
      selectedArtist.set(artist ?? ({ id: artistId, name: artistName } as any));
      artistAlbums.set(albums ?? []);
    } catch {
      selectedArtist.set({ id: artistId, name: artistName } as any);
    }
    libraryTab.set('artists');
    activeView.set('library');
  }

  async function navigateToAlbum(albumId: number | undefined, albumTitle?: string) {
    if (!albumId) return;
    try {
      const album = await api.getAlbum(albumId).catch(() => null);
      selectedAlbum.set(album ?? ({ id: albumId, title: albumTitle ?? '' } as any));
    } catch {
      selectedAlbum.set({ id: albumId, title: albumTitle ?? '' } as any);
    }
    libraryTab.set('albums');
    activeView.set('library');
  }

  function navigateToYear(year: number | undefined) {
    if (!year) return;
    yearFilter.set(year);
    libraryTab.set('albums');
    activeView.set('library');
  }

  async function enrichCurrentTrackCredits() {
    const tr = displayTrack;
    if (!tr?.id || creditsEnriching) return;
    creditsEnriching = true;
    try {
      await api.enrichTrackCredits(tr.id);
      // Force refetch — MB lookup just wrote new rows server-side.
      npCreditsTrackId = null;
      await loadNpCredits(tr.id);
    } catch {
      notifications.add({ message: $t('credits.enrich.failed'), type: 'error' });
    } finally {
      creditsEnriching = false;
    }
  }

  async function loadNpLyrics(trackId: number) {
    if (trackId === npLyricsTrackId) return;
    npLyricsTrackId = trackId;
    lyricsLoading = true;
    try {
      const result = await api.getTrackLyrics(trackId);
      npLyrics = result.lyrics;
      npSyncedRaw = result.synced ?? null;
      if (npSyncedRaw) {
        syncedLines = parseSyncedLyrics(npSyncedRaw);
      } else {
        syncedLines = [];
      }
    } catch {
      npLyrics = null;
      npSyncedRaw = null;
      syncedLines = [];
    }
    lyricsLoading = false;
  }

  // Auto-load credits and lyrics when track changes (progressive enhancement)
  $effect(() => {
    const tr = displayTrack;
    if (!tr?.id) return;
    // Always pre-load credits for the inline summary
    loadNpCredits(tr.id);
    // Auto-load lyrics if panel is open
    if (showLyrics) loadNpLyrics(tr.id);
    // Reset when track changes
    if (tr?.id !== npCreditsTrackId) { npCredits = []; npCreditsTrackId = null; }
    if (tr?.id !== npLyricsTrackId) { npLyrics = null; npSyncedRaw = null; syncedLines = []; npLyricsTrackId = null; karaokeMode = false; }
  });

  // Compact inline credits summary: "Piano: K. Jarrett / Bass: G. Peacock / Drums: J. DeJohnette"
  let inlineCredits = $derived.by(() => {
    if (npCredits.length === 0) return '';
    const unique = dedupCredits(npCredits);
    // Show primary roles: performer, composer, conductor (skip engineer etc.)
    const primaryRoles = ['performer', 'composer', 'conductor', 'arranger', 'lyricist'];
    const primary = unique.filter(c => primaryRoles.includes(c.role));
    const credits = primary.length > 0 ? primary : unique.slice(0, 6);
    // Group by role
    const groups = Object.groupBy(credits, c => c.role);
    const parts: string[] = [];
    for (const [role, members] of Object.entries(groups)) {
      if (!members) continue;
      const names = members.slice(0, 3).map(m => {
        let name = m.artist_name;
        if (m.instrument) name += ` (${m.instrument})`;
        return name;
      });
      if (members.length > 3) names.push('...');
      parts.push(`${formatRole(role)}: ${names.join(', ')}`);
    }
    return parts.join(' · ');
  });

  const _detailTr: Record<string, string> = {
    'Renderer fetches audio directly from source — zero processing': 'signal.directUrlDetail',
    'DSD stream served bit-perfect to DSD-capable renderer': 'signal.nativeDsdDetail',
    'Native format streamed without re-encoding': 'signal.filePassthroughDetail',
    'Local file': 'signal.localFile',
    'Live radio stream': 'signal.liveRadio',
    'Network': 'signal.network',
    'Dlna': 'DLNA', 'Local': 'Local', 'Airplay': 'AirPlay',
  };
  const _descTr: Record<string, string> = {
    'Direct URL Passthrough': 'signal.directUrl',
    'Native DSD Passthrough': 'signal.nativeDsd',
    'File Passthrough': 'signal.filePassthrough',
  };
  function trDetail(text: string | null | undefined): string {
    if (!text) return '';
    const k = _detailTr[text];
    if (k?.startsWith('signal.')) return $t(k as any);
    return k ?? text;
  }
  function trDesc(text: string): string {
    const k = _descTr[text];
    if (k) return $t(k as any);
    if (text.startsWith('Streaming CDN')) return text.replace('Streaming CDN', $t('signal.streamingCdn' as any));
    return text;
  }

  $effect(() => {
    const tr = track;
    if (tr?.source === 'radio' && tr.title && tr.artist_name) {
      api.apiFetch(`/radio-favorites/is-favorite?title=${encodeURIComponent(tr.title)}&artist=${encodeURIComponent(tr.artist_name)}`)
        .then((r: any) => { isFavorite = r.is_favorite; })
        .catch(() => { isFavorite = false; });
    } else {
      isFavorite = false;
    }
  });

  async function toggleFav() {
    if (favChecking) return;
    favChecking = true;
    try {
      if (isFavorite) {
        const favs = await api.apiFetch('/radio-favorites?limit=500');
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
  import { ytPlayerState, ytVideoRect, showYTVideo, hideYTVideo } from '../lib/stores/ytPlayer';
  import { onDestroy, onMount } from 'svelte';

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

  // Close lightbox on Escape
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && showLightbox) {
      showLightbox = false;
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    hideYTVideo();
    window.removeEventListener('keydown', handleKeydown);
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
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="artwork-clickable" onclick={() => { if (!ytActive) showLightbox = true; }}>
            <AlbumArt coverPath={displayTrack.cover_path} albumId={displayTrack.album_id} size={isWide ? 420 : 440} alt={displayTrack.title} />
            {#if !ytActive}
              <div class="artwork-zoom-hint">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              </div>
            {/if}
          </div>
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
        {#if displayTrack.format || displayTrack.sample_rate || displayTrack.bit_depth}
          {@const tier = getQualityTier(displayTrack)}
          <div
            class="artwork-quality-badge tier-{getQualityTierColor(tier)}"
            title={formatQualityTooltip(displayTrack)}
          >
            <span class="aqb-tier">{getQualityTierLabel(tier)}</span>
            <span class="aqb-detail">{formatQualitySource(displayTrack)}</span>
          </div>
        {/if}
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
          <div class="track-title-row">
            <h2 class="track-title truncate">{displayTrack.title}</h2>
            {#if isRadio}
              <button class="np-fav-btn" class:is-fav={isFavorite} onclick={toggleFav}>
                <svg viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" width="22" height="22">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>
            {/if}
          </div>
          {#if displayTrack.artist_name && displayTrack.artist_name !== displayTrack.album_title}
            {#if displayTrack.artist_id}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <p class="track-artist truncate clickable" onclick={() => navigateToArtist(displayTrack.artist_id!, displayTrack.artist_name!)}>{displayTrack.artist_name}</p>
            {:else}
              <p class="track-artist truncate">{displayTrack.artist_name}</p>
            {/if}
          {/if}
          {#if !isRadio && inlineCredits}
            <p class="inline-credits">{inlineCredits}</p>
          {/if}
          {#if !isRadio && displayTrack.album_title}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            {#if displayTrack.album_id}
              <p class="track-album truncate clickable" onclick={() => navigateToAlbum(displayTrack.album_id, displayTrack.album_title)}>{displayTrack.album_title}{#if displayTrack.year} <span class="track-year clickable" onclick={(e) => { e.stopPropagation(); navigateToYear(displayTrack.year!); }}>({displayTrack.year})</span>{/if}</p>
            {:else}
              <p class="track-album truncate">{displayTrack.album_title}{#if displayTrack.year} <span class="track-year clickable" onclick={(e) => { e.stopPropagation(); navigateToYear(displayTrack.year!); }}>({displayTrack.year})</span>{/if}</p>
            {/if}
          {/if}
          {#if !isRadio && displayTrack.id}
            <div class="np-extra-btns">
            <button class="np-credits-btn" class:active={showCredits} onclick={() => { showCredits = !showCredits; showLyrics = false; if (showCredits && displayTrack.id) loadNpCredits(displayTrack.id); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              {$t('artist.credits')}
            </button>
            {#if showCredits}
              {#if npCredits.length > 0}
                <div class="np-credits">
                  {#each sortedRoleEntries(npCredits) as [role, credits]}
                    <div class="np-credits-group">
                      <span class="np-credits-role">{formatRole(role)}</span>
                      <div class="np-credits-names">
                        {#each credits ?? [] as c}
                          <button
                            class="np-credit-chip"
                            class:linkable={!!c.artist_id}
                            disabled={!c.artist_id}
                            onclick={() => navigateToArtist(c.artist_id, c.artist_name)}
                          >
                            {c.artist_name}{#if c.instrument}<span class="np-credit-instr">{c.instrument}</span>{/if}
                          </button>
                        {/each}
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="np-credits-empty">
                  <div class="np-credits-empty-title">{$t('credits.empty.title')}</div>
                  <button
                    class="np-credits-empty-cta"
                    onclick={enrichCurrentTrackCredits}
                    disabled={creditsEnriching}
                  >
                    {creditsEnriching ? $t('credits.enrich.in_progress') : $t('credits.empty.cta_enrich')}
                  </button>
                </div>
              {/if}
            {/if}
            <button class="np-credits-btn" class:active={showLyrics} onclick={() => { showLyrics = !showLyrics; showCredits = false; showEq = false; if (!showLyrics) karaokeMode = false; if (showLyrics && displayTrack.id) loadNpLyrics(displayTrack.id); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
              Paroles
            </button>
            <button class="np-credits-btn" class:active={showEq} onclick={() => { showEq = !showEq; showCredits = false; showLyrics = false; karaokeMode = false; }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></svg>
              EQ
            </button>
            <button class="np-credits-btn" onclick={handleShare}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
              Partager
            </button>
            <div class="np-sleep-wrapper" style="position:relative;display:inline-flex">
              <button class="np-credits-btn" class:active={sleepActive} onclick={() => { showSleepMenu = !showSleepMenu; showDspMenu = false; }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                Sleep
              </button>
              {#if showSleepMenu}
                <div class="np-sleep-dropdown">
                  {#each [15, 30, 45, 60] as m}
                    <button class="sleep-option" class:active={sleepActive && sleepMinutes === m} onclick={() => handleSleepTimer(m)}>{m} min</button>
                  {/each}
                  <button class="sleep-option sleep-off" onclick={() => handleSleepTimer(0)}>Off</button>
                </div>
              {/if}
            </div>
            <div class="np-sleep-wrapper" style="position:relative;display:inline-flex">
              <button class="np-credits-btn" class:active={currentCrossfeed !== null} onclick={() => { showDspMenu = !showDspMenu; showSleepMenu = false; }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M2 12h4l3-9 6 18 3-9h4" /></svg>
                DSP
              </button>
              {#if showDspMenu}
                <div class="np-sleep-dropdown">
                  {#each DSP_PRESETS as preset}
                    <button class="sleep-option" class:active={currentCrossfeed === preset.value} onclick={() => handleDsp(preset.value)}>{preset.label}</button>
                  {/each}
                </div>
              {/if}
            </div>
            <button class="np-credits-btn" class:active={alarmActive || showAlarm} onclick={() => { showAlarm = !showAlarm; showSleepMenu = false; showDspMenu = false; }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3L2 6"/><path d="M22 6l-3-3"/></svg>
              Reveil
            </button>
            </div>
            {#if showAlarm}
              <div class="np-alarm-panel">
                <div class="alarm-row">
                  <input type="time" class="alarm-time-input" bind:value={alarmTime} />
                  <button class="alarm-set-btn" onclick={handleSetAlarm} disabled={alarmSetting || !alarmTime}>
                    {alarmSetting ? '...' : 'Activer'}
                  </button>
                  {#if alarmActive}
                    <button class="alarm-cancel-btn" onclick={handleCancelAlarm}>Annuler</button>
                  {/if}
                </div>
                {#if alarmActive}
                  <span class="alarm-status">Reveil actif : {alarmTime}</span>
                {/if}
              </div>
            {/if}
            {#if showLyrics}
              <NowPlayingLyrics
                loading={lyricsLoading}
                lyrics={npLyrics}
                {syncedLines}
                {karaokeMode}
                onToggleKaraoke={() => { karaokeMode = !karaokeMode; }}
              />
            {/if}
            {#if showEq}
              <NowPlayingEqPanel current={currentEqPreset} onSelect={setEqPreset} />
            {/if}
          {/if}
          {#if zone?.signal_path}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="signal-path-pill" class:bit-perfect={zone.signal_path.bit_perfect} onclick={() => showSignalDetail = !showSignalDetail}>
              <span class="sp-dot"></span>
              <span class="sp-label">{zone.signal_path.bit_perfect ? $t('signal.bitPerfect') : $t('signal.transcoded')}</span>
            </div>
            {#if showSignalDetail}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="signal-path-overlay" onclick={() => showSignalDetail = false}>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="signal-path-card" onclick={(e) => e.stopPropagation()}>
                  <div class="sp-card-header">
                    <h3>{$t('signal.title')} : <span class:sp-quality-good={zone.signal_path.bit_perfect} class:sp-quality-lossy={!zone.signal_path.bit_perfect}>{zone.signal_path.bit_perfect ? $t('signal.lossless') : $t('signal.lossy')}</span></h3>
                    <button class="sp-close" onclick={() => showSignalDetail = false}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>

                  <div class="sp-steps">
                    {#each zone.signal_path.steps as step, i}
                      <div class="sp-step">
                        <div class="sp-step-icon-col">
                          <div class="sp-step-icon" class:bit-perfect={zone.signal_path.bit_perfect}>
                            {#if step.stage === 'source'}
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /><line x1="12" y1="2" x2="12" y2="5" /></svg>
                            {:else if step.stage === 'transport' || step.stage === 'decode'}
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                            {:else}
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 010 14.14" /><path d="M15.54 8.46a5 5 0 010 7.07" /></svg>
                            {/if}
                          </div>
                          {#if i < zone.signal_path.steps.length - 1}
                            <div class="sp-step-line" class:bit-perfect={zone.signal_path.bit_perfect}></div>
                          {/if}
                        </div>
                        <div class="sp-step-info">
                          <span class="sp-step-name">{trDesc(step.description)} <span class="sp-step-dot" class:bit-perfect={zone.signal_path.bit_perfect}></span></span>
                          {#if step.sample_rate}
                            <span class="sp-step-detail">{step.format} {step.sample_rate/1000}kHz {step.channels}ch {step.bit_depth}bit</span>
                          {:else if step.detail}
                            <span class="sp-step-detail">{trDetail(step.detail)}</span>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              </div>
            {/if}
          {/if}
        </div>

        <div class="np-visualizer-row">
          <AudioVisualizer
            playing={isEffectivePlaying}
            mode={vizMode}
            height={80}
            sampleRate={displayTrack.sample_rate}
            bitDepth={displayTrack.bit_depth}
            format={displayTrack.format}
          />
          <button class="viz-toggle-btn" onclick={() => vizMode = vizMode === 'spectrum' ? 'waveform' : 'spectrum'} title={vizMode === 'spectrum' ? 'Waveform' : 'Spectrum'}>
            {#if vizMode === 'spectrum'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M2 12c4 0 6-6 10-6s6 6 10 6" /></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="4" y1="20" x2="4" y2="10" /><line x1="8" y1="20" x2="8" y2="4" /><line x1="12" y1="20" x2="12" y2="8" /><line x1="16" y1="20" x2="16" y2="14" /><line x1="20" y1="20" x2="20" y2="6" /></svg>
            {/if}
          </button>
        </div>

        {#if !isRadio}
        <div class="seek-container">
          <SeekBar
            positionMs={$seekPositionMs}
            durationMs={displayTrack.duration_ms ?? 0}
            enabled={state === 'playing' || state === 'paused'}
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


          {#if onAddToPlaylist && (displayTrack?.id || displayTrack?.source_id)}
            <button class="setting-btn" onclick={() => onAddToPlaylist!(displayTrack!)} title={$t('nowplaying.addToPlaylist')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" /><line x1="16" y1="3" x2="16" y2="11" /><line x1="12" y1="7" x2="20" y2="7" />
              </svg>
            </button>
          {/if}

          <button class="setting-btn" class:active={crossfadeEnabled} onclick={toggleCrossfade} title="Crossfade">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <path d="M2 6c4 0 6 6 10 6s6-6 10-6" /><path d="M2 18c4 0 6-6 10-6s6 6 10 6" />
            </svg>
          </button>
          <button class="setting-btn" class:active={normEnabled} onclick={toggleNormalization} title="Normalisation">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="8" y1="8" x2="8" y2="16" /><line x1="12" y1="6" x2="12" y2="18" /><line x1="16" y1="9" x2="16" y2="15" />
            </svg>
          </button>

          <div class="setting-spacer"></div>

          <div class="np-volume-control">
            <VolumeControl />
          </div>

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
                  {#if nextTrack.format}
                    {@const nextTier = getQualityTier(nextTrack)}
                    <span
                      class="up-next-quality tier-{getQualityTierColor(nextTier)}"
                      title={formatQualityTooltip(nextTrack)}
                    >{formatCompactQuality(nextTrack)}</span>
                  {/if}
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

<!-- Lightbox overlay for hi-res artwork -->
{#if showLightbox && resolvedCoverUrl}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="lightbox-overlay" onclick={() => showLightbox = false}>
    <button class="lightbox-close" onclick={() => showLightbox = false}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
    </button>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <img
      class="lightbox-img"
      src={resolvedCoverUrl}
      alt={displayTrack?.title ?? 'Artwork'}
      onclick={(e) => e.stopPropagation()}
    />
    {#if displayTrack}
      <div class="lightbox-caption" onclick={(e) => e.stopPropagation()}>
        <span class="lightbox-title">{displayTrack.title}</span>
        {#if displayTrack.artist_name}
          <span class="lightbox-artist">{displayTrack.artist_name}</span>
        {/if}
        {#if displayTrack.album_title}
          <span class="lightbox-album">{displayTrack.album_title}</span>
        {/if}
      </div>
    {/if}
  </div>
{/if}

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

  @media (min-width: 1400px) {
    .content-layout.wide {
      max-width: 1200px;
    }
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

  @media (min-width: 1400px) {
    .artwork-container {
      max-width: 520px;
    }
    .content-layout.wide .artwork-container {
      max-width: 520px;
    }
  }

  @media (min-width: 1800px) {
    .artwork-container {
      max-width: 640px;
    }
    .content-layout.wide .artwork-container {
      max-width: 640px;
    }
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
    min-width: 0;
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

  .track-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .track-title {
    font-family: var(--font-display);
    font-size: 36px;
    font-weight: 600;
    color: var(--tune-text);
    margin-bottom: var(--space-xs);
    line-height: 1.15;
  }

  .np-fav-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    flex-shrink: 0;
    transition: color 0.2s, transform 0.15s;
  }

  .np-fav-btn:hover {
    color: var(--tune-text);
    transform: scale(1.2);
  }

  .np-fav-btn.is-fav {
    color: #e74c6f;
  }

  .track-artist {
    font-family: var(--font-display);
    font-size: 24px;
    font-weight: 400;
    color: var(--tune-text-secondary);
    margin-bottom: var(--space-xs);
    line-height: 1.2;
  }

  .track-artist.clickable {
    cursor: pointer;
    transition: color 0.15s ease-out;
  }

  .track-artist.clickable:hover {
    color: var(--tune-accent);
    text-decoration: underline;
  }

  .track-year.clickable {
    cursor: pointer;
    transition: color 0.15s ease-out;
  }

  .track-year.clickable:hover {
    color: var(--tune-accent);
    text-decoration: underline;
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

  /* Signal Path — Roon-inspired design */
  .signal-path-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: var(--space-xs);
    cursor: pointer;
    padding: 3px 0;
  }

  .sp-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #f59e0b;
    flex-shrink: 0;
  }

  .signal-path-pill.bit-perfect .sp-dot {
    background: #4ade80;
  }

  .sp-label {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-text-muted);
    letter-spacing: 0.3px;
  }

  .signal-path-pill:hover .sp-label { color: var(--tune-text); }

  .signal-path-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: spFadeIn 0.15s ease-out;
  }

  @keyframes spFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .signal-path-card {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 12px;
    width: 340px;
    max-height: 80vh;
    overflow-y: auto;
    animation: spSlideUp 0.2s ease-out;
  }

  @keyframes spSlideUp {
    from { transform: translateY(12px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .sp-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--tune-border);
  }

  .sp-card-header h3 {
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 400;
    color: var(--tune-text);
    margin: 0;
  }

  .sp-quality-good { color: #4ade80; font-weight: 600; }
  .sp-quality-lossy { color: #f59e0b; font-weight: 600; }

  .sp-close {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
  }

  .sp-close:hover { color: var(--tune-text); }

  .sp-steps {
    padding: 16px 20px 20px;
  }

  .sp-step {
    display: flex;
    gap: 14px;
  }

  .sp-step-icon-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 36px;
    flex-shrink: 0;
  }

  .sp-step-icon {
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

  .sp-step-icon.bit-perfect {
    background: rgba(74, 222, 128, 0.1);
    border-color: rgba(74, 222, 128, 0.3);
    color: #4ade80;
  }

  .sp-step-line {
    width: 2px;
    flex: 1;
    min-height: 16px;
    background: rgba(245, 158, 11, 0.25);
    margin: 4px 0;
  }

  .sp-step-line.bit-perfect {
    background: rgba(74, 222, 128, 0.25);
  }

  .sp-step-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 6px;
    padding-bottom: 8px;
    min-width: 0;
  }

  .sp-step-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 500;
    color: var(--tune-text);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sp-step-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #f59e0b;
    flex-shrink: 0;
  }

  .sp-step-dot.bit-perfect {
    background: #4ade80;
  }

  .sp-step-detail {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-accent);
  }

  .seek-container {
    width: 100%;
  }

  /* Audio Visualizer */
  .np-visualizer-row {
    width: 100%;
    display: flex;
    align-items: flex-end;
    gap: 6px;
    margin: 4px 0;
  }

  .viz-toggle-btn {
    background: none;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    flex-shrink: 0;
    transition: color 0.15s, border-color 0.15s;
    line-height: 0;
  }

  .viz-toggle-btn:hover {
    color: var(--tune-accent);
    border-color: var(--tune-accent);
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

  .up-next-quality {
    font-family: var(--font-label);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.3px;
    padding: 1px 6px;
    border-radius: 3px;
    flex-shrink: 0;
    text-transform: uppercase;
    cursor: default;
  }

  .up-next-quality.tier-gold {
    color: #fbbf24;
    background: rgba(251, 191, 36, 0.12);
  }

  .up-next-quality.tier-silver {
    color: #d1d5db;
    background: rgba(209, 213, 219, 0.1);
  }

  .up-next-quality.tier-gray {
    color: #9ca3af;
    background: rgba(156, 163, 175, 0.08);
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

  /* Now Playing Credits */
  .np-credits-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px solid var(--tune-border);
    border-radius: 14px;
    padding: 3px 10px;
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
    cursor: pointer;
    transition: all 0.12s ease-out;
    margin-top: var(--space-xs);
  }

  .np-credits-btn:hover, .np-credits-btn.active {
    color: var(--tune-accent);
    border-color: var(--tune-accent);
  }

  .np-credits {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: rgba(255, 255, 255, 0.03);
    border-radius: var(--radius-md);
    max-height: 200px;
    overflow-y: auto;
  }

  .np-credits-group {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .np-credits-role {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tune-text-muted);
    white-space: nowrap;
    min-width: 70px;
  }

  .np-credits-names {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .np-credit-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-body);
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 10px;
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.08);
    color: var(--tune-text);
    border: none;
    cursor: default;
  }
  .np-credit-chip.linkable {
    cursor: pointer;
    transition: background 120ms ease;
  }
  .np-credit-chip.linkable:hover {
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.18);
    text-decoration: underline;
  }
  .np-credit-chip:disabled {
    opacity: 0.85;
  }

  .np-credit-instr {
    font-size: 10px;
    color: var(--tune-text-muted);
    font-style: italic;
  }

  .np-credits-empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 4px;
    margin-top: 6px;
  }
  .np-credits-empty-title {
    font-size: 12px;
    color: var(--tune-text-muted);
  }
  .np-credits-empty-cta {
    font-family: var(--font-body);
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.4);
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.08);
    color: var(--tune-text);
    cursor: pointer;
    transition: background 120ms ease;
  }
  .np-credits-empty-cta:hover:not(:disabled) {
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.18);
  }
  .np-credits-empty-cta:disabled {
    opacity: 0.6;
    cursor: progress;
  }

  .np-extra-btns {
    display: flex;
    gap: var(--space-sm);
    margin-top: var(--space-xs);
  }

  .np-lyrics {
    margin-top: var(--space-sm);
    padding: var(--space-md);
    background: rgba(255, 255, 255, 0.03);
    border-radius: var(--radius-md);
    max-height: 300px;
    overflow-y: auto;
  }

  .lyrics-text {
    font-family: var(--font-body);
    font-size: 14px;
    line-height: 1.8;
    color: var(--tune-text-secondary);
    white-space: pre-wrap;
    margin: 0;
  }

  .lyrics-empty {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    font-style: italic;
    margin: 0;
  }

  .np-eq {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin-top: var(--space-sm);
  }

  .eq-preset {
    padding: 4px 12px;
    border: 1px solid var(--tune-border);
    border-radius: 14px;
    background: none;
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .eq-preset.active {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.1);
  }

  .eq-preset:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  /* Sleep Timer / DSP dropdown */
  .np-sleep-dropdown {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 10px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    z-index: 20;
    box-shadow: var(--shadow-lg);
    min-width: 80px;
    margin-bottom: 6px;
  }

  .sleep-option {
    background: none;
    border: none;
    padding: 6px 12px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.1s;
    white-space: nowrap;
  }

  .sleep-option:hover {
    background: var(--tune-surface-hover);
    color: var(--tune-text);
  }

  .sleep-option.active {
    color: var(--tune-accent);
    font-weight: 600;
  }

  .sleep-option.sleep-off {
    color: var(--tune-warning);
  }

  /* Alarm panel */
  .np-alarm-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: rgba(255, 255, 255, 0.03);
    border-radius: var(--radius-md);
  }

  .alarm-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .alarm-time-input {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    outline: none;
  }

  .alarm-time-input:focus {
    border-color: var(--tune-accent);
  }

  .alarm-set-btn {
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    padding: 4px 12px;
    font-family: var(--font-body);
    font-size: 12px;
    cursor: pointer;
  }

  .alarm-set-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .alarm-cancel-btn {
    background: none;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-warning);
    cursor: pointer;
  }

  .alarm-status {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-accent);
  }

  /* Artwork click-to-zoom */
  .artwork-clickable {
    cursor: zoom-in;
    position: relative;
    width: 100%;
    height: 100%;
  }

  .artwork-zoom-hint {
    position: absolute;
    bottom: 10px;
    left: 10px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s ease-out;
    backdrop-filter: blur(4px);
    pointer-events: none;
  }

  .artwork-clickable:hover .artwork-zoom-hint {
    opacity: 1;
  }

  /* Audio quality badge on artwork */
  .artwork-quality-badge {
    position: relative;
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 3px 10px;
    border-radius: 4px;
    background: rgba(60, 60, 63, 0.6);
    backdrop-filter: blur(8px);
    text-transform: uppercase;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: default;
    transition: transform 0.15s ease-out;
    margin-bottom: var(--space-sm);
  }

  .artwork-quality-badge:hover {
    transform: scale(1.05);
  }

  .aqb-tier {
    font-weight: 800;
    letter-spacing: 0.8px;
  }

  .aqb-detail {
    font-weight: 500;
    opacity: 0.85;
    letter-spacing: 0.3px;
  }

  /* Gold tier (MQA / Hi-Res) */
  .artwork-quality-badge.tier-gold {
    color: #fbbf24;
    border: 1px solid rgba(251, 191, 36, 0.4);
    box-shadow: 0 0 8px rgba(251, 191, 36, 0.15);
  }
  .artwork-quality-badge.tier-gold .aqb-tier {
    color: #fcd34d;
  }

  /* Silver tier (CD quality) */
  .artwork-quality-badge.tier-silver {
    color: #d1d5db;
    border: 1px solid rgba(209, 213, 219, 0.3);
  }
  .artwork-quality-badge.tier-silver .aqb-tier {
    color: #e5e7eb;
  }

  /* Gray tier (Lossy) */
  .artwork-quality-badge.tier-gray {
    color: #9ca3af;
    border: 1px solid rgba(156, 163, 175, 0.25);
  }
  .artwork-quality-badge.tier-gray .aqb-tier {
    color: #9ca3af;
  }

  /* Inline credits summary below artist name */
  .inline-credits {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    line-height: 1.4;
    margin-bottom: var(--space-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  /* Lightbox overlay */
  .lightbox-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.92);
    z-index: 500;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    animation: lightboxFadeIn 0.2s ease-out;
    cursor: zoom-out;
  }

  @keyframes lightboxFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .lightbox-close {
    position: absolute;
    top: 16px;
    right: 16px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    width: 40px;
    height: 40px;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 501;
    transition: background 0.15s;
  }

  .lightbox-close:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .lightbox-img {
    max-width: min(90vw, 800px);
    max-height: 75vh;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
    cursor: default;
    animation: lightboxImgIn 0.25s ease-out;
  }

  @keyframes lightboxImgIn {
    from { transform: scale(0.92); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  .lightbox-caption {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    margin-top: 16px;
    cursor: default;
  }

  .lightbox-title {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 600;
    color: white;
  }

  .lightbox-artist {
    font-family: var(--font-body);
    font-size: 14px;
    color: rgba(255, 255, 255, 0.7);
  }

  .lightbox-album {
    font-family: var(--font-body);
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  }

  /* Volume control inside Now Playing — hidden on desktop (transport bar has it), shown on mobile */
  .np-volume-control {
    display: none;
  }

  @media (max-width: 768px) {
    .np-volume-control {
      display: flex;
      align-items: center;
      width: 100%;
      margin-top: var(--space-xs);
    }

    /* Reset the spacer above so volume goes full width */
    .settings-row {
      flex-wrap: wrap;
    }
  }

  /* Responsive: hide inline credits on very small screens */
  @media (max-width: 480px) {
    .inline-credits {
      display: none;
    }
  }

  @media (max-width: 768px) {
    .inline-credits {
      font-size: 11px;
      -webkit-line-clamp: 1;
    }

    .artwork-quality-badge {
      font-size: 9px;
      padding: 2px 8px;
      gap: 4px;
    }

    .aqb-detail {
      display: none;
    }

    .lightbox-img {
      max-width: 95vw;
      max-height: 70vh;
    }
  }

  /* Kiosk mode: landscape 800x480 touchscreen optimization */
  :global([data-kiosk]) .now-playing {
    padding: 8px 16px;
    padding-top: 8px;
  }

  :global([data-kiosk]) .content-layout {
    flex-direction: row;
    align-items: center;
    gap: 20px;
    max-width: 100%;
  }

  :global([data-kiosk]) .artwork-container {
    max-width: 280px;
    min-width: 240px;
    flex-shrink: 0;
  }

  :global([data-kiosk]) .info-column {
    max-width: none;
    flex: 1;
    min-width: 0;
  }

  :global([data-kiosk]) .track-title {
    font-size: 22px;
    margin-bottom: 2px;
  }

  :global([data-kiosk]) .track-artist {
    font-size: 16px;
    margin-bottom: 2px;
  }

  :global([data-kiosk]) .track-album {
    font-size: 12px;
    margin-bottom: 2px;
  }

  :global([data-kiosk]) .inline-credits {
    display: none;
  }

  :global([data-kiosk]) .np-extra-btns {
    display: none;
  }

  :global([data-kiosk]) .np-credits,
  :global([data-kiosk]) .np-lyrics,
  :global([data-kiosk]) .np-eq {
    display: none;
  }

  :global([data-kiosk]) .up-next {
    display: none;
  }

  :global([data-kiosk]) .artwork-zoom-hint {
    display: none;
  }

  :global([data-kiosk]) .artwork-quality-badge {
    font-size: 9px;
    padding: 2px 8px;
    margin-bottom: 4px;
  }

  :global([data-kiosk]) .seek-container {
    margin-top: 4px;
  }

  :global([data-kiosk]) .settings-row {
    gap: 4px;
  }

  :global([data-kiosk]) .np-volume-control {
    display: flex;
    align-items: center;
    width: 100%;
    margin-top: 4px;
  }

  :global([data-kiosk]) .bg-blur {
    filter: blur(60px) brightness(0.25);
  }
</style>

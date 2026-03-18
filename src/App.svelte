<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { tuneWS } from './lib/websocket';
  import { zones, currentZoneId, currentZone } from './lib/stores/zones';
  import { devices } from './lib/stores/devices';
  import { seekPositionMs, startSeekTimer, stopSeekTimer, shuffleEnabled, repeatMode } from './lib/stores/nowPlaying';
  import { queueTracks, queuePosition, queueLength } from './lib/stores/queue';
  import { playlists as playlistsStore, playlistsLoaded } from './lib/stores/playlists';
  import { connectionState } from './lib/stores/connection';
  import { activeView } from './lib/stores/navigation';
  import { preferences, applyTheme } from './lib/stores/preferences';
  import { locale } from './lib/i18n';
  import { setupKeyboardShortcuts } from './lib/keyboard';
  import { playbackHistory } from './lib/stores/history';
  import { ytPlayerState, ytLoading, playVideo, pauseVideo, resumeVideo, stopVideo, clearYTLoading } from './lib/stores/ytPlayer';
  import { get } from 'svelte/store';
  import { t } from './lib/i18n';
  import * as api from './lib/api';
  import Sidebar from './components/Sidebar.svelte';
  import NowPlaying from './components/NowPlaying.svelte';
  import TransportBar from './components/TransportBar.svelte';
  import QueueView from './components/QueueView.svelte';
  import LibraryView from './components/LibraryView.svelte';
  import SearchView from './components/SearchView.svelte';
  import PlaylistsView from './components/PlaylistsView.svelte';
  import SettingsView from './components/SettingsView.svelte';
  import HistoryView from './components/HistoryView.svelte';
  import HomeView from './components/HomeView.svelte';
  import StreamingView from './components/StreamingView.svelte';
  import MetadataView from './components/MetadataView.svelte';
  import BrowseView from './components/BrowseView.svelte';
  import RadiosView from './components/RadiosView.svelte';
  import GenresView from './components/GenresView.svelte';
  import MediaServersView from './components/MediaServersView.svelte';
  import AddToPlaylistModal from './components/AddToPlaylistModal.svelte';
  import YTPlayer from './components/YTPlayer.svelte';

  import type { Track } from './lib/types';

  let scanIndicator = $state(false);
  let playlistModalTrack = $state<Track | null>(null);

  function openPlaylistModal(track: Track) {
    playlistModalTrack = track;
  }

  function closePlaylistModal() {
    playlistModalTrack = null;
  }

  async function fetchZones(restoreState = false) {
    try {
      const zoneList = await api.getZones();
      zones.set(zoneList);

      // Zone selection: keep current if already set, otherwise prefer a playing
      // zone over the default/first so the UI reconnects to active playback.
      let curId: number | null = null;
      currentZoneId.subscribe((v) => (curId = v))();
      if (curId === null && zoneList.length > 0) {
        let defaultId: number | null = null;
        preferences.subscribe((p) => (defaultId = p.defaultZoneId))();
        const defaultZone = defaultId !== null ? zoneList.find((z) => z.id === defaultId) : null;
        // Prefer the default if it exists, else the first playing zone, else zone[0]
        const playingZone = zoneList.find((z) => z.state === 'playing');
        const target = defaultZone ?? playingZone ?? zoneList[0];
        if (target?.id != null) currentZoneId.set(target.id);
      }

      // Restore seek state for the selected zone from the already-fetched data.
      // Only on initial load or WS reconnect — not on zone.* events, which would
      // reset the seek position and break the seek timer on every volume change etc.
      if (restoreState) {
        let selectedId: number | null = null;
        currentZoneId.subscribe((v) => (selectedId = v))();
        const selectedZone = zoneList.find((z) => z.id === selectedId);
        if (selectedZone) {
          seekPositionMs.set(selectedZone.position_ms ?? 0);
          if (selectedZone.state === 'playing') {
            startSeekTimer();
            // Restore queue display (not fetched by playback events on reconnect)
            fetchQueue();
            // Restart the muted IFrame if the active track is a YouTube track
            const yt = get(ytPlayerState);
            const track = selectedZone.current_track;
            if (track?.source === 'youtube' && track.source_id && !yt.active) {
              playVideo(track.source_id, track);
              clearYTLoading();
            }
          } else {
            stopSeekTimer();
          }
        }
      }
    } catch (e) {
      console.error('Fetch zones error:', e);
    }
  }

  async function fetchDevices() {
    try {
      const deviceList = await api.getDevices();
      devices.set(deviceList);
    } catch (e) {
      console.error('Fetch devices error:', e);
    }
  }

  async function fetchQueue() {
    let zoneId: number | null = null;
    currentZone.subscribe((z) => (zoneId = z?.id ?? null))();
    if (zoneId === null) return;
    try {
      const qs = await api.getQueue(zoneId);
      queuePosition.set(qs.position);
      queueTracks.set(qs.tracks);
      queueLength.set(qs.length);
    } catch (e) {
      console.error('Fetch queue error:', e);
    }
  }

  async function fetchPlaylists() {
    try {
      const list = await api.getPlaylists();
      playlistsStore.set(list);
      playlistsLoaded.set(true);
    } catch (e) {
      console.error('Fetch playlists error:', e);
    }
  }

  /**
   * Refresh zone state from API and sync seek position.
   * Called on playback events since WS events lack full track/position data.
   */
  async function syncZoneState(zoneId: number) {
    try {
      const zone = await api.getZone(zoneId);
      zones.update((zs) =>
        zs.map((z) => z.id === zoneId ? zone : z)
      );
      // Only update seek position and timer for the currently displayed zone.
      // Events from other zones must not corrupt the active zone's playback state.
      if (get(currentZone)?.id === zoneId) {
        seekPositionMs.set(zone.position_ms ?? 0);
        if (zone.state === 'playing') {
          startSeekTimer();
        } else {
          stopSeekTimer();
        }
      }
    } catch (e) {
      console.error('Sync zone state error:', e);
    }
  }

  onMount(() => {
    // Apply saved preferences (theme + language)
    const unsub = preferences.subscribe((prefs) => {
      applyTheme(prefs.theme);
      locale.set(prefs.language ?? 'fr');
    });
    unsub(); // Read once, theme is applied

    // Apply startup view
    let prefs: { startupView?: string; defaultZoneId?: number | null } = {};
    preferences.subscribe((p) => (prefs = p))();
    if (prefs.startupView) {
      activeView.set(prefs.startupView as any);
    }

    const cleanupKeyboard = setupKeyboardShortcuts();

    connectionState.set('connecting');
    tuneWS.connect();
    fetchZones(true);
    fetchDevices();
    fetchPlaylists();

    tuneWS.onEvent((event) => {
      const type = event.type;

      // Internal connection events
      if (type === '_connected') {
        connectionState.set('connected');
        fetchZones(true);
        fetchDevices();
        return;
      }
      if (type === '_disconnected') {
        connectionState.set('disconnected');
        return;
      }

      // Playback events — refetch zone state since WS events lack full data
      if (type.startsWith('playback.')) {
        const zoneId = event.data?.zone_id;
        if (type === 'playback.position' && event.data?.position_ms !== undefined) {
          // Lightweight position update (no API call)
          seekPositionMs.set(event.data.position_ms);
        } else if (type === 'playback.queue_changed') {
          fetchQueue();
          if (zoneId) syncZoneState(zoneId);
        } else if (zoneId) {
          // For started/resumed/paused/stopped/track_changed: fetch full zone state
          syncZoneState(zoneId).then(() => {
            // IFrame sync and history only concern the active zone
            if (get(currentZone)?.id !== zoneId) return;

            const z = get(currentZone);

            // Sync muted IFrame with backend playback state
            const yt = get(ytPlayerState);
            if (type === 'playback.paused' || type === 'playback.stopped') {
              ytLoading.set(false);
              if (yt.active) pauseVideo();
            } else if (type === 'playback.resumed') {
              ytLoading.set(false);
              if (yt.active) resumeVideo();
            } else if (type === 'playback.started' || type === 'playback.track_changed') {
              if (z?.current_track && z.current_track.source !== 'youtube') {
                // New track is not YouTube — stop IFrame if active
                if (yt.active) stopVideo();
              } else if (z?.current_track?.source === 'youtube' && z.current_track.source_id) {
                const sourceId = z.current_track.source_id;
                if (yt.active && yt.videoId === sourceId) {
                  // IFrame already has the right video (single track flow) — just clear loading
                  clearYTLoading();
                } else {
                  // New video (next/previous/playlist) — load it in IFrame; DLNA already started
                  playVideo(sourceId, z.current_track);
                  clearYTLoading();
                }
              }
            }

            // Record to playback history on track start/change
            if (type === 'playback.started' || type === 'playback.track_changed') {
              if (z?.current_track) {
                playbackHistory.add(z.current_track, z.name);
              }
            }
          });
          if (type === 'playback.started' || type === 'playback.resumed' || type === 'playback.track_changed') {
            fetchQueue();
          }
        }
        return;
      }

      // Zone events
      if (type.startsWith('zone.')) {
        fetchZones();
        if (type === 'zone.volume_changed' && event.data?.zone_id !== undefined && event.data?.volume !== undefined) {
          zones.update((zs) =>
            zs.map((z) => z.id === event.data.zone_id ? { ...z, volume: event.data.volume } : z)
          );
        }
        return;
      }

      // Library scan events
      if (type.startsWith('library.scan.')) {
        if (type === 'library.scan.started') {
          scanIndicator = true;
        } else if (type === 'library.scan.completed') {
          scanIndicator = false;
        }
        return;
      }

      // Playlist events
      if (type.startsWith('playlist.')) {
        fetchPlaylists();
        return;
      }

      // Device events
      if (type.startsWith('device.')) {
        fetchDevices();
        return;
      }
    });
  });

  onDestroy(() => {
    cleanupKeyboard();
    tuneWS.disconnect();
    stopSeekTimer();
  });
</script>

<div class="app-layout">
  <Sidebar />

  <main class="main-content">
    {#key $activeView}
      <div class="view-transition">
        {#if $activeView === 'home'}
          <HomeView />
        {:else if $activeView === 'nowplaying'}
          <NowPlaying onAddToPlaylist={openPlaylistModal} />
        {:else if $activeView === 'library'}
          <LibraryView onAddToPlaylist={openPlaylistModal} />
        {:else if $activeView === 'queue'}
          <QueueView onAddToPlaylist={openPlaylistModal} />
        {:else if $activeView === 'playlists'}
          <PlaylistsView onAddToPlaylist={openPlaylistModal} />
        {:else if $activeView === 'browse'}
          <BrowseView onAddToPlaylist={openPlaylistModal} />
        {:else if $activeView === 'search'}
          <SearchView onAddToPlaylist={openPlaylistModal} />
        {:else if $activeView === 'settings'}
          <SettingsView />
        {:else if $activeView === 'history'}
          <HistoryView />
        {:else if $activeView === 'streaming'}
          <StreamingView onAddToPlaylist={openPlaylistModal} />
        {:else if $activeView === 'radios'}
          <RadiosView />
        {:else if $activeView === 'genres'}
          <GenresView onAddToPlaylist={openPlaylistModal} />
        {:else if $activeView === 'metadata'}
          <MetadataView />
        {:else if $activeView === 'mediaservers'}
          <MediaServersView />
        {/if}
      </div>
    {/key}

    {#if scanIndicator}
      <div class="scan-indicator">
        <div class="scan-spinner"></div>
        {$t('settings.scanning')}
      </div>
    {/if}
  </main>

  <TransportBar />
</div>

<!-- Single persistent YouTube IFrame Player instance (off-screen) -->
<YTPlayer />

{#if playlistModalTrack !== null}
  <AddToPlaylistModal track={playlistModalTrack} onClose={closePlaylistModal} />
{/if}

<style>
  .app-layout {
    display: grid;
    grid-template-columns: var(--sidebar-width) 1fr;
    grid-template-rows: 1fr var(--transport-height);
    height: 100vh;
    overflow: hidden;
  }

  .main-content {
    grid-column: 2;
    grid-row: 1;
    overflow-y: auto;
    padding: 0;
    position: relative;
  }

  .view-transition {
    height: 100%;
    animation: viewFadeIn 0.15s ease-out;
  }

  @keyframes viewFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .scan-indicator {
    position: fixed;
    top: 12px;
    right: 12px;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-md);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    z-index: 100;
  }

  .scan-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 768px) {
    .app-layout {
      grid-template-columns: 1fr;
    }

    .main-content {
      grid-column: 1;
    }
  }
</style>

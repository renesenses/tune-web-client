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
  import SmartPlaylistsView from './components/SmartPlaylistsView.svelte';
  import SettingsView from './components/SettingsView.svelte';
  import HistoryView from './components/HistoryView.svelte';
  import HomeView from './components/HomeView.svelte';
  import StreamingView from './components/StreamingView.svelte';
  import MetadataView from './components/MetadataView.svelte';
  import ZoneManagerView from './components/ZoneManagerView.svelte';
  import DiagnosticsView from './components/DiagnosticsView.svelte';
  import BrowseView from './components/BrowseView.svelte';
  import RadiosView from './components/RadiosView.svelte';
  import PodcastsView from './components/PodcastsView.svelte';
  import GenresView from './components/GenresView.svelte';
  import MediaServersView from './components/MediaServersView.svelte';
  import FavoritesView from './components/FavoritesView.svelte';
  import RadioFavoritesView from './components/RadioFavoritesView.svelte';
  import PlaylistManagerView from './components/PlaylistManagerView.svelte';
  import PlaylistsHub from './components/PlaylistsHub.svelte';
  import DJView from './components/DJView.svelte';
  import PartyView from './components/PartyView.svelte';
  import CollectionsView from './components/CollectionsView.svelte';
  import AddToPlaylistModal from './components/AddToPlaylistModal.svelte';
  import BottomTabBar from './components/BottomTabBar.svelte';
  import YTPlayer from './components/YTPlayer.svelte';
  import ToastContainer from './components/ToastContainer.svelte';
  import OnboardingWizard from './components/OnboardingWizard.svelte';
  import { mobileNowPlayingOpen } from './lib/stores/navigation';
  import { loadProfiles } from './lib/stores/profile';
  import { notifications } from './lib/stores/notifications';
  import { streamingServices as streamingServicesStore } from './lib/stores/streaming';

  import type { Track } from './lib/types';

  let cleanupKeyboard: (() => void) | null = null;
  let scanIndicator = $state(false);
  let playlistModalTrack = $state<Track | null>(null);
  let showOnboarding = $state(false);
  let onboardingChecked = $state(false);

  function showError(msg: string) {
    notifications.error(msg);
  }

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
      showError('Failed to load zones');
    }
  }

  async function fetchDevices() {
    try {
      const deviceList = await api.getDevices();
      devices.set(deviceList);
    } catch (e) {
      console.error('Fetch devices error:', e);
      showError('Failed to load devices');
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
      showError('Failed to load queue');
    }
  }

  async function fetchPlaylists() {
    try {
      const list = await api.getPlaylists();
      playlistsStore.set(list);
      playlistsLoaded.set(true);
    } catch (e) {
      console.error('Fetch playlists error:', e);
      showError('Failed to load playlists');
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
      // Propagate playback state to all other zones in the same group:
      // when a group plays, all members share the same track/state/position.
      if (zone.group_id) {
        zones.update((zs) =>
          zs.map((z) => {
            if (z.group_id === zone.group_id && z.id !== zoneId) {
              return { ...z, state: zone.state, current_track: zone.current_track, position_ms: zone.position_ms };
            }
            return z;
          })
        );
      }
      // Update seek position and timer for the currently displayed zone,
      // including when it is a group member of the zone that fired the event.
      const curZone = get(currentZone);
      const isCurrentOrGroupMember =
        curZone?.id === zoneId ||
        (zone.group_id != null && curZone?.group_id === zone.group_id);
      if (isCurrentOrGroupMember) {
        seekPositionMs.set(zone.position_ms ?? 0);
        if (zone.state === 'playing') {
          startSeekTimer();
        } else {
          stopSeekTimer();
        }
      }
    } catch (e) {
      console.error('Sync zone state error:', e);
      showError('Failed to sync zone state');
    }
  }

  async function checkOnboarding() {
    // Skip if already completed
    if (localStorage.getItem('tune_onboarding_completed')) {
      onboardingChecked = true;
      return;
    }
    try {
      const [stats, services] = await Promise.all([
        api.getLibraryStats(),
        api.getStreamingServices(),
      ]);
      const hasNoTracks = stats.tracks === 0;
      const hasNoEnabledServices = !Object.values(services).some((s: any) => s.enabled);
      showOnboarding = hasNoTracks && hasNoEnabledServices;
    } catch {
      // If API fails, skip onboarding — server may not be ready yet
      showOnboarding = false;
    }
    onboardingChecked = true;
  }

  function handleOnboardingComplete() {
    showOnboarding = false;
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

    cleanupKeyboard = setupKeyboardShortcuts();

    connectionState.set('connecting');
    tuneWS.connect();
    fetchZones(true);
    fetchDevices();
    fetchPlaylists();
    loadProfiles();
    checkOnboarding();

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
        if (type === 'playback.metadata') {
          // ICY metadata update (radio stream title change) — refetch zone state
          if (zoneId) syncZoneState(zoneId);
          return;
        }
        if (type === 'playback.position' && event.data?.position_ms !== undefined) {
          // Lightweight position update (no API call)
          seekPositionMs.set(event.data.position_ms);
        } else if (type === 'playback.queue_changed') {
          fetchQueue();
          if (zoneId) syncZoneState(zoneId);
        } else if (zoneId) {
          // For started/resumed/paused/stopped/track_changed: fetch full zone state
          syncZoneState(zoneId).then(() => {
            // IFrame sync and history only concern the active zone (or its group members)
            const curZone = get(currentZone);
            const isGroupMember = curZone?.group_id != null && curZone.group_id === get(zones).find(z => z.id === zoneId)?.group_id;
            if (curZone?.id !== zoneId && !isGroupMember) return;

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
    cleanupKeyboard?.();
    tuneWS.disconnect();
    stopSeekTimer();
  });
</script>

<div class="app-layout">
  <Sidebar />

  <main class="main-content">
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
    {:else if $activeView === 'playlistmanager'}
      <PlaylistManagerView onAddToPlaylist={openPlaylistModal} />
    {:else if $activeView === 'playlistshub'}
      <PlaylistsHub />
    {:else if $activeView === 'smartplaylists'}
      <SmartPlaylistsView />
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
    {:else if $activeView === 'podcasts'}
      <PodcastsView />
    {:else if $activeView === 'genres'}
      <GenresView onAddToPlaylist={openPlaylistModal} />
    {:else if $activeView === 'metadata'}
      <MetadataView />
    {:else if $activeView === 'mediaservers'}
      <MediaServersView />
    {:else if $activeView === 'favorites'}
      <FavoritesView onAddToPlaylist={openPlaylistModal} />
    {:else if $activeView === 'radiofavorites'}
      <RadioFavoritesView />
    {:else if $activeView === 'zonemanager'}
      <ZoneManagerView />
    {:else if $activeView === 'dj'}
      <DJView />
    {:else if $activeView === 'party'}
      <PartyView />
    {:else if $activeView === 'collections'}
      <CollectionsView />
    {:else if $activeView === 'diagnostics'}
      <DiagnosticsView />
    {/if}

    {#if scanIndicator}
      <div class="scan-indicator">
        <div class="scan-spinner"></div>
        {$t('settings.scanning')}
      </div>
    {/if}
  </main>

  <TransportBar />

  <BottomTabBar />

  {#if $mobileNowPlayingOpen}
    <div class="mobile-np-overlay">
      <button class="mobile-np-close" onclick={() => mobileNowPlayingOpen.set(false)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <NowPlaying onAddToPlaylist={openPlaylistModal} />
    </div>
  {/if}

  <ToastContainer />
</div>

{#if showOnboarding}
  <OnboardingWizard onComplete={handleOnboardingComplete} />
{/if}

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

  .app-layout > :global(.sidebar) {
    grid-column: 1;
    grid-row: 1 / -1;
  }

  .app-layout > :global(.transport-bar) {
    grid-column: 2;
    grid-row: 2;
  }

  .main-content {
    grid-column: 2;
    grid-row: 1;
    overflow-y: auto;
    padding: 0;
    position: relative;
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

  /* Tablet: sidebar icônes */
  @media (min-width: 769px) and (max-width: 1024px) {
    .app-layout {
      grid-template-columns: var(--sidebar-collapsed-width) 1fr;
    }
  }

  /* Mobile: pas de sidebar, tab bar en bas */
  @media (max-width: 768px) {
    .app-layout {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr var(--mini-player-height);
      padding-bottom: var(--tab-bar-height);
    }

    .main-content {
      grid-column: 1;
    }

    .app-layout > :global(.transport-bar) {
      grid-column: 1;
    }
  }

  /* Overlay NowPlaying mobile (plein écran) */
  .mobile-np-overlay {
    display: none;
  }

  @media (max-width: 768px) {
    .mobile-np-overlay {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 150;
      background: var(--tune-bg);
      overflow-y: auto;
      animation: slideUp 0.25s ease-out;
    }

    .mobile-np-close {
      position: absolute;
      top: 12px;
      left: 12px;
      z-index: 151;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--tune-text);
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    @keyframes slideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
  }
</style>
// cache bust 1774201447

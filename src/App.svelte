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
  import AddToPlaylistModal from './components/AddToPlaylistModal.svelte';

  let scanIndicator = $state(false);
  let playlistModalTrackId = $state<number | null>(null);

  function openPlaylistModal(trackId: number) {
    playlistModalTrackId = trackId;
  }

  function closePlaylistModal() {
    playlistModalTrackId = null;
  }

  async function fetchZones() {
    try {
      const zoneList = await api.getZones();
      zones.set(zoneList);
      // Auto-select default zone from preferences, or first zone
      let curId: number | null = null;
      currentZoneId.subscribe((v) => (curId = v))();
      if (curId === null && zoneList.length > 0) {
        let defaultId: number | null = null;
        preferences.subscribe((p) => (defaultId = p.defaultZoneId))();
        const defaultZone = defaultId !== null ? zoneList.find((z) => z.id === defaultId) : null;
        const target = defaultZone ?? zoneList[0];
        if (target?.id !== null) currentZoneId.set(target.id!);
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
      seekPositionMs.set(zone.position_ms ?? 0);
      if (zone.state === 'playing') {
        startSeekTimer();
      } else {
        stopSeekTimer();
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
    fetchZones();
    fetchDevices();
    fetchPlaylists();

    tuneWS.onEvent((event) => {
      const type = event.type;

      // Internal connection events
      if (type === '_connected') {
        connectionState.set('connected');
        fetchZones();
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
            // Record to playback history on track start/change
            if (type === 'playback.started' || type === 'playback.track_changed') {
              const z = get(currentZone);
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
          <PlaylistsView />
        {:else if $activeView === 'browse'}
          <BrowseView />
        {:else if $activeView === 'search'}
          <SearchView />
        {:else if $activeView === 'settings'}
          <SettingsView />
        {:else if $activeView === 'history'}
          <HistoryView />
        {:else if $activeView === 'streaming'}
          <StreamingView />
        {:else if $activeView === 'radios'}
          <RadiosView />
        {:else if $activeView === 'genres'}
          <GenresView onAddToPlaylist={openPlaylistModal} />
        {:else if $activeView === 'metadata'}
          <MetadataView />
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

{#if playlistModalTrackId !== null}
  <AddToPlaylistModal trackId={playlistModalTrackId} onClose={closePlaylistModal} />
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

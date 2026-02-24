<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { tuneWS } from './lib/websocket';
  import { zones, currentZoneId, currentZone } from './lib/stores/zones';
  import { devices } from './lib/stores/devices';
  import { seekPositionMs, startSeekTimer, stopSeekTimer, shuffleEnabled, repeatMode } from './lib/stores/nowPlaying';
  import { queueTracks, queuePosition, queueLength } from './lib/stores/queue';
  import { connectionState } from './lib/stores/connection';
  import { activeView } from './lib/stores/navigation';
  import * as api from './lib/api';
  import Sidebar from './components/Sidebar.svelte';
  import NowPlaying from './components/NowPlaying.svelte';
  import TransportBar from './components/TransportBar.svelte';
  import QueueView from './components/QueueView.svelte';
  import LibraryView from './components/LibraryView.svelte';
  import SearchView from './components/SearchView.svelte';
  import PlaylistsView from './components/PlaylistsView.svelte';
  import SettingsView from './components/SettingsView.svelte';

  let scanIndicator = $state(false);

  async function fetchZones() {
    try {
      const zoneList = await api.getZones();
      zones.set(zoneList);
      // Auto-select first zone if none selected
      let curId: number | null = null;
      currentZoneId.subscribe((v) => (curId = v))();
      if (curId === null && zoneList.length > 0 && zoneList[0].id !== null) {
        currentZoneId.set(zoneList[0].id);
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
      queueTracks.set(qs.tracks);
      queuePosition.set(qs.position);
      queueLength.set(qs.length);
    } catch (e) {
      console.error('Fetch queue error:', e);
    }
  }

  onMount(() => {
    connectionState.set('connecting');
    tuneWS.connect();
    fetchZones();
    fetchDevices();

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

      // Playback events
      if (type.startsWith('playback.')) {
        if (type === 'playback.position' && event.data?.position_ms !== undefined) {
          seekPositionMs.set(event.data.position_ms);
        } else if (type === 'playback.started' || type === 'playback.resumed') {
          if (event.data?.zone_id !== undefined) {
            zones.update((zs) =>
              zs.map((z) => z.id === event.data.zone_id ? { ...z, state: 'playing', ...(event.data.track ? { current_track: event.data.track } : {}) } : z)
            );
          }
          if (event.data?.position_ms !== undefined) {
            seekPositionMs.set(event.data.position_ms);
          }
          startSeekTimer();
        } else if (type === 'playback.paused') {
          if (event.data?.zone_id !== undefined) {
            zones.update((zs) =>
              zs.map((z) => z.id === event.data.zone_id ? { ...z, state: 'paused' } : z)
            );
          }
          if (event.data?.position_ms !== undefined) {
            seekPositionMs.set(event.data.position_ms);
          }
          stopSeekTimer();
        } else if (type === 'playback.stopped') {
          if (event.data?.zone_id !== undefined) {
            zones.update((zs) =>
              zs.map((z) => z.id === event.data.zone_id ? { ...z, state: 'stopped', current_track: null } : z)
            );
          }
          seekPositionMs.set(0);
          stopSeekTimer();
        } else if (type === 'playback.track_changed') {
          if (event.data?.zone_id !== undefined && event.data?.track) {
            zones.update((zs) =>
              zs.map((z) => z.id === event.data.zone_id ? { ...z, current_track: event.data.track } : z)
            );
          }
          if (event.data?.position_ms !== undefined) {
            seekPositionMs.set(event.data.position_ms);
          } else {
            seekPositionMs.set(0);
          }
        } else if (type === 'playback.queue_changed') {
          fetchQueue();
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

      // Device events
      if (type.startsWith('device.')) {
        fetchDevices();
        return;
      }
    });
  });

  onDestroy(() => {
    tuneWS.disconnect();
    stopSeekTimer();
  });
</script>

<div class="app-layout">
  <Sidebar />

  <main class="main-content">
    {#if $activeView === 'nowplaying'}
      <NowPlaying />
    {:else if $activeView === 'library'}
      <LibraryView />
    {:else if $activeView === 'queue'}
      <QueueView />
    {:else if $activeView === 'playlists'}
      <PlaylistsView />
    {:else if $activeView === 'search'}
      <SearchView />
    {:else if $activeView === 'settings'}
      <SettingsView />
    {/if}

    {#if scanIndicator}
      <div class="scan-indicator">
        <div class="scan-spinner"></div>
        Scan en cours...
      </div>
    {/if}
  </main>

  <TransportBar />
</div>

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

<script lang="ts">
  import { untrack } from 'svelte';
  import { get } from 'svelte/store';
  import * as api from '../lib/api';
  import { tuneWS } from '../lib/websocket';
  import { zones } from '../lib/stores/zones';
  import { devices } from '../lib/stores/devices';
  import { preferences, applyTheme, type ThemeMode, type VolumeDisplay, type StartupView } from '../lib/stores/preferences';
  import { streamingServices as streamingServicesStore } from '../lib/stores/streaming';
  import type { SystemHealth, SystemStats, StreamingServiceStatus, StreamingAuthResponse, LocalAudioDevice, BrowseRootEntry } from '../lib/types';
  import { t, locale, localeNames, type Locale } from '../lib/i18n';

  const CLIENT_VERSION = __APP_VERSION__;
  let serverVersion = $state<string | null>(null);

  let health: SystemHealth | null = $state(null);
  let stats: SystemStats | null = $state(null);
  let scanning = $state(false);
  let loading = $state(true);
  let artworkScanning = $state(false);
  let audioDevices = $state<LocalAudioDevice[]>([]);
  let artworkProgress: { current: number; total: number; found: number } | null = $state(null);
  let musicRoots = $state<BrowseRootEntry[]>([]);
  let scanningPath = $state<string | null>(null);

  // Music dir management
  let newMusicDirPath = $state('');
  let addingMusicDir = $state(false);
  let removingMusicDir = $state<string | null>(null);
  let musicDirError = $state<string | null>(null);

  // AirPlay pairing
  let pairingDeviceId: string | null = $state(null);
  let pairingPin = $state('');
  let pairingLoading = $state(false);
  let pairingAwaitingPin = $state(false);
  let pairingMessage: string | null = $state(null);

  async function startPairing(deviceId: string) {
    pairingDeviceId = deviceId;
    pairingPin = '';
    pairingLoading = true;
    pairingAwaitingPin = false;
    pairingMessage = null;
    try {
      const res = await api.beginPairing(deviceId);
      if (res.status === 'awaiting_pin') {
        pairingAwaitingPin = true;
        pairingMessage = res.message || null;
      }
    } catch (e: any) {
      pairingMessage = get(t)('pairing.error');
      pairingDeviceId = null;
    }
    pairingLoading = false;
  }

  async function submitPin() {
    if (!pairingDeviceId || !pairingPin.trim()) return;
    pairingLoading = true;
    try {
      const res = await api.submitPairingPin(pairingDeviceId, pairingPin.trim());
      if (res.status === 'paired') {
        pairingMessage = get(t)('pairing.success');
        setTimeout(() => { pairingDeviceId = null; pairingMessage = null; }, 2000);
      }
    } catch (e: any) {
      pairingMessage = get(t)('pairing.error');
    }
    pairingLoading = false;
    pairingAwaitingPin = false;
  }

  function cancelPairing() {
    pairingDeviceId = null;
    pairingAwaitingPin = false;
    pairingPin = '';
    pairingMessage = null;
  }

  // Streaming auth state
  let qobuzUsername = $state('');
  let qobuzPassword = $state('');
  let qobuzAuthLoading = $state(false);
  let qobuzAuthError: string | null = $state(null);

  let tidalAuthLoading = $state(false);
  let tidalVerificationUrl: string | null = $state(null);
  let tidalPollingInterval: ReturnType<typeof setInterval> | null = $state(null);
  let tidalAuthError: string | null = $state(null);

  let spotifyAuthLoading = $state(false);
  let spotifyVerificationUrl: string | null = $state(null);
  let spotifyPollingInterval: ReturnType<typeof setInterval> | null = $state(null);
  let spotifyAuthError: string | null = $state(null);

  let deezerAuthLoading = $state(false);
  let deezerVerificationUrl: string | null = $state(null);
  let deezerPollingInterval: ReturnType<typeof setInterval> | null = $state(null);
  let deezerAuthError: string | null = $state(null);

  let youtubeAuthLoading = $state(false);
  let youtubeVerificationUrl: string | null = $state(null);
  let youtubeUserCode: string | null = $state(null);
  let youtubePollingInterval: ReturnType<typeof setInterval> | null = $state(null);
  let youtubeAuthError: string | null = $state(null);

  async function handleQobuzAuth() {
    qobuzAuthLoading = true;
    qobuzAuthError = null;
    try {
      const res = await api.authenticateStreaming('qobuz', {
        username: qobuzUsername,
        password: qobuzPassword,
      });
      if (res.authenticated) {
        $streamingServicesStore = {
          ...$streamingServicesStore,
          qobuz: { ...$streamingServicesStore['qobuz'], authenticated: true },
        };
        qobuzPassword = '';
      } else {
        qobuzAuthError = get(t)('settings.wrongCredentials');
      }
    } catch (e) {
      qobuzAuthError = get(t)('settings.connectionError');
    }
    qobuzAuthLoading = false;
  }

  async function handleTidalAuth() {
    tidalAuthLoading = true;
    tidalAuthError = null;
    tidalVerificationUrl = null;
    try {
      const res = await api.authenticateStreaming('tidal');
      if (res.authenticated) {
        $streamingServicesStore = {
          ...$streamingServicesStore,
          tidal: { ...$streamingServicesStore['tidal'], authenticated: true },
        };
        tidalAuthLoading = false;
        return;
      }
      if (res.verification_url) {
        const url = res.verification_url;
        tidalVerificationUrl = url.startsWith('http') ? url : `https://${url}`;
        startTidalPolling();
      } else {
        tidalAuthError = get(t)('settings.tidalNoLink');
        tidalAuthLoading = false;
      }
    } catch (e) {
      tidalAuthError = get(t)('settings.connectionError');
      tidalAuthLoading = false;
    }
  }

  function startTidalPolling() {
    stopTidalPolling();
    tidalPollingInterval = setInterval(async () => {
      try {
        const status = await api.getStreamingServiceStatus('tidal');
        if (status.authenticated) {
          stopTidalPolling();
          tidalVerificationUrl = null;
          tidalAuthLoading = false;
          $streamingServicesStore = {
            ...$streamingServicesStore,
            tidal: { ...$streamingServicesStore['tidal'], authenticated: true },
          };
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
  }

  function stopTidalPolling() {
    if (tidalPollingInterval) {
      clearInterval(tidalPollingInterval);
      tidalPollingInterval = null;
    }
  }

  async function handleSpotifyAuth() {
    spotifyAuthLoading = true;
    spotifyAuthError = null;
    spotifyVerificationUrl = null;
    try {
      const res = await api.authenticateStreaming('spotify');
      if (res.authenticated) {
        $streamingServicesStore = {
          ...$streamingServicesStore,
          spotify: { ...$streamingServicesStore['spotify'], authenticated: true },
        };
        spotifyAuthLoading = false;
        return;
      }
      if (res.verification_url) {
        spotifyVerificationUrl = res.verification_url;
        startSpotifyPolling();
      } else {
        spotifyAuthError = get(t)('settings.connectionError');
        spotifyAuthLoading = false;
      }
    } catch (e) {
      spotifyAuthError = get(t)('settings.connectionError');
      spotifyAuthLoading = false;
    }
  }

  function startSpotifyPolling() {
    stopSpotifyPolling();
    spotifyPollingInterval = setInterval(async () => {
      try {
        const status = await api.getStreamingServiceStatus('spotify');
        if (status.authenticated) {
          stopSpotifyPolling();
          spotifyVerificationUrl = null;
          spotifyAuthLoading = false;
          $streamingServicesStore = {
            ...$streamingServicesStore,
            spotify: { ...$streamingServicesStore['spotify'], authenticated: true },
          };
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
  }

  function stopSpotifyPolling() {
    if (spotifyPollingInterval) {
      clearInterval(spotifyPollingInterval);
      spotifyPollingInterval = null;
    }
  }

  async function handleDeezerAuth() {
    deezerAuthLoading = true;
    deezerAuthError = null;
    deezerVerificationUrl = null;
    try {
      const res = await api.authenticateStreaming('deezer');
      if (res.authenticated) {
        $streamingServicesStore = {
          ...$streamingServicesStore,
          deezer: { ...$streamingServicesStore['deezer'], authenticated: true },
        };
        deezerAuthLoading = false;
        return;
      }
      if (res.verification_url) {
        deezerVerificationUrl = res.verification_url;
        startDeezerPolling();
      } else {
        deezerAuthError = get(t)('settings.connectionError');
        deezerAuthLoading = false;
      }
    } catch (e) {
      deezerAuthError = get(t)('settings.connectionError');
      deezerAuthLoading = false;
    }
  }

  function startDeezerPolling() {
    stopDeezerPolling();
    deezerPollingInterval = setInterval(async () => {
      try {
        const status = await api.getStreamingServiceStatus('deezer');
        if (status.authenticated) {
          stopDeezerPolling();
          deezerVerificationUrl = null;
          deezerAuthLoading = false;
          $streamingServicesStore = {
            ...$streamingServicesStore,
            deezer: { ...$streamingServicesStore['deezer'], authenticated: true },
          };
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
  }

  function stopDeezerPolling() {
    if (deezerPollingInterval) {
      clearInterval(deezerPollingInterval);
      deezerPollingInterval = null;
    }
  }

  async function handleYoutubeAuth() {
    youtubeAuthLoading = true;
    youtubeAuthError = null;
    youtubeVerificationUrl = null;
    youtubeUserCode = null;
    try {
      const res = await api.authenticateStreaming('youtube');
      if (res.authenticated) {
        $streamingServicesStore = {
          ...$streamingServicesStore,
          youtube: { ...$streamingServicesStore['youtube'], authenticated: true },
        };
        youtubeAuthLoading = false;
        return;
      }
      if (res.verification_url) {
        youtubeVerificationUrl = res.verification_url;
        youtubeUserCode = res.user_code ?? null;
        startYoutubePolling();
      } else {
        youtubeAuthError = res.error === 'missing_credentials'
          ? get(t)('settings.youtubeMissingCredentials')
          : get(t)('settings.connectionError');
        youtubeAuthLoading = false;
      }
    } catch (e) {
      youtubeAuthError = get(t)('settings.connectionError');
      youtubeAuthLoading = false;
    }
  }

  function startYoutubePolling() {
    stopYoutubePolling();
    youtubePollingInterval = setInterval(async () => {
      try {
        const status = await api.getStreamingServiceStatus('youtube');
        if (status.authenticated) {
          stopYoutubePolling();
          youtubeVerificationUrl = null;
          youtubeUserCode = null;
          youtubeAuthLoading = false;
          $streamingServicesStore = {
            ...$streamingServicesStore,
            youtube: { ...$streamingServicesStore['youtube'], authenticated: true },
          };
        }
      } catch {
        // ignore polling errors
      }
    }, 5000);
  }

  function stopYoutubePolling() {
    if (youtubePollingInterval) {
      clearInterval(youtubePollingInterval);
      youtubePollingInterval = null;
    }
  }

  async function handleDisconnect(serviceName: string) {
    try {
      await api.disconnectStreaming(serviceName);
      $streamingServicesStore = {
        ...$streamingServicesStore,
        [serviceName]: { ...$streamingServicesStore[serviceName], authenticated: false },
      };
    } catch (e) {
      console.error('Disconnect error:', e);
    }
  }

  async function fetchServerVersion() {
    try {
      const res = await fetch('/');
      const data = await res.json();
      serverVersion = data.version ?? null;
    } catch {
      serverVersion = null;
    }
  }

  async function loadAll() {
    loading = true;
    try {
      const [h, s, ss, sc, br] = await Promise.all([
        api.getHealth(),
        api.getStats(),
        api.getStreamingServices().catch(() => ({})),
        api.getScanStatus().catch(() => ({ scanning: false })),
        api.getBrowseRoots().catch(() => ({ roots: [] })),
      ]);
      health = h;
      stats = s;
      $streamingServicesStore = ss as Record<string, StreamingServiceStatus>;
      scanning = sc.scanning;
      musicRoots = br.roots;
    } catch (e) {
      console.error('Settings load error:', e);
    }
    loading = false;
  }

  async function fetchAudioDevices() {
    try {
      audioDevices = await api.getAudioDevices();
    } catch (e) {
      console.error('Fetch audio devices error:', e);
    }
  }

  function toggleDevice(prefixedId: string) {
    preferences.update((p) => {
      const ids = p.hiddenDeviceIds;
      const hidden = ids.includes(prefixedId);
      return { ...p, hiddenDeviceIds: hidden ? ids.filter(id => id !== prefixedId) : [...ids, prefixedId] };
    });
  }

  function showAllDevices() {
    preferences.update((p) => ({ ...p, hiddenDeviceIds: [] }));
  }

  function hideAllDevices() {
    const allIds = [
      ...audioDevices.map(d => `audio:${d.id}`),
      ...$devices.map(d => `net:${d.id}`),
    ];
    preferences.update((p) => ({ ...p, hiddenDeviceIds: allIds }));
  }

  async function handleAddMusicDir() {
    const path = newMusicDirPath.trim();
    if (!path) return;
    addingMusicDir = true;
    musicDirError = null;
    try {
      await api.addMusicDir(path);
      newMusicDirPath = '';
      const br = await api.getBrowseRoots().catch(() => ({ roots: [] }));
      musicRoots = br.roots;
    } catch (e: any) {
      musicDirError = e.message || String(e);
    }
    addingMusicDir = false;
  }

  async function handleRemoveMusicDir(path: string) {
    if (!confirm(get(t)('settings.removeMusicDirConfirm'))) return;
    removingMusicDir = path;
    try {
      await api.removeMusicDir(path);
      const br = await api.getBrowseRoots().catch(() => ({ roots: [] }));
      musicRoots = br.roots;
    } catch (e: any) {
      console.error('Remove music dir error:', e);
    }
    removingMusicDir = null;
  }

  async function handleScan() {
    scanning = true;
    try {
      await api.triggerScan();
    } catch (e) {
      console.error('Scan error:', e);
      scanning = false;
    }
  }

  async function handleScanPath(path: string) {
    scanningPath = path;
    try {
      await api.triggerScan(path);
    } catch (e) {
      console.error('Scan path error:', e);
      scanningPath = null;
    }
  }

  async function handleArtworkRescan() {
    artworkScanning = true;
    artworkProgress = null;
    try {
      const res = await api.rescanArtwork();
      if (res.status === 'already_running') {
        // already in progress, keep indicator
      }
    } catch (e) {
      console.error('Artwork rescan error:', e);
      artworkScanning = false;
    }
  }

  $effect(() => {
    untrack(() => {
      loadAll();
      fetchAudioDevices();
      fetchServerVersion();
    });
    const unsub = tuneWS.onEvent((event) => {
      if (event.type === 'library.scan.completed') {
        scanning = false;
        scanningPath = null;
        loadAll();
      } else if (event.type === 'library.artwork.progress') {
        artworkProgress = event.data;
      } else if (event.type === 'library.artwork.completed') {
        artworkScanning = false;
        artworkProgress = null;
      }
    });
    return () => {
      unsub();
      stopTidalPolling();
      stopSpotifyPolling();
      stopDeezerPolling();
      stopYoutubePolling();
    };
  });
</script>

<div class="settings-view">
  <h2>{$t('settings.title')}</h2>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      {$t('common.loading')}
    </div>
  {:else}
    <!-- Server health -->
    <section class="settings-section">
      <h3>{$t('settings.serverHealth')}</h3>
      {#if health}
        <div class="health-status" class:ok={health.status === 'ok'} class:degraded={health.status === 'degraded'}>
          <span class="health-dot"></span>
          {health.status === 'ok' ? $t('settings.operational') : $t('settings.degraded')}
        </div>
        <div class="component-list">
          {#each Object.entries(health.components) as [name, ok]}
            <div class="component-item">
              <span class="component-name">{name}</span>
              <span class="component-status" class:ok={ok} class:error={!ok}>{ok ? $t('common.ok') : $t('common.error')}</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Library stats -->
    <section class="settings-section">
      <h3>{$t('settings.library')}</h3>
      {#if stats}
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-value">{stats.tracks}</span>
            <span class="stat-label">{$t('settings.tracks')}</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{stats.albums}</span>
            <span class="stat-label">{$t('settings.albums')}</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{stats.artists}</span>
            <span class="stat-label">{$t('settings.artists')}</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{stats.zones}</span>
            <span class="stat-label">{$t('settings.zones')}</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{stats.devices}</span>
            <span class="stat-label">{$t('settings.devices')}</span>
          </div>
        </div>
      {/if}

      <div class="action-buttons">
        <button class="scan-btn" onclick={handleScan} disabled={scanning}>
          {#if scanning}
            <div class="spinner small"></div>
            {$t('settings.scanning')}
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            {$t('settings.scanLibrary')}
          {/if}
        </button>

        <button class="scan-btn" onclick={handleArtworkRescan} disabled={artworkScanning}>
          {#if artworkScanning}
            <div class="spinner small"></div>
            {#if artworkProgress}
              {$t('settings.coversProgress').replace('{current}', String(artworkProgress.current)).replace('{total}', String(artworkProgress.total)).replace('{found}', String(artworkProgress.found))}
            {:else}
              {$t('settings.searchingCovers')}
            {/if}
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
            </svg>
            {$t('settings.searchMissingCovers')}
          {/if}
        </button>
      </div>
    </section>

    <!-- Music locations -->
    <section class="settings-section">
      <h3>{$t('settings.musicDirs')}</h3>
      <div class="music-dir-add">
        <input
          type="text"
          class="auth-input"
          placeholder={$t('settings.addMusicDirPlaceholder')}
          bind:value={newMusicDirPath}
          disabled={addingMusicDir}
          onkeydown={(e) => { if (e.key === 'Enter') handleAddMusicDir(); }}
        />
        <button
          class="scan-btn"
          onclick={handleAddMusicDir}
          disabled={addingMusicDir || !newMusicDirPath.trim()}
        >
          {#if addingMusicDir}
            <div class="spinner small"></div>
            {$t('settings.addingMusicDir')}
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {$t('settings.addMusicDir')}
          {/if}
        </button>
      </div>
      {#if musicDirError}
        <div class="music-dir-error">{musicDirError}</div>
      {/if}
      {#if musicRoots.length === 0}
        <p class="muted">{$t('settings.noMusicDirs')}</p>
      {:else}
        <div class="music-dirs-list">
          {#each musicRoots as root}
            <div class="music-dir-item">
              <div class="music-dir-info">
                <span class="music-dir-name">{root.name}</span>
                <span class="music-dir-path">{root.path}</span>
                <span class="music-dir-tracks">{root.track_count} {$t('common.tracks')}</span>
              </div>
              <div class="music-dir-actions">
                <button
                  class="scan-btn small"
                  onclick={() => handleScanPath(root.path)}
                  disabled={scanning || scanningPath !== null}
                >
                  {#if scanningPath === root.path}
                    <div class="spinner small"></div>
                    {$t('settings.scanningPath')}
                  {:else}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    {$t('settings.scanPath')}
                  {/if}
                </button>
                <button
                  class="scan-btn small danger"
                  onclick={() => handleRemoveMusicDir(root.path)}
                  disabled={musicRoots.length <= 1 || removingMusicDir !== null}
                >
                  {#if removingMusicDir === root.path}
                    <div class="spinner small"></div>
                  {:else}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    {$t('settings.removeMusicDir')}
                  {/if}
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Network Devices (DLNA / AirPlay) -->
    <section class="settings-section">
      <h3>{$t('settings.networkDevices')}</h3>
      <div class="devices-actions">
        <button class="scan-btn small" onclick={showAllDevices}>{$t('settings.showAll')}</button>
        <button class="scan-btn small" onclick={hideAllDevices}>{$t('settings.hideAll')}</button>
      </div>
      <div class="device-toggle-list">
        {#each $devices as device}
          {@const prefId = `net:${device.id}`}
          <label class="device-toggle-item">
            <input
              type="checkbox"
              checked={!$preferences.hiddenDeviceIds.includes(prefId)}
              onchange={() => toggleDevice(prefId)}
            />
            <svg class="device-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              {#if device.type === 'airplay'}
                <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" />
              {:else}
                <rect x="2" y="7" width="20" height="15" rx="2" ry="2" /><polyline points="17 2 12 7 7 2" />
              {/if}
            </svg>
            <span class="device-toggle-name">{device.name}</span>
            <span class="device-toggle-tag {device.type}">{device.type === 'airplay' ? 'AirPlay' : 'DLNA'}</span>
            {#if device.host}<span class="device-toggle-host">{device.host}</span>{/if}
            {#if device.type === 'airplay'}
              {#if pairingDeviceId === device.id && pairingAwaitingPin}
                <input
                  type="text"
                  class="pairing-pin-input"
                  placeholder={$t('pairing.pinPlaceholder')}
                  bind:value={pairingPin}
                  onkeydown={(e) => { if (e.key === 'Enter') submitPin(); if (e.key === 'Escape') cancelPairing(); }}
                  disabled={pairingLoading}
                />
                <button class="scan-btn small" onclick={submitPin} disabled={pairingLoading || !pairingPin.trim()}>
                  {$t('pairing.submit')}
                </button>
                <button class="scan-btn small" onclick={cancelPairing}>
                  {$t('pairing.cancel')}
                </button>
              {:else if pairingDeviceId === device.id && pairingMessage}
                <span class="pairing-message">{pairingMessage}</span>
              {:else}
                <button class="scan-btn small" onclick={() => startPairing(device.id)} disabled={pairingLoading}>
                  {#if pairingLoading && pairingDeviceId === device.id}
                    <div class="spinner small"></div>
                    {$t('pairing.pairing')}
                  {:else}
                    {$t('pairing.pair')}
                  {/if}
                </button>
              {/if}
            {/if}
          </label>
        {/each}
        {#if $devices.length === 0}
          <p class="muted">{$t('settings.noNetworkDevices')}</p>
        {/if}
      </div>
    </section>

    <!-- Local Audio Outputs -->
    <section class="settings-section">
      <h3>{$t('settings.localAudio')}</h3>
      <div class="device-toggle-list">
        {#each audioDevices as device}
          {@const prefId = `audio:${device.id}`}
          <label class="device-toggle-item">
            <input
              type="checkbox"
              checked={!$preferences.hiddenDeviceIds.includes(prefId)}
              onchange={() => toggleDevice(prefId)}
            />
            <svg class="device-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <rect x="4" y="2" width="16" height="20" rx="2" /><circle cx="12" cy="14" r="4" /><line x1="12" y1="6" x2="12.01" y2="6" />
            </svg>
            <span class="device-toggle-name">{device.name}</span>
            <span class="device-toggle-tag local">{device.channels}ch · {Math.round(device.sample_rate / 1000)} kHz</span>
          </label>
        {/each}
        {#if audioDevices.length === 0}
          <p class="muted">{$t('settings.noAudioDevices')}</p>
        {/if}
      </div>
    </section>

    <!-- Preferences -->
    <section class="settings-section">
      <h3>{$t('settings.interface')}</h3>
      <div class="pref-grid">
        <label class="pref-label" for="pref-theme">{$t('settings.theme')}</label>
        <select id="pref-theme" class="pref-select" value={$preferences.theme}
          onchange={(e) => {
            const theme = (e.target as HTMLSelectElement).value as ThemeMode;
            preferences.update((p) => ({ ...p, theme }));
            applyTheme(theme);
          }}>
          <option value="dark">{$t('settings.dark')}</option>
          <option value="light">{$t('settings.light')}</option>
        </select>

        <label class="pref-label" for="pref-lang">{$t('settings.language')}</label>
        <select id="pref-lang" class="pref-select" value={$preferences.language ?? 'fr'}
          onchange={(e) => {
            const language = (e.target as HTMLSelectElement).value as Locale;
            preferences.update((p) => ({ ...p, language }));
            locale.set(language);
          }}>
          {#each Object.entries(localeNames) as [code, name]}
            <option value={code}>{name}</option>
          {/each}
        </select>

        <label class="pref-label" for="pref-startup">{$t('settings.startupView')}</label>
        <select id="pref-startup" class="pref-select" value={$preferences.startupView}
          onchange={(e) => {
            const startupView = (e.target as HTMLSelectElement).value as StartupView;
            preferences.update((p) => ({ ...p, startupView }));
          }}>
          <option value="home">{$t('nav.home')}</option>
          <option value="nowplaying">{$t('nav.nowplaying')}</option>
          <option value="library">{$t('nav.library')}</option>
          <option value="queue">{$t('nav.queue')}</option>
          <option value="playlists">{$t('nav.playlists')}</option>
          <option value="search">{$t('nav.search')}</option>
          <option value="settings">{$t('nav.settings')}</option>
        </select>

        <label class="pref-label" for="pref-zone">{$t('settings.defaultZone')}</label>
        <select id="pref-zone" class="pref-select" value={$preferences.defaultZoneId ?? ''}
          onchange={(e) => {
            const val = (e.target as HTMLSelectElement).value;
            const defaultZoneId = val ? Number(val) : null;
            preferences.update((p) => ({ ...p, defaultZoneId }));
          }}>
          <option value="">{$t('settings.autoZone')}</option>
          {#each $zones as z}
            <option value={z.id}>{z.name}</option>
          {/each}
        </select>

        <label class="pref-label" for="pref-volume">{$t('settings.volumeDisplay')}</label>
        <select id="pref-volume" class="pref-select" value={$preferences.volumeDisplay}
          onchange={(e) => {
            const volumeDisplay = (e.target as HTMLSelectElement).value as VolumeDisplay;
            preferences.update((p) => ({ ...p, volumeDisplay }));
          }}>
          <option value="percent">{$t('settings.percent')}</option>
          <option value="dB">{$t('settings.decibels')}</option>
        </select>
      </div>
    </section>

    <!-- Streaming services -->
    <section class="settings-section">
      <h3>{$t('settings.streaming')}</h3>
      {#if Object.keys($streamingServicesStore).length === 0}
        <p class="muted">{$t('settings.noService')}</p>
      {:else}
        <div class="service-list">
          {#each Object.entries($streamingServicesStore) as [name, status]}
            <div class="service-card">
              <div class="service-header">
                <span class="service-name">{name.charAt(0).toUpperCase() + name.slice(1)}</span>
                <div class="service-header-actions">
                  {#if status.authenticated}
                    <span class="badge auth">{$t('settings.connected')}</span>
                    <button class="disconnect-btn" onclick={() => handleDisconnect(name)}>{$t('settings.disconnect')}</button>
                  {:else}
                    <span class="badge noauth">{$t('settings.notConnected')}</span>
                  {/if}
                </div>
              </div>

              {#if status.enabled && !status.authenticated}
                {#if name === 'qobuz'}
                  <div class="service-auth-form">
                    <input
                      type="email"
                      class="auth-input"
                      placeholder={$t('settings.email')}
                      bind:value={qobuzUsername}
                      disabled={qobuzAuthLoading}
                    />
                    <input
                      type="password"
                      class="auth-input"
                      placeholder={$t('settings.password')}
                      bind:value={qobuzPassword}
                      disabled={qobuzAuthLoading}
                      onkeydown={(e) => { if (e.key === 'Enter') handleQobuzAuth(); }}
                    />
                    {#if qobuzAuthError}
                      <p class="auth-error">{qobuzAuthError}</p>
                    {/if}
                    <button
                      class="scan-btn"
                      onclick={handleQobuzAuth}
                      disabled={qobuzAuthLoading || !qobuzUsername || !qobuzPassword}
                    >
                      {#if qobuzAuthLoading}
                        <div class="spinner small"></div>
                        {$t('settings.connecting')}
                      {:else}
                        {$t('settings.connect')}
                      {/if}
                    </button>
                  </div>
                {:else if name === 'tidal'}
                  <div class="service-auth-form">
                    {#if tidalVerificationUrl}
                      <p class="auth-hint">{$t('settings.tidalLink')}</p>
                      <a href={tidalVerificationUrl} target="_blank" rel="noopener noreferrer" class="auth-link">
                        {tidalVerificationUrl}
                      </a>
                      <div class="auth-waiting">
                        <div class="spinner small"></div>
                        {$t('settings.tidalWaiting')}
                      </div>
                    {:else}
                      {#if tidalAuthError}
                        <p class="auth-error">{tidalAuthError}</p>
                      {/if}
                      <button
                        class="scan-btn"
                        onclick={handleTidalAuth}
                        disabled={tidalAuthLoading}
                      >
                        {#if tidalAuthLoading}
                          <div class="spinner small"></div>
                          {$t('settings.connecting')}
                        {:else}
                          {$t('settings.tidalConnect')}
                        {/if}
                      </button>
                    {/if}
                  </div>
                {:else if name === 'spotify'}
                  <div class="service-auth-form">
                    {#if spotifyVerificationUrl}
                      <p class="auth-hint">{$t('settings.spotifyLink')}</p>
                      <a href={spotifyVerificationUrl} target="_blank" rel="noopener noreferrer" class="auth-link">
                        {$t('settings.spotifyOpenAuth')}
                      </a>
                      <div class="auth-waiting">
                        <div class="spinner small"></div>
                        {$t('settings.spotifyWaiting')}
                      </div>
                    {:else}
                      {#if spotifyAuthError}
                        <p class="auth-error">{spotifyAuthError}</p>
                      {/if}
                      <button
                        class="scan-btn"
                        onclick={handleSpotifyAuth}
                        disabled={spotifyAuthLoading}
                      >
                        {#if spotifyAuthLoading}
                          <div class="spinner small"></div>
                          {$t('settings.connecting')}
                        {:else}
                          {$t('settings.spotifyConnect')}
                        {/if}
                      </button>
                    {/if}
                  </div>
                {:else if name === 'deezer'}
                  <div class="service-auth-form">
                    {#if deezerVerificationUrl}
                      <p class="auth-hint">{$t('settings.deezerLink')}</p>
                      <a href={deezerVerificationUrl} target="_blank" rel="noopener noreferrer" class="auth-link">
                        {$t('settings.deezerOpenAuth')}
                      </a>
                      <div class="auth-waiting">
                        <div class="spinner small"></div>
                        {$t('settings.deezerWaiting')}
                      </div>
                    {:else}
                      {#if deezerAuthError}
                        <p class="auth-error">{deezerAuthError}</p>
                      {/if}
                      <button
                        class="scan-btn"
                        onclick={handleDeezerAuth}
                        disabled={deezerAuthLoading}
                      >
                        {#if deezerAuthLoading}
                          <div class="spinner small"></div>
                          {$t('settings.connecting')}
                        {:else}
                          {$t('settings.deezerConnect')}
                        {/if}
                      </button>
                    {/if}
                  </div>
                {:else if name === 'youtube'}
                  <div class="service-auth-form">
                    {#if youtubeVerificationUrl}
                      <p class="auth-hint">{$t('settings.youtubeLink')}</p>
                      {#if youtubeUserCode}
                        <p class="auth-code">{youtubeUserCode}</p>
                      {/if}
                      <a href={youtubeVerificationUrl} target="_blank" rel="noopener noreferrer" class="auth-link">
                        {$t('settings.youtubeOpenAuth')}
                      </a>
                      <div class="auth-waiting">
                        <div class="spinner small"></div>
                        {$t('settings.youtubeWaiting')}
                      </div>
                    {:else}
                      {#if youtubeAuthError}
                        <p class="auth-error">{youtubeAuthError}</p>
                      {/if}
                      <button
                        class="scan-btn"
                        onclick={handleYoutubeAuth}
                        disabled={youtubeAuthLoading}
                      >
                        {#if youtubeAuthLoading}
                          <div class="spinner small"></div>
                          {$t('settings.connecting')}
                        {:else}
                          {$t('settings.youtubeConnect')}
                        {/if}
                      </button>
                    {/if}
                  </div>
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- About -->
    <section class="settings-section">
      <h3>{$t('settings.about')}</h3>
      <div class="about-grid">
        <div class="about-row">
          <span class="about-label">{$t('settings.clientVersion')}</span>
          <span class="about-value">{CLIENT_VERSION}</span>
        </div>
        <div class="about-row">
          <span class="about-label">{$t('settings.serverVersion')}</span>
          <span class="about-value">{serverVersion ?? '...'}</span>
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .settings-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
    gap: var(--space-lg);
  }

  .settings-view > h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  .settings-section {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
  }

  .settings-section h3 {
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
    margin-bottom: var(--space-md);
  }

  .health-status {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-body);
    font-size: 14px;
    margin-bottom: var(--space-md);
  }

  .health-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .health-status.ok .health-dot {
    background: var(--tune-success);
  }

  .health-status.degraded .health-dot {
    background: var(--tune-warning);
  }

  .component-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .component-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-xs) 0;
    font-family: var(--font-body);
    font-size: 13px;
  }

  .component-name {
    color: var(--tune-text-secondary);
    text-transform: capitalize;
  }

  .component-status.ok {
    color: var(--tune-success);
  }

  .component-status.error {
    color: var(--tune-warning);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
  }

  .stat-value {
    font-family: var(--font-label);
    font-size: 24px;
    font-weight: 600;
    color: var(--tune-text);
  }

  .stat-label {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }

  .action-buttons {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .scan-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-lg);
    background: var(--tune-grey2);
    color: var(--tune-text);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 14px;
    transition: all 0.12s ease-out;
  }

  .scan-btn:hover:not(:disabled) {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .scan-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .service-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .service-card {
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: var(--space-md);
  }

  .service-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .service-header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .disconnect-btn {
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 12px;
    padding: 2px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.12s ease-out;
  }

  .disconnect-btn:hover {
    border-color: var(--tune-warning);
    color: var(--tune-warning);
  }

  .service-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
  }

  .service-auth-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-top: var(--space-md);
  }

  .service-auth-form .scan-btn {
    align-self: flex-start;
  }

  .auth-input {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
    outline: none;
    transition: border-color 0.12s ease-out;
  }

  .auth-input:focus {
    border-color: var(--tune-accent);
  }

  .auth-input:disabled {
    opacity: 0.6;
  }

  .auth-error {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-warning);
    margin: 0;
  }

  .auth-hint {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
    margin: 0;
  }

  .auth-code {
    font-family: var(--font-label);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 3px;
    color: var(--tune-accent);
    margin: 0;
  }

  .auth-link {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-accent);
    word-break: break-all;
  }

  .auth-waiting {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
  }

  .badge {
    font-family: var(--font-label);
    font-size: 11px;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
  }

  .badge.enabled {
    background: rgba(87, 198, 185, 0.15);
    color: var(--tune-success);
  }

  .badge.disabled {
    background: rgba(102, 102, 102, 0.15);
    color: var(--tune-text-muted);
  }

  .badge.auth {
    background: rgba(87, 198, 185, 0.15);
    color: var(--tune-success);
  }

  .badge.noauth {
    background: rgba(201, 84, 75, 0.15);
    color: var(--tune-warning);
  }

  .muted {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
  }

  .loading {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    padding: var(--space-xl);
    justify-content: center;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner.small {
    width: 14px;
    height: 14px;
  }

  .pref-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md) var(--space-lg);
    align-items: center;
  }

  .pref-label {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
  }

  .pref-select {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
    outline: none;
    cursor: pointer;
    transition: border-color 0.12s ease-out;
  }

  .pref-select:focus {
    border-color: var(--tune-accent);
  }

  .devices-actions {
    display: flex;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }

  .scan-btn.small {
    padding: var(--space-xs) var(--space-md);
    font-size: 12px;
  }

  .device-toggle-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .device-toggle-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) 0;
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text);
    cursor: pointer;
  }

  .device-toggle-item:hover {
    color: var(--tune-accent);
  }

  .device-toggle-item input[type="checkbox"] {
    accent-color: var(--tune-accent);
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .device-toggle-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .device-toggle-tag {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tune-text-muted);
    background: var(--tune-bg);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .device-toggle-tag.dlna { color: var(--tune-accent); background: rgba(117,116,243,0.1); }
  .device-toggle-tag.airplay { color: var(--tune-success, #10b981); background: rgba(16,185,129,0.1); }
  .device-toggle-tag.local { color: var(--tune-text-secondary); }

  .device-type-icon {
    flex-shrink: 0;
    color: var(--tune-text-muted);
  }

  .device-toggle-host {
    font-family: var(--font-label);
    font-size: 10px;
    color: var(--tune-text-muted);
    opacity: 0.5;
    flex-shrink: 0;
  }

  .pairing-pin-input {
    width: 80px;
    padding: 3px 8px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    background: var(--tune-bg);
    color: var(--tune-text);
    font-size: 13px;
    text-align: center;
    letter-spacing: 2px;
  }

  .pairing-message {
    font-size: 12px;
    color: var(--tune-accent);
  }

  .music-dir-error {
    color: #e74c3c;
    font-size: var(--font-sm);
    margin-bottom: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background: rgba(231, 76, 60, 0.1);
    border-radius: var(--radius-sm);
  }

  .music-dir-add {
    display: flex;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }

  .music-dir-add .auth-input {
    flex: 1;
  }

  .music-dir-actions {
    display: flex;
    gap: var(--space-xs);
    flex-shrink: 0;
  }

  .scan-btn.danger {
    color: var(--tune-warning);
    border-color: var(--tune-warning);
  }

  .scan-btn.danger:hover:not(:disabled) {
    background: rgba(201, 84, 75, 0.1);
    border-color: var(--tune-warning);
    color: var(--tune-warning);
  }

  .music-dirs-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .music-dir-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
  }

  .music-dir-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .music-dir-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 500;
    color: var(--tune-text);
  }

  .music-dir-path {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .music-dir-tracks {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }

  .about-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .about-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-xs) 0;
    font-family: var(--font-body);
    font-size: 13px;
  }

  .about-label {
    color: var(--tune-text-secondary);
  }

  .about-value {
    color: var(--tune-text);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>

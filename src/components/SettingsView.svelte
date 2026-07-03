<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import * as api from '../lib/api';
  import { tuneWS } from '../lib/websocket';
  import { zones } from '../lib/stores/zones';
  import { devices } from '../lib/stores/devices';
  import { preferences, applyTheme, type ThemeMode, type VolumeDisplay, type StartupView } from '../lib/stores/preferences';
  import { streamingServices as streamingServicesStore } from '../lib/stores/streaming';
  import type { SystemHealth, SystemStats, SystemConfig, StreamingServiceStatus, StreamingAuthResponse, LocalAudioDevice, BrowseRootEntry, BackupInfo } from '../lib/types';
  import { t, locale, localeNames, type Locale } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import { activeView, settingsInitialTab } from '../lib/stores/navigation';
  import { licenseState, isPremium, loadLicense } from '../lib/stores/license';
  import SmbWizard from './SmbWizard.svelte';
  import FolderWizard from './FolderWizard.svelte';
  import MultiroomSettings from './MultiroomSettings.svelte';

  const CLIENT_VERSION = __APP_VERSION__;
  let serverVersion = $state<string | null>(null);
  // Consume settingsInitialTab once: allows sidebar shortcuts to open a specific tab
  const _initialTab = get(settingsInitialTab);
  settingsInitialTab.set(null);
  let settingsTab = $state<string>(_initialTab ?? 'general');

  let health: SystemHealth | null = $state(null);
  let stats: SystemStats | null = $state(null);
  let config: SystemConfig | null = $state(null);
  let backups = $state<BackupInfo[]>([]);
  let scanning = $state(false);
  let scanProgress: { scanned: number; added: number; updated: number } | null = $state(null);
  let restarting = $state(false);
  let loading = $state(true);
  let artworkScanning = $state(false);
  let enrichMsg = $state('');
  let audioDevices = $state<LocalAudioDevice[]>([]);
  let artworkProgress: { current: number; total: number; found: number } | null = $state(null);
  let musicRoots = $state<BrowseRootEntry[]>([]);

  // Peer discovery
  let tunePeers = $state<api.TunePeer[]>([]);
  let peersLoading = $state(false);

  // Tune Bridge (remote access)
  let bridgeEnabled = $state(false);
  let bridgeConnected = $state(false);
  let bridgeServerId = $state('');
  let bridgeAccessUrl = $state('');
  let bridgeToken = $state('');
  let bridgeLoading = $state(false);

  // Database migration
  let pgUrl = $state('');
  let pgTesting = $state(false);
  let pgTestOk = $state(false);
  let pgTestResult = $state('');
  let pgMigrating = $state(false);
  let scanningPath = $state<string | null>(null);

  // Update checker
  let updateInfo = $state<{ latest_version: string; current_version: string; release_notes?: string } | null>(null);
  let updateInstalling = $state(false);
  let updateDone = $state(false);
  let updateDmgReady = $state(false);
  let updateDmgPath = $state('');

  // Music dir management
  let newMusicDirPath = $state('');
  let addingMusicDir = $state(false);
  let removingMusicDir = $state<string | null>(null);
  let musicDirError = $state<string | null>(null);

  // Wizard modals
  let showSmbWizard = $state(false);
  let showFolderWizard = $state(false);

  // Metadata fields configuration
  interface MetadataField { key: string; label: string; enabled: boolean; }
  interface MetadataCategory { name: string; fields: MetadataField[]; }
  let metadataCategories = $state<MetadataCategory[]>([]);
  let metadataLoading = $state(true);
  let metadataCollapsed = $state<Record<string, boolean>>({});
  let metadataSaveTimer: ReturnType<typeof setTimeout> | null = null;

  async function loadMetadataFields() {
    metadataLoading = true;
    try {
      const data = await api.apiFetch('/system/settings/metadata-fields');
      metadataCategories = data.categories ?? [];
    } catch (e) {
      console.warn('loadMetadataFields failed:', e);
    }
    metadataLoading = false;
  }

  function toggleMetadataField(catIndex: number, fieldIndex: number) {
    metadataCategories[catIndex].fields[fieldIndex].enabled =
      !metadataCategories[catIndex].fields[fieldIndex].enabled;
    debounceSaveMetadataFields();
  }

  function toggleMetadataCategory(catName: string) {
    metadataCollapsed[catName] = !metadataCollapsed[catName];
  }

  function debounceSaveMetadataFields() {
    if (metadataSaveTimer) clearTimeout(metadataSaveTimer);
    metadataSaveTimer = setTimeout(saveMetadataFields, 500);
  }

  async function saveMetadataFields() {
    const enabledKeys: string[] = [];
    for (const cat of metadataCategories) {
      for (const field of cat.fields) {
        if (field.enabled) enabledKeys.push(field.key);
      }
    }
    try {
      await fetch('/api/v1/system/settings/metadata-fields', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: enabledKeys }),
      });
    } catch (e) {
      console.warn('saveMetadataFields failed:', e);
    }
  }

  // Cloud / mozaiklabs.fr
  let cloudSsoEmail = $state<string | null>(null);
  let cloudSsoName = $state<string | null>(null);
  let cloudSsoAvatar = $state<string | null>(null);
  let cloudSsoConfigured = $state(false);
  let cloudSsoLoading = $state(true);
  let cloudTelemetryEnabled = $state(false);
  let cloudTelemetryLoading = $state(false);
  let cloudTelemetryInstanceId = $state<string | null>(null);

  async function loadCloudStatus() {
    cloudSsoLoading = true;
    try {
      const sso = await api.apiFetch('/cloud/sso/status');
      cloudSsoConfigured = !!sso?.configured;
      if (sso?.connected && sso?.user) {
        cloudSsoEmail = sso.user.email || null;
        cloudSsoName = sso.user.display_name || null;
        cloudSsoAvatar = sso.user.avatar_url || null;
      } else {
        cloudSsoEmail = null;
        cloudSsoName = null;
        cloudSsoAvatar = null;
      }
    } catch (e) {
      console.warn('loadCloudStatus failed:', e);
      cloudSsoConfigured = false;
      cloudSsoEmail = null;
    }
    cloudSsoLoading = false;

    try {
      const tel = await api.apiFetch('/cloud/telemetry/status');
      cloudTelemetryEnabled = !!tel?.enabled;
      cloudTelemetryInstanceId = tel?.instance_id || tel?.server_id || null;
    } catch { /* endpoint may not exist */ }
  }

  async function loadBridgeStatus() {
    try {
      const data = await api.apiFetch('/cloud/bridge/status');
      bridgeEnabled = !!data?.enabled;
      bridgeConnected = !!data?.connected;
      bridgeServerId = data?.server_id || '';
      bridgeAccessUrl = data?.access_url || '';
      bridgeToken = '';
    } catch { /* endpoint may not exist on older servers */ }
  }

  async function toggleBridge() {
    bridgeLoading = true;
    try {
      if (bridgeEnabled) {
        await api.apiPost('/cloud/bridge/disable');
        bridgeEnabled = false;
        bridgeConnected = false;
        bridgeAccessUrl = '';
        bridgeToken = '';
      } else {
        const data = await api.apiPost('/cloud/bridge/enable');
        bridgeEnabled = true;
        bridgeServerId = data?.server_id || '';
        bridgeAccessUrl = data?.access_url || '';
        bridgeToken = data?.bridge_token || '';
      }
    } catch (e) {
      console.error('toggleBridge failed:', e);
    }
    bridgeLoading = false;
  }

  function cloudSsoConnect() {
    // Store a flag so the app knows to navigate back to Settings after
    // the OAuth redirect (the server redirects to "/" with no indicator).
    // Use localStorage with a timestamp — sessionStorage is unreliable across
    // cross-origin redirect chains (Safari ITP, mobile browsers).
    try {
      localStorage.setItem('tune_sso_pending', Date.now().toString());
    } catch {}
    try { sessionStorage.setItem('tune_sso_pending', '1'); } catch {}
    window.location.href = '/api/v1/cloud/sso/authorize';
  }

  async function toggleCloudTelemetry() {
    cloudTelemetryLoading = true;
    const endpoint = cloudTelemetryEnabled ? '/cloud/telemetry/disable' : '/cloud/telemetry/enable';
    try {
      await api.apiPost(endpoint);
      cloudTelemetryEnabled = !cloudTelemetryEnabled;
    } catch (err: any) {
      notifications.error(err?.message ?? 'Erreur telemetrie');
    }
    cloudTelemetryLoading = false;
  }

  // License / Premium
  let licenseKeyInput = $state('');
  let licenseActivating = $state(false);
  let licenseDeactivating = $state(false);
  let licenseValidating = $state(false);
  let licenseError = $state<string | null>(null);

  async function handleActivateLicense() {
    const key = licenseKeyInput.trim();
    if (!key) return;
    licenseActivating = true;
    licenseError = null;
    try {
      const result = await api.activateLicense(key);
      if (result.status === 'ok' || result.tier === 'premium' || result.tier === 'pro') {
        notifications.success('Licence activee avec succes !');
        licenseKeyInput = '';
        await loadLicense();
      } else {
        licenseError = 'Cle invalide ou expiree';
      }
    } catch (e: any) {
      licenseError = e?.message === 'premium_required' ? 'Cle invalide' : (e?.message ?? 'Erreur');
    }
    licenseActivating = false;
  }

  async function handleDeactivateLicense() {
    if (!confirm('Desactiver votre licence Premium ? Vous perdrez l\'acces aux fonctionnalites Premium.')) return;
    licenseDeactivating = true;
    try {
      await api.deactivateLicense();
      notifications.success('Licence desactivee');
      await loadLicense();
    } catch (e: any) {
      notifications.error(e?.message ?? 'Erreur');
    }
    licenseDeactivating = false;
  }

  async function handleValidateLicense() {
    licenseValidating = true;
    try {
      await api.validateLicense();
      await loadLicense();
      notifications.success('Licence validee');
    } catch (e: any) {
      notifications.error(e?.message ?? 'Erreur de validation');
    }
    licenseValidating = false;
  }

  function maskLicenseKey(key: string | null): string {
    if (!key) return '';
    if (key.length <= 4) return key;
    return '****-****-****-' + key.slice(-4);
  }

  loadCloudStatus();
  loadLicense();

  // After an SSO redirect the server may still be finalising the token exchange
  // when the SPA loads.  Detect a recent SSO attempt (localStorage flag set by
  // cloudSsoConnect) and re-fetch once more after a short delay so the UI
  // reflects the newly-connected state even if the first call raced.
  try {
    const pending = localStorage.getItem('tune_sso_pending');
    if (pending) {
      const elapsed = Date.now() - Number(pending);
      // Only honour the flag if it was set less than 2 minutes ago
      if (elapsed >= 0 && elapsed < 120_000) {
        localStorage.removeItem('tune_sso_pending');
        setTimeout(() => loadCloudStatus(), 1500);
      } else {
        // Stale flag — clean up
        localStorage.removeItem('tune_sso_pending');
      }
    }
  } catch {}

  // Scan schedule
  let scanScheduleEnabled = $state(false);
  let scanScheduleTime = $state('03:00');
  let scanScheduleLoading = $state(false);

  async function loadScanSchedule() {
    try {
      const sched = await api.getScanSchedule();
      scanScheduleEnabled = sched.enabled;
      scanScheduleTime = sched.time ?? '03:00';
    } catch { /* endpoint may not exist yet */ }
  }

  async function saveScanSchedule() {
    scanScheduleLoading = true;
    try {
      const sched = await api.setScanSchedule(scanScheduleTime, scanScheduleEnabled);
      scanScheduleEnabled = sched.enabled;
      scanScheduleTime = sched.time ?? '03:00';
      notifications.success($t('settings.scanScheduleSaved' as any));
    } catch (err: any) {
      notifications.error(err?.message ?? 'Error');
    }
    scanScheduleLoading = false;
  }

  // Diagnostics bundle download
  let diagDownloading = $state(false);

  // Audio backend
  let audioBackend = $state('wasapi');
  let exclusiveMode = $state(false);

  async function loadAudioBackend() {
    try {
      const resp = await fetch('/api/v1/system/config');
      const data = await resp.json();
      audioBackend = data.audio_backend ?? data.local_audio_backend ?? 'wasapi';
      exclusiveMode = data.local_exclusive_mode ?? false;
    } catch {}
  }

  async function changeAudioBackend(backend: string) {
    audioBackend = backend;
    const newExclusive = backend === 'asio' ? true : exclusiveMode;
    try {
      await fetch('/api/v1/system/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ local_audio_backend: backend, local_exclusive_mode: newExclusive }),
      });
      exclusiveMode = newExclusive;
      notifications.success(`Backend audio: ${backend.toUpperCase()}. Redemarrez le serveur.`);
    } catch {
      notifications.error('Erreur changement backend audio');
    }
  }

  async function toggleExclusiveMode() {
    const newVal = !exclusiveMode;
    exclusiveMode = newVal;
    try {
      await fetch('/api/v1/system/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ local_exclusive_mode: newVal }),
      });
      notifications.success(newVal ? 'Mode exclusif active. Redemarrez le serveur.' : 'Mode partage active. Redemarrez le serveur.');
    } catch {
      notifications.error('Erreur changement mode exclusif');
    }
  }

  // Log level
  let logLevel = $state('info');

  async function loadLogLevel() {
    try {
      const resp = await fetch('/api/v1/system/log-level');
      const data = await resp.json();
      logLevel = data.level ?? 'info';
    } catch {}
  }

  async function changeLogLevel(level: string) {
    logLevel = level;
    try {
      await fetch('/api/v1/system/log-level', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level }),
      });
      notifications.success(`Niveau de log: ${level}`);
    } catch {
      notifications.error('Erreur changement log level');
    }
  }

  // Logs download
  let logsDownloading = $state(false);

  async function downloadLogs() {
    logsDownloading = true;
    try {
      const resp = await fetch(`/api/v1/system/logs`);
      const text = await resp.text();
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tune-logs-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Erreur logs: ' + (err?.message ?? String(err)));
    } finally {
      logsDownloading = false;
    }
  }

  // CSV export
  let csvExporting = $state<string | null>(null);

  async function downloadDiagnostics() {
    diagDownloading = true;
    try {
      const { blob, filename } = await api.downloadDiagnosticsBundle();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Erreur diagnostic: ' + (err?.message ?? String(err)));
    } finally {
      diagDownloading = false;
    }
  }

  // HQPlayer
  let hqplayerEnabled = $state(false);
  let hqplayerHostInput = $state('');
  let hqplayerPortInput = $state(4321);
  let hqplayerSaving = $state(false);
  let hqplayerChecking = $state(false);
  let hqplayerReachable = $state<boolean | null>(null);

  async function loadHqplayerConfig() {
    try {
      const cfg = await api.apiFetch('/hqplayer/config');
      hqplayerEnabled = cfg?.enabled ?? false;
      hqplayerHostInput = cfg?.host ?? '';
      hqplayerPortInput = cfg?.port ?? 4321;
    } catch { /* not configured */ }
  }

  async function toggleHqplayer() {
    hqplayerSaving = true;
    try {
      hqplayerEnabled = !hqplayerEnabled;
      await api.apiPost('/hqplayer/config', { host: hqplayerHostInput, port: hqplayerPortInput, enabled: hqplayerEnabled });
    } catch (e: any) { notifications.error(e?.message ?? 'Error'); }
    hqplayerSaving = false;
  }

  async function saveHqplayer() {
    hqplayerSaving = true;
    try {
      await api.apiPost('/hqplayer/config', { host: hqplayerHostInput.trim(), port: hqplayerPortInput, enabled: hqplayerEnabled });
      notifications.success('HQPlayer configuré');
      await checkHqplayer();
    } catch (e: any) { notifications.error(e?.message ?? 'Error'); }
    hqplayerSaving = false;
  }

  async function checkHqplayer() {
    hqplayerChecking = true;
    try {
      const status = await api.apiFetch('/hqplayer/status');
      hqplayerReachable = status?.reachable ?? false;
    } catch { hqplayerReachable = false; }
    hqplayerChecking = false;
  }

  // Squeezebox / Lyrion
  let squeezeboxStatus = $state<api.SqueezeboxStatus | null>(null);
  let squeezeboxLoading = $state(false);
  let squeezeboxLmsHostInput = $state('');
  let squeezeboxSaving = $state(false);
  let squeezeboxCreatingZone = $state<string | null>(null);

  async function refreshSqueezebox() {
    squeezeboxLoading = true;
    try {
      squeezeboxStatus = await api.getSqueezeboxStatus();
      if (squeezeboxStatus?.lms_host) {
        squeezeboxLmsHostInput = squeezeboxStatus.lms_host;
      }
    } catch (err) {
      console.error('squeezebox status failed', err);
    }
    squeezeboxLoading = false;
  }

  async function toggleSqueezeboxEnabled() {
    squeezeboxSaving = true;
    try {
      const newVal = !(config?.squeezebox_enabled);
      await api.updateConfig({ squeezebox_enabled: newVal });
      if (config) config = { ...config, squeezebox_enabled: newVal };
      if (newVal) {
        await refreshSqueezebox();
      } else {
        squeezeboxStatus = null;
      }
    } catch (err: any) {
      notifications.error(err?.message ?? 'Error');
    }
    squeezeboxSaving = false;
  }

  async function saveSqueezeboxLmsHost() {
    squeezeboxSaving = true;
    try {
      const host = squeezeboxLmsHostInput.trim() || null;
      await api.updateConfig({ lms_host: host });
      if (config) config = { ...config, lms_host: host };
      await refreshSqueezebox();
      notifications.success(get(t)('settings.scanScheduleSaved' as any));
    } catch (err: any) {
      notifications.error(err?.message ?? 'Error');
    }
    squeezeboxSaving = false;
  }

  async function discoverSqueezeboxPlayers() {
    squeezeboxLoading = true;
    try {
      squeezeboxStatus = await api.discoverSqueezebox();
    } catch (err: any) {
      notifications.error(err?.message ?? 'Error');
    }
    squeezeboxLoading = false;
  }

  async function createZoneFromSqueezebox(player: api.SqueezeboxPlayer) {
    squeezeboxCreatingZone = player.id;
    try {
      await api.createZoneFromSqueezebox(player.id, player.name);
      notifications.success(get(t)('settings.squeezeboxZoneCreated' as any).replace('{name}', player.name));
    } catch (err: any) {
      notifications.error(err?.message ?? 'Error');
    }
    squeezeboxCreatingZone = null;
  }

  // Spotify Connect (receiver)
  let spotifyConnect = $state<api.SpotifyConnectStatus | null>(null);
  let spotifyConnectZoneId = $state<number | null>(null);
  let spotifyConnectDeviceName = $state<string>('');
  let spotifyConnectBusy = $state(false);
  let spotifyConnectError = $state<string | null>(null);

  async function refreshSpotifyConnect() {
    try {
      spotifyConnect = await api.getSpotifyConnectStatus();
      if (spotifyConnect?.zone_id != null) spotifyConnectZoneId = spotifyConnect.zone_id;
      if (spotifyConnect?.device_name) spotifyConnectDeviceName = spotifyConnect.device_name;
    } catch (err) {
      console.error('spotify-connect status failed', err);
    }
  }

  async function toggleSpotifyConnect() {
    spotifyConnectError = null;
    spotifyConnectBusy = true;
    try {
      if (spotifyConnect?.enabled) {
        spotifyConnect = await api.disableSpotifyConnect();
      } else {
        if (spotifyConnectZoneId == null) {
          spotifyConnectError = 'Choisissez une zone';
          return;
        }
        spotifyConnect = await api.enableSpotifyConnect(
          spotifyConnectZoneId,
          spotifyConnectDeviceName.trim() || null,
        );
      }
    } catch (err: any) {
      spotifyConnectError = err?.message ?? String(err);
    } finally {
      spotifyConnectBusy = false;
    }
  }

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

  // Crossfade
  let crossfadeEnabled = $state(false);
  let crossfadeDuration = $state(3);
  let crossfadeLoading = $state(false);

  async function loadCrossfade() {
    const zoneList = get(zones);
    if (!zoneList.length) return;
    try {
      const res = await api.getCrossfade(zoneList[0].id);
      crossfadeEnabled = res.enabled ?? false;
      crossfadeDuration = res.duration ?? 3;
    } catch {}
  }

  async function applyCrossfade() {
    const zoneList = get(zones);
    if (!zoneList.length) return;
    crossfadeLoading = true;
    try {
      await api.setCrossfade(zoneList[0].id, crossfadeEnabled, crossfadeDuration);
    } catch {}
    crossfadeLoading = false;
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
  let youtubeDeviceCode: string | null = $state(null);
  let youtubePollingInterval: ReturnType<typeof setInterval> | null = $state(null);
  let youtubePollingTimeout: ReturnType<typeof setTimeout> | null = $state(null);
  let youtubeAuthError: string | null = $state(null);
  let youtubeEmail: string | null = $state(null);

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
    youtubeDeviceCode = null;
    try {
      const res = await api.youtubeAuthDeviceCode();
      youtubeVerificationUrl = res.verification_url;
      youtubeUserCode = res.user_code;
      youtubeDeviceCode = res.device_code;
      startYoutubePolling(res.device_code, res.expires_in);
    } catch (e: any) {
      youtubeAuthError = e?.message?.includes('missing_credentials') || e?.message?.includes('not configured')
        ? get(t)('settings.youtubeMissingCredentials')
        : get(t)('settings.connectionError');
      youtubeAuthLoading = false;
    }
  }

  function startYoutubePolling(deviceCode: string, expiresIn: number) {
    stopYoutubePolling();
    youtubePollingInterval = setInterval(async () => {
      try {
        const res = await api.youtubeAuthPoll(deviceCode);
        if (res.authenticated) {
          stopYoutubePolling();
          youtubeVerificationUrl = null;
          youtubeUserCode = null;
          youtubeDeviceCode = null;
          youtubeEmail = res.email ?? null;
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
    // Auto-stop polling after expires_in seconds
    youtubePollingTimeout = setTimeout(() => {
      if (youtubePollingInterval) {
        stopYoutubePolling();
        youtubeVerificationUrl = null;
        youtubeUserCode = null;
        youtubeDeviceCode = null;
        youtubeAuthLoading = false;
        youtubeAuthError = get(t)('settings.youtubeExpired');
      }
    }, expiresIn * 1000);
  }

  function stopYoutubePolling() {
    if (youtubePollingInterval) {
      clearInterval(youtubePollingInterval);
      youtubePollingInterval = null;
    }
    if (youtubePollingTimeout) {
      clearTimeout(youtubePollingTimeout);
      youtubePollingTimeout = null;
    }
  }

  async function handleYoutubeDisconnect() {
    try {
      await api.youtubeAuthLogout();
      youtubeEmail = null;
      $streamingServicesStore = {
        ...$streamingServicesStore,
        youtube: { ...$streamingServicesStore['youtube'], authenticated: false },
      };
    } catch (e) {
      console.error('YouTube disconnect error:', e);
    }
  }

  async function fetchYoutubeAuthStatus() {
    try {
      const status = await api.youtubeAuthStatus();
      if (status.authenticated) {
        youtubeEmail = status.email;
      }
    } catch {
      // ignore
    }
  }

  async function handleToggleService(serviceName: string, enable: boolean) {
    try {
      if (enable) {
        await api.enableStreamingService(serviceName);
      } else {
        await api.disableStreamingService(serviceName);
      }
      // Refresh services list
      $streamingServicesStore = await api.getStreamingServices();
    } catch (e: any) {
      console.error('Toggle service error:', e);
      notifications.error(e?.message || String(e));
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
      const data = await api.apiFetch('/system/update/check');
      serverVersion = data?.current_version ?? data?.current ?? null;
    } catch {
      serverVersion = null;
    }
  }

  async function testPgConnection() {
    pgTesting = true;
    pgTestResult = '';
    pgTestOk = false;
    try {
      const res = await fetch(`/api/v1/system/database/test-connection?url=${encodeURIComponent(pgUrl)}`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        pgTestOk = true;
        pgTestResult = `PostgreSQL ${data.version} — connexion OK`;
      } else {
        pgTestResult = `Erreur: ${data.error}`;
      }
    } catch (e: any) {
      pgTestResult = `Erreur: ${e.message}`;
    }
    pgTesting = false;
  }

  async function migrateToPg() {
    if (!pgUrl || !pgTestOk) return;
    pgMigrating = true;
    try {
      await fetch(`/api/v1/system/database/migrate?target=postgres&url=${encodeURIComponent(pgUrl)}`, { method: 'POST' });
      pgTestResult = 'Migration lancée ! Le serveur va redémarrer...';
    } catch (e: any) {
      pgTestResult = `Erreur migration: ${e.message}`;
    }
    pgMigrating = false;
  }

  async function migrateToSqlite() {
    pgMigrating = true;
    try {
      await fetch(`/api/v1/system/database/migrate?target=sqlite`, { method: 'POST' });
      pgTestResult = 'Migration vers SQLite lancée...';
    } catch (e: any) {
      pgTestResult = `Erreur: ${e.message}`;
    }
    pgMigrating = false;
  }

  // DB Import/Export
  let dbImporting = $state(false);
  let dbImportResult = $state('');
  let dbImportFileInput: HTMLInputElement | null = $state(null);

  // FTS rebuild
  let ftsRebuilding = $state(false);
  let ftsResult = $state('');

  async function rebuildFtsIndex() {
    ftsRebuilding = true;
    ftsResult = '';
    try {
      const result = await api.rebuildFts();
      ftsResult = `Index reconstruit : ${result.rows_indexed} enregistrements indexes.`;
    } catch (err: any) {
      ftsResult = `Erreur : ${err.message}`;
    } finally {
      ftsRebuilding = false;
    }
  }

  function exportDatabase() {
    window.location.href = api.exportDatabaseUrl();
  }

  async function onImportFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!confirm(`Importer "${file.name}" va remplacer la base de données actuelle.\nUn backup de sécurité sera créé.\nLe serveur devra être redémarré après l'import.\n\nContinuer ?`)) {
      input.value = '';
      return;
    }
    dbImporting = true;
    dbImportResult = '';
    try {
      const result = await api.importDatabase(file);
      dbImportResult = `Import réussi (${(result.size / 1024 / 1024).toFixed(1)} MB). Redémarrez le serveur pour prendre en compte les changements.`;
    } catch (err: any) {
      dbImportResult = `Erreur import: ${err.message}`;
    } finally {
      dbImporting = false;
      input.value = '';
    }
  }

  async function checkForUpdate() {
    try {
      const data = await api.checkForUpdate();
      const latest = data.latest_version || data.latest;
      const current = data.current_version || data.current;
      if (latest && latest !== current) {
        updateInfo = { ...data, latest_version: latest, current_version: current };
      }
    } catch { /* ignore */ }
  }

  async function installUpdate() {
    updateInstalling = true;
    try {
      // Server returns immediately ("started"). Download runs in the
      // background; we poll /update/status until it completes.
      await api.installUpdate();
    } catch (e) {
      // Old server (≤ v0.7.41) blocked the request for the full
      // download and the browser reported 'Failed to fetch' even though
      // the install actually completed. Treat as expected and fall
      // through to the polling+reload loop.
      console.warn('install fetch failed, server may be downloading:', e);
    }

    // Poll /update/status first to detect macOS dmg_ready phase.
    const oldVersion = updateInfo?.current_version;
    const start = Date.now();
    while (Date.now() - start < 180_000) {
      await new Promise((r) => setTimeout(r, 3_000));
      try {
        const status = await api.getUpdateStatus();
        if (status?.phase === 'dmg_ready') {
          // macOS: DMG downloaded and opened in Finder. No restart needed.
          updateDmgReady = true;
          updateDmgPath = status.dmg_path || '~/Downloads';
          updateInstalling = false;
          return;
        }
        if (status?.phase === 'failed') {
          updateInstalling = false;
          return;
        }
      } catch {
        // Server may be restarting (connection refused). Fall through to
        // version check below.
      }
      try {
        const info = await api.checkForUpdate();
        if (info?.current_version && info.current_version !== oldVersion) {
          // Server is back on the new version — success.
          updateDone = true;
          updateInstalling = false;
          setTimeout(() => window.location.reload(), 1500);
          return;
        }
      } catch {
        // Server still down (restarting). Keep polling.
      }
    }
    updateInstalling = false;
  }

  async function loadAll() {
    loading = true;
    try {
      const T = 10_000; // 10s timeout per call — unblocks the page even if one endpoint hangs
      const results = await Promise.allSettled([
        api.withTimeout(api.getHealth(), T, '/system/health'),
        api.withTimeout(api.getStats(), T, '/system/stats'),
        api.withTimeout(api.getStreamingServices(), T, '/streaming/services'),
        api.withTimeout(api.getScanStatus(), T, '/system/scan/status'),
        api.withTimeout(api.getBrowseRoots(), T, '/library/browse'),
        api.withTimeout(api.getConfig(), T, '/system/config'),
        api.withTimeout(api.getBackups(), T, '/system/backups'),
      ]);
      const val = <T>(r: PromiseSettledResult<T>, fallback: T): T =>
        r.status === 'fulfilled' ? r.value : fallback;
      const [rHealth, rStats, rStreaming, rScan, rBrowse, rConfig, rBackups] = results;
      health = val(rHealth, null);
      stats = val(rStats, null);
      $streamingServicesStore = val(rStreaming, {} as Record<string, StreamingServiceStatus>) as Record<string, StreamingServiceStatus>;
      scanning = val(rScan, { scanning: false }).scanning;
      musicRoots = val(rBrowse, { roots: [] as any[] }).roots;
      config = val(rConfig, null);
      backups = val(rBackups, []);
      // Log individual failures for debugging
      for (const [i, r] of results.entries()) {
        if (r.status === 'rejected') {
          const names = ['health', 'stats', 'streaming', 'scan', 'browse', 'config', 'backups'];
          console.warn(`Settings: ${names[i]} failed:`, r.reason);
        }
      }
      // Don't block on Spotify Connect — it may 503 if manager isn't initialized.
      refreshSpotifyConnect();
      // Load HQPlayer config
      loadHqplayerConfig();
      // Load Squeezebox status if enabled
      if (config?.squeezebox_enabled) refreshSqueezebox();
      loadBridgeStatus();
    } catch (e) {
      console.error('Settings load error:', e);
    } finally {
      loading = false;
    }
  }

  async function fetchAudioDevices() {
    try {
      audioDevices = await api.withTimeout(api.getAudioDevices(), 8_000, '/devices/audio');
    } catch (e) {
      console.error('Fetch audio devices error:', e);
    }
  }

  async function fetchTunePeers() {
    peersLoading = true;
    try {
      tunePeers = await api.withTimeout(api.getTunePeers(), 8_000, '/peers');
    } catch (e) {
      console.error('Fetch tune peers error:', e);
    }
    peersLoading = false;
  }

  function toggleDevice(prefixedId: string) {
    preferences.update((p) => {
      const ids = p.hiddenDeviceIds;
      const hidden = ids.includes(prefixedId);
      return { ...p, hiddenDeviceIds: hidden ? ids.filter(id => id !== prefixedId) : [...ids, prefixedId] };
    });
  }

  function showAllDevices() {
    // Only reveal network devices — keep local audio devices hidden if user unchecked them
    preferences.update((p) => ({
      ...p,
      hiddenDeviceIds: p.hiddenDeviceIds.filter(id => id.startsWith('audio:')),
    }));
  }

  async function handleDeleteDevice(deviceId: string, deviceName: string) {
    try {
      await api.deleteDevice(deviceId);
      devices.update(list => list.filter(d => d.id !== deviceId));
      notifications.success(`${deviceName} supprimé`);
    } catch (e: any) {
      notifications.error(e?.message || 'Erreur');
    }
  }

  async function handleClearAllDevices() {
    try {
      const result = await api.clearDevices();
      devices.set([]);
      notifications.success(`${result.cleared} appareils supprimés`);
    } catch (e: any) {
      notifications.error(e?.message || 'Erreur');
    }
  }

  function hideAllDevices() {
    // Only hide network devices — preserve local audio device visibility
    const netIds = $devices.map(d => `net:${d.id}`);
    preferences.update((p) => ({
      ...p,
      hiddenDeviceIds: [
        ...p.hiddenDeviceIds.filter(id => id.startsWith('audio:')),
        ...netIds,
      ],
    }));
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
      notifications.error(e.message || String(e));
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

  let scanMessage = $state('');
  let clearingLibrary = $state(false);

  async function handleClearLibrary() {
    if (!confirm('Vider toute la bibliothèque ? (tracks, albums, artistes)\nLes zones, playlists et radios seront conservées.')) return;
    clearingLibrary = true;
    try {
      const result = await api.clearLibrary();
      if (result) {
        scanMessage = 'Bibliothèque vidée. Lancez un scan pour reconstruire.';
        stats = await api.getStats();
      } else {
        scanMessage = 'Erreur lors de la suppression';
      }
    } catch (e: any) {
      scanMessage = `Erreur: ${e?.message || e}`;
    }
    clearingLibrary = false;
  }

  async function handleScan(full = false) {
    scanning = true;
    scanMessage = '';
    try {
      await api.triggerScan(undefined, full);
      scanMessage = full ? 'Scan complet lance !' : 'Scan lance !';
      notifications.success(full ? 'Scan complet (relecture de tous les tags)' : 'Scan de la bibliotheque lance');
    } catch (e: any) {
      if (e?.message?.includes('already') || e?.message?.includes('409')) {
        scanMessage = 'Scan deja en cours...';
        notifications.success('Scan deja en cours');
      } else {
        scanMessage = `Erreur: ${e?.message || e}`;
        notifications.error(`Erreur scan: ${e?.message || e}`);
      }
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

  // --- Streaming Quality ---
  let streamingQuality = $state<string>('max');
  let qualityLoading = $state(false);

  async function loadStreamingQuality() {
    const zoneList = get(zones);
    if (!zoneList.length) return;
    try {
      const res = await api.getStreamingQuality(zoneList[0].id);
      streamingQuality = res.quality ?? 'max';
    } catch {}
  }

  async function applyStreamingQuality() {
    const zoneList = get(zones);
    if (!zoneList.length) return;
    qualityLoading = true;
    try {
      await api.setStreamingQuality(zoneList[0].id, streamingQuality);
    } catch {}
    qualityLoading = false;
  }

  // --- Config Export/Import ---
  let configExporting = $state(false);
  let configImporting = $state(false);
  let configImportFileInput: HTMLInputElement | null = $state(null);

  async function handleExportConfig() {
    configExporting = true;
    try {
      await api.exportConfig();
    } catch (err: any) {
      notifications.error(err?.message ?? 'Export failed');
    }
    configExporting = false;
  }

  async function onConfigImportSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    configImporting = true;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await api.importConfig(data);
      notifications.success(get(t)('settings.importConfigSuccess' as any));
    } catch (err: any) {
      notifications.error(get(t)('settings.importConfigError' as any) + ': ' + (err?.message ?? ''));
    }
    configImporting = false;
    input.value = '';
  }

  // --- MusicBrainz Batch Enrichment ---
  let batchEnrichRunning = $state(false);
  let batchEnrichCurrent = $state(0);
  let batchEnrichTotal = $state(0);
  let batchEnrichTimer: ReturnType<typeof setInterval> | null = $state(null);

  async function startBatchEnrich() {
    batchEnrichRunning = true;
    batchEnrichCurrent = 0;
    batchEnrichTotal = 0;
    try {
      await api.startBatchEnrich();
      notifications.info(get(t)('settings.batchEnrichStarted' as any));
      pollBatchEnrich();
    } catch (err: any) {
      batchEnrichRunning = false;
      notifications.error(err?.message ?? 'Error');
    }
  }

  function pollBatchEnrich() {
    if (batchEnrichTimer) clearInterval(batchEnrichTimer);
    batchEnrichTimer = setInterval(async () => {
      try {
        const status = await api.getBatchEnrichStatus();
        batchEnrichCurrent = status.processed ?? 0;
        batchEnrichTotal = status.total ?? 0;
        if (!status.running) {
          batchEnrichRunning = false;
          if (batchEnrichTimer) { clearInterval(batchEnrichTimer); batchEnrichTimer = null; }
          notifications.success(get(t)('settings.batchEnrichDone' as any));
        }
      } catch {
        batchEnrichRunning = false;
        if (batchEnrichTimer) { clearInterval(batchEnrichTimer); batchEnrichTimer = null; }
      }
    }, 10000);
  }

  // --- Library Import (Roon / Plex / Playlists) ---
  type ImportSource = 'roon' | 'plex' | 'playlists';
  type ImportStep = 'select' | 'preview' | 'done';
  let importSource = $state<ImportSource | null>(null);
  let importStep = $state<ImportStep>('select');
  let importFile = $state<File | null>(null);
  let importPreviewing = $state(false);
  let importImporting = $state(false);
  let importReport = $state<any>(null);
  let importError = $state<string | null>(null);
  let importFileInputRoon: HTMLInputElement | undefined = $state();
  let importFileInputPlex: HTMLInputElement | undefined = $state();
  let importFileInputPlaylist: HTMLInputElement | undefined = $state();

  function onImportFileChosen(source: ImportSource) {
    return async (e: Event) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      importSource = source;
      importFile = file;
      importError = null;
      importReport = null;
      importStep = 'preview';
      importPreviewing = true;
      try {
        let report;
        if (source === 'roon') report = await api.importRoon(file, true);
        else if (source === 'plex') report = await api.importPlex(file, true);
        else report = await api.importPlaylists(file, true);
        importReport = report;
        if (report.total_rows === 0) {
          importError = $t('import.noData' as any);
        }
      } catch (err: any) {
        importError = err?.message ?? 'Error';
      } finally {
        importPreviewing = false;
        input.value = '';
      }
    };
  }

  async function confirmImport() {
    if (!importFile || !importSource) return;
    importImporting = true;
    importError = null;
    try {
      let report;
      if (importSource === 'roon') report = await api.importRoon(importFile, false);
      else if (importSource === 'plex') report = await api.importPlex(importFile, false);
      else report = await api.importPlaylists(importFile, false);
      importReport = report;
      importStep = 'done';
      notifications.success($t('import.done' as any));
    } catch (err: any) {
      importError = err?.message ?? 'Error';
    } finally {
      importImporting = false;
    }
  }

  function resetImport() {
    importSource = null;
    importStep = 'select';
    importFile = null;
    importReport = null;
    importError = null;
    importPreviewing = false;
    importImporting = false;
  }

  // --- Push Notifications ---
  import { isPushEnabled, setPushEnabled, initPushNotifications } from '../lib/notifications-push';
  let pushEnabled = $state(isPushEnabled());

  function togglePush() {
    pushEnabled = !pushEnabled;
    setPushEnabled(pushEnabled);
    if (pushEnabled) initPushNotifications();
  }

  // Display metadata fields (chips shown under track titles)
  import { displayFields, DISPLAY_FIELDS_DEFAULTS } from '../lib/stores/displayFields';

  function toggleDisplayField(key: string) {
    displayFields.toggle(key);
  }

  // Use onMount (not $effect) to load data exactly once on component
  // creation.  The $effect(() => { untrack(() => { ... }) }) pattern
  // can re-trigger on batch flushes in certain Svelte 5 runtime versions,
  // flooding the server with API calls and starving the main thread so
  // sidebar clicks are never processed.
  onMount(() => {
    loadAll();
    fetchAudioDevices();
    fetchTunePeers();
    fetchServerVersion();
    checkForUpdate();
    loadCrossfade();
    loadStreamingQuality();
    loadScanSchedule();
    loadMetadataFields();
    loadLogLevel();
    loadAudioBackend();
    fetchYoutubeAuthStatus();
    if (pushEnabled) initPushNotifications();
  });

  // WS event subscription for scan/enrich progress — use $effect for
  // automatic cleanup on component destruction.
  $effect(() => {
    const unsub = tuneWS.onEvent((event) => {
      if (event.type === 'library.scan.progress') {
        scanning = true;
        scanProgress = event.data;
        api.getStats().then(s => { stats = s; }).catch(() => {});
      } else if (event.type === 'library.scan.completed') {
        scanning = false;
        scanProgress = null;
        scanningPath = null;
        const d = event.data ?? {};
        scanMessage = `Scan termine : ${d.scanned ?? '?'} fichiers, ${d.added ?? 0} ajoutes, ${d.updated ?? 0} mis a jour, ${d.removed ?? 0} supprimes`;
        notifications.success(scanMessage);
        loadAll();
      } else if (event.type === 'library.artwork.progress') {
        artworkProgress = event.data;
      } else if (event.type === 'library.artwork.completed') {
        artworkScanning = false;
        artworkProgress = null;
      } else if (event.type === 'library.enrich.progress') {
        batchEnrichRunning = true;
        batchEnrichCurrent = event.data.processed ?? 0;
        batchEnrichTotal = event.data.total ?? 0;
      } else if (event.type === 'library.enrich.completed') {
        batchEnrichRunning = false;
        if (batchEnrichTimer) { clearInterval(batchEnrichTimer); batchEnrichTimer = null; }
        notifications.success(get(t)('settings.batchEnrichDone' as any));
      }
    });
    return () => {
      unsub();
      stopTidalPolling();
      stopSpotifyPolling();
      stopDeezerPolling();
      stopYoutubePolling();
      if (batchEnrichTimer) { clearInterval(batchEnrichTimer); batchEnrichTimer = null; }
    };
  });
</script>

<div class="settings-view">
  <h2>{$t('settings.title')}</h2>

  <div class="settings-tabs">
    <button class="settings-tab" class:active={settingsTab === 'general'} onclick={() => settingsTab = 'general'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="18" x2="18" y2="18" />
        <circle cx="19" cy="6" r="3" /><circle cx="19" cy="12" r="3" />
      </svg>
      Général
    </button>
    <button class="settings-tab" class:active={settingsTab === 'library'} onclick={() => settingsTab = 'library'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
      Bibliothèque
    </button>
    <button class="settings-tab" class:active={settingsTab === 'services'} onclick={() => settingsTab = 'services'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
      Services
    </button>
    <button class="settings-tab" class:active={settingsTab === 'network'} onclick={() => settingsTab = 'network'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      Réseau &amp; Audio
    </button>
    <button class="settings-tab" class:active={settingsTab === 'system'} onclick={() => settingsTab = 'system'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      Système
    </button>
    <button class="settings-tab" class:active={settingsTab === 'multiroom'} onclick={() => settingsTab = 'multiroom'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <rect x="2" y="7" width="8" height="10" rx="1" /><rect x="14" y="7" width="8" height="10" rx="1" /><path d="M10 12h4" />
      </svg>
      Multi-room
    </button>
  </div>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      {$t('common.loading')}
    </div>
  {:else}
    {#if settingsTab === 'multiroom'}
    <!-- Multi-room settings -->
    <MultiroomSettings />
    {/if}

    {#if settingsTab === 'network'}
    <!-- Audio diagnostic -->
    <section class="settings-section audio-diagnostic">
      <h3>Diagnostic audio</h3>
      <div class="diag-checks">
        <div class="diag-check">
          <span class="diag-icon">{$zones.length > 0 ? '✅' : '⚠️'}</span>
          <span class="diag-label">Zones de lecture</span>
          <span class="diag-value">{$zones.length} configurée{$zones.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="diag-check">
          <span class="diag-icon">{audioDevices.length > 0 ? '✅' : '⚠️'}</span>
          <span class="diag-label">Sorties audio</span>
          <span class="diag-value">{audioDevices.length} détectée{audioDevices.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="diag-check">
          <span class="diag-icon">{$devices.length > 0 ? '✅' : 'ℹ️'}</span>
          <span class="diag-label">Appareils réseau</span>
          <span class="diag-value">{$devices.length} trouvé{$devices.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
      {#if $zones.length === 0 || audioDevices.length === 0}
        <p class="diag-hint">
          {#if $zones.length === 0}
            Aucune zone configurée. Créez-en une dans la section Zones ci-dessous.
          {:else if audioDevices.length === 0}
            Aucune sortie audio détectée. Vérifiez vos connexions (USB DAC, HDMI, etc.).
          {/if}
        </p>
      {/if}
    </section>
    {/if}

    {#if settingsTab === 'system'}
    <!-- Update banner (top of system tab for visibility) -->
    {#if updateInfo}
      <section class="settings-section">
        <div class="update-banner" style="margin-bottom: 1rem;">
          <span class="update-icon">🔄</span>
          <span class="update-text">
            Mise à jour disponible : <strong>v{updateInfo.latest_version}</strong>
            (actuel : v{updateInfo.current_version})
          </span>
          {#if updateDmgReady}
            <span class="update-done">DMG téléchargé et ouvert dans le Finder.</span>
          {:else if updateDone}
            <span class="update-done">Installée — redémarrage...</span>
          {:else if updateInstalling}
            <span class="update-btn" style="opacity:0.6">Installation...</span>
          {:else}
            <button class="update-btn" onclick={installUpdate}>Mettre à jour</button>
          {/if}
        </div>
      </section>
    {/if}

    <!-- Server health -->
    <section class="settings-section">
      <h3>{$t('settings.serverHealth')}</h3>
      {#if health}
        <div class="health-status" class:ok={health.status === 'ok'} class:degraded={health.status === 'degraded'}>
          <span class="health-dot"></span>
          {health.status === 'ok' ? $t('settings.operational') : $t('settings.degraded')}
        </div>
        {#if health.components}
        <div class="component-list">
          {#each Object.entries(health.components) as [name, ok]}
            <div class="component-item">
              <span class="component-name">{name}</span>
              <span class="component-status" class:ok={ok} class:error={!ok}>{ok ? $t('common.ok') : $t('common.error')}</span>
            </div>
          {/each}
        </div>
        {/if}
      {/if}
      <div class="server-actions">
        <button
          class="restart-btn"
          disabled={restarting}
          onclick={async () => {
            if (!confirm($t('settings.restartConfirm'))) return;
            restarting = true;
            try {
              await api.restartServer();
              setTimeout(() => window.location.reload(), 6000);
            } catch (e) {
              restarting = false;
              alert((e as Error).message);
            }
          }}
        >
          {restarting ? $t('settings.restarting') : $t('settings.restartServer')}
        </button>
      </div>
    </section>
    {/if}

    {#if settingsTab === 'network'}
    <!-- Tune Peers on the network -->
    <section class="settings-section">
      <h3>Serveurs Tune sur le réseau</h3>
      {#if peersLoading}
        <div class="loading"><div class="spinner small"></div> Recherche...</div>
      {:else if tunePeers.length === 0}
        <p class="diag-hint">Aucun autre serveur Tune détecté sur le réseau local.</p>
      {:else}
        <div class="peers-list">
          {#each tunePeers as peer}
            <div class="peer-card">
              <div class="peer-info">
                <span class="peer-name">{peer.name}</span>
                <span class="peer-details">{peer.host}:{peer.port} — v{peer.version}</span>
                <span class="peer-stats">{peer.tracks} pistes, {peer.zones} zone{peer.zones !== 1 ? 's' : ''}</span>
              </div>
              <div class="peer-actions">
                <button class="btn-secondary" onclick={() => window.open(`http://${peer.host}:${peer.port}`, '_blank')}>
                  Parcourir
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      <button class="scan-btn" onclick={fetchTunePeers} disabled={peersLoading} style="margin-top: 8px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
        Actualiser
      </button>
    </section>
    {/if}

    {#if settingsTab === 'general'}
    <!-- Playback / Crossfade -->
    <section class="settings-section">
      <h3>Lecture</h3>
      <div class="setting-row">
        <div class="setting-label">
          <span>Crossfade</span>
          <span class="setting-hint">Fondu enchaîné entre les pistes. Décochez pour un enchaînement gapless (sans silence ni fondu).</span>
        </div>
        <label class="toggle">
          <input type="checkbox" bind:checked={crossfadeEnabled} onchange={() => applyCrossfade()} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      {#if crossfadeEnabled}
        <div class="setting-row">
          <div class="setting-label">
            <span>Durée : {crossfadeDuration}s</span>
          </div>
          <input
            type="range"
            min="1" max="12" step="1"
            bind:value={crossfadeDuration}
            onchange={() => applyCrossfade()}
            style="flex: 1; max-width: 200px; accent-color: var(--tune-accent, #007AFF);"
          />
        </div>
      {/if}
    </section>

    <!-- Voice AI -->
    <section class="settings-section">
      <h3>Tune Voice AI</h3>
      <div class="setting-row">
        <div class="setting-label">
          <span>Commande vocale</span>
          <span class="setting-hint">Activez le micro pour parler a Tune AI au lieu de taper.</span>
        </div>
        <label class="toggle">
          <input type="checkbox" checked={localStorage.getItem('tune_voice_ai_enabled') === 'true'} onchange={(e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            localStorage.setItem('tune_voice_ai_enabled', String(enabled));
            if (enabled) {
              navigator.mediaDevices?.getUserMedia({ audio: true }).then(() => {
                notifications.success('Micro autorise. Rechargez la page pour activer le bouton micro dans Tune AI.');
              }).catch(() => {
                notifications.error('Acces au micro refuse par le navigateur.');
                localStorage.setItem('tune_voice_ai_enabled', 'false');
                (e.target as HTMLInputElement).checked = false;
              });
            }
          }} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </section>
    {/if}

    {#if settingsTab === 'library'}
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
        <button class="scan-btn" onclick={() => handleScan(false)} disabled={scanning}>
          {#if scanning}
            <div class="spinner small"></div>
            {$t('settings.scanning')}{#if scanProgress} — {scanProgress.scanned} fichiers ({scanProgress.added} ajoutés){/if}
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            {$t('settings.scanLibrary')}
          {/if}
        </button>
        <button class="scan-btn" onclick={() => handleScan(true)} disabled={scanning} title="Relit tous les tags audio (plus long)">
          {#if scanning}
            <div class="spinner small"></div>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M21.5 2v6h-6" /><path d="M2.5 22v-6h6" /><path d="M22 11.5A10 10 0 0 0 3.2 7.2" /><path d="M2 12.5a10 10 0 0 0 18.8 4.2" />
            </svg>
            Scan complet
          {/if}
        </button>
        {#if scanMessage}
          <span class="scan-message">{scanMessage}</span>
        {/if}

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

        <button class="scan-btn danger-btn" onclick={handleClearLibrary} disabled={clearingLibrary}>
          {#if clearingLibrary}
            <div class="spinner small"></div>
            Suppression...
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Vider la bibliothèque
          {/if}
        </button>
      </div>
    </section>

    <!-- Quality Split -->
    <section class="settings-section">
      <h3>Options de scan</h3>
      <div class="setting-row">
        <div class="setting-label">
          <span>Séparer les albums par qualité</span>
          <span class="setting-hint">Si un même album existe en CD et Hi-Res, créer deux entrées distinctes (ex: "Album (96kHz/24bit)")</span>
        </div>
        <label class="toggle">
          <input type="checkbox" checked={!(config?.quality_split === false || config?.quality_split === 'false' || config?.quality_split === 0 || config?.quality_split === '0')} onchange={async (e) => {
            const val = (e.target as HTMLInputElement).checked;
            await api.apiPatch('/system/config', { quality_split: val });
            if (config) config.quality_split = val;
            notifications.success('Sauvegardé. Relancez un scan complet pour appliquer.');
          }} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </section>

    <!-- Scan Schedule -->
    <section class="settings-section">
      <h3>{$t('settings.scanSchedule' as any)}</h3>
      <div class="setting-row">
        <div class="setting-label">
          <span>{$t('settings.scanScheduleEnabled' as any)}</span>
        </div>
        <label class="toggle">
          <input type="checkbox" bind:checked={scanScheduleEnabled} onchange={() => saveScanSchedule()} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      {#if scanScheduleEnabled}
        <div class="setting-row">
          <div class="setting-label">
            <span>{$t('settings.scanScheduleTime' as any)}</span>
          </div>
          <input
            type="time"
            class="pref-select"
            bind:value={scanScheduleTime}
            onchange={() => saveScanSchedule()}
            disabled={scanScheduleLoading}
            style="max-width: 140px;"
          />
        </div>
        <div class="scan-schedule-next">
          {$t('settings.scanScheduleNext' as any).replace('{time}', scanScheduleTime)}
        </div>
      {:else}
        <div class="scan-schedule-next muted">
          {$t('settings.scanScheduleDisabled' as any)}
        </div>
      {/if}
    </section>
    {/if}

    {#if settingsTab === 'system'}
    <!-- Database -->
    {#if config}
    <section class="settings-section">
      <h3>{$t('settings.database')}</h3>
      <div class="db-info">
        <div class="db-row">
          <span class="db-label">{$t('settings.dbEngine')}</span>
          <span class="badge {config.db_engine === 'sqlite' ? 'db-sqlite' : 'db-postgres'}">
            {config.db_engine === 'sqlite' ? 'SQLite' : 'PostgreSQL'}
          </span>
        </div>
        <div class="db-row">
          <span class="db-label">{$t('settings.dbConnected')}</span>
          <span class="component-status" class:ok={config.db_connected} class:error={!config.db_connected}>
            {config.db_connected ? $t('common.ok') : $t('common.error')}
          </span>
        </div>
        {#if config.db_engine === 'sqlite' && config.db_path}
          <div class="db-row">
            <span class="db-label">{$t('settings.dbPath')}</span>
            <span class="db-value mono">{config.db_path}</span>
          </div>
          <div class="db-row">
            <span class="db-label">Backups</span>
            <span class="db-value">{backups.length}</span>
          </div>
        {/if}
        {#if config.db_engine === 'postgres'}
          <div class="db-row">
            <span class="db-label">{$t('settings.dbPoolSize')}</span>
            <span class="db-value">{config.db_pool_min} - {config.db_pool_max}</span>
          </div>
        {/if}
        {#if stats}
          <div class="db-stats">
            <span class="db-stat">{stats.tracks} {$t('settings.tracks')}</span>
            <span class="db-stat">{stats.albums} {$t('settings.albums')}</span>
            <span class="db-stat">{stats.artists} {$t('settings.artists')}</span>
          </div>
        {/if}

        <!-- Import / Export -->
        <div class="db-importexport">
          <h4>Import / Export</h4>
          <div class="db-ie-actions">
            <button class="btn-secondary" onclick={exportDatabase}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Exporter la base
            </button>
            <button class="btn-secondary" onclick={() => dbImportFileInput?.click()} disabled={dbImporting}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {dbImporting ? 'Import...' : 'Importer un fichier'}
            </button>
            <input
              bind:this={dbImportFileInput}
              type="file"
              accept=".db,.sqlite,.sqlite3,.sql"
              style="display:none"
              onchange={onImportFileSelected}
            />
          </div>
          {#if dbImportResult}
            <div class="migrate-result" class:ok={dbImportResult.startsWith('Import réussi')} class:error={dbImportResult.startsWith('Erreur')}>
              {dbImportResult}
            </div>
          {/if}
        </div>

        <!-- Rebuild search index -->
        <div class="db-importexport">
          <h4>Index de recherche</h4>
          <p class="db-hint" style="margin-top:0">Reconstruire l'index si la recherche ne renvoie pas de resultats apres des modifications manuelles de la base.</p>
          <div class="db-ie-actions">
            <button class="btn-secondary" onclick={rebuildFtsIndex} disabled={ftsRebuilding}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {ftsRebuilding ? 'Reconstruction...' : 'Reconstruire l\'index'}
            </button>
          </div>
          {#if ftsResult}
            <div class="migrate-result" class:ok={ftsResult.startsWith('Index')} class:error={ftsResult.startsWith('Erreur')}>
              {ftsResult}
            </div>
          {/if}
        </div>

        <p class="db-hint">{$t('settings.dbSwitchInfo')}</p>

        <!-- Migration section -->
        {#if config.db_engine === 'sqlite'}
          <div class="db-migrate">
            <h4>Migrer vers PostgreSQL</h4>
            <div class="migrate-form">
              <input type="text" class="auth-input" placeholder="postgresql://user:password@localhost/tune" bind:value={pgUrl} />
              <div class="migrate-actions">
                <button class="btn-secondary" onclick={testPgConnection} disabled={!pgUrl || pgTesting}>
                  {pgTesting ? 'Test...' : 'Tester la connexion'}
                </button>
                <button class="btn-primary" onclick={migrateToPg} disabled={!pgTestOk || pgMigrating}>
                  {pgMigrating ? 'Migration en cours...' : 'Migrer'}
                </button>
              </div>
              {#if pgTestResult}
                <div class="migrate-result" class:ok={pgTestOk} class:error={!pgTestOk}>
                  {pgTestResult}
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <div class="db-migrate">
            <h4>Migrer vers SQLite</h4>
            <button class="btn-secondary" onclick={migrateToSqlite} disabled={pgMigrating}>
              {pgMigrating ? 'Migration en cours...' : 'Migrer vers SQLite'}
            </button>
          </div>
        {/if}
      </div>
    </section>
    {/if}

    <!-- Library Import (Roon / Plex / Playlists) -->
    <section class="settings-section">
      <h3>{$t('import.title' as any)}</h3>

      {#if importStep === 'select'}
        <div class="import-sources">
          <div class="import-card" role="button" tabindex="0"
               onclick={() => importFileInputRoon?.click()}
               onkeydown={(e) => e.key === 'Enter' && importFileInputRoon?.click()}>
            <div class="import-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 12h8M12 8v8" />
              </svg>
            </div>
            <div class="import-card-text">
              <strong>{$t('import.roon' as any)}</strong>
              <span>{$t('import.roonDesc' as any)}</span>
            </div>
            <input bind:this={importFileInputRoon} type="file" accept=".csv,.CSV,.txt" style="display:none"
                   onchange={onImportFileChosen('roon')} />
          </div>

          <div class="import-card" role="button" tabindex="0"
               onclick={() => importFileInputPlex?.click()}
               onkeydown={(e) => e.key === 'Enter' && importFileInputPlex?.click()}>
            <div class="import-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M9 8l6 4-6 4V8z" />
              </svg>
            </div>
            <div class="import-card-text">
              <strong>{$t('import.plex' as any)}</strong>
              <span>{$t('import.plexDesc' as any)}</span>
            </div>
            <input bind:this={importFileInputPlex} type="file" accept=".xml,.XML" style="display:none"
                   onchange={onImportFileChosen('plex')} />
          </div>

          <div class="import-card" role="button" tabindex="0"
               onclick={() => importFileInputPlaylist?.click()}
               onkeydown={(e) => e.key === 'Enter' && importFileInputPlaylist?.click()}>
            <div class="import-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <div class="import-card-text">
              <strong>{$t('import.playlists' as any)}</strong>
              <span>{$t('import.playlistDesc' as any)}</span>
            </div>
            <input bind:this={importFileInputPlaylist} type="file" accept=".m3u,.m3u8,.pls,.M3U,.M3U8,.PLS" style="display:none"
                   onchange={onImportFileChosen('playlists')} />
          </div>
        </div>

      {:else if importStep === 'preview'}
        <div class="import-preview">
          {#if importPreviewing}
            <div class="import-loading">
              <div class="spinner"></div>
              <span>{$t('import.previewing' as any)}</span>
            </div>
          {:else if importError}
            <div class="import-error">{importError}</div>
            <button class="btn-secondary" onclick={resetImport}>{$t('import.back' as any)}</button>
          {:else if importReport}
            <div class="import-summary">
              <h4>{$t('import.preview' as any)} — {importFile?.name}</h4>
              <div class="import-stats">
                <div class="import-stat">
                  <span class="import-stat-value">{importReport.total_rows}</span>
                  <span class="import-stat-label">{$t('import.totalRows' as any)}</span>
                </div>
                <div class="import-stat matched">
                  <span class="import-stat-value">{importReport.matched}</span>
                  <span class="import-stat-label">{$t('import.matched' as any)}</span>
                </div>
                <div class="import-stat unmatched">
                  <span class="import-stat-value">{importReport.unmatched}</span>
                  <span class="import-stat-label">{$t('import.unmatched' as any)}</span>
                </div>
              </div>

              {#if importReport.details?.length > 0}
                <details class="import-details">
                  <summary>{$t('import.matchDetails' as any)}</summary>
                  <div class="import-details-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Titre</th>
                          <th>Artiste</th>
                          <th>Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each importReport.details.slice(0, 100) as d}
                          <tr class:matched={d.matched} class:unmatched={!d.matched}>
                            <td>{d.title}</td>
                            <td>{d.artist ?? ''}</td>
                            <td>
                              {#if d.matched}
                                <span class="badge-ok">{d.match_method}</span>
                              {:else}
                                <span class="badge-miss">--</span>
                              {/if}
                            </td>
                          </tr>
                        {/each}
                        {#if importReport.details.length > 100}
                          <tr><td colspan="3" class="more-rows">+ {importReport.details.length - 100} lignes...</td></tr>
                        {/if}
                      </tbody>
                    </table>
                  </div>
                </details>
              {/if}

              <div class="import-actions">
                <button class="btn-secondary" onclick={resetImport}>{$t('import.cancel' as any)}</button>
                <button class="btn-primary" onclick={confirmImport} disabled={importImporting || importReport.matched === 0}>
                  {importImporting ? $t('import.importing' as any) : $t('import.confirm' as any)}
                </button>
              </div>
            </div>
          {/if}
        </div>

      {:else if importStep === 'done'}
        <div class="import-done">
          <div class="import-done-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h4>{$t('import.done' as any)}</h4>
          {#if importReport}
            <div class="import-stats">
              <div class="import-stat matched">
                <span class="import-stat-value">{importReport.matched}</span>
                <span class="import-stat-label">{$t('import.matched' as any)}</span>
              </div>
              {#if importReport.play_counts_updated > 0}
                <div class="import-stat">
                  <span class="import-stat-value">{importReport.play_counts_updated}</span>
                  <span class="import-stat-label">{$t('import.playCounts' as any)}</span>
                </div>
              {/if}
              {#if importReport.ratings_updated > 0}
                <div class="import-stat">
                  <span class="import-stat-value">{importReport.ratings_updated}</span>
                  <span class="import-stat-label">{$t('import.ratings' as any)}</span>
                </div>
              {/if}
              {#if importReport.playlists_created > 0}
                <div class="import-stat">
                  <span class="import-stat-value">{importReport.playlists_created}</span>
                  <span class="import-stat-label">{$t('import.playlistsCreated' as any)}</span>
                </div>
              {/if}
            </div>
          {/if}
          <button class="btn-secondary" onclick={resetImport}>{$t('import.back' as any)}</button>
        </div>
      {/if}
    </section>
    {/if}

    {#if settingsTab === 'library'}
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
      <div class="wizard-buttons">
        <button class="scan-btn" onclick={() => showSmbWizard = true}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
          </svg>
          {$t('settings.addSmbShare')}
        </button>
        <button class="scan-btn" onclick={() => showFolderWizard = true}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          {$t('settings.addLocalFolder')}
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
    {/if}

    {#if settingsTab === 'network'}
    <!-- Network Devices (DLNA / AirPlay) -->
    <section class="settings-section">
      <h3>{$t('settings.networkDevices')}</h3>
      <div class="devices-actions">
        <button class="scan-btn small" onclick={showAllDevices}>{$t('settings.showAll')}</button>
        <button class="scan-btn small" onclick={hideAllDevices}>{$t('settings.hideAll')}</button>
        <button class="scan-btn small danger" onclick={handleClearAllDevices}>{$t('settings.clearDevices')}</button>
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
              {#if device.type === 'airplay' || device.type === 'airplay2'}
                <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" />
              {:else}
                <rect x="2" y="7" width="20" height="15" rx="2" ry="2" /><polyline points="17 2 12 7 7 2" />
              {/if}
            </svg>
            <span class="device-toggle-name">{device.name}</span>
            <span class="device-toggle-tag {device.type}">{device.type === 'airplay2' ? 'AirPlay 2' : device.type === 'airplay' ? 'AirPlay' : device.type === 'chromecast' ? 'Cast' : device.type === 'bluos' ? 'BluOS' : device.type === 'openhome' ? 'OpenHome' : 'DLNA'}</span>
            {#if device.host}<span class="device-toggle-host">{device.host}</span>{/if}
            {#if device.type === 'airplay' || device.type === 'airplay2'}
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
            <button class="device-delete-btn" onclick={() => handleDeleteDevice(device.id, device.name)} title={$t('settings.deleteDevice')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
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
      <div class="about-row" style="margin-bottom: 0.75rem">
        <span class="about-label">Backend audio</span>
        <select class="log-level-select" value={audioBackend} onchange={(e) => changeAudioBackend((e.target as HTMLSelectElement).value)}>
          <option value="auto">Auto (defaut)</option>
          <option value="wasapi">WASAPI</option>
          <option value="asio">ASIO (bit-perfect)</option>
        </select>
      </div>
      {#if audioBackend === 'wasapi'}
      <div class="about-row" style="margin-bottom: 0.75rem">
        <span class="about-label">Mode WASAPI</span>
        <select class="log-level-select" value={exclusiveMode ? 'exclusive' : 'shared'} onchange={(e) => { const v = (e.target as HTMLSelectElement).value; if ((v === 'exclusive') !== exclusiveMode) toggleExclusiveMode(); }}>
          <option value="shared">Partage (defaut)</option>
          <option value="exclusive">Exclusif (bit-perfect)</option>
        </select>
      </div>
      {/if}
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

    <!-- Tune Bridge (Remote Access) -->
    <section class="settings-section">
      <h3>Tune Bridge</h3>
      <p class="muted" style="margin-bottom: 1rem">
        Access your Tune server from anywhere — no VPN or port forwarding needed.
      </p>
      <div class="about-row">
        <span class="about-label">Remote access</span>
        <button
          class="scan-btn small"
          class:danger={bridgeEnabled}
          onclick={toggleBridge}
          disabled={bridgeLoading}
        >
          {#if bridgeLoading}
            <div class="spinner small"></div>
          {:else}
            {bridgeEnabled ? 'Disable' : 'Enable'}
          {/if}
        </button>
      </div>
      {#if bridgeEnabled}
        <div class="about-row">
          <span class="about-label">Status</span>
          <span class="badge" class:badge-ok={bridgeConnected} class:badge-warn={!bridgeConnected}>
            {bridgeConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div class="about-row">
          <span class="about-label">Server ID</span>
          <span class="about-value mono">{bridgeServerId}</span>
        </div>
        {#if bridgeAccessUrl}
          <div class="about-row">
            <span class="about-label">Access URL</span>
            <a href={bridgeAccessUrl} target="_blank" rel="noopener" class="about-value link">{bridgeAccessUrl}</a>
          </div>
        {/if}
        {#if bridgeToken}
          <div class="about-row">
            <span class="about-label">Token</span>
            <code class="about-value mono" style="font-size: 0.75rem; word-break: break-all">{bridgeToken}</code>
          </div>
          <p class="muted" style="margin-top: 0.5rem">
            Save this token — it won't be shown again. Restart the server to activate.
          </p>
        {/if}
        {#if !bridgeConnected}
          <p class="muted" style="margin-top: 0.5rem">
            Restart the server to connect to the relay.
          </p>
        {/if}
      {/if}
    </section>
    {/if}

    {#if settingsTab === 'library'}
    <!-- Metadata -->
    {#if config}
    <section class="settings-section">
      <h3>{$t('metadata.title')}</h3>
      <div class="pref-grid">
        <label class="pref-label">{$t('settings.metadataReadonly')}</label>
        <label class="toggle-switch">
          <input type="checkbox" checked={config.metadata_readonly} onchange={async (e) => { const val = (e.target as HTMLInputElement).checked; config.metadata_readonly = val; await api.updateConfig({ metadata_readonly: val }); }} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <p class="settings-note">{$t('settings.metadataReadonlyHelp')}</p>
    </section>
    {/if}

    <!-- Enrichment -->
    {#if config}
    <section class="settings-section">
      <h3>{$t('settings.enrichment')}</h3>
      <div class="pref-grid">
        <label class="pref-label">{$t('settings.discogsToken')}</label>
        <span class="pref-value">
          {#if config.discogs_token_set}
            <span class="badge-ok">{$t('settings.discogsTokenSet')}</span>
          {:else}
            <span class="badge-warn">{$t('settings.discogsTokenNotSet')}</span>
          {/if}
        </span>
      </div>
      <p class="settings-note">{$t('settings.discogsTokenHelp')}</p>
      <p class="settings-note">TUNE_DISCOGS_TOKEN=... dans .env</p>
      <div class="settings-actions">
        <button class="action-btn" onclick={async () => { await api.apiPost('/system/enrich'); enrichMsg = $t('settings.enrichStarted'); setTimeout(() => enrichMsg = '', 3000); }}>
          {$t('settings.enrichNow')}
        </button>
        {#if enrichMsg}<span class="action-feedback">{enrichMsg}</span>{/if}
      </div>
      <div class="settings-actions" style="margin-top: 12px;">
        <button class="action-btn" onclick={async () => { await api.apiPost('/library/enrich-all'); enrichMsg = 'Enrichissement MusicBrainz lancé (genre, label, année, compositeur, ISRC)...'; setTimeout(() => enrichMsg = '', 5000); }}>
          Enrichir via MusicBrainz
        </button>
        <button class="action-btn" style="margin-left: 8px;" onclick={async () => { await api.apiPost('/library/write-tags', { only_missing: true }); enrichMsg = 'Écriture des tags dans les fichiers lancée (champs manquants uniquement)...'; setTimeout(() => enrichMsg = '', 5000); }}>
          Écrire les tags dans les fichiers
        </button>
      </div>
    </section>
    {/if}
    {/if}

    {#if settingsTab === 'general'}
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
          <option value="oled">{$t('settings.themeOled' as any)}</option>
          <option value="midnight">{$t('settings.themeMidnight' as any)}</option>
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
            api.setDefaultZone(defaultZoneId).catch(() => {});
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

    <!-- Display metadata fields -->
    <section class="settings-section">
      <h3>Champs métadonnées affichés</h3>
      <p class="section-hint">Champs affichés sous chaque titre dans les résultats de recherche, la bibliothèque, la file d'attente et l'historique.</p>
      {#if metadataLoading}
        <p style="opacity:0.5">Chargement…</p>
      {:else if metadataCategories.length > 0}
        {#each metadataCategories as cat, catIndex}
          <div class="metadata-category">
            <button class="category-toggle" onclick={() => toggleMetadataCategory(cat.name)}>
              <span class="toggle-icon">{metadataCollapsed[cat.name] ? '▸' : '▾'}</span>
              <span class="category-name">{cat.name}</span>
              <span class="category-count">{cat.fields.filter((f: any) => $displayFields.includes(f.key)).length}/{cat.fields.length}</span>
            </button>
            {#if !metadataCollapsed[cat.name]}
              <div class="display-fields-grid">
                {#each cat.fields as field, fieldIndex}
                  <label class="display-field-check">
                    <input
                      type="checkbox"
                      checked={$displayFields.includes(field.key)}
                      onchange={() => toggleDisplayField(field.key)}
                    />
                    <span>{field.label}</span>
                  </label>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      {:else}
        <div class="display-fields-grid">
          {#each DISPLAY_FIELDS_DEFAULTS as key}
            <label class="display-field-check">
              <input type="checkbox" checked={$displayFields.includes(key)} onchange={() => toggleDisplayField(key)} />
              <span>{key}</span>
            </label>
          {/each}
        </div>
      {/if}
    </section>
    {/if}

    {#if settingsTab === 'services'}
    <!-- Streaming services -->
    <section class="settings-section">
      <h3>{$t('settings.streaming')}</h3>
        <div class="service-list">
          {#each Object.entries($streamingServicesStore) as [name, status]}
            <div class="service-card">
              <div class="service-header">
                <span class="service-name">{name.charAt(0).toUpperCase() + name.slice(1)}</span>
                <div class="service-header-actions">
                  {#if status.enabled}
                    {#if status.authenticated}
                      {#if name === 'youtube' && youtubeEmail}
                        <span class="badge auth">{youtubeEmail}</span>
                        <button class="disconnect-btn" onclick={handleYoutubeDisconnect}>{$t('settings.disconnect')}</button>
                      {:else}
                        <span class="badge auth">{$t('settings.connected')}</span>
                        <button class="disconnect-btn" onclick={() => handleDisconnect(name)}>{$t('settings.disconnect')}</button>
                      {/if}
                    {:else}
                      <span class="badge noauth">{$t('settings.notConnected')}</span>
                    {/if}
                    <button class="disconnect-btn" onclick={() => handleToggleService(name, false)}>{$t('settings.disable')}</button>
                  {:else}
                    <button class="scan-btn" onclick={() => handleToggleService(name, true)}>{$t('settings.enable')}</button>
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
                        <p class="yt-user-code" title={$t('settings.youtubeCopyCode')} onclick={() => { navigator.clipboard.writeText(youtubeUserCode ?? ''); notifications.success($t('settings.youtubeCopied')); }}>{youtubeUserCode}</p>
                      {/if}
                      <a href={youtubeVerificationUrl} target="_blank" rel="noopener noreferrer" class="auth-link">
                        {youtubeVerificationUrl}
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
    </section>

    <!-- Spotify Connect (receiver) -->
    {#if spotifyConnect}
      <section class="settings-section">
        <h3>Spotify Connect</h3>
        <p class="section-hint">
          Tune apparaît comme un récepteur Spotify Connect sur le réseau local.
          Depuis l'app Spotify, sélectionnez "Tune (…)" dans la liste des appareils.
          Compte Spotify Premium requis côté client.
        </p>

        {#if !spotifyConnect.binary_available}
          <p class="auth-error">
            librespot non détecté. Réinstallez Tune Server depuis le .pkg /
            archive officiel pour que le binaire soit livré, ou installez-le
            séparément (<code>brew install librespot</code> /
            <code>apt install librespot</code>).
          </p>
        {:else}
          <div class="form-row">
            <label for="sc-zone">Zone cible</label>
            <select id="sc-zone" bind:value={spotifyConnectZoneId} disabled={spotifyConnect.enabled || spotifyConnectBusy}>
              <option value={null}>—</option>
              {#each $zones as z (z.id)}
                <option value={z.id}>{z.name}</option>
              {/each}
            </select>
          </div>
          <div class="form-row">
            <label for="sc-name">Nom du device (optionnel)</label>
            <input
              id="sc-name"
              type="text"
              placeholder="Tune ({spotifyConnect.device_name ?? '...'})"
              bind:value={spotifyConnectDeviceName}
              disabled={spotifyConnect.enabled || spotifyConnectBusy}
            />
          </div>

          {#if spotifyConnectError}
            <p class="auth-error">{spotifyConnectError}</p>
          {/if}

          <div class="form-actions">
            <button
              class="scan-btn"
              onclick={toggleSpotifyConnect}
              disabled={spotifyConnectBusy}
            >
              {#if spotifyConnectBusy}
                <div class="spinner small"></div>
                Patience…
              {:else if spotifyConnect.enabled}
                Désactiver
              {:else}
                Activer
              {/if}
            </button>
            {#if spotifyConnect.enabled}
              <span class="status-pill" class:active={spotifyConnect.active}>
                {spotifyConnect.active ? '● En lecture' : '○ En attente'}
              </span>
            {/if}
          </div>
        {/if}
      </section>
    {/if}

    <!-- Zone auto-create -->
    {#if config}
      <section class="settings-section">
        <h3>{$t('settings.zoneAutoCreate' as any)}</h3>
        <div class="pref-grid">
          <label class="pref-label">{$t('settings.zoneAutoCreateLabel' as any)}</label>
          <label class="toggle-switch">
            <input type="checkbox" checked={config.zone_auto_create ?? true} onchange={async (e) => { const val = (e.target as HTMLInputElement).checked; config.zone_auto_create = val; await api.updateConfig({ zone_auto_create: val }); }} />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <p class="settings-note">{$t('settings.zoneAutoCreateHint' as any)}</p>
      </section>
    {/if}

    <!-- Zone audio settings (DSD mode, gapless, fixed volume) -->
    {#if $zones.length > 0}
      <section class="settings-section">
        <h3>Réglages par zone</h3>
        <p class="section-hint">Mode DSD, volume fixe et gapless pour chaque zone de lecture.</p>
        <div class="zone-settings-list">
          {#each $zones as z (z.id)}
            <div class="zone-setting-row">
              <span class="zone-setting-name">{z.name}</span>
              <div class="zone-setting-controls">
                <label class="zone-setting-label">
                  <span>DSD</span>
                  <select
                    class="zone-select"
                    value={z.dsd_mode ?? 'auto'}
                    onchange={async (e) => {
                      const mode = (e.target as HTMLSelectElement).value;
                      await api.updateZoneDsdMode(z.id, mode);
                    }}
                  >
                    <option value="auto">Auto</option>
                    <option value="native">Natif (passthrough)</option>
                    <option value="dop">DoP</option>
                    <option value="pcm">PCM (conversion)</option>
                  </select>
                </label>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Squeezebox / Lyrion Music Server -->
    {#if config}
      <section class="settings-section">
        <h3>{$t('settings.squeezebox' as any)}</h3>
        <p class="section-hint">{$t('settings.squeezeboxHint' as any)}</p>

        <div class="setting-row">
          <div class="setting-label">
            <span>{$t('settings.squeezeboxEnabled' as any)}</span>
          </div>
          <label class="toggle">
            <input type="checkbox" checked={config.squeezebox_enabled ?? false} onchange={() => toggleSqueezeboxEnabled()} disabled={squeezeboxSaving} />
            <span class="toggle-slider"></span>
          </label>
        </div>

        {#if config.squeezebox_enabled}
          <div class="setting-row" style="margin-top: 0.5rem;">
            <div class="setting-label">
              <span>{$t('settings.squeezeboxLmsHost' as any)}</span>
              {#if squeezeboxStatus?.lms_discovered && squeezeboxStatus?.lms_host}
                <span class="setting-hint">{$t('settings.squeezeboxLmsDetected' as any).replace('{host}', squeezeboxStatus.lms_host)}</span>
              {/if}
            </div>
            <div class="squeezebox-host-row">
              <input
                type="text"
                class="auth-input"
                placeholder={$t('settings.squeezeboxLmsPlaceholder' as any)}
                bind:value={squeezeboxLmsHostInput}
                disabled={squeezeboxSaving}
                onkeydown={(e) => { if (e.key === 'Enter') saveSqueezeboxLmsHost(); }}
                style="max-width: 260px;"
              />
              <button class="scan-btn small" onclick={saveSqueezeboxLmsHost} disabled={squeezeboxSaving}>
                {squeezeboxSaving ? $t('settings.squeezeboxSaving' as any) : $t('common.save' as any)}
              </button>
            </div>
          </div>

          <div style="margin-top: 1rem;">
            <div class="squeezebox-players-header">
              <h4>{$t('settings.squeezeboxPlayers' as any)}</h4>
              <button class="scan-btn small" onclick={discoverSqueezeboxPlayers} disabled={squeezeboxLoading}>
                {#if squeezeboxLoading}
                  <div class="spinner small"></div>
                  {$t('settings.squeezeboxRefreshing' as any)}
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  {$t('settings.squeezeboxRefresh' as any)}
                {/if}
              </button>
            </div>

            {#if squeezeboxStatus?.players && squeezeboxStatus.players.length > 0}
              <div class="squeezebox-player-list">
                {#each squeezeboxStatus.players as player}
                  <div class="squeezebox-player-card">
                    <div class="squeezebox-player-info">
                      <span class="squeezebox-player-name">{player.name}</span>
                      <span class="squeezebox-player-details">{player.model} &mdash; {player.ip}</span>
                    </div>
                    <div class="squeezebox-player-actions">
                      <span class="squeezebox-status-badge" class:connected={player.connected} class:disconnected={!player.connected}>
                        {player.connected ? $t('settings.squeezeboxConnected' as any) : $t('settings.squeezeboxDisconnected' as any)}
                      </span>
                      <button
                        class="scan-btn small"
                        onclick={() => createZoneFromSqueezebox(player)}
                        disabled={squeezeboxCreatingZone === player.id || !player.connected}
                      >
                        {#if squeezeboxCreatingZone === player.id}
                          <div class="spinner small"></div>
                          {$t('settings.squeezeboxCreatingZone' as any)}
                        {:else}
                          {$t('settings.squeezeboxCreateZone' as any)}
                        {/if}
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {:else if !squeezeboxLoading}
              <p class="muted">{$t('settings.squeezeboxNoPlayers' as any)}</p>
            {/if}
          </div>
        {/if}
      </section>
    {/if}

    <!-- HQPlayer -->
    {#if config}
      <section class="settings-section">
        <h3>HQPlayer</h3>
        <p class="section-hint">Connectez Tune à HQPlayer pour l'upsampling et les filtres audiophiles. Port par défaut : 4321 (v4/v5) ou 8019 (v6).</p>

        <div class="setting-row">
          <div class="setting-label">
            <span>Activer HQPlayer</span>
          </div>
          <label class="toggle">
            <input type="checkbox" checked={hqplayerEnabled} onchange={() => toggleHqplayer()} disabled={hqplayerSaving} />
            <span class="toggle-slider"></span>
          </label>
        </div>

        {#if hqplayerEnabled}
          <div class="setting-row" style="margin-top: 0.5rem;">
            <div class="setting-label">
              <span>Adresse IP HQPlayer</span>
            </div>
            <div class="squeezebox-host-row">
              <input
                type="text"
                class="auth-input"
                placeholder="192.168.1.100"
                bind:value={hqplayerHostInput}
                disabled={hqplayerSaving}
                onkeydown={(e) => { if (e.key === 'Enter') saveHqplayer(); }}
                style="max-width: 200px;"
              />
              <input
                type="number"
                class="auth-input"
                placeholder="4321"
                bind:value={hqplayerPortInput}
                disabled={hqplayerSaving}
                style="max-width: 80px;"
              />
              <button class="scan-btn small" onclick={saveHqplayer} disabled={hqplayerSaving}>
                {hqplayerSaving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </div>
          </div>

          <div class="setting-row" style="margin-top: 0.5rem;">
            <div class="setting-label">
              <span>État</span>
            </div>
            <div>
              {#if hqplayerChecking}
                <div class="spinner small"></div>
              {:else if hqplayerReachable === true}
                <span class="squeezebox-status-badge connected">Connecté</span>
              {:else if hqplayerReachable === false}
                <span class="squeezebox-status-badge disconnected">Injoignable</span>
              {:else}
                <span class="muted">Non testé</span>
              {/if}
              <button class="scan-btn small" onclick={checkHqplayer} disabled={hqplayerChecking} style="margin-left: 8px;">
                Tester la connexion
              </button>
            </div>
          </div>
        {/if}
      </section>
    {/if}
    {/if}

    {#if settingsTab === 'general'}
    <!-- Streaming Quality -->
    <section class="settings-section">
      <h3>{$t('settings.streamingQuality' as any)}</h3>
      <div class="setting-row">
        <div class="setting-label">
          <span>{$t('settings.streamingQuality' as any)}</span>
        </div>
        <select class="quality-select" bind:value={streamingQuality} onchange={() => applyStreamingQuality()} disabled={qualityLoading}>
          <option value="max">{$t('settings.qualityMax' as any)}</option>
          <option value="hires">{$t('settings.qualityHires' as any)}</option>
          <option value="cd">{$t('settings.qualityCd' as any)}</option>
          <option value="low">{$t('settings.qualityLow' as any)}</option>
        </select>
      </div>
    </section>
    {/if}

    {#if settingsTab === 'system'}
    <!-- Config Export/Import -->
    <section class="settings-section">
      <h3>{$t('settings.configSection' as any)}</h3>
      <div class="db-ie-actions">
        <button class="btn-secondary" onclick={handleExportConfig} disabled={configExporting}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {configExporting ? $t('settings.exporting' as any) : $t('settings.exportConfig' as any)}
        </button>
        <button class="btn-secondary" onclick={() => configImportFileInput?.click()} disabled={configImporting}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {configImporting ? $t('settings.importing' as any) : $t('settings.importConfig' as any)}
        </button>
        <input
          type="file"
          accept=".json"
          style="display:none"
          bind:this={configImportFileInput}
          onchange={onConfigImportSelected}
        />
      </div>
    </section>
    {/if}

    {#if settingsTab === 'library'}
    <!-- MusicBrainz Batch Enrichment -->
    <section class="settings-section">
      <h3>MusicBrainz</h3>
      <div class="action-buttons">
        <button class="scan-btn" onclick={startBatchEnrich} disabled={batchEnrichRunning}>
          {#if batchEnrichRunning}
            <div class="spinner small"></div>
            {$t('settings.batchEnrichRunning' as any).replace('{current}', String(batchEnrichCurrent)).replace('{total}', String(batchEnrichTotal))}
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {$t('settings.batchEnrich' as any)}
          {/if}
        </button>
      </div>
      {#if batchEnrichRunning && batchEnrichTotal > 0}
        <div class="enrich-progress">
          <div class="enrich-progress-bar">
            <div class="enrich-progress-fill" style="width: {Math.round((batchEnrichCurrent / batchEnrichTotal) * 100)}%"></div>
          </div>
          <span class="enrich-progress-text">{batchEnrichCurrent} / {batchEnrichTotal}</span>
        </div>
      {/if}
    </section>
    {/if}

    {#if settingsTab === 'system'}
    <!-- Push Notifications -->
    <section class="settings-section">
      <h3>{$t('settings.pushNotifications' as any)}</h3>
      <div class="setting-row">
        <div class="setting-label">
          <span>{$t('settings.pushNotifications' as any)}</span>
          <span class="setting-hint">{$t('settings.pushNotificationsHint' as any)}</span>
        </div>
        <label class="toggle">
          <input type="checkbox" checked={pushEnabled} onchange={togglePush} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </section>

    <section class="settings-section">
      <h3>Exporter CSV</h3>
      <p class="section-hint">Téléchargez votre bibliothèque au format CSV.</p>
      <div class="db-ie-actions">
        <button class="btn-secondary" onclick={async () => { csvExporting = 'albums'; try { await api.exportAlbumsCsv(); } catch (e) { alert('Erreur : ' + (e as Error).message); } finally { csvExporting = null; } }} disabled={csvExporting !== null}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {csvExporting === 'albums' ? 'Export...' : 'Albums (CSV)'}
        </button>
        <button class="btn-secondary" onclick={async () => { csvExporting = 'tracks'; try { await api.exportTracksCsv(); } catch (e) { alert('Erreur : ' + (e as Error).message); } finally { csvExporting = null; } }} disabled={csvExporting !== null}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {csvExporting === 'tracks' ? 'Export...' : 'Pistes (CSV)'}
        </button>
        <button class="btn-secondary" onclick={async () => { csvExporting = 'artists'; try { await api.exportArtistsCsv(); } catch (e) { alert('Erreur : ' + (e as Error).message); } finally { csvExporting = null; } }} disabled={csvExporting !== null}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {csvExporting === 'artists' ? 'Export...' : 'Artistes (CSV)'}
        </button>
      </div>
    </section>
    {/if}

    {#if settingsTab === 'library'}
    <!-- Metadata Fields Configuration -->
    <section class="settings-section">
      <h3>Metadonnees</h3>
      <p class="meta-fields-hint">Choisissez les champs de metadonnees affichees dans les vues album et piste.</p>
      {#if metadataLoading}
        <div class="loading"><div class="spinner small"></div> Chargement...</div>
      {:else}
        <div class="meta-fields-categories">
          {#each metadataCategories as cat, catIndex}
            <div class="meta-fields-category">
              <button
                class="meta-fields-category-header"
                onclick={() => toggleMetadataCategory(cat.name)}
              >
                <span class="meta-fields-category-name">{cat.name}</span>
                <span class="meta-fields-category-count">
                  {cat.fields.filter(f => f.enabled).length}/{cat.fields.length}
                </span>
                <svg
                  class="meta-fields-chevron"
                  class:collapsed={metadataCollapsed[cat.name]}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  width="16" height="16"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {#if !metadataCollapsed[cat.name]}
                <div class="meta-fields-list">
                  {#each cat.fields as field, fieldIndex}
                    <label class="meta-field-item">
                      <span class="meta-field-label">{field.label}</span>
                      <span class="meta-field-key">{field.key}</span>
                      <label class="cloud-toggle">
                        <input
                          type="checkbox"
                          checked={field.enabled}
                          onchange={() => toggleMetadataField(catIndex, fieldIndex)}
                        />
                        <span class="cloud-toggle-slider"></span>
                      </label>
                    </label>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>
    {/if}

    {#if settingsTab === 'system'}
    <!-- Cloud / mozaiklabs.fr -->
    <section class="settings-section">
      <h3>Cloud</h3>

      <!-- SSO Status -->
      <div class="cloud-subsection">
        <h4 class="cloud-label">mozaiklabs.fr</h4>
        {#if cloudSsoLoading}
          <div class="cloud-row"><div class="spinner small"></div> Chargement...</div>
        {:else if cloudSsoEmail}
          <div class="cloud-row">
            {#if cloudSsoAvatar}
              <img src={cloudSsoAvatar} alt="" class="cloud-avatar" />
            {:else}
              <span class="cloud-status-dot connected"></span>
            {/if}
            <span class="cloud-status-text">Connecté en tant que <strong>{cloudSsoName || cloudSsoEmail}</strong></span>
          </div>
        {:else if cloudSsoConfigured}
          <div class="cloud-row">
            <span class="cloud-status-dot disconnected"></span>
            <span class="cloud-status-text">Non connecte</span>
            <button class="scan-btn small" onclick={cloudSsoConnect}>Se connecter</button>
          </div>
        {:else}
          <div class="cloud-row">
            <span class="cloud-status-dot disconnected"></span>
            <span class="cloud-status-text">Cloud bientôt disponible sur ce serveur</span>
            <span style="margin-left:0.5em;font-size:0.85em"><a href="https://mozaiklabs.fr" target="_blank" rel="noopener noreferrer" style="color:var(--tune-accent)">En savoir plus</a></span>
          </div>
        {/if}
      </div>

      <!-- Telemetry -->
      <div class="cloud-subsection">
        <div class="cloud-toggle-row">
          <div class="cloud-toggle-label">
            <span>Telemetrie</span>
            <span class="cloud-toggle-hint">Envoyer des statistiques anonymes pour ameliorer Tune.</span>
          </div>
          <label class="cloud-toggle">
            <input type="checkbox" checked={cloudTelemetryEnabled} onchange={toggleCloudTelemetry} disabled={cloudTelemetryLoading} />
            <span class="cloud-toggle-slider"></span>
          </label>
        </div>
        {#if cloudTelemetryInstanceId}
          <div class="cloud-instance-id">Instance : <code>{cloudTelemetryInstanceId}</code></div>
        {/if}
      </div>

      <!-- Plugins marketplace link -->
      <div class="cloud-subsection">
        <button class="scan-btn" onclick={() => activeView.set('plugins')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M20 16V7a2 2 0 0 0-2-2h-3a2 2 0 0 1-2-2 2 2 0 0 0-2 2H8a2 2 0 0 0-2 2v3a2 2 0 0 1 2 2 2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h3a2 2 0 0 1 2 2 2 2 0 0 0 2-2h3a2 2 0 0 0 2-2z"/>
          </svg>
          Parcourir les plugins
        </button>
      </div>
    </section>

    <!-- Licence Tune Premium -->
    <section class="settings-section">
      <h3>Licence Tune Premium</h3>

      <!-- Tier badge -->
      <div class="license-tier-row">
        {#if $isPremium}
          <span class="license-badge premium">Premium</span>
        {:else}
          <span class="license-badge free">Free</span>
        {/if}
        {#if $licenseState.expiresAt}
          <span class="license-expires">Expire le {new Date($licenseState.expiresAt).toLocaleDateString('fr-FR')}</span>
        {/if}
      </div>

      {#if $licenseState.licenseKey}
        <!-- Active license display -->
        <div class="license-active-row">
          <span class="license-key-display">{maskLicenseKey($licenseState.licenseKey)}</span>
          <div class="license-actions">
            <button class="scan-btn small" onclick={handleValidateLicense} disabled={licenseValidating}>
              {licenseValidating ? 'Validation...' : 'Valider'}
            </button>
            <button class="scan-btn small danger-btn" onclick={handleDeactivateLicense} disabled={licenseDeactivating}>
              {licenseDeactivating ? 'Desactivation...' : 'Desactiver'}
            </button>
          </div>
        </div>
      {:else}
        <!-- Key input + activate -->
        <div class="license-input-row">
          <input
            type="text"
            class="pref-select license-key-input"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            bind:value={licenseKeyInput}
            onkeydown={(e) => { if (e.key === 'Enter') handleActivateLicense(); }}
          />
          <button class="scan-btn" onclick={handleActivateLicense} disabled={licenseActivating || !licenseKeyInput.trim()}>
            {licenseActivating ? 'Activation...' : 'Activer'}
          </button>
        </div>
        {#if licenseError}
          <div class="license-error">{licenseError}</div>
        {/if}
      {/if}

      <!-- Features list -->
      {#if Object.keys($licenseState.features).length > 0}
        <div class="license-features">
          <h4 class="cloud-label">Fonctionnalites</h4>
          <div class="license-features-grid">
            {#each Object.entries($licenseState.features) as [key, feat]}
              <div class="license-feature-item" class:enabled={feat.enabled} class:locked={!feat.enabled}>
                <span class="license-feature-icon">{feat.enabled ? '✓' : '🔒'}</span>
                <span class="license-feature-name">{feat.display_name}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="license-footer">
        <a href="https://mozaiklabs.fr/pricing" target="_blank" rel="noopener noreferrer" class="license-pricing-link">
          Voir les offres sur mozaiklabs.fr/pricing
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
        </a>
      </div>
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
        {#if updateInfo}
          <div class="update-banner">
            <span class="update-icon">🔄</span>
            <span class="update-text">
              Mise à jour disponible : <strong>v{updateInfo.latest_version}</strong>
              (actuel : v{updateInfo.current_version})
            </span>
            {#if updateDmgReady}
              <span class="update-done">Le DMG a été téléchargé et ouvert. Glissez la nouvelle app dans Applications, puis relancez Tune Server.</span>
            {:else if updateDone}
              <span class="update-done">Installée</span>
              <button
                class="update-btn"
                disabled={restarting}
                onclick={async () => {
                  if (!confirm($t('settings.restartConfirm'))) return;
                  restarting = true;
                  try {
                    await api.restartServer();
                    setTimeout(() => window.location.reload(), 6000);
                  } catch (e) {
                    restarting = false;
                    alert((e as Error).message);
                  }
                }}
              >
                {restarting ? $t('settings.restarting') : $t('settings.restartServer')}
              </button>
            {:else if updateInfo.installable === false}
              <span class="update-done" title={updateInfo.install_hint ?? ''}>
                ⚠️ Source install — voir notes
              </span>
            {:else}
              <button class="update-btn" onclick={installUpdate} disabled={updateInstalling}>
                {updateInstalling ? 'Installation...' : 'Installer'}
              </button>
            {/if}
          </div>
          {#if updateInfo.installable === false && updateInfo.install_hint}
            <div class="install-hint">{updateInfo.install_hint}</div>
          {/if}
        {:else}
          <div class="about-row">
            <span class="about-label">Mises à jour</span>
            <span class="about-value" style="color: var(--tune-accent)">✓ À jour</span>
          </div>
        {/if}

        <!-- Diagnostics bundle (Windows-friendly support tool) -->
        <div class="about-row" style="margin-top: 0.75rem">
          <span class="about-label">Diagnostics</span>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button
              class="scan-btn"
              onclick={downloadDiagnostics}
              disabled={diagDownloading}
              title="Télécharge un ZIP avec logs + diagnostics + config (creds masqués) à envoyer au support"
            >
              {#if diagDownloading}
                <div class="spinner small"></div>
                Préparation…
              {:else}
                Télécharger le diagnostic
              {/if}
            </button>
            <button
              class="scan-btn"
              onclick={downloadLogs}
              disabled={logsDownloading}
              title="Télécharge les derniers logs du serveur"
            >
              {#if logsDownloading}
                <div class="spinner small"></div>
              {:else}
                Télécharger les logs
              {/if}
            </button>
          </div>
        </div>

        <!-- Log Level -->
        <div class="about-row" style="margin-top: 0.75rem">
          <span class="about-label">Niveau de log</span>
          <select
            class="log-level-select"
            value={logLevel}
            onchange={(e) => changeLogLevel((e.target as HTMLSelectElement).value)}
          >
            <option value="error">Error</option>
            <option value="warn">Warn</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
            <option value="trace">Trace</option>
          </select>
        </div>

        <!-- What's New -->
        <div class="about-row" style="margin-top: 0.75rem">
          <span class="about-label">{$t('whatsnew.title')}</span>
          <button
            class="scan-btn"
            onclick={() => window.dispatchEvent(new CustomEvent('tune:open-whatsnew'))}
            title={$t('whatsnew.title')}
          >
            ✨ {$t('whatsnew.title')}
          </button>
        </div>

        <!-- API Documentation -->
        <div class="about-row" style="margin-top: 0.75rem">
          <span class="about-label">{$t('settings.apiDocs' as any)}</span>
          <a
            class="scan-btn"
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            style="text-decoration: none; display: inline-flex; align-items: center; gap: 6px;"
          >
            {$t('settings.apiDocs' as any)}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      </div>
    </section>
    {/if}
  {/if}
</div>

{#if showSmbWizard}
  <SmbWizard
    onClose={() => showSmbWizard = false}
    onMusicDirsChanged={async () => {
      const br = await api.getBrowseRoots().catch(() => ({ roots: [] }));
      musicRoots = br.roots;
    }}
  />
{/if}

{#if showFolderWizard}
  <FolderWizard
    onClose={() => showFolderWizard = false}
    onMusicDirsChanged={async () => {
      const br = await api.getBrowseRoots().catch(() => ({ roots: [] }));
      musicRoots = br.roots;
    }}
  />
{/if}

<style>
  .settings-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    padding-bottom: calc(var(--space-lg) + 24px);
    overflow-y: auto;
    gap: var(--space-lg);
  }

  .settings-view > h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  /* Tab pills */
  .settings-tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 4px;
  }

  .settings-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 600;
    padding: 6px 16px;
    border-radius: 20px;
    border: 1.5px solid rgba(255, 255, 255, 0.12);
    background: transparent;
    color: var(--tune-text-secondary);
    cursor: pointer;
    transition: all 0.15s ease-out;
    letter-spacing: 0.2px;
  }

  .settings-tab:hover {
    border-color: var(--tune-accent);
    color: var(--tune-text);
  }

  .settings-tab.active {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: white;
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

  /* Audio diagnostic */
  .diag-checks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
  }

  .diag-check {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-body);
    font-size: 14px;
  }

  .diag-icon {
    font-size: 16px;
  }

  .diag-label {
    color: var(--tune-text-secondary);
  }

  .diag-value {
    font-weight: 600;
    color: var(--tune-text);
  }

  .diag-hint {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-warning);
    margin: var(--space-sm) 0 0;
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

  .danger-btn {
    border-color: rgba(239, 68, 68, 0.3) !important;
    color: #ef4444 !important;
  }

  .danger-btn:hover:not(:disabled) {
    border-color: #ef4444 !important;
    background: rgba(239, 68, 68, 0.1) !important;
    color: #ef4444 !important;
  }

  .scan-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .server-actions {
    margin-top: var(--space-md);
  }

  .restart-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-lg);
    background: var(--tune-grey2);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 14px;
    transition: all 0.12s ease-out;
  }

  .restart-btn:hover:not(:disabled) {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.1);
  }

  .restart-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .install-hint {
    margin-top: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.25);
    border-radius: var(--radius-md);
    color: #fbbf24;
    font-family: var(--font-body);
    font-size: 13px;
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

  .yt-user-code {
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 32px;
    font-weight: 800;
    letter-spacing: 6px;
    color: var(--tune-accent);
    background: var(--tune-surface);
    border: 2px dashed var(--tune-accent);
    border-radius: 8px;
    padding: 12px 24px;
    margin: 8px 0;
    text-align: center;
    cursor: pointer;
    user-select: all;
    transition: background 0.15s;
  }

  .yt-user-code:hover {
    background: color-mix(in srgb, var(--tune-accent) 10%, var(--tune-surface));
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

  .section-hint {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    margin: 0 0 var(--space-md) 0;
    line-height: 1.5;
  }

  .metadata-category {
    margin-bottom: 12px;
  }
  .category-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    color: var(--tune-text);
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    padding: 6px 0;
    width: 100%;
    text-align: left;
  }
  .category-toggle:hover { color: var(--tune-accent); }
  .toggle-icon { font-size: 11px; opacity: 0.6; width: 12px; }
  .category-count { font-weight: 400; opacity: 0.5; font-size: 11px; margin-left: auto; }
  .display-fields-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-sm) var(--space-md);
    padding-left: 20px;
  }

  .display-field-check {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
    cursor: pointer;
    user-select: none;
  }

  .display-field-check input[type="checkbox"] {
    accent-color: var(--tune-accent);
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    cursor: pointer;
  }

  .display-field-check:hover {
    color: var(--tune-text);
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

  .device-delete-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 2px;
    margin-left: auto;
    border-radius: var(--radius-sm);
    transition: all 0.12s ease-out;
  }

  .device-delete-btn:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }

  .scan-btn.danger {
    color: #ef4444;
    border-color: #ef4444;
  }

  .scan-btn.danger:hover {
    background: rgba(239, 68, 68, 0.1);
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

  .wizard-buttons {
    display: flex;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
    flex-wrap: wrap;
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

  .log-level-select {
    background: rgba(255,255,255,0.06);
    border: 1px solid var(--tune-border);
    border-radius: 6px;
    color: var(--tune-text);
    font-family: var(--font-label);
    font-size: 13px;
    padding: 5px 10px;
    cursor: pointer;
  }
  .log-level-select:focus { border-color: var(--tune-accent); outline: none; }

  .update-banner {
    margin-top: 12px;
    padding: 12px 16px;
    background: linear-gradient(135deg, var(--tune-accent), color-mix(in srgb, var(--tune-accent) 70%, white));
    border-radius: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: white;
  }

  .update-icon {
    font-size: 20px;
  }

  .update-text {
    flex: 1;
    font-size: 13px;
  }

  .update-btn {
    background: white;
    color: var(--tune-accent);
    border: none;
    border-radius: 6px;
    padding: 6px 16px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
  }

  .update-btn:hover {
    opacity: 0.9;
  }

  .update-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .update-done {
    font-weight: 600;
    font-size: 13px;
  }

  /* Database section */
  .db-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .db-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-xs) 0;
    font-family: var(--font-body);
    font-size: 13px;
  }

  .db-label {
    color: var(--tune-text-secondary);
  }

  .db-value {
    color: var(--tune-text);
    font-weight: 500;
  }

  .db-value.mono {
    font-family: monospace;
    font-size: 12px;
    color: var(--tune-text-muted);
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
  }

  .badge.db-sqlite {
    background: rgba(87, 198, 185, 0.15);
    color: var(--tune-success);
  }

  .badge.db-postgres {
    background: rgba(117, 116, 243, 0.15);
    color: var(--tune-accent);
  }

  .db-stats {
    display: flex;
    gap: var(--space-md);
    padding: var(--space-sm) 0;
  }

  .db-stat {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }

  .db-hint {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    margin: var(--space-sm) 0 0 0;
    line-height: 1.4;
  }

  .db-migrate {
    margin-top: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--tune-border);
  }
  .db-migrate h4 {
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text-primary);
    margin: 0 0 var(--space-sm) 0;
  }
  .db-importexport {
    margin-top: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--tune-border);
  }
  .db-importexport h4 {
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text-primary);
    margin: 0 0 var(--space-sm) 0;
  }
  .db-ie-actions {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
    margin-bottom: var(--space-sm);
  }
  .db-ie-actions button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .migrate-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .migrate-actions {
    display: flex;
    gap: var(--space-sm);
  }
  .migrate-result {
    font-size: 12px;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
  }
  .migrate-result.ok {
    color: #4ade80;
    background: rgba(74, 222, 128, 0.1);
  }
  .migrate-result.error {
    color: #f87171;
    background: rgba(248, 113, 113, 0.1);
  }
  .btn-primary {
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    padding: 6px 14px;
    font-size: 12px;
    cursor: pointer;
    font-weight: 600;
  }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary {
    background: var(--tune-surface-hover);
    color: var(--tune-text-primary);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 6px 14px;
    font-size: 12px;
    cursor: pointer;
  }
  .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .scan-message { font-size: 12px; color: var(--tune-accent); margin-left: 8px; font-weight: 600; }

  .scan-schedule-next {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
    margin-top: var(--space-sm);
    padding: var(--space-sm) 0;
  }

  .scan-schedule-next.muted {
    color: var(--tune-text-muted);
  }

  /* Squeezebox / Lyrion */
  .squeezebox-host-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .squeezebox-players-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-sm);
  }

  .squeezebox-players-header h4 {
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    margin: 0;
  }

  .squeezebox-player-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .squeezebox-player-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    gap: var(--space-md);
  }

  .squeezebox-player-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .squeezebox-player-name {
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .squeezebox-player-details {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .squeezebox-player-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-shrink: 0;
  }

  .squeezebox-status-badge {
    font-family: var(--font-body);
    font-size: 11px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 9999px;
    white-space: nowrap;
  }

  .squeezebox-status-badge.connected {
    background: rgba(52, 199, 89, 0.15);
    color: #34c759;
  }

  .squeezebox-status-badge.disconnected {
    background: rgba(255, 59, 48, 0.12);
    color: #ff3b30;
  }

  /* Streaming Quality */
  .quality-select {
    background: var(--tune-bg);
    color: var(--tune-text);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 6px 12px;
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    min-width: 160px;
  }

  .quality-select:disabled { opacity: 0.5; }

  /* Batch Enrich Progress */
  .enrich-progress {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-top: var(--space-md);
  }

  .enrich-progress-bar {
    flex: 1;
    height: 8px;
    background: var(--tune-border);
    border-radius: 4px;
    overflow: hidden;
  }

  .enrich-progress-fill {
    height: 100%;
    background: var(--tune-accent);
    border-radius: 4px;
    transition: width 0.3s ease-out;
  }

  .enrich-progress-text {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    font-variant-numeric: tabular-nums;
    min-width: 70px;
    text-align: right;
  }

  /* Library Import */
  .import-sources {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .import-card {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 14px 16px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md, 8px);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .import-card:hover {
    border-color: var(--tune-accent);
    background: var(--tune-surface-hover);
  }
  .import-card-icon {
    color: var(--tune-accent);
    flex-shrink: 0;
  }
  .import-card-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .import-card-text strong {
    font-size: 14px;
    color: var(--tune-text-primary);
  }
  .import-card-text span {
    font-size: 12px;
    color: var(--tune-text-secondary);
  }
  .import-loading {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-lg);
    color: var(--tune-text-secondary);
    font-size: 13px;
  }
  .import-error {
    color: #f87171;
    font-size: 13px;
    padding: var(--space-md);
    background: rgba(248, 113, 113, 0.08);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-md);
  }
  .import-summary h4 {
    margin: 0 0 var(--space-md);
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text-primary);
  }
  .import-stats {
    display: flex;
    gap: var(--space-lg);
    flex-wrap: wrap;
    margin-bottom: var(--space-md);
  }
  .import-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 10px 16px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    min-width: 80px;
  }
  .import-stat.matched {
    border-color: #34d399;
    background: rgba(52, 211, 153, 0.06);
  }
  .import-stat.unmatched {
    border-color: #fbbf24;
    background: rgba(251, 191, 36, 0.06);
  }
  .import-stat-value {
    font-size: 20px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--tune-text-primary);
  }
  .import-stat-label {
    font-size: 11px;
    color: var(--tune-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .import-actions {
    display: flex;
    gap: var(--space-sm);
    margin-top: var(--space-md);
  }
  .import-details {
    margin: var(--space-md) 0;
  }
  .import-details summary {
    cursor: pointer;
    font-size: 12px;
    color: var(--tune-text-secondary);
    margin-bottom: var(--space-sm);
  }
  .import-details-table {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
  }
  .import-details-table table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .import-details-table th {
    position: sticky;
    top: 0;
    background: var(--tune-surface-hover);
    padding: 6px 10px;
    text-align: left;
    font-weight: 600;
    color: var(--tune-text-secondary);
    border-bottom: 1px solid var(--tune-border);
  }
  .import-details-table td {
    padding: 5px 10px;
    border-bottom: 1px solid var(--tune-border);
    color: var(--tune-text-primary);
  }
  .import-details-table tr.unmatched td {
    color: var(--tune-text-muted);
  }
  .import-details-table .more-rows {
    text-align: center;
    color: var(--tune-text-muted);
    font-style: italic;
  }
  .badge-ok {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    background: rgba(52, 211, 153, 0.15);
    color: #34d399;
  }
  .badge-miss {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    background: rgba(251, 191, 36, 0.12);
    color: #fbbf24;
  }
  .import-done {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-xl, 24px) 0;
  }
  .import-done-icon {
    color: #34d399;
  }
  .import-done h4 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--tune-text-primary);
  }

  /* Tune Peers */
  .peers-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .peer-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--tune-bg-secondary, #f5f5f5);
    border-radius: 8px;
    gap: 12px;
  }
  .peer-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .peer-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--tune-text-primary);
  }
  .peer-details {
    font-size: 12px;
    color: var(--tune-text-secondary, #888);
    font-family: monospace;
  }
  .peer-stats {
    font-size: 12px;
    color: var(--tune-text-secondary, #888);
  }
  .peer-actions {
    flex-shrink: 0;
  }

  /* Cloud section */
  .cloud-subsection {
    margin-bottom: var(--space-lg);
  }

  .cloud-subsection:last-child {
    margin-bottom: 0;
  }

  .cloud-label {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    margin-bottom: var(--space-sm);
  }

  .cloud-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text);
  }

  .cloud-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    border: 2px solid var(--tune-accent, #007AFF);
  }

  .cloud-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .cloud-status-dot.connected {
    background: var(--tune-success);
  }

  .cloud-status-dot.disconnected {
    background: var(--tune-text-muted);
  }

  .cloud-status-text {
    flex: 1;
    min-width: 0;
  }

  .cloud-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .cloud-toggle-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text);
  }

  .cloud-toggle-hint {
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .cloud-toggle {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
  }

  .cloud-toggle input {
    opacity: 0;
    width: 0;
    height: 0;
    position: absolute;
  }

  .cloud-toggle-slider {
    position: absolute;
    inset: 0;
    background: var(--tune-grey2);
    border-radius: 12px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .cloud-toggle-slider::before {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.2s;
  }

  .cloud-toggle input:checked + .cloud-toggle-slider {
    background: var(--tune-accent);
  }

  .cloud-toggle input:checked + .cloud-toggle-slider::before {
    transform: translateX(20px);
  }

  .cloud-instance-id {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
    margin-top: var(--space-xs);
  }

  .cloud-instance-id code {
    font-family: monospace;
    background: var(--tune-bg);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    font-size: 10px;
  }

  /* License / Premium section */
  .license-tier-row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }

  .license-badge {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 700;
    padding: 3px 12px;
    border-radius: 9999px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .license-badge.free {
    background: rgba(107, 114, 128, 0.15);
    color: #9ca3af;
  }

  .license-badge.premium {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.2));
    color: #f59e0b;
    box-shadow: 0 0 8px rgba(245, 158, 11, 0.15);
  }

  .license-expires {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .license-active-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }

  .license-key-display {
    font-family: monospace;
    font-size: 13px;
    color: var(--tune-text-secondary);
    background: var(--tune-bg);
    padding: 6px 12px;
    border-radius: var(--radius-md);
    letter-spacing: 1px;
  }

  .license-actions {
    display: flex;
    gap: var(--space-sm);
    flex-shrink: 0;
  }

  .license-input-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }

  .license-key-input {
    flex: 1;
    max-width: 300px;
    font-family: monospace;
    letter-spacing: 1px;
  }

  .license-error {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-danger, #ef4444);
    margin-bottom: var(--space-md);
  }

  .license-features {
    margin-top: var(--space-md);
    margin-bottom: var(--space-md);
  }

  .license-features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-sm);
  }

  .license-feature-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 6px 10px;
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: 13px;
    transition: background 0.12s;
  }

  .license-feature-item.enabled {
    color: var(--tune-text);
    background: rgba(74, 222, 128, 0.06);
  }

  .license-feature-item.locked {
    color: var(--tune-text-muted);
    background: rgba(107, 114, 128, 0.06);
  }

  .license-feature-icon {
    font-size: 14px;
    flex-shrink: 0;
    width: 18px;
    text-align: center;
  }

  .license-feature-name {
    min-width: 0;
  }

  .license-footer {
    margin-top: var(--space-sm);
  }

  .license-pricing-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-accent);
    text-decoration: none;
    transition: opacity 0.12s;
  }

  .license-pricing-link:hover {
    opacity: 0.8;
  }

  /* Metadata fields configuration */
  .meta-fields-hint {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    margin-bottom: var(--space-md);
  }

  .meta-fields-categories {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .meta-fields-category {
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .meta-fields-category-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: var(--tune-bg);
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 600;
    transition: background 0.12s ease-out;
  }

  .meta-fields-category-header:hover {
    background: var(--tune-surface-hover);
  }

  .meta-fields-category-name {
    flex: 1;
    text-align: left;
  }

  .meta-fields-category-count {
    font-family: var(--font-body);
    font-size: 11px;
    font-weight: 500;
    color: var(--tune-text-muted);
    background: var(--tune-grey2);
    padding: 1px 8px;
    border-radius: 9999px;
  }

  .meta-fields-chevron {
    transition: transform 0.2s ease-out;
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  .meta-fields-chevron.collapsed {
    transform: rotate(-90deg);
  }

  .meta-fields-list {
    display: flex;
    flex-direction: column;
  }

  .meta-field-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-md);
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text);
    cursor: pointer;
    transition: background 0.1s ease-out;
    border-top: 1px solid var(--tune-border);
  }

  .meta-field-item:hover {
    background: var(--tune-surface-hover);
  }

  .meta-field-label {
    flex: 1;
    min-width: 0;
  }

  .meta-field-key {
    font-family: monospace;
    font-size: 11px;
    color: var(--tune-text-muted);
    background: var(--tune-bg);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .zone-settings-list { display: flex; flex-direction: column; gap: 8px; }
  .zone-setting-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.04);
    border-radius: var(--radius-md, 8px); gap: 12px;
  }
  .zone-setting-name { font-size: 14px; font-weight: 500; color: var(--tune-text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .zone-setting-controls { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .zone-setting-label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--tune-text-muted); }
  .zone-select {
    padding: 4px 8px; font-size: 12px; border-radius: var(--radius-sm, 4px);
    border: 1px solid var(--tune-border, #333); background: var(--tune-surface, #1a1a1a);
    color: var(--tune-text); cursor: pointer;
  }
</style>

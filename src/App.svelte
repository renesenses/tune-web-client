<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { tuneWS } from './lib/websocket';
  import { zones, currentZoneId, currentZone } from './lib/stores/zones';
  import { devices } from './lib/stores/devices';
  import { isBrowserZone, browserPlay, browserPause, browserResume, browserStop } from './lib/stores/browserAudio';
  import { seekPositionMs, startSeekTimer, stopSeekTimer, shuffleEnabled, repeatMode } from './lib/stores/nowPlaying';
  import { queueTracks, queuePosition, queueLength } from './lib/stores/queue';
  import { playlists as playlistsStore, playlistsLoaded } from './lib/stores/playlists';
  import { connectionState, reconnectAttempts } from './lib/stores/connection';
  import { activeView, settingsInitialTab } from './lib/stores/navigation';
  import { selectedAlbum, selectedArtist, libraryTab } from './lib/stores/library';
  import { preferences, applyTheme, syncPreferencesFromServer } from './lib/stores/preferences';
  import { locale } from './lib/i18n';
  import { setupKeyboardShortcuts } from './lib/keyboard';
  import { playbackHistory } from './lib/stores/history';
  import { handleAudioLevelsEvent } from './lib/stores/audioLevels';
  import { startUpdatePolling, stopUpdatePolling, updateAvailable, latestVersion, currentVersion, updateBannerDismissed, dismissUpdateBanner } from './lib/stores/updates';
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
  import ServiceTokensView from './components/ServiceTokensView.svelte';
  import GenreTreeView from './components/GenreTreeView.svelte';
  import ZoneManagerView from './components/ZoneManagerView.svelte';
  import DiagnosticsView from './components/DiagnosticsView.svelte';
import AlarmsView from './components/AlarmsView.svelte';
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
  import SmartAIView from './components/SmartAIView.svelte';
  import PartyView from './components/PartyView.svelte';
  import CollectionsView from './components/CollectionsView.svelte';
  import SmartCollectionsView from './components/SmartCollectionsView.svelte';
  import DashboardView from './components/DashboardView.svelte';
  import EqualizerView from './components/EqualizerView.svelte';
  import PluginsView from './components/PluginsView.svelte';
  import AdminDashboard from './components/AdminDashboard.svelte';
  import AddToPlaylistModal from './components/AddToPlaylistModal.svelte';
  import BottomTabBar from './components/BottomTabBar.svelte';
  import YTPlayer from './components/YTPlayer.svelte';
  import ToastContainer from './components/ToastContainer.svelte';
  import OnboardingWizard from './components/OnboardingWizard.svelte';
  import OnboardingView from './components/OnboardingView.svelte';
  import OfflineView from './components/OfflineView.svelte';
  import WhatsNew from './components/WhatsNew.svelte';
  import LoginView from './components/LoginView.svelte';
  import BridgeView from './components/BridgeView.svelte';
  import AiChat from './components/AiChat.svelte';
  import GlobalSearchBar from './components/GlobalSearchBar.svelte';
  import { mobileNowPlayingOpen } from './lib/stores/navigation';
  import { loadProfiles } from './lib/stores/profile';
  import { loadLicense } from './lib/stores/license';
  import { notifications } from './lib/stores/notifications';
  import { healthStatus } from './lib/stores/health';
  import { streamingServices as streamingServicesStore } from './lib/stores/streaming';
  import { isPushEnabled, initPushNotifications } from './lib/notifications-push';

  import type { Track } from './lib/types';

  let cleanupKeyboard: (() => void) | null = null;
  // Declared at component scope so onDestroy can unsubscribe (was a const inside
  // onMount → ReferenceError in onDestroy that blanked the app on teardown/HMR).
  let unsubZoneForPolling: (() => void) | null = null;
  let scanIndicator = $state(false);
  let playlistModalTrack = $state<Track | null>(null);
  let showOnboarding = $state(false);
  let onboardingChecked = $state(false);
  let showWhatsNew = $state(false);

  // Status banner state
  type BannerStatus = 'idle' | 'scan' | 'streaming' | 'ready';
  let bannerStatus = $state<BannerStatus>('idle');
  let bannerMessage = $state('');
  let bannerFadeout = $state(false);
  let bannerFadeTimer: ReturnType<typeof setTimeout> | null = null;

  function showBanner(status: BannerStatus, message: string) {
    if (bannerFadeTimer) { clearTimeout(bannerFadeTimer); bannerFadeTimer = null; }
    bannerStatus = status;
    bannerMessage = message;
    bannerFadeout = false;
  }

  function showReadyBanner() {
    if (bannerFadeTimer) { clearTimeout(bannerFadeTimer); bannerFadeTimer = null; }
    bannerStatus = 'ready';
    bannerMessage = 'Prêt';
    bannerFadeout = false;
    bannerFadeTimer = setTimeout(() => {
      bannerFadeout = true;
      bannerFadeTimer = setTimeout(() => {
        bannerStatus = 'idle';
        bannerFadeout = false;
        bannerFadeTimer = null;
      }, 600);
    }, 1500);
  }

  // Kiosk mode: ?kiosk=true forces NowPlaying view on small touchscreen
  const isKiosk = new URLSearchParams(window.location.search).has('kiosk');

  // Reset seek state + refresh queue when zone changes.
  // IMPORTANT: use get(zones) instead of $zones inside the callback to avoid
  // tracking the zones store as a reactive dependency — otherwise this effect
  // re-runs on every zone data update (position polls, volume, etc.) and
  // resets seekPositionMs, causing the progress bar to flicker.
  $effect(() => {
    const unsub = currentZoneId.subscribe((zoneId) => {
      if (zoneId == null) return;
      stopSeekTimer();
      const zone = get(zones).find((z: any) => z.id === zoneId);
      if (zone) {
        seekPositionMs.set(zone.position_ms ?? 0);
        if (zone.state === 'playing') startSeekTimer();
      } else {
        seekPositionMs.set(0);
      }
      fetchQueue();
      syncZoneState(zoneId);
    });
    return unsub;
  });

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
      const curZoneExists = curId !== null && zoneList.some((z) => z.id === curId);
      if ((!curZoneExists) && zoneList.length > 0) {
        // Check server-side default zone (is_default flag from zones list),
        // then fall back to local preference, then playing zone, then first zone.
        const serverDefault = zoneList.find((z) => z.is_default);
        let localDefaultId: number | null = null;
        preferences.subscribe((p) => (localDefaultId = p.defaultZoneId))();
        const localDefault = localDefaultId !== null ? zoneList.find((z) => z.id === localDefaultId) : null;
        const defaultZone = serverDefault ?? localDefault;
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
        zs.map((z) => {
          if (z.id !== zoneId) return z;
          // Preserve cover_path if the API response lost it (avoids cover flash)
          if (zone.current_track && !zone.current_track.cover_path && z.current_track?.cover_path) {
            zone.current_track.cover_path = z.current_track.cover_path;
          }
          return zone;
        })
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
        if (zone.state === 'playing') {
          startSeekTimer();
          // Apply drift filter: only correct the interpolated position when
          // the server-reported position differs by more than 2s.  Small
          // drifts are expected (timer imprecision, browser throttling) and
          // the local interpolation is smoother than server jumps.
          const serverPos = zone.position_ms ?? 0;
          const drift = Math.abs(get(seekPositionMs) - serverPos);
          if (drift > 2000) {
            seekPositionMs.set(serverPos);
          }
        } else {
          stopSeekTimer();
          seekPositionMs.set(zone.position_ms ?? 0);
        }
      }
    } catch (e) {
      console.error('Sync zone state error:', e);
    }
  }

  async function checkOnboarding() {
    // Skip if already completed locally
    if (localStorage.getItem('tune_onboarding_completed')) {
      onboardingChecked = true;
      return;
    }
    try {
      // Check server-side flag first
      const config = await api.getConfig().catch(() => null);
      if (config?.onboarding_complete === 'true' || config?.onboarding_complete === true || config?.onboarding_completed === 'true' || config?.onboarding_completed === true) {
        localStorage.setItem('tune_onboarding_completed', 'true');
        onboardingChecked = true;
        return;
      }
      // Try the onboarding API
      const status = await api.getOnboardingStatus().catch(() => null);
      if (status && !status.complete) {
        showOnboarding = true;
        onboardingChecked = true;
        return;
      }
      // Fallback: check library stats
      const stats = await api.getLibraryStats();
      showOnboarding = stats.tracks === 0;
    } catch {
      showOnboarding = false;
    }
    onboardingChecked = true;
  }

  function handleOnboardingComplete() {
    showOnboarding = false;
  }

  async function checkWhatsNew() {
    try {
      const data = await api.checkForUpdate();
      const currentVersion = data?.current_version;
      if (!currentVersion) return;
      const lastSeen = localStorage.getItem('tune_last_seen_version');
      if (lastSeen !== currentVersion) {
        showWhatsNew = true;
      }
    } catch {
      // Server may not be ready yet, skip silently
    }
  }

  function handleWhatsNewClose() {
    showWhatsNew = false;
  }

  onMount(() => {
    // Kiosk mode: set data attribute on <html> and force nowplaying view
    if (isKiosk) {
      document.documentElement.setAttribute('data-kiosk', '');
      activeView.set('nowplaying');
    }

    // Apply saved preferences (theme + language) — keep subscribed for server sync
    preferences.subscribe((prefs) => {
      applyTheme(prefs.theme);
      locale.set(prefs.language ?? 'fr');
    });

    syncPreferencesFromServer();
    startUpdatePolling();

    // Apply startup view (skip in kiosk mode — always nowplaying)
    if (!isKiosk) {
      // After SSO OAuth redirect, the server sends the browser back to "/".
      // Detect the pending flag and navigate straight to Settings so the
      // SettingsView component re-runs loadCloudStatus() and shows the
      // newly-connected state.
      //
      // Check both sessionStorage (original mechanism) and localStorage
      // (more reliable across cross-origin redirect chains in Safari/mobile).
      let ssoPending = false;
      try {
        if (sessionStorage.getItem('tune_sso_pending')) {
          sessionStorage.removeItem('tune_sso_pending');
          ssoPending = true;
        }
      } catch {}
      if (!ssoPending) {
        try {
          const ts = localStorage.getItem('tune_sso_pending');
          if (ts) {
            const elapsed = Date.now() - Number(ts);
            // Only honour if set less than 2 minutes ago
            if (elapsed >= 0 && elapsed < 120_000) {
              ssoPending = true;
            }
            // Don't remove here — SettingsView will consume it for its retry
          }
        } catch {}
      }

      if (ssoPending) {
        activeView.set('settings');
      } else {
        let prefs: { startupView?: string; defaultZoneId?: number | null } = {};
        preferences.subscribe((p) => (prefs = p))();
        if (prefs.startupView) {
          activeView.set(prefs.startupView as any);
        }
      }
    }

    cleanupKeyboard = setupKeyboardShortcuts();

    // Browser history integration for mouse back/forward buttons
    let _pushingState = false;
    let _viewInitialized = false;
    activeView.subscribe(view => {
      if (!_pushingState && typeof window !== 'undefined') {
        const ctx = {
          view,
          albumId: $selectedAlbum?.id ?? null,
          artistId: $selectedArtist?.id ?? null,
          tab: $libraryTab ?? null,
        };
        // First call (on subscription) replaces the current entry to avoid
        // polluting the history stack; subsequent view changes push.
        if (!_viewInitialized) {
          _viewInitialized = true;
          window.history.replaceState(ctx, '', `#${view}`);
        } else {
          window.history.pushState(ctx, '', `#${view}`);
        }
      }
    });

    // Push a history entry when entering album/artist detail within the library,
    // so the browser back button returns to the grid instead of the previous view.
    selectedAlbum.subscribe(album => {
      if (!_pushingState && _viewInitialized && typeof window !== 'undefined') {
        let view = '';
        activeView.subscribe(v => (view = v))();
        if (view === 'library') {
          const ctx = {
            view,
            albumId: album?.id ?? null,
            artistId: $selectedArtist?.id ?? null,
            tab: $libraryTab ?? null,
          };
          if (album !== null) {
            // Entering detail: push so back returns to grid
            window.history.pushState(ctx, '', `#${view}`);
          } else {
            // Returning to grid (programmatic, not via popstate): update current entry
            window.history.replaceState(ctx, '', `#${view}`);
          }
        }
      }
    });

    selectedArtist.subscribe(artist => {
      if (!_pushingState && _viewInitialized && typeof window !== 'undefined') {
        let view = '';
        activeView.subscribe(v => (view = v))();
        if (view === 'library') {
          const ctx = {
            view,
            albumId: $selectedAlbum?.id ?? null,
            artistId: artist?.id ?? null,
            tab: $libraryTab ?? null,
          };
          if (artist !== null) {
            window.history.pushState(ctx, '', `#${view}`);
          } else {
            window.history.replaceState(ctx, '', `#${view}`);
          }
        }
      }
    });

    window.addEventListener('popstate', (e) => {
      const ctx = e.state;
      _pushingState = true;
      if (ctx?.view) {
        activeView.set(ctx.view);
        if (ctx.view === 'library') {
          if (ctx.tab) libraryTab.set(ctx.tab);
        }
      }
      // Always reconcile detail state: if the history entry has no albumId/artistId
      // (or state is null, e.g. Safari initial entry), clear any active detail view.
      // This fixes Safari where navigating back to the grid could leave stale state
      // preventing subsequent album clicks from opening detail.
      if (!ctx?.albumId) selectedAlbum.set(null);
      if (!ctx?.artistId) selectedArtist.set(null);
      _pushingState = false;
    });

    connectionState.set('connecting');
    tuneWS.connect();
    fetchZones(true);
    fetchDevices();
    fetchPlaylists();
    loadProfiles();
    loadLicense();
    checkOnboarding();
    checkWhatsNew();

    // Keep polling aware of the active zone so it can fetch the queue
    unsubZoneForPolling = currentZoneId.subscribe((zoneId) => {
      tuneWS.setCurrentZoneId(zoneId);
    });

    // Allow any component to open the What's New dialog via custom event
    window.addEventListener('tune:open-whatsnew', () => { showWhatsNew = true; });

    // Initialize browser push notifications if enabled
    if (isPushEnabled()) initPushNotifications();

    tuneWS.onEvent((event) => {
      const type = event.type;

      // Internal connection events
      if (type === '_connected') {
        connectionState.set(tuneWS.isPolling ? 'polling' : 'connected');
        reconnectAttempts.set(0);
        fetchZones(true);
        fetchDevices();
        return;
      }
      if (type === '_polling_started') {
        connectionState.set('polling');
        return;
      }
      if (type === '_polling_stopped') {
        connectionState.set('connected');
        return;
      }
      if (type === '_disconnected') {
        const attempts = event.data?.attemptCount ?? tuneWS.attemptCount;
        reconnectAttempts.set(attempts);
        // Show "reconnecting" (orange) for the first 4 attempts, then "disconnected" (red)
        connectionState.set(attempts >= 5 ? 'disconnected' : 'reconnecting');
        return;
      }

      // Polling bulk zone update — replace all zones at once
      if (type === 'zone.updated' && event.data?.zones && Array.isArray(event.data.zones)) {
        const zoneList = event.data.zones;
        // Flatten nested quality sub-object on current_track (streaming sources)
        for (const z of zoneList) {
          if (z.current_track?.quality && typeof z.current_track.quality === 'object') {
            const q = z.current_track.quality;
            if (q.codec && !z.current_track.format)       z.current_track.format = q.codec.toLowerCase();
            if (q.sample_rate && !z.current_track.sample_rate) z.current_track.sample_rate = q.sample_rate;
            if (q.bit_depth && !z.current_track.bit_depth)     z.current_track.bit_depth = q.bit_depth;
            if (q.channels && !z.current_track.channels)       z.current_track.channels = q.channels;
          }
        }
        zones.set(zoneList);
        // Update seek position for current zone — apply drift filter so the
        // server-polled position doesn't fight with the local interpolation
        // timer, which would cause the progress bar to oscillate.
        let curId: number | null = null;
        currentZoneId.subscribe((v) => (curId = v))();
        const curZone = curId !== null ? zoneList.find((z: any) => z.id === curId) : null;
        if (curZone) {
          if (curZone.state === 'playing') {
            startSeekTimer();
            const serverPos = curZone.position_ms ?? 0;
            const drift = Math.abs(get(seekPositionMs) - serverPos);
            if (drift > 2000) {
              seekPositionMs.set(serverPos);
            }
          } else {
            stopSeekTimer();
            seekPositionMs.set(curZone.position_ms ?? 0);
          }
        }
        return;
      }

      // Polling queue update
      if (type === 'playback.queue_changed' && tuneWS.isPolling) {
        const d = event.data;
        if (d?.tracks) queueTracks.set(d.tracks);
        if (d?.position !== undefined) queuePosition.set(d.position);
        if (d?.length !== undefined) queueLength.set(d.length);
        return;
      }

      if (type === 'playback.audio_levels') {
        handleAudioLevelsEvent(event.data);
        return;
      }

      // Playback events — refetch zone state since WS events lack full data
      if (type.startsWith('playback.')) {
        const zoneId = event.data?.zone_id;
        if (type === 'playback.error') {
          // Surface playback errors to the user (output unavailable, pipeline
          // error, stream URL timeout, etc.) so they know WHY play failed.
          const msg = event.data?.message || event.data?.error || 'Playback error';
          const trackTitle = event.data?.track_title;
          showError(trackTitle ? `${msg} — ${trackTitle}` : msg);
          if (zoneId) syncZoneState(zoneId);
          return;
        }
        if (type === 'playback.metadata') {
          // ICY metadata update (radio stream title change) — refetch zone state
          if (zoneId) syncZoneState(zoneId);
          return;
        }
        if (type === 'playback.seek' && event.data?.position_ms !== undefined) {
          // Seek confirmed by server — immediately jump the progress bar
          // to the new position.  This handles seeks from other clients
          // (the local SeekBar already does an optimistic update).
          const curZoneSeek = get(currentZone);
          const isRelevantZoneSeek =
            curZoneSeek?.id === zoneId ||
            (curZoneSeek?.group_id != null && curZoneSeek.group_id === get(zones).find((z: any) => z.id === zoneId)?.group_id);
          if (isRelevantZoneSeek) {
            seekPositionMs.set(event.data.position_ms);
            startSeekTimer();
          }
          return;
        }
        if (type === 'playback.position' && event.data?.position_ms !== undefined) {
          // Only recalibrate the *current* zone (or a group member) and only
          // when drift exceeds 2s — small drifts are expected and the local
          // interpolation timer is smoother than server-polled jumps.
          const curZonePos = get(currentZone);
          const isRelevantZone =
            curZonePos?.id === zoneId ||
            (curZonePos?.group_id != null && curZonePos.group_id === get(zones).find((z: any) => z.id === zoneId)?.group_id);
          if (isRelevantZone) {
            const drift = Math.abs(get(seekPositionMs) - event.data.position_ms);
            if (drift > 2000) {
              seekPositionMs.set(event.data.position_ms);
              startSeekTimer();
            }
          }
        } else if (type === 'playback.queue_changed' || type === 'playback.queue.track_removed') {
          fetchQueue();
          if (zoneId) syncZoneState(zoneId);
        } else if (type === 'playback.queue.cleared') {
          // Queue was explicitly cleared — reset current track so the Now Playing
          // bar and screen no longer display stale cover art / track info.
          if (zoneId) {
            zones.update((zs) =>
              zs.map((z) => {
                if (z.id !== zoneId) return z;
                return { ...z, current_track: null, state: 'stopped' as const, position_ms: 0 };
              })
            );
            const curZone = get(currentZone);
            if (curZone?.id === zoneId || (curZone?.group_id != null && curZone.group_id === get(zones).find(z => z.id === zoneId)?.group_id)) {
              stopSeekTimer();
              seekPositionMs.set(0);
            }
          }
          queueTracks.set([]);
          queuePosition.set(0);
          queueLength.set(0);
        } else if (zoneId) {
          // Optimistic update: apply track metadata from the WS event
          // immediately so the UI updates without waiting for the API call.
          // syncZoneState() will overwrite with the full zone state shortly.
          if ((type === 'playback.started' || type === 'playback.track_changed') && event.data) {
            zones.update((zs) =>
              zs.map((z) => {
                if (z.id !== zoneId) return z;
                const d = event.data;
                const partial: Record<string, unknown> = {};
                if (d.track_title !== undefined) partial.title = d.track_title;
                if (d.artist_name !== undefined) partial.artist_name = d.artist_name;
                if (d.album_title !== undefined) partial.album_title = d.album_title;
                if (d.cover_path !== undefined) partial.cover_path = d.cover_path;
                if (d.track_id !== undefined) partial.id = d.track_id;
                if (d.duration_ms !== undefined) partial.duration_ms = d.duration_ms;
                const updatedTrack = z.current_track
                  ? { ...z.current_track, ...partial }
                  : { ...partial } as any;
                return { ...z, current_track: updatedTrack, state: 'playing' as const };
              })
            );
          }
          // Immediately reset seek position for the current zone on track
          // change so the progress bar doesn't keep showing the old track's
          // position while waiting for the async syncZoneState() API call.
          if (type === 'playback.started' || type === 'playback.track_changed') {
            const curZoneNow = get(currentZone);
            const isCurrentZoneEvent =
              curZoneNow?.id === zoneId ||
              (curZoneNow?.group_id != null && curZoneNow.group_id === get(zones).find(z => z.id === zoneId)?.group_id);
            if (isCurrentZoneEvent) {
              seekPositionMs.set(0);
              startSeekTimer();
            }
            // Refresh queue on playback start / track change so the queue
            // view shows the full list and the correct current position.
            // The server does not emit playback.queue_changed when a
            // streaming playlist begins or advances to the next track.
            fetchQueue();
          }
          // Fetch full zone state from API (authoritative update)
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

            // Browser audio sync — when the zone uses browser output,
            // control the local HTML5 <audio> element based on WS events.
            if (isBrowserZone(z)) {
              if (type === 'playback.paused') {
                browserPause();
              } else if (type === 'playback.stopped') {
                browserStop();
              } else if (type === 'playback.resumed') {
                if (z?.stream_url) browserPlay(z.stream_url);
                else browserResume();
              } else if (type === 'playback.started' || type === 'playback.track_changed') {
                if (z?.stream_url) browserPlay(z.stream_url);
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
        if (type === 'zone.created' && event.data?.zone) {
          // Merge the new zone into the store directly to avoid WAL race condition
          zones.update((zs) => {
            if (zs.some((z) => z.id === event.data.zone.id)) return zs;
            return [...zs, event.data.zone];
          });
        } else if (type === 'zone.deleted' && event.data?.id !== undefined) {
          zones.update((zs) => zs.filter((z) => z.id !== event.data.id));
        } else if (type === 'zone.volume_changed' && event.data?.zone_id !== undefined && event.data?.volume !== undefined) {
          zones.update((zs) =>
            zs.map((z) => z.id === event.data.zone_id ? { ...z, volume: event.data.volume } : z)
          );
        } else if (type === 'zone.recovering') {
          const zoneId = event.data?.zone_id;
          if (zoneId !== undefined) {
            zones.update((zs) =>
              zs.map((z) => z.id === zoneId ? {
                ...z,
                recovery_started_at: event.data.elapsed_secs ?? 0,
                recovery_attempts: event.data.attempts ?? 0,
              } : z)
            );
          }
        } else if (type === 'zone.recovered') {
          const zoneId = event.data?.zone_id;
          if (zoneId !== undefined) {
            zones.update((zs) =>
              zs.map((z) => z.id === zoneId ? {
                ...z,
                online: true,
                recovery_started_at: null,
                recovery_attempts: 0,
              } : z)
            );
          }
        } else if (type === 'zone.offline') {
          const zoneId = event.data?.zone_id;
          const deviceId = event.data?.device_id;
          if (zoneId !== undefined) {
            zones.update((zs) =>
              zs.map((z) => z.id === zoneId ? {
                ...z,
                online: false,
                recovery_started_at: null,
                recovery_attempts: 0,
              } : z)
            );
          } else if (deviceId) {
            zones.update((zs) =>
              zs.map((z) => z.output_device_id === deviceId ? {
                ...z,
                online: false,
                recovery_started_at: null,
                recovery_attempts: 0,
              } : z)
            );
          }
        } else {
          // Fallback for other zone events (e.g. zone.updated without inline data)
          fetchZones();
        }
        return;
      }

      // Library scan events
      if (type.startsWith('library.scan.')) {
        if (type === 'library.scan.started') {
          scanIndicator = true;
          showBanner('scan', 'Synchronisation de la bibliothèque...');
        } else if (type === 'library.scan.progress') {
          scanIndicator = true;
          const scanned = event.data?.scanned ?? event.data?.files_scanned;
          const added = event.data?.added ?? event.data?.tracks_added;
          if (scanned !== undefined) {
            const addedPart = added !== undefined ? ` · ${added} ajouté${added !== 1 ? 's' : ''}` : '';
            showBanner('scan', `Synchronisation de la bibliothèque... ${scanned} fichier${scanned !== 1 ? 's' : ''}${addedPart}`);
          }
        } else if (type === 'library.scan.completed') {
          scanIndicator = false;
          showReadyBanner();
        }
        return;
      }

      // Streaming auth events
      if (type === 'streaming.auth.success' && event.data?.service) {
        const service = (event.data.service as string).toLowerCase();
        const serviceLabels: Record<string, string> = {
          tidal: 'Tidal', qobuz: 'Qobuz', spotify: 'Spotify',
          deezer: 'Deezer', amazon: 'Amazon Music',
        };
        const label = serviceLabels[service] ?? service;
        showBanner('streaming', `Connexion à ${label}...`);
        // Auto-clear after 3s if no scan is running
        if (bannerFadeTimer) clearTimeout(bannerFadeTimer);
        bannerFadeTimer = setTimeout(() => {
          if (bannerStatus === 'streaming') showReadyBanner();
        }, 2000);
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

      // License updated — reload license state
      if (type === 'license.updated') {
        loadLicense();
        return;
      }

      // Health alerts — show a notification banner for warnings/criticals
      if (type === 'system.health_alert' && event.data) {
        const level = event.data.level;
        const message = event.data.message || 'Health alert';
        if (level === 'critical') {
          healthStatus.set('critical');
          notifications.error(message, 10000);
        } else if (level === 'warning') {
          // Only upgrade, never downgrade from critical on a single alert
          healthStatus.update((cur) => cur === 'critical' ? 'critical' : 'warning');
          notifications.info(message, 6000);
        }
        return;
      }
    });
  });

  onDestroy(() => {
    cleanupKeyboard?.();
    unsubZoneForPolling?.();
    tuneWS.disconnect();
    stopSeekTimer();
    stopUpdatePolling();
    if (bannerFadeTimer) clearTimeout(bannerFadeTimer);
  });
</script>

<div class="app-layout" class:kiosk-mode={isKiosk}>
  {#if !isKiosk}
  <Sidebar />
  {/if}

  <main class="main-content">
    {#if $updateAvailable && !$updateBannerDismissed}
      <div class="update-banner" onclick={() => { activeView.set('settings'); settingsInitialTab.set('system'); }} style="cursor: pointer;" role="button" tabindex={0}>
        <span class="update-banner-text">Tune v{$latestVersion} disponible — cliquez pour mettre à jour</span>
        <button class="update-banner-dismiss" onclick={(e) => { e.stopPropagation(); dismissUpdateBanner(); }} title="Masquer">&times;</button>
      </div>
    {/if}

    {#if bannerStatus !== 'idle'}
      <div class="status-banner" class:status-banner--scan={bannerStatus === 'scan'} class:status-banner--streaming={bannerStatus === 'streaming'} class:status-banner--ready={bannerStatus === 'ready'} class:status-banner--fadeout={bannerFadeout}>
        {#if bannerStatus === 'scan' || bannerStatus === 'streaming'}
          <span class="status-banner-spinner"></span>
        {:else if bannerStatus === 'ready'}
          <svg class="status-banner-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>
        {/if}
        <span class="status-banner-text">{bannerMessage}</span>
      </div>
    {/if}

    <!-- Global search bar: sticky top-right overlay accessible from any view -->
    {#if !isKiosk && $activeView !== 'nowplaying' && $activeView !== 'login' && $activeView !== 'onboarding' && $activeView !== 'offline'}
      <div class="global-search-wrapper" class:has-banner={$updateAvailable && !$updateBannerDismissed}>
        <GlobalSearchBar />
      </div>
    {/if}

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
    {:else if $activeView === 'smart-ai'}
      <SmartAIView />
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
    {:else if $activeView === 'services'}
      <ServiceTokensView />
    {:else if $activeView === 'genretree'}
      <GenreTreeView />
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
    {:else if $activeView === 'collections' || $activeView === 'smartcollections'}
      <CollectionsView />
    {:else if $activeView === 'dashboard'}
      <DashboardView />
    {:else if $activeView === 'equalizer'}
      <EqualizerView />
    {:else if $activeView === 'plugins'}
      <PluginsView />
    {:else if $activeView === 'alarms'}
      <AlarmsView />
    {:else if $activeView === 'diagnostics'}
      <DiagnosticsView />
    {:else if $activeView === 'admin'}
      <AdminDashboard />
    {:else if $activeView === 'onboarding'}
      <OnboardingView />
    {:else if $activeView === 'offline'}
      <OfflineView />
    {:else if $activeView === 'login'}
      <LoginView />
    {:else if $activeView === 'bridge'}
      <BridgeView />
    {/if}

  </main>

  <TransportBar />

  {#if !isKiosk}
  <BottomTabBar />
  {/if}

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

  <AiChat />
  <ToastContainer />
</div>

{#if showOnboarding}
  <OnboardingWizard onComplete={handleOnboardingComplete} />
{/if}

{#if showWhatsNew}
  <WhatsNew onClose={handleWhatsNewClose} />
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
    /* Transport row must never clip: pin it to at least --transport-height but
       let it grow to fit its content (the right tier stacks icons over volume,
       which can exceed the fixed height on some fonts/zoom levels). The content
       row (minmax(0,1fr)) shrinks to compensate. */
    grid-template-rows: minmax(0, 1fr) minmax(var(--transport-height), auto);
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    padding-left: env(safe-area-inset-left, 0);
    padding-right: env(safe-area-inset-right, 0);
  }

  .app-layout > :global(.sidebar) {
    grid-column: 1;
    /* Row 1 only: the player bar runs full-width beneath it (Spotify-style),
       so the sidebar no longer crams the bar into the content column. */
    grid-row: 1;
  }

  .app-layout > :global(.transport-bar) {
    grid-column: 1 / -1;
    grid-row: 2;
    z-index: 10;
    position: relative;
  }

  .main-content {
    grid-column: 2;
    grid-row: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0;
    position: relative;
    min-width: 0;
    min-height: 0;
  }

  .global-search-wrapper {
    position: fixed;
    top: 8px;
    right: 16px;
    z-index: 85;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }
  .global-search-wrapper.has-banner {
    top: 38px;
  }

  .global-search-wrapper > :global(*) {
    pointer-events: all;
  }

  /* Status banner */
  .status-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 5px var(--space-md);
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
    background: var(--tune-surface-2, rgba(255,255,255,0.06));
    border-bottom: 1px solid var(--tune-border);
    flex-shrink: 0;
    position: sticky;
    top: 0;
    z-index: 40;
    transition: opacity 0.6s ease;
    opacity: 1;
  }

  .status-banner--scan {
    background: rgba(107, 110, 217, 0.15);
    color: var(--tune-accent, #6b6ed9);
    border-bottom-color: rgba(107, 110, 217, 0.25);
  }

  .status-banner--streaming {
    background: rgba(34, 197, 94, 0.1);
    color: #4ade80;
    border-bottom-color: rgba(34, 197, 94, 0.2);
  }

  .status-banner--ready {
    background: rgba(34, 197, 94, 0.08);
    color: #4ade80;
    border-bottom-color: rgba(34, 197, 94, 0.15);
  }

  .status-banner--fadeout {
    opacity: 0;
  }

  .status-banner-spinner {
    width: 11px;
    height: 11px;
    border: 1.5px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: banner-spin 0.7s linear infinite;
    flex-shrink: 0;
    opacity: 0.8;
  }

  .status-banner-check {
    flex-shrink: 0;
    opacity: 0.9;
  }

  .status-banner-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 60vw;
  }

  @keyframes banner-spin {
    to { transform: rotate(360deg); }
  }

  /* Tablet: sidebar icônes */
  @media (min-width: 769px) and (max-width: 1024px) {
    .app-layout {
      grid-template-columns: var(--sidebar-collapsed-width) 1fr;
    }

    .app-layout > :global(.transport-bar) {
      grid-column: 1 / -1;
    }
  }

  /* Mobile: pas de sidebar, tab bar en bas */
  @media (max-width: 768px) {
    .app-layout {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr var(--mini-player-height);
      padding-bottom: calc(var(--tab-bar-height) + env(safe-area-inset-bottom, 0));
    }

    .main-content {
      grid-column: 1;
    }

    .app-layout > :global(.transport-bar) {
      grid-column: 1;
    }
  }

  /* Kiosk mode: full-screen layout, no sidebar */
  .app-layout.kiosk-mode {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 80px;
    padding-bottom: 0;
  }

  .app-layout.kiosk-mode .main-content {
    grid-column: 1;
  }

  .app-layout.kiosk-mode > :global(.transport-bar) {
    grid-column: 1;
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

  .update-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: 6px var(--space-md);
    background: var(--tune-accent);
    color: #fff;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 500;
    z-index: 50;
    flex-shrink: 0;
  }

  .update-banner-text {
    text-align: center;
  }

  .update-banner-dismiss {
    background: none;
    border: none;
    color: #fff;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    padding: 0 4px;
    opacity: 0.8;
    transition: opacity 0.15s;
  }

  .update-banner-dismiss:hover {
    opacity: 1;
  }
</style>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { tuneWS } from './lib/websocket';
  import { zones, currentZoneId, currentZone, playPendingUntil, suppressedByPlayGrace } from './lib/stores/zones';
  import { devices } from './lib/stores/devices';
  import { isBrowserZone, browserPlay, browserPause, browserResume, browserStop } from './lib/stores/browserAudio';
  import { seekPositionMs, startSeekTimer, stopSeekTimer, shuffleEnabled, repeatMode, nowPlayingToTrack } from './lib/stores/nowPlaying';
  import { mergeTransport, transportDeLEvenement, type TransportState } from './lib/transportSync';
  import { queueTracks, queuePosition, queueLength } from './lib/stores/queue';
  import { playlists as playlistsStore, playlistsLoaded } from './lib/stores/playlists';
  import { connectionState, reconnectAttempts } from './lib/stores/connection';
  import { activeView, focusMode, settingsInitialTab, saveScrollPosition, getScrollPosition } from './lib/stores/navigation';
  import { selectedAlbum, selectedArtist, libraryTab } from './lib/stores/library';
  import { preferences, applyTheme, syncPreferencesFromServer } from './lib/stores/preferences';
  import { syncDisplayFieldsFromServer } from './lib/stores/displayFields';
  import { locale } from './lib/i18n';
  import { setupKeyboardShortcuts } from './lib/keyboard';
  import { playbackHistory } from './lib/stores/history';
  import { handleAudioLevelsEvent } from './lib/stores/audioLevels';
  import { startUpdatePolling, stopUpdatePolling, updateAvailable, latestVersion, currentVersion, updateBannerDismissed, dismissUpdateBanner } from './lib/stores/updates';
  import { startSupportPolling, stopSupportPolling } from './lib/stores/support';
  import { ytPlayerState, ytLoading, playVideo, pauseVideo, resumeVideo, stopVideo, clearYTLoading } from './lib/stores/ytPlayer';
  import { get } from 'svelte/store';
  import { t } from './lib/i18n';
  import * as api from './lib/api';
  import { libelleBanniereEnrichissement, enrichissementImagesTermine, type TacheDeFond } from './lib/tachesDeFond';
  import { urlFlux } from './lib/bridge';
  import Sidebar from './components/Sidebar.svelte';
  import NowPlaying from './components/NowPlaying.svelte';
  import TvView from './components/TvView.svelte';
  import TransportBar from './components/TransportBar.svelte';
  import QueueView from './components/QueueView.svelte';
  import LibraryView from './components/LibraryView.svelte';
  import OxygenView from './components/OxygenView.svelte';
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
  import SupportView from './components/SupportView.svelte';
import AlarmsView from './components/AlarmsView.svelte';
  import BrowseView from './components/BrowseView.svelte';
  import RadiosView from './components/RadiosView.svelte';
  import PodcastsView from './components/PodcastsView.svelte';
  import MediaServersView from './components/MediaServersView.svelte';
  import ShortcutsView from './components/ShortcutsView.svelte';
  import FavoritesView from './components/FavoritesView.svelte';
  import RadioFavoritesView from './components/RadioFavoritesView.svelte';
  import PlaylistManagerView from './components/PlaylistManagerView.svelte';
  import PlaylistsHub from './components/PlaylistsHub.svelte';
  import SmartAIView from './components/SmartAIView.svelte';
  import AmbianceView from './components/AmbianceView.svelte';
  import BandcampView from './components/BandcampView.svelte';
  import CollectionsView from './components/CollectionsView.svelte';
  import SmartCollectionsView from './components/SmartCollectionsView.svelte';
  import DashboardView from './components/DashboardView.svelte';
  import EqualizerView from './components/EqualizerView.svelte';
  import PluginsView from './components/PluginsView.svelte';
  import AddToPlaylistModal from './components/AddToPlaylistModal.svelte';
  import BottomTabBar from './components/BottomTabBar.svelte';
  import YTPlayer from './components/YTPlayer.svelte';
  import MiniPlayer from './components/MiniPlayer.svelte';
  import ToastContainer from './components/ToastContainer.svelte';
  import DialogContainer from './components/DialogContainer.svelte';
  import ImportWizard from './components/ImportWizard.svelte';
  import OnboardingWizard from './components/OnboardingWizard.svelte';
  import OnboardingView from './components/OnboardingView.svelte';
  import OfflineView from './components/OfflineView.svelte';
  import WhatsNew from './components/WhatsNew.svelte';
  import StreamingSessionPrompt from './components/StreamingSessionPrompt.svelte';
  import LoginView from './components/LoginView.svelte';
  import ConverterView from './components/ConverterView.svelte';
  import DeplocView from './components/DeplocView.svelte';
  import AiChat from './components/AiChat.svelte';
  import GlobalSearchBar from './components/GlobalSearchBar.svelte';
  import AddShortcutButton from './components/AddShortcutButton.svelte';
  import { mobileNowPlayingOpen } from './lib/stores/navigation';
  import { loadProfiles } from './lib/stores/profile';
  import { loadLicense, isPremium } from './lib/stores/license';
  import { notifications } from './lib/stores/notifications';
  import { healthStatus } from './lib/stores/health';
  import { streamingServices as streamingServicesStore } from './lib/stores/streaming';
  import { isPushEnabled, initPushNotifications } from './lib/notifications-push';

  import type { Track, Zone } from './lib/types';
  import { resolveKioskZone } from './lib/kioskZone';

  let cleanupKeyboard: (() => void) | null = null;
  // Declared at component scope so onDestroy can unsubscribe (was a const inside
  // onMount → ReferenceError in onDestroy that blanked the app on teardown/HMR).
  let unsubZoneForPolling: (() => void) | null = null;
  // Idem pour le gestionnaire d'événements WS : sans ça, un remontage de App
  // (teardown/HMR, ou simplement un second onMount) empile un abonnement de
  // plus et chaque événement est traité N fois.
  let unsubWsEvents: (() => void) | null = null;
  let scanIndicator = $state(false);
  // Tâches de fond en cours (pochettes, images d'artistes, biographies…), telles
  // que le serveur les publie par `system.background_tasks`. Sans cet état, un
  // enrichissement qui dure des minutes est parfaitement invisible (#2227).
  let backgroundTasks = $state<TacheDeFond[]>([]);
  let playlistModalTrack = $state<Track | null>(null);
  let showOnboarding = $state(false);
  let onboardingChecked = $state(false);
  let showWhatsNew = $state(false);

  // Status banner state
  type BannerStatus = 'idle' | 'scan' | 'streaming' | 'ready' | 'enrichment';
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
    bannerMessage = get(t)('app.ready');
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

  /**
   * Reporter les tâches de fond du serveur dans le bandeau d'état.
   *
   * Le scan a son propre bandeau et reste prioritaire ; l'enrichissement ne
   * s'affiche que lorsqu'aucun scan ne tourne, et rend la main à « Prêt »
   * quand la dernière tâche s'achève.
   */
  function applyEnrichmentBanner() {
    if (scanIndicator) return; // ne pas écraser le bandeau de scan
    const libelle = libelleBanniereEnrichissement(backgroundTasks, get(t)('app.enrichmentRunning'));
    if (libelle !== null) {
      showBanner('enrichment', libelle);
    } else if (bannerStatus === 'enrichment') {
      showReadyBanner();
    }
  }

  /**
   * Afficher le bilan de l'enrichissement des images d'artistes qui vient de
   * finir.
   *
   * Sans lui, le bandeau disparaît sans un mot : « la progression tourne […]
   * mais à la fin, la fenêtre se ferme » (Jean Valjean, #2227 / fil 1108).
   *
   * La relance manuelle tourne pour tout le monde : un résultat à 0 veut dire
   * « rien trouvé », jamais « il faut Premium » — ce garde-fou-là ne concerne
   * que la passe automatique d'après-scan. Purement additif : en cas d'erreur
   * on se tait plutôt que d'inventer un chiffre.
   */
  async function showArtistEnrichSummary() {
    try {
      const s = await api.enrichArtistImagesStatus();
      const enriched = s?.result?.enriched ?? 0;
      const missing = s?.artists_without_image ?? 0;
      const msg = get(t)('settings.enrichArtistImagesResult')
        .replace('{enriched}', String(enriched))
        .replace('{missing}', String(missing));
      notifications.info(msg, 6000);
    } catch {
      /* serveur muet : on n'affiche pas de bilan inventé */
    }
  }

  // Kiosk mode: ?kiosk=true forces NowPlaying view on small touchscreen
  const isKiosk = new URLSearchParams(window.location.search).has('kiosk');
  // La zone affichée par un écran kiosque se désigne dans l'URL —
  // `?kiosk&zone=<id>`, ou le raccourci `?kiosk=<id>` (#2274). Sans ce
  // paramètre elle venait du seul réglage global, donc deux écrans muraux ne
  // pouvaient pas montrer deux zones différentes.
  //
  // L'URL ne vaut qu'au démarrage : une fois la zone posée, l'écran se pilote
  // normalement (sélecteur de zone de la barre de transport) et une
  // reconnexion WebSocket ne le ramène pas de force sur la zone de l'URL.
  let kioskUrlZoneApplied = false;
  function kioskUrlZoneId(zoneList: Zone[]): number | null {
    if (!isKiosk || kioskUrlZoneApplied) return null;
    // Liste vide : le serveur n'a pas encore ses zones. Ne pas conclure
    // « inconnue » ici, sinon une zone parfaitement valide serait refusée pour
    // de bon — on retentera au prochain fetchZones().
    if (zoneList.length === 0) return null;
    kioskUrlZoneApplied = true;
    const resolved = resolveKioskZone(window.location.search, zoneList);
    if (resolved.kind === 'pinned') return resolved.zoneId;
    if (resolved.kind === 'unknown') {
      // Repli explicite. Épingler une zone absente ferait retomber le store
      // dérivé `currentZone` sur `zones[0]` : l'écran piloterait une autre
      // zone en silence, ce qui est pire que de ne rien épingler.
      console.warn(
        `[kiosque] zone « ${resolved.requested} » demandée dans l'URL mais introuvable — ` +
        `repli sur la zone du réglage global`,
      );
    }
    return null;
  }
  // Mode mini-lecteur : la fenetre Windows de ~320px charge cette meme
  // interface avec ?mini=1 plutot qu'un second front a maintenir. Tout le
  // reste de l'application est court-circuite — pas de barre laterale, pas de
  // vues, pas de barre de transport : rien de tout cela ne tient dans 320px.
  const isMini = new URLSearchParams(window.location.search).has('mini');

  // Reset seek state + refresh queue when zone changes.
  // IMPORTANT: use get(zones) instead of $zones inside the callback to avoid
  // tracking the zones store as a reactive dependency — otherwise this effect
  // re-runs on every zone data update (position polls, volume, etc.) and
  // resets seekPositionMs, causing the progress bar to flicker.
  $effect(() => {
    const unsub = currentZoneId.subscribe((zoneId) => {
      if (zoneId == null) return;
      stopSeekTimer();
      // La répétition et l'aléatoire appartiennent à la zone, pas à l'écran :
      // en changer, c'est changer d'état de transport (#1810).
      const transport = transportByZone.get(zoneId);
      if (transport?.repeat) repeatMode.set(transport.repeat as any);
      if (typeof transport?.shuffle === 'boolean') shuffleEnabled.set(transport.shuffle);
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

      // La zone demandée dans l'URL du mode kiosque prend le pas (#2274), et
      // seulement si elle existe vraiment. Sans paramètre — ou avec une zone
      // inconnue — on ne pose rien et la sélection ci-dessous se déroule
      // exactement comme avant.
      const urlZoneId = kioskUrlZoneId(zoneList);
      if (urlZoneId !== null) currentZoneId.set(urlZoneId);

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

      // Recaler l'aléatoire et la répétition sur ce que le serveur vient de
      // dire (#2092). APRÈS la sélection de zone, sinon `syncTransportFromZone`
      // comparerait à une zone courante qui n'est pas encore la bonne et ne
      // poserait rien à l'écran.
      //
      // `fetchZones` est le chemin du CHARGEMENT DE PAGE et de la REPRISE DE
      // CONNEXION : c'est ici que se joue « un aléatoire allumé la semaine
      // dernière doit se voir dès l'ouverture ». Il couvre aussi le repli par
      // sondage, où aucun instantané WebSocket n'arrive jamais.
      for (const z of zoneList) syncTransportFromZone(z);

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
              playVideo(track.source_id, nowPlayingToTrack(track));
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
   * Dernière répétition / lecture aléatoire connues du serveur, par zone.
   *
   * On retient au passage tout ce qui les porte — instantané WebSocket, liste
   * REST des zones, zone REST isolée, annonce en direct — pour pouvoir recaler
   * les commandes de transport au moment où l'on change de zone, sans requête
   * supplémentaire. Voir `lib/transportSync.ts` pour le détail du contrat.
   */
  const transportByZone = new Map<number, TransportState>();

  /**
   * Aligner les boutons de transport sur ce que fait vraiment le serveur.
   *
   * `repeatMode` et `shuffleEnabled` sont des miroirs locaux : ils repartent de
   * « off » à chaque chargement de page, alors que le serveur, lui, conserve la
   * répétition — il la persiste à chaque changement et la restaure au
   * démarrage. Une zone laissée en repeat-one bouclait donc sur une piste
   * indéfiniment pendant que le bouton affichait « désactivé », et le premier
   * clic renvoyait « one » au lieu de l'éteindre : il faut trois clics pour
   * revenir à off depuis une base fausse (Dominique Comet, #1810).
   *
   * On ne recale que sur des valeurs présentes : écraser avec un `undefined`
   * venu d'une charge utile REST remettrait exactement le mensonge en place.
   */
  function syncTransportFromZone(zone: any) {
    if (!zone || typeof zone.id !== 'number') return;
    const merged = mergeTransport(transportByZone.get(zone.id), zone);
    transportByZone.set(zone.id, merged);
    if (zone.id !== get(currentZoneId)) return;
    if (merged.repeat) repeatMode.set(merged.repeat);
    if (typeof merged.shuffle === 'boolean') shuffleEnabled.set(merged.shuffle);
  }

  /**
   * Refresh zone state from API and sync seek position.
   * Called on playback events since WS events lack full track/position data.
   */
  async function syncZoneState(zoneId: number) {
    try {
      const zone = await api.getZone(zoneId);
      // `GET /zones/{id}` porte le transport depuis #2153 — et c'est la charge
      // utile relue après CHAQUE événement de lecture. La lire ici, c'est la
      // dernière chance de rattraper un écart avant que l'utilisateur ne le
      // voie (#2092).
      syncTransportFromZone(zone);
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
    syncDisplayFieldsFromServer();
    startUpdatePolling();
    // Pastille « réponse support non lue » (sidebar) — poll léger 5 min.
    startSupportPolling();

    // Démarrage direct en mode Grand écran : #tv ou #tv&zone=<id>.
    // Lu AVANT la vue de démarrage des préférences, qui ne doit pas l'écraser.
    const isTvHash = (h: string) => h === '#tv' || h.startsWith('#tv&') || h.startsWith('#tv?');
    const enterTvFromHash = (h: string) => {
      const zoneMatch = h.match(/[&?]zone=(\d+)/);
      // Force la zone demandée ; fetchZones() la conserve si elle existe.
      if (zoneMatch) currentZoneId.set(Number(zoneMatch[1]));
      activeView.set('tv');
    };
    const bootHash = window.location.hash;
    const tvBoot = !isKiosk && isTvHash(bootHash);
    if (tvBoot) enterTvFromHash(bootHash);
    // Taper #tv dans un onglet où l'app TOURNE DÉJÀ ne recharge pas la page :
    // sans écoute du hashchange, « rien » ne se passe (Bertrand, .18). On
    // bascule à chaud — et #tv reste sans effet en kiosque.
    window.addEventListener('hashchange', () => {
      const h = window.location.hash;
      if (!isKiosk && isTvHash(h)) enterTvFromHash(h);
    });

    // Apply startup view (skip in kiosk mode — always nowplaying)
    if (!isKiosk && !tvBoot) {
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
    let _previousViewForScroll: string | null = null;
    activeView.subscribe(view => {
      // The "Genres" nav destination reuses the Library view — force its tab to
      // Genres on entry so it lands on the genre browser (and the pushed history
      // entry below captures tab='genres'). Runs on every entry path: bottom-tab
      // nav, deep link, and history restore.
      if (view === 'genres') libraryTab.set('genres');
      if (!_pushingState && typeof window !== 'undefined') {
        // Save scroll position of the view we're leaving
        if (_previousViewForScroll && _previousViewForScroll !== view) {
          const mainEl = document.querySelector('.view-scroller');
          if (mainEl) saveScrollPosition(_previousViewForScroll, mainEl.scrollTop);
        }
        _previousViewForScroll = view;

        const ctx = {
          view,
          albumId: $selectedAlbum?.id ?? null,
          artistId: $selectedArtist?.id ?? null,
          tab: $libraryTab ?? null,
        };
        if (!_viewInitialized) {
          _viewInitialized = true;
          window.history.replaceState(ctx, '', `#${view}`);
        } else {
          window.history.pushState(ctx, '', `#${view}`);
        }

        // Restore scroll position of the view we're entering
        requestAnimationFrame(() => {
          const mainEl = document.querySelector('.view-scroller');
          if (mainEl) mainEl.scrollTop = getScrollPosition(view);
        });
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
            // Entering detail: push so back returns to grid. La fiche reçoit sa
            // PROPRE adresse (`#album/{id}`) au lieu de réutiliser `#library`,
            // pour que la barre d'adresse reflète la vue et que précédent /
            // suivant soient sans ambiguïté (demande testeur, 5c420af).
            // Aucune régression de routage : rien ne lit ce fragment au
            // démarrage — le seul lu est `#tv` (voir `isTvHash` plus haut), et
            // l'aiguillage se fait sur `history.state`, inchangé.
            window.history.pushState(ctx, '', `#album/${album.id}`);
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
            // Adresse propre à la fiche artiste (`#artist/{id}`) ; voir le cas
            // album ci-dessus.
            window.history.pushState(ctx, '', `#artist/${artist.id}`);
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
    // État initial des tâches de fond, au cas où un enrichissement tourne déjà
    // au chargement ; le direct arrive ensuite par le WebSocket (#2227).
    api.getBackgroundTasks()
      .then((r) => { backgroundTasks = r?.tasks ?? []; applyEnrichmentBanner(); })
      .catch(() => {});

    // Keep polling aware of the active zone so it can fetch the queue
    unsubZoneForPolling = currentZoneId.subscribe((zoneId) => {
      tuneWS.setCurrentZoneId(zoneId);
    });

    // Allow any component to open the What's New dialog via custom event
    window.addEventListener('tune:open-whatsnew', () => { showWhatsNew = true; });

    // Initialize browser push notifications if enabled
    if (isPushEnabled()) initPushNotifications();

    unsubWsEvents = tuneWS.onEvent((event) => {
      // The Rust server emits playback failures as `zone.playback_error`
      // (orchestrator.rs), while the embedded iPad server emits
      // `playback.error`. Normalize to the latter so the error branch below —
      // including the post-play grace window (#1146) — handles both; without
      // this the Rust event never entered the `playback.*` block at all.
      const type = event.type === 'zone.playback_error' ? 'playback.error' : event.type;

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

      // Instantané d'ouverture de connexion. Le serveur l'envoie pour que le
      // client « ait la vérité tout de suite » (routes/ws.rs). On ne s'en sert
      // que pour le transport — la liste des zones reste servie par
      // fetchZones, inchangée.
      if (type === 'snapshot' && Array.isArray(event.data?.zones)) {
        for (const z of event.data.zones) syncTransportFromZone(z);
        return;
      }

      // Bascule d'aléatoire ou de répétition annoncée EN DIRECT (#2092).
      //
      // C'est le seul chemin par lequel un changement fait AILLEURS —
      // application mobile, seconde fenêtre, Siri, widget, appel d'API —
      // atteint cet écran sans rechargement. Sans lui, deux télécommandes
      // ouvertes côte à côte affichent deux vérités différentes, et celle qui
      // n'a pas cliqué a tort.
      //
      // Placé AVANT le bloc générique `playback.*`, et sans `return` : c'est un
      // AJOUT, pas un détournement. Le bloc générique continue de faire ce
      // qu'il faisait pour ces deux événements (un `syncZoneState` de
      // rattrapage) ; le court-circuiter aurait échangé un défaut contre le
      // risque d'un autre.
      {
        const direct = transportDeLEvenement(type, event.data);
        if (direct) syncTransportFromZone({ id: direct.zoneId, ...direct.transport });
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
        for (const z of zoneList) syncTransportFromZone(z);
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
        // Playback actually started → close the post-play grace window so any
        // later error surfaces normally (#1146).
        if (zoneId != null && (type === 'playback.started' || type === 'playback.track_changed')) {
          playPendingUntil.delete(zoneId);
        }
        if (type === 'playback.error') {
          // Within the post-play grace window a "playback.error" usually means a
          // slow HI-RES DASH pre-transcode is still working (playback then
          // starts), so show "chargement…" instead of a scary error (#1146). A
          // genuine failure that persists past the window still surfaces.
          //
          // Unless the server marked it `fatal`: an audio device that refuses to
          // open never recovers, and the server now reports it within a second —
          // i.e. squarely inside this window. Waiting it out would show a
          // spinner and then nothing at all, since that error is emitted once
          // and the zone stops right after.
          if (suppressedByPlayGrace(zoneId, event.data?.fatal === true)) {
            notifications.info(get(t)('common.loading'));
            if (zoneId) syncZoneState(zoneId);
            return;
          }
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
                if (d.title !== undefined) partial.title = d.title;
                else if (d.track_title !== undefined) partial.title = d.track_title;
                if (d.artist_name !== undefined) partial.artist_name = d.artist_name;
                if (d.album_title !== undefined) partial.album_title = d.album_title;
                if (d.cover_path !== undefined) partial.cover_path = d.cover_path;
                if (d.track_id !== undefined) partial.id = d.track_id;
                if (d.duration_ms !== undefined) partial.duration_ms = d.duration_ms;
                if (d.source !== undefined) partial.source = d.source;
                if (d.source_id !== undefined) partial.source_id = d.source_id;
                // Technical info for the quality / signal-path badge, so it
                // renders immediately on play instead of only after a refresh.
                if (d.format !== undefined) partial.format = d.format;
                if (d.sample_rate !== undefined) partial.sample_rate = d.sample_rate;
                if (d.bit_depth !== undefined) partial.bit_depth = d.bit_depth;
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
                  playVideo(sourceId, nowPlayingToTrack(z.current_track));
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
                // Même règle que resumeAndSync : browserResume sait
                // recharger tout seul quand la source est morte.
                browserResume(urlFlux(z?.stream_url, (z as any)?.stream_url_remote) ?? undefined);
              } else if (type === 'playback.started' || type === 'playback.track_changed') {
                // Force a reload on a track change: the next track may reuse the
                // same per-zone stream URL, and without this the ended element
                // just replays the old track (album "repeats" — Elie).
                // A travers le relais, `stream_url` pointe sur une adresse LAN
                // qui ne mene nulle part depuis l'exterieur. Le serveur annonce
                // aussi `stream_url_remote` : c'est celle-la qu'il faut.
                const src = urlFlux(z?.stream_url, (z as any)?.stream_url_remote);
                if (src) browserPlay(src, type === 'playback.track_changed');
              }
            }

            // Record to playback history on track start/change
            if (type === 'playback.started' || type === 'playback.track_changed') {
              if (z?.current_track) {
                playbackHistory.add(nowPlayingToTrack(z.current_track), z.name);
              }
            }
          });
          // NOTE: no fetchQueue() here — playback.started/track_changed already
          // refetch the queue above, and playback.resumed never changes it. A
          // second blanket refetch re-downloaded and re-set the ENTIRE queue on
          // every track advance, which froze the UI under a large (e.g.
          // whole-library shuffle) queue until refresh (#1126).
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
          showBanner('scan', get(t)('app.syncing'));
        } else if (type === 'library.scan.progress') {
          scanIndicator = true;
          const scanned = event.data?.scanned ?? event.data?.files_scanned;
          const added = event.data?.added ?? event.data?.tracks_added;
          if (scanned !== undefined) {
            const addedPart = added !== undefined ? get(t)('app.syncingAdded').replace('{count}', String(added)) : '';
            showBanner('scan', get(t)('app.syncingProgress').replace('{count}', String(scanned)).replace('{added}', addedPart));
          }
        } else if (type === 'library.scan.completed') {
          scanIndicator = false;
          showReadyBanner();
        }
        return;
      }

      // Tâches de fond : pochettes, images d'artistes, biographies, métadonnées.
      // Le serveur publie l'avancement fin (`bg_tasks.update_progress`) ; plus
      // personne ne le lisait depuis la fusion `f14553f6` (#2227).
      if (type === 'system.background_tasks') {
        const tasks: TacheDeFond[] = Array.isArray(event.data?.tasks) ? event.data.tasks : [];
        const venaitDeFinir = enrichissementImagesTermine(backgroundTasks, tasks);
        backgroundTasks = tasks;
        applyEnrichmentBanner();
        // La fenêtre se referme — mais sur un bilan, plus sur du vide.
        if (venaitDeFinir) showArtistEnrichSummary();
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
        showBanner('streaming', get(t)('app.connecting').replace('{label}', label));
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
    unsubWsEvents?.();
    tuneWS.disconnect();
    stopSeekTimer();
    stopUpdatePolling();
    stopSupportPolling();
    if (bannerFadeTimer) clearTimeout(bannerFadeTimer);
  });

  // --- Ajout de contenu par glisser-déposer ---
  //
  // Lâcher un dossier d'album n'importe où dans l'app ouvre l'assistant
  // d'import. Trois garde-fous pour ne pas voler le drop de quelqu'un d'autre :
  //  - defaultPrevented : une cible plus spécifique (pochette d'album, image
  //    d'artiste) a déjà traité l'événement ;
  //  - le drag doit transporter des fichiers, ce qui exclut les drags internes
  //    (arbre des genres, réordonnancement de file) qui passent du text/plain ;
  //  - le contenu doit ressembler à de la musique (extension audio, ou dossier
  //    dont on ne peut pas connaître le contenu avant lecture).
  let importDropFiles = $state<api.DroppedFile[] | null>(null);
  let showImportDrop = $state(false);
  let dragDepth = $state(0);

  function dragHasFiles(e: DragEvent): boolean {
    return Array.from(e.dataTransfer?.types ?? []).includes('Files');
  }

  function onWindowDragEnter(e: DragEvent) {
    if (e.defaultPrevented || !dragHasFiles(e)) return;
    dragDepth += 1;
  }

  function onWindowDragOver(e: DragEvent) {
    if (e.defaultPrevented || !dragHasFiles(e)) return;
    // Sans preventDefault le navigateur ouvre le fichier au lâcher.
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }

  function onWindowDragLeave(e: DragEvent) {
    if (!dragHasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
  }

  async function onWindowDrop(e: DragEvent) {
    dragDepth = 0;
    if (e.defaultPrevented || !e.dataTransfer || !dragHasFiles(e)) return;
    if (!api.dropLooksLikeMusic(e.dataTransfer)) return;

    e.preventDefault();
    const files = await api.collectDroppedFiles(e.dataTransfer);
    if (files.length === 0) return;
    importDropFiles = files;
    showImportDrop = true;
  }

  function closeImportDrop() {
    showImportDrop = false;
    importDropFiles = null;
  }
</script>

<svelte:window
  ondragenter={onWindowDragEnter}
  ondragover={onWindowDragOver}
  ondragleave={onWindowDragLeave}
  ondrop={onWindowDrop}
/>

{#if isMini}
  <MiniPlayer />
{:else}
<div class="app-layout" class:kiosk-mode={isKiosk} class:focus-mode={$focusMode}>
  {#if !isKiosk && !$focusMode}
  <Sidebar />
  {/if}

  <main class="main-content">
    {#if $updateAvailable && !$updateBannerDismissed}
      <div class="update-banner" onclick={() => { activeView.set('settings'); settingsInitialTab.set('system'); }} style="cursor: pointer;" role="button" tabindex={0}>
        <span class="update-banner-text">{$t('app.updateAvailable').replace('{version}', String($latestVersion))}</span>
        <button class="update-banner-dismiss" onclick={(e) => { e.stopPropagation(); dismissUpdateBanner(); }} title={$t('app.dismiss')}>&times;</button>
      </div>
    {/if}

    {#if bannerStatus !== 'idle'}
      <div class="status-banner" class:status-banner--scan={bannerStatus === 'scan'} class:status-banner--streaming={bannerStatus === 'streaming'} class:status-banner--enrichment={bannerStatus === 'enrichment'} class:status-banner--ready={bannerStatus === 'ready'} class:status-banner--fadeout={bannerFadeout}>
        {#if bannerStatus === 'scan' || bannerStatus === 'streaming' || bannerStatus === 'enrichment'}
          <span class="status-banner-spinner"></span>
        {:else if bannerStatus === 'ready'}
          <svg class="status-banner-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>
        {/if}
        <span class="status-banner-text">{bannerMessage}</span>
      </div>
    {/if}

    <!-- Global search bar + "add to shortcuts": sticky top-right overlay
         accessible from ANY view, so the shortcut button lives in one standard
         place instead of being scattered/absent across views (Elie). -->
    {#if !isKiosk && !$focusMode && $activeView !== 'nowplaying' && $activeView !== 'login' && $activeView !== 'onboarding' && $activeView !== 'offline'}
      <div class="global-search-wrapper" class:has-banner={$updateAvailable && !$updateBannerDismissed}>
        <AddShortcutButton />
        <GlobalSearchBar />
      </div>
    {/if}

    <!-- Single dedicated scroll container for the active view. Banners live
         ABOVE it (outside the scroller) so they can never overflow it and
         re-trigger the "double ascenseur" (#1075). Block views (Radios,
         Métadonnées, Plugins, GenreTree) that used to scroll `.main-content`
         now scroll THIS plain block — which fixes sticky headers scrolling
         away under Firefox (#1282): a sticky element nested in a flex-column
         scroller is honored by Chrome but not by Firefox. Auto-scrolling views
         (Library/Podcasts, height:100%+overflow:auto) fill it exactly and keep
         scrolling internally, unchanged. -->
    <div class="view-scroller">
    {#if $activeView === 'home'}
      <HomeView />
    {:else if $activeView === 'nowplaying'}
      <NowPlaying onAddToPlaylist={openPlaylistModal} />
    {:else if $activeView === 'library'}
      <LibraryView onAddToPlaylist={openPlaylistModal} />
    {:else if $activeView === 'oxygen'}
      <!-- Oxygen est une feature Premium (Bertrand, release v0.9.0) : un
           compte Free retombe sur la bibliothèque classique. -->
      {#if $isPremium}
        <OxygenView />
      {:else}
        <LibraryView />
      {/if}
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
    {:else if $activeView === 'ambiance'}
      <AmbianceView />
    {:else if $activeView === 'bandcamp'}
      <BandcampView />
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
      <!-- The "Genres" nav destination renders the Library on its Genres tab
           (forced via the activeView subscriber below). GenresView.svelte was a
           second, diverging copy of the same genre browser with a poorer album
           detail — retired so genre fixes only ever touch one place. -->
      <LibraryView onAddToPlaylist={openPlaylistModal} />
    {:else if $activeView === 'metadata'}
      <MetadataView />
    {:else if $activeView === 'services'}
      <ServiceTokensView />
    {:else if $activeView === 'genretree'}
      <GenreTreeView />
    {:else if $activeView === 'mediaservers'}
      <MediaServersView />
    {:else if $activeView === 'shortcuts'}
      <ShortcutsView />
    {:else if $activeView === 'favorites'}
      <FavoritesView onAddToPlaylist={openPlaylistModal} />
    {:else if $activeView === 'radiofavorites'}
      <RadioFavoritesView />
    {:else if $activeView === 'zonemanager'}
      <ZoneManagerView />
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
    {:else if $activeView === 'support'}
      <SupportView />
    {:else if $activeView === 'onboarding'}
      <OnboardingView />
    {:else if $activeView === 'offline'}
      <OfflineView />
    {:else if $activeView === 'login'}
      <LoginView />
    {:else if $activeView === 'converter'}
      <ConverterView />
    {:else if $activeView === 'declick'}
      <DeplocView />
    {/if}
    </div>

  </main>

  <TransportBar />

  {#if !isKiosk && !$focusMode}
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
  <DialogContainer />
</div>

<!-- Mode Grand écran : overlay plein viewport au-dessus de tout (afficheur
     type tvOS, sans contrôles — Échap ou clic pour revenir à l'app). -->
{/if}

{#if $activeView === 'tv'}
  <TvView />
{/if}

{#if showOnboarding}
  <OnboardingWizard onComplete={handleOnboardingComplete} />
{/if}

{#if showWhatsNew}
  <WhatsNew onClose={handleWhatsNewClose} />
{/if}

<!-- Shows itself when a streaming session drops; silent otherwise. -->
<StreamingSessionPrompt />

<!-- Single persistent YouTube IFrame Player instance (off-screen) -->
<YTPlayer />

{#if playlistModalTrack !== null}
  <AddToPlaylistModal track={playlistModalTrack} onClose={closePlaylistModal} />
{/if}

{#if dragDepth > 0 && !showImportDrop}
  <div class="drop-hint">
    <div class="drop-card">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="34" height="34">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <strong>{$t('ingest.title')}</strong>
      <span>{$t('ingest.dropHere')}</span>
    </div>
  </div>
{/if}

{#if showImportDrop}
  <ImportWizard droppedFiles={importDropFiles} onClose={closeImportDrop} />
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
    /* Scroll is owned by `.view-scroller` (below), NOT by .main-content. This
       lets the banners stack ABOVE the scroller as fixed-height flex items
       (never scrolled, never overflowing it) which fixes both the "double
       ascenseur" #1075 AND the Firefox sticky-header bug #1282 (sticky nested
       in a flex-column scroller is honored by Chrome but not Firefox). */
    overflow: hidden;
    padding: 0;
    position: relative;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /* THE single scroll container for the active view (see markup comment). A
     plain block scroller → sticky headers behave identically Chrome/Firefox.
     flex:1 + min-height:0 makes it take the space left after the banners, so a
     `height:100%` view inside fills it exactly and scrolls internally without
     overflowing (no second scrollbar). */
  .view-scroller {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
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

  /* Enrichissement en fond : même famille visuelle que le scan, teinte plus
     discrète — c'est une tâche d'arrière-plan, pas une opération demandée. */
  .status-banner--enrichment {
    background: rgba(107, 110, 217, 0.1);
    color: var(--tune-accent, #6b6ed9);
    border-bottom-color: rgba(107, 110, 217, 0.18);
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

  /* Mode « sans distraction » : la vue prend toute la largeur, comme le
     kiosque, mais la rangée du lecteur garde sa hauteur élastique (le kiosque
     la fige à 80px, ce qui rognerait la barre sur certains zooms). */
  .app-layout.focus-mode {
    grid-template-columns: 1fr;
  }

  .app-layout.focus-mode .main-content {
    grid-column: 1;
  }

  .app-layout.focus-mode > :global(.transport-bar) {
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

  /* Retour visuel pendant qu'un dossier survole la fenêtre. `pointer-events:
     none` est indispensable : l'overlay ne doit pas intercepter le dragleave
     ni le drop, sinon le compteur de profondeur se désynchronise et le voile
     reste affiché. */
  .drop-hint {
    position: fixed;
    inset: 0;
    z-index: 1200;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.45);
    pointer-events: none;
  }

  .drop-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 30px 44px;
    border-radius: 16px;
    border: 2px dashed var(--tune-accent);
    background: var(--tune-surface);
    color: var(--tune-text);
    text-align: center;
  }

  .drop-card strong {
    font-size: 1.05rem;
  }

  .drop-card span {
    font-size: 0.85rem;
    opacity: 0.7;
  }
</style>

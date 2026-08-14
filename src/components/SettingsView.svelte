<script lang="ts">
  import { onMount } from 'svelte';
  import SettingHint from './SettingHint.svelte';
  import { tip } from '../lib/tooltip';
  import { dialogs } from '../lib/stores/dialogs';
  import { get } from 'svelte/store';
  import * as api from '../lib/api';
  import { refreshAcousticStatus, acousticStatus, acousticEnabled } from '../lib/stores/acoustic';
  import AcousticProgress from './AcousticProgress.svelte';
  import { tuneWS } from '../lib/websocket';
  import { zones, currentZoneId, followMe } from '../lib/stores/zones';
  import { audiophileEnabled, audiophileLockVolume, setVolumeLock, refreshVolumeLock } from '../lib/stores/audiophile';
  import { loopByDefault } from '../lib/stores/loopByDefault';
  import { devices } from '../lib/stores/devices';
  import { preferences, applyTheme, OXYGEN_FACETS_ALL, type ThemeMode, type VolumeDisplay, type StartupView, type OxygenViewMode } from '../lib/stores/preferences';
  import { SETTING_LEVELS, SETTINGS_LEVELS, isSettingVisible, hiddenCountByTab, nextLevel, type SettingKey, type SettingsLevel } from '../lib/settingLevels';
  import { streamingServices as streamingServicesStore } from '../lib/stores/streaming';
  import type { SystemHealth, SystemStats, SystemConfig, StreamingServiceStatus, StreamingAuthResponse, LocalAudioDevice, BrowseRootEntry, BackupInfo } from '../lib/types';
  import { t, locale, localeNames, type Locale } from '../lib/i18n';
  import RendererConfig from './RendererConfig.svelte';
  import { notifications } from '../lib/stores/notifications';
  import { copyText, errText } from '../lib/utils';
  import { activeView, settingsInitialTab, type View } from '../lib/stores/navigation';
  import { licenseState, isPremium, loadLicense } from '../lib/stores/license';
  import SmbWizard from './SmbWizard.svelte';
  import FolderWizard from './FolderWizard.svelte';
  import MultiroomSettings from './MultiroomSettings.svelte';

  // ─── Per-zone settings: transport badge + Local/Network grouping ───────────
  // The flat list showed every zone the same way, so the 4 identical
  // "Cet ordinateur" (native output vs browser output) were indistinguishable
  // and the DLNA renderer panel broke the row rhythm. We group Local vs Network,
  // give each zone a transport badge + a short device hint, and fold the renderer
  // controls under an "Avancé" disclosure.
  function zoneBadge(ot: string | undefined): { label: string; cls: string } {
    switch (ot) {
      case 'local': return { label: $t('settings.zoneBadgeLocal'), cls: 'local' };
      case 'browser': return { label: $t('settings.zoneBadgeBrowser'), cls: 'browser' };
      case 'airplay':
      case 'airplay2': return { label: 'AirPlay', cls: 'airplay' };
      case 'dlna': return { label: 'DLNA', cls: 'dlna' };
      case 'openhome': return { label: 'OpenHome', cls: 'dlna' };
      case 'chromecast': return { label: 'Chromecast', cls: 'cast' };
      case 'sonos': return { label: 'Sonos', cls: 'cast' };
      case 'bluos': return { label: 'BluOS', cls: 'cast' };
      case 'squeezebox': return { label: 'Squeezebox', cls: 'cast' };
      case 'snapcast': return { label: 'Snapcast', cls: 'cast' };
      default: return { label: ot ?? '—', cls: 'other' };
    }
  }
  function isLocalZone(z: { output_type?: string }): boolean {
    return ['local', 'browser'].includes(z.output_type ?? '');
  }
  // Le DoP fait voyager le DSD dans des trames PCM 24 bits à un seizième du
  // débit DSD : DSD64 → 176,4 kHz, DSD128 → 352,8 kHz, DSD256 → 705,6 kHz.
  // Un plafond de fréquence plus bas ne « préserve » donc rien du tout — le
  // serveur repasse en PCM sans rien dire (orchestrator.rs,
  // `dsd_dop_rate_exceeds_zone_max_falling_back_to_pcm`).
  //
  // Cyrille avait choisi 384 kHz, la valeur la plus haute que cette liste
  // proposait, et perdait son DSD256 : aucune option n'aurait pu marcher, et
  // l'infobulle lui promettait l'inverse (forum #1320). D'où les deux paliers
  // DoP ajoutés à la liste, et cet avertissement sous le réglage.
  //
  // Sortie locale uniquement : le serveur ne déclenche le DoP que sur un
  // `output_device_id` en `local:`, et un renderer réseau reçoit le fichier DSD
  // tel quel sans jamais consulter ce plafond.
  // Seuil = le DoP du DSD256, pas celui du DSD512 : au-dessus de 705,6 kHz on
  // ne perd plus que du DSD512, que presque personne ne possède, et un
  // avertissement qui se déclenche pour rien finit par ne plus être lu.
  const DOP_RATE_DSD256 = 705600;
  function dopCappedToPcm(z: {
    output_type?: string;
    dsd_mode?: string;
    max_sample_rate?: number | null;
  }): boolean {
    if (z.output_type !== 'local') return false;
    if (!['native', 'dop'].includes(z.dsd_mode ?? 'auto')) return false;
    const cap = z.max_sample_rate;
    if (!cap) return false;
    return cap < DOP_RATE_DSD256;
  }
  // Le DoP transporte le DSD dans des trames PCM avec deux octets de marquage
  // par échantillon : le MOINDRE calcul sur les échantillons les détruit, et
  // le DAC lit alors du PCM brut — grésillement violent, sans erreur nulle
  // part (Cyrille, forum 1320, #436). Trois traitements font ce calcul dans
  // la sortie locale : le volume de zone (< 100 %), le ReplayGain (inclus
  // dans le volume effectif — `recompute_effective_volume`, local.rs) et
  // l'égaliseur. Chacun a son avertissement, nommé, sous le réglage DSD.
  //
  // `fixed_volume` n'est pas exposé au client, mais quand il est actif le
  // serveur épingle le volume à 100 en base — `z.volume < 100` reste donc un
  // signal fiable.
  function dsdWantsBitPerfect(z: { output_type?: string; dsd_mode?: string }): boolean {
    return z.output_type === 'local' && ['native', 'dop'].includes(z.dsd_mode ?? 'auto');
  }
  // EQ par zone : l'état n'est pas dans le payload des zones, il se charge à
  // part (`GET /zones/{id}/eq`). Uniquement pour les zones locales en DSD
  // natif/DoP — les seules où l'avertissement peut s'afficher — et une seule
  // fois par zone (l'échec retombe sur false : pas d'avertissement fantôme).
  let zoneEqEnabled = $state<Record<number, boolean>>({});
  const eqFetched = new Set<number>();
  $effect(() => {
    for (const z of $zones) {
      if (z.id == null || !dsdWantsBitPerfect(z) || eqFetched.has(z.id)) continue;
      eqFetched.add(z.id);
      const id = z.id;
      api
        .getEq(id)
        .then((eq) => {
          zoneEqEnabled[id] = !!eq.enabled;
        })
        .catch(() => {
          zoneEqEnabled[id] = false;
        });
    }
  });
  // Readable device hint from output_device_id ("local:Haut-parleurs…" →
  // "Haut-parleurs…") so two same-named zones can be told apart.
  function zoneDeviceHint(z: { output_device_id?: string | null; output_type?: string }): string {
    const id = z.output_device_id ?? '';
    if (!id) return z.output_type === 'browser' ? 'Web Audio' : '';
    const rest = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
    return rest.length > 44 ? rest.slice(0, 44) + '…' : rest;
  }
  function zoneHasAdvanced(z: { output_type?: string }): boolean {
    return ['dlna', 'openhome', 'chromecast', 'bluos', 'squeezebox', 'slimproto'].includes(
      z.output_type ?? '',
    );
  }

  const CLIENT_VERSION = __APP_VERSION__;
  let serverVersion = $state<string | null>(null);

  // Client/server version drift. The embedded web client (CLIENT_VERSION) and
  // the backend (serverVersion) ship together, so a mismatch means a stale
  // bundle is being served against a different server — the UI then calls
  // routes the pairing doesn't line up on (Yacine on the deprecated Python
  // server: 404s, a wrong "FREE" licence, empty log downloads). Surface it
  // instead of the misleading "✓ up to date", which only compares the SERVER
  // version against GitHub and is blind to this drift.
  const clientStale = $derived(
    !!serverVersion && !!CLIENT_VERSION && serverVersion !== CLIENT_VERSION,
  );
  // Consume settingsInitialTab once: allows sidebar shortcuts to open a specific tab
  const _initialTab = get(settingsInitialTab);
  settingsInitialTab.set(null);
  // 'multiroom' n'existe plus comme onglet : son contenu a rejoint « Réseau ».
// Un raccourci enregistré sur l'ancien onglet, ou un lien externe, doit
// atterrir sur le nouveau plutôt que sur une page blanche.
const MERGED_TABS: Record<string, string> = { multiroom: 'network' };
function normalizeTab(tab: string | null | undefined): string {
  if (!tab) return 'general';
  return MERGED_TABS[tab] ?? tab;
}
let settingsTab = $state<string>(normalizeTab(_initialTab));

// Already-open case: clicking a sidebar shortcut (e.g. CLAP) while Settings is
// already displayed must still switch tabs — the one-shot consumption above
// only runs at init. Consume the store reactively too; the first run sees null
// (already consumed) and is a no-op.
$effect(() => {
  const tab = $settingsInitialTab;
  if (tab) {
    settingsTab = normalizeTab(tab);
    settingsInitialTab.set(null);
  }
});

// Niveaux d'affichage des réglages (#1617) — voir lib/settingLevels.ts.
//
// L'ancien toggle « Afficher les réglages avancés » de cet onglet Système
// (localStorage `tune_settings_advanced`) est absorbé : actif ⇒ niveau
// expert au premier chargement (migration dans stores/preferences.ts).
//
// Masquage par classe (`lv-hidden`) et non par {#if} : les sections restent
// montées, donc leur état interne et leurs chargements ne repartent pas de
// zéro à chaque bascule — et aucune structure n'est déplacée dans un fichier
// de 7 000 lignes. Le mécanisme de visibilité (lvOk/lvAny) et le compteur de
// réglages masqués sont déclarés en fin de script, après les états qu'ils
// observent pour la règle d'or.
const settingsLevel = $derived($preferences.settingsLevel);
function setSettingsLevel(level: SettingsLevel) {
  preferences.update((p) => ({ ...p, settingsLevel: level }));
}

  // Premium feature widgets: clicking an available feature opens its page.
  // Features without a dedicated destination (declick, social_sharing,
  // weekly_digest) are shown as available but are not clickable.
  const FEATURE_TARGET: Record<string, { view?: View; tab?: string }> = {
    advanced_alarms: { view: 'alarms' },
    ai_recommendations: { view: 'ambiance' },
    auto_enrichment: { view: 'metadata' },
    batch_converter: { view: 'converter' },
    declick: { view: 'declick' },
    dsp_eq: { view: 'equalizer' },
    room_correction: { view: 'equalizer' },
    dac_calibration: { view: 'equalizer' },
    listening_stats: { view: 'history' },
    multi_server: { view: 'mediaservers' },
    multiroom_sync: { view: 'zonemanager' },
    unlimited_zones: { view: 'zonemanager' },
    playlist_transfer: { view: 'playlistmanager' },
    playlists_hub: { view: 'playlistshub' },
    plugin_marketplace: { view: 'plugins' },
    synced_lyrics: { view: 'nowplaying' },
    cloud_backup: { tab: 'system' },
    cloud_config_backup: { tab: 'system' },
    cloud_relay: { tab: 'system' },
    developer_api: { tab: 'services' },
    multi_scrobbling: { tab: 'services' },
    oaat_protocol: { tab: 'network' },
    multi_profiles: { tab: 'general' },
  };

  function openFeature(key: string) {
    const t = FEATURE_TARGET[key];
    if (!t) return;
    if (t.tab) {
      settingsTab = t.tab;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (t.view) {
      activeView.set(t.view);
    }
  }

  let health: SystemHealth | null = $state(null);
  let stats: SystemStats | null = $state(null);
  let config: SystemConfig | null = $state(null);
  let backups = $state<BackupInfo[]>([]);
  let scanning = $state(false);
  let cancellingScan = $state(false);
  type ScanProgress = {
    phase?: string;
    scanned?: number; added?: number; updated?: number; skipped?: number;
    total?: number; batch?: number; tracks_per_second?: number; eta_seconds?: number;
    pruned?: number; artwork_backfilled?: number;
  };
  let scanProgress: ScanProgress | null = $state(null);
  // Percent complete (files phase); null when total is unknown (indeterminate).
  let scanPercent = $derived.by(() => {
    const p = scanProgress;
    if (!p || !p.total || !p.scanned) return null;
    return Math.min(100, Math.round((p.scanned / p.total) * 100));
  });
  // Human phase label, inferred from which fields the latest event carried
  // (metadata → prune → artwork). A server-side `phase` field is a follow-up.
  let scanPhase = $derived.by(() => {
    const p = scanProgress;
    if (!p) return '';
    // Prefer the server-provided phase; fall back to inferring it from which
    // payload keys are present (older servers without the `phase` field).
    const labels: Record<string, string> = {
      files: get(t)('settings.scanPhaseFiles'),
      prune: get(t)('settings.scanPhasePrune'),
      artwork: get(t)('settings.scanPhaseArtwork'),
    };
    if (p.phase && labels[p.phase]) return labels[p.phase];
    if (p.artwork_backfilled != null) return labels.artwork;
    if (p.pruned != null) return labels.prune;
    return labels.files;
  });
  // ETA formatted as m:ss (or h:mm:ss) from eta_seconds.
  let scanEta = $derived.by(() => {
    const s = scanProgress?.eta_seconds;
    if (s == null || !isFinite(s) || s <= 0) return '';
    const total = Math.round(s);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${m}:${String(sec).padStart(2, '0')}`;
  });
  let restarting = $state(false);

  // Restart the server and reload the page only once it is actually back.
  // A plain restart can drop the port and rebind a few seconds later (bind-retry
  // race), so the old fixed 6s reload hit a not-yet-ready server → "Network
  // error: server unreachable" then "Failed to load zones" (#1209, Mika/Windows).
  // Poll /system/health and reload once it comes back UP (after observing it go
  // DOWN, or as a fallback if it restarted too fast to catch the drop), with a
  // hard backstop so we never hang forever.
  async function restartServerAndReload() {
    if (!(await dialogs.confirm(get(t)('settings.restartConfirm'), { danger: true }))) return;
    restarting = true;
    try {
      await api.restartServer();
    } catch (e) {
      // Le serveur peut couper la connexion AVANT d'avoir répondu : ici,
      // « Failed to fetch » signifie que le redémarrage a COMMENCÉ, pas qu'il
      // a échoué. L'ancien code l'affichait en boîte native et abandonnait le
      // suivi — c'est la capture de Stéphane Villerio (12/08/2026). On ne
      // s'arrête que sur une vraie erreur applicative.
      const msg = errText(e);
      if (msg !== null) {
        restarting = false;
        notifications.error(msg);
        return;
      }
    }
    const start = Date.now();
    let sawDown = false;
    const tryReload = async () => {
      const elapsed = Date.now() - start;
      let up = false;
      try {
        await api.getHealth();
        up = true;
      } catch {
        sawDown = true; // server is restarting
      }
      if (up && (sawDown || elapsed > 8_000)) {
        window.location.reload();
        return;
      }
      if (elapsed > 45_000) {
        window.location.reload(); // hard backstop
        return;
      }
      setTimeout(tryReload, 700);
    };
    setTimeout(tryReload, 1_000);
  }

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
  // Forme réelle de /system/update/check, plus les deux champs que checkForUpdate
  // normalise. Le serveur renvoie `latest`/`current` ; `latest_version`/
  // `current_version` sont les noms retenus ici, d'où la double lecture plus bas.
  // `installable`/`install_hint` : aucune version du serveur ne les émet
  // aujourd'hui, la branche d'UI qui les lit est donc inerte — typés optionnels
  // pour la garder compilable sans prétendre qu'ils arrivent.
  let updateInfo = $state<{
    latest_version: string;
    current_version: string;
    release_notes?: string;
    installable?: boolean;
    install_hint?: string;
  } | null>(null);
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

  // "Add content" defaults. Each change is saved immediately; the wizard can
  // still override any of them for a single import.
  let ingestSettings = $state<import('../lib/api/ingest').IngestSettings | null>(null);
  let ingestError = $state<string | null>(null);

  async function loadIngestSettings() {
    try {
      ingestSettings = await api.getIngestSettings();
    } catch (e) {
      ingestError = e instanceof Error ? e.message : String(e);
    }
  }

  async function saveIngest(patch: Record<string, unknown>) {
    ingestError = null;
    try {
      ingestSettings = await api.updateIngestSettings(patch as any);
      notifications.success($t('settings.ingestSaved'));
    } catch (e) {
      ingestError = e instanceof Error ? e.message : String(e);
      // Reprend l'état serveur : le contrôle affiche encore la valeur refusée.
      await loadIngestSettings();
    }
  }

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

  // True when every field across all categories is enabled — drives the
  // select-all / deselect-all toggle button label.
  const allMetadataFieldsEnabled = $derived(
    metadataCategories.length > 0 &&
      metadataCategories.every((c) => c.fields.every((f) => f.enabled)),
  );

  function setAllMetadataFields(enabled: boolean) {
    for (const cat of metadataCategories) {
      for (const field of cat.fields) {
        field.enabled = enabled;
      }
    }
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
    // Single source of truth: drive the displayFields store, which persists to
    // localStorage AND PUTs the same /system/settings/metadata-fields endpoint.
    // Previously this raw PUT and the displayFields store (which feeds the
    // track-title chips and re-syncs from the server on startup) were separate:
    // enabling technical fields (format/sample_rate/bit_depth) in this catalog
    // never reached the chips and got dropped on the next sync — the display was
    // "lost" (Bilou, #1078). Routing through the store keeps both in sync.
    displayFields.set(enabledKeys);
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

  /// Relit l'etat cloud jusqu'a ce que la connexion apparaisse, ou abandon.
  ///
  /// Le retour d'OAuth recharge la SPA : le premier appel peut precéder
  /// l'enregistrement du jeton cote serveur. Delais croissants, arret des que
  /// c'est connecte. Total ~16 s au pire, ce qui couvre largement un aller-
  /// retour lent sans laisser l'ecran mentir.
  async function pollCloudStatusUntilConnected() {
    const delays = [800, 1500, 3000, 5000, 6000];
    for (const d of delays) {
      await new Promise((r) => setTimeout(r, d));
      await loadCloudStatus();
      if (cloudSsoEmail) return;
    }
  }

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

  let cloudSsoDisconnecting = $state(false);
  async function cloudSsoDisconnect() {
    cloudSsoDisconnecting = true;
    try {
      await api.ssoDisconnect();
      cloudSsoEmail = '';
      cloudSsoName = '';
      cloudSsoAvatar = '';
      notifications.success(get(t)('settings.cloudDisconnected'));
    } catch (e: any) {
      notifications.error(e?.message ?? get(t)('common.error'));
    }
    cloudSsoDisconnecting = false;
  }

  async function toggleCloudTelemetry() {
    cloudTelemetryLoading = true;
    const endpoint = cloudTelemetryEnabled ? '/cloud/telemetry/disable' : '/cloud/telemetry/enable';
    try {
      await api.apiPost(endpoint);
      cloudTelemetryEnabled = !cloudTelemetryEnabled;
    } catch (err: any) {
      notifications.error(err?.message ?? get(t)('settings.telemetryError'));
    }
    cloudTelemetryLoading = false;
  }

  // License / Premium
  let licenseKeyInput = $state('');
  let licenseActivating = $state(false);
  let licenseDeactivating = $state(false);
  let licenseValidating = $state(false);
  let licenseError = $state<string | null>(null);
  // Backoff after a 429 from the license endpoints (throttle:10/min server-side):
  // a rejected key made testers re-click "Valider" in a loop → rate-limited →
  // shown as "invalid" (Matteo). On 429 we surface a clear message and disable
  // the buttons for a minute so the storm can't build.
  let licenseCooldown = $state(false);
  function startLicenseCooldown() {
    licenseCooldown = true;
    setTimeout(() => { licenseCooldown = false; }, 60_000);
  }

  // Re-fetch the authoritative licence status and update the reactive store
  // in-place. The badge (`$isPremium`) and the feature tiles both read from
  // `$licenseState`, so a single `loadLicense()` refreshes them together —
  // no manual page reload needed.
  //
  // The server can briefly report the premium tier *before* the per-feature
  // entitlements have finished propagating (which is why a second manual
  // refresh used to be needed to clear the locks). To cover that lag we
  // schedule one delayed re-fetch so the tiles unlock on their own.
  async function refreshLicense(): Promise<void> {
    await loadLicense();
    setTimeout(() => { void loadLicense(); }, 1500);
  }

  async function handleActivateLicense() {
    const key = licenseKeyInput.trim();
    if (!key) return;
    licenseActivating = true;
    licenseError = null;
    try {
      // `fetchJSON` throws on every non-2xx response, so reaching this line
      // means the server ACCEPTED and stored the key. Trust HTTP success and
      // re-fetch the authoritative status instead of guessing from a narrow
      // literal check on the POST body — a Lifetime tier, or a `status`/`tier`
      // string other than the hard-coded 'ok'/'premium'/'pro', previously
      // produced a false "invalid or expired" even though activation succeeded.
      await api.activateLicense(key);
      await refreshLicense();
      // The key is considered accepted once the refreshed status reports it as
      // the active licence key (covers Lifetime, and a floating session held on
      // another server where the tier stays `free` here but the key is valid).
      if (get(licenseState).licenseKey) {
        notifications.success(get(t)('settings.licenseActivated'));
        licenseKeyInput = '';
      } else {
        licenseError = get(t)('settings.licenseInvalidOrExpired');
      }
    } catch (e: any) {
      if (e?.status === 429) {
        licenseError = get(t)('settings.licenseRateLimited');
        startLicenseCooldown();
      } else {
        licenseError = e?.message === 'premium_required' ? get(t)('settings.licenseInvalid') : (e?.message ?? get(t)('common.error'));
      }
    }
    licenseActivating = false;
  }

  async function handleDeactivateLicense() {
    if (!(await dialogs.confirm(get(t)('settings.deactivateLicenseConfirm'), { danger: true }))) return;
    licenseDeactivating = true;
    try {
      await api.deactivateLicense();
      notifications.success(get(t)('settings.licenseDeactivated'));
      await refreshLicense();
    } catch (e: any) {
      notifications.error(e?.message ?? get(t)('common.error'));
    }
    licenseDeactivating = false;
  }

  async function handleValidateLicense() {
    licenseValidating = true;
    try {
      await api.validateLicense();
      await refreshLicense();
      notifications.success(get(t)('settings.licenseValidated'));
    } catch (e: any) {
      if (e?.status === 429) {
        notifications.error(get(t)('settings.licenseRateLimited'));
        startLicenseCooldown();
      } else {
        notifications.error(e?.message ?? get(t)('settings.licenseValidationError'));
      }
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
        // Une seule relecture a 1,5 s ne suffisait pas : si le serveur n'avait
        // pas fini d'enregistrer le jeton dans ce laps de temps, l'ecran
        // restait sur « non connecte » jusqu'a un rafraichissement manuel.
        // On relit plusieurs fois, en espacant, et on s'arrete des que l'etat
        // bascule — donc aucun appel superflu dans le cas nominal.
        pollCloudStatusUntilConnected();
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
  // DSD → network renderer: stream the transcode instead of a blocking temp
  // file (fixes DSD 256/512 timeouts/silence on some DLNA renderers).
  let dsdLpcmStream = $state(false);

  // Résolution de l'égaliseur Expert (10/15/31 bandes) — clé serveur partagée
  // par tous les clients ; la vue Égaliseur la lit à l'ouverture.
  let eqExpertBands = $state(10);
  async function loadEqExpertBands() {
    try { eqExpertBands = (await api.getEqExpertSettings()).expert_bands; } catch { /* vieux serveur */ }
  }
  async function changeEqExpertBands(n: number) {
    try {
      eqExpertBands = (await api.setEqExpertSettings(n)).expert_bands;
      notifications.success(get(t)('settings.eqBandsSaved'));
    } catch {
      notifications.error(get(t)('settings.eqBandsError'));
    }
  }

  async function loadAudioBackend() {
    try {
      const resp = await fetch('/api/v1/system/config');
      const data = await resp.json();
      audioBackend = data.audio_backend ?? data.local_audio_backend ?? 'wasapi';
      exclusiveMode = data.local_exclusive_mode ?? false;
      dsdLpcmStream = data.dsd_lpcm_stream ?? false;
      replayGainMode = data.replaygain_mode ?? 'off';
      replayGainPreamp = Number(data.replaygain_preamp_db ?? 0);
      replayGainPreventClipping = data.replaygain_prevent_clipping ?? true;
    } catch {}
  }

  async function toggleDsdLpcmStream() {
    const newVal = !dsdLpcmStream;
    dsdLpcmStream = newVal;
    try {
      await fetch('/api/v1/system/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dsd_lpcm_stream: newVal }),
      });
      notifications.success(get(t)(newVal ? 'settings.dsdStreamOn' : 'settings.dsdStreamOff'));
    } catch {
      dsdLpcmStream = !newVal; // revert on failure
      notifications.error(get(t)('settings.dsdStreamError'));
    }
  }

  let replayGainMode = $state('off');
  let replayGainPreamp = $state(0);
  let replayGainPreventClipping = $state(true);

  async function saveReplayGain(patch: Record<string, unknown>) {
    try {
      await fetch('/api/v1/system/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      notifications.success(`${get(t)('settings.replayGain')}: ${get(t)('common.saved')}`);
    } catch {
      notifications.error(get(t)('settings.replayGainError'));
    }
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
      notifications.success(`${get(t)('settings.audioBackend')}: ${backend.toUpperCase()}. ${get(t)('settings.restartServerNeeded')}`);
    } catch {
      notifications.error(get(t)('settings.audioBackendError'));
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
      notifications.success((newVal ? get(t)('settings.exclusiveModeOn') : get(t)('settings.sharedModeOn')) + ' ' + get(t)('settings.restartServerNeeded'));
    } catch {
      notifications.error(get(t)('settings.exclusiveModeError'));
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
      notifications.success(`${get(t)('settings.logLevel')}: ${level}`);
    } catch {
      notifications.error(get(t)('settings.logLevelError'));
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
      notifications.error(get(t)('settings.logsError') + ': ' + (errText(err) ?? get(t)('common.serverUnreachable')));
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
      notifications.error(get(t)('settings.diagnosticError') + ': ' + (errText(err) ?? get(t)('common.serverUnreachable')));
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
  let hqplayerStatusHost = $state('');
  let hqplayerStatusPort = $state(0);
  let hqplayerStatusMessage = $state('');

  async function loadHqplayerConfig() {
    try {
      const cfg = await api.apiFetch('/hqplayer/config');
      hqplayerEnabled = cfg?.hqplayer_enabled ?? false;
      hqplayerHostInput = cfg?.hqplayer_host ?? '';
      hqplayerPortInput = cfg?.hqplayer_port ?? 4321;
    } catch { /* not configured */ }
  }

  async function toggleHqplayer() {
    hqplayerSaving = true;
    try {
      hqplayerEnabled = !hqplayerEnabled;
      await api.apiPost('/hqplayer/config', { hqplayer_host: hqplayerHostInput, hqplayer_port: hqplayerPortInput, hqplayer_enabled: hqplayerEnabled });
    } catch (e: any) { notifications.error(e?.message ?? 'Error'); }
    hqplayerSaving = false;
  }

  async function saveHqplayer() {
    hqplayerSaving = true;
    try {
      await api.apiPost('/hqplayer/config', { hqplayer_host: hqplayerHostInput.trim(), hqplayer_port: hqplayerPortInput, hqplayer_enabled: hqplayerEnabled });
      notifications.success(get(t)('settings.hqplayerConfigured'));
      await checkHqplayer();
    } catch (e: any) { notifications.error(e?.message ?? 'Error'); }
    hqplayerSaving = false;
  }

  async function checkHqplayer() {
    hqplayerChecking = true;
    try {
      // GET /hqplayer/status may take a few seconds (server probes ports 4321 then 8019).
      // We await the full response and read `connected` (the real backend field).
      const status = await api.apiFetch('/hqplayer/status');
      hqplayerReachable = status?.connected ?? false;
      hqplayerStatusHost = status?.host ?? hqplayerHostInput;
      hqplayerStatusPort = status?.port ?? hqplayerPortInput;
      hqplayerStatusMessage = status?.message ?? '';
    } catch {
      hqplayerReachable = false;
      hqplayerStatusHost = hqplayerHostInput;
      hqplayerStatusPort = hqplayerPortInput;
      hqplayerStatusMessage = '';
    }
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

  // Create a "browser" output zone so the user can play on THIS device
  // (browser → OS default output: PC speakers / AirPods), useful when the
  // server has no local audio output (headless / remote).
  let creatingBrowserZone = $state(false);
  async function createBrowserZoneHere() {
    creatingBrowserZone = true;
    try {
      const zone: any = await api.createZone(get(t)('settings.thisComputer'), 'browser');
      if (zone?.id != null) currentZoneId.set(zone.id);
      notifications.success(get(t)('settings.browserZoneCreated'));
    } catch (err: any) {
      notifications.error(err?.message ?? 'Error');
    }
    creatingBrowserZone = false;
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
          spotifyConnectError = get(t)('settings.chooseZone');
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
    // `zones[0].id` est nullable dans le type : on l'extrait une fois plutôt que
    // de supposer sa présence à chaque appel.
    const zoneId = get(zones)[0]?.id;
    if (zoneId == null) return;
    try {
      const res = await api.getCrossfade(zoneId);
      crossfadeEnabled = res.enabled ?? false;
      crossfadeDuration = res.duration ?? 3;
    } catch {}
  }

  async function applyCrossfade() {
    const zoneId = get(zones)[0]?.id;
    if (zoneId == null) return;
    crossfadeLoading = true;
    try {
      await api.setCrossfade(zoneId, crossfadeEnabled, crossfadeDuration);
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
  let deezerArl = $state('');
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

  // YouTube playback (managed yt-dlp helper) — opt-in download.
  let ytPlaybackInstalled = $state(false);
  let ytPlaybackVersion = $state<string | null>(null);
  let ytPlaybackStatus = $state<string>('absent');
  let ytPlaybackBusy = $state(false);
  let ytPollTimer: ReturnType<typeof setInterval> | null = null;

  async function refreshYoutubePlayback() {
    try {
      const s = await api.getYoutubeStatus();
      ytPlaybackInstalled = !!s.installed;
      ytPlaybackVersion = s.version ?? null;
      ytPlaybackStatus = s.status ?? (s.installed ? 'ready' : 'absent');
      ytPlaybackBusy = ytPlaybackStatus === 'downloading';
      if (ytPlaybackStatus !== 'downloading' && ytPollTimer) {
        clearInterval(ytPollTimer); ytPollTimer = null;
      }
    } catch { /* endpoint may be older server — ignore */ }
  }

  async function enableYoutubePlayback() {
    ytPlaybackBusy = true;
    try {
      await api.enableYoutubePlayback();
      ytPlaybackStatus = 'downloading';
      if (ytPollTimer) clearInterval(ytPollTimer);
      ytPollTimer = setInterval(refreshYoutubePlayback, 2000);
    } catch (e: any) {
      ytPlaybackBusy = false;
      notifications.error(e?.message ?? 'Error');
    }
  }

  $effect(() => { refreshYoutubePlayback(); });

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

  // Deezer authenticates with an ARL cookie token (not OAuth/device-code):
  // save it via the service-token endpoint, which validates the ARL server-side.
  async function handleDeezerAuth() {
    const arl = deezerArl.trim();
    if (!arl) return;
    deezerAuthLoading = true;
    deezerAuthError = null;
    try {
      const res = await api.saveServiceToken('deezer', { arl });
      if (res.valid === false) {
        deezerAuthError = res.validation_message ?? get(t)('settings.connectionError');
      } else {
        $streamingServicesStore = {
          ...$streamingServicesStore,
          deezer: { ...$streamingServicesStore['deezer'], authenticated: true },
        };
        deezerArl = '';
      }
    } catch (e: any) {
      deezerAuthError = e?.message ?? get(t)('settings.connectionError');
    }
    deezerAuthLoading = false;
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
        pgTestResult = `PostgreSQL ${data.version} — ${get(t)('settings.connectionOk')}`;
      } else {
        pgTestResult = `${get(t)('common.error')}: ${data.error}`;
      }
    } catch (e: any) {
      pgTestResult = `${get(t)('common.error')}: ${e.message}`;
    }
    pgTesting = false;
  }

  async function migrateToPg() {
    if (!pgUrl || !pgTestOk) return;
    pgMigrating = true;
    try {
      await fetch(`/api/v1/system/database/migrate?target=postgres&url=${encodeURIComponent(pgUrl)}`, { method: 'POST' });
      pgTestResult = get(t)('settings.migrationStarted');
    } catch (e: any) {
      pgTestResult = `${get(t)('settings.migrationError')}: ${e.message}`;
    }
    pgMigrating = false;
  }

  async function migrateToSqlite() {
    pgMigrating = true;
    try {
      await fetch(`/api/v1/system/database/migrate?target=sqlite`, { method: 'POST' });
      pgTestResult = get(t)('settings.migrationToSqliteStarted');
    } catch (e: any) {
      pgTestResult = `${get(t)('common.error')}: ${e.message}`;
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
      ftsResult = `${get(t)('settings.ftsRebuilt')} : ${result.rows_indexed} ${get(t)('settings.recordsIndexed')}`;
    } catch (err: any) {
      ftsResult = `${get(t)('common.error')} : ${err.message}`;
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
    if (
      !(await dialogs.confirm(get(t)('settings.importDbConfirm').replace('{name}', file.name), {
        danger: true,
      }))
    ) {
      input.value = '';
      return;
    }
    dbImporting = true;
    dbImportResult = '';
    try {
      const result = await api.importDatabase(file);
      dbImportResult = `${get(t)('settings.importDbSuccess')} (${(result.size / 1024 / 1024).toFixed(1)} MB). ${get(t)('settings.restartToApply')}`;
    } catch (err: any) {
      dbImportResult = `${get(t)('settings.importDbError')}: ${err.message}`;
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

  // Combien de zones jouent en ce moment. Installer une mise à jour relance le
  // serveur, ce qui coupe la lecture en cours — sur .18 le 10 août, six mises à
  // jour dans la journée ont coupé la musique sans que rien ne le dise, et le
  // symptôme est remonté en « micro-coupures du son » (#1462). On le dit avant
  // le clic plutôt que de le laisser découvrir à l'oreille.
  const playingZones = $derived($zones.filter((z) => z.state === 'playing').length);

  /** Message lisible pour un refus de mise à jour renvoyé par le serveur.
   *  Les motifs connus sont traduits ; un motif inconnu retombe sur le texte
   *  du serveur, qui vaut mieux que rien. */
  let updateRefusal = $state('');
  function updateRefusalMessage(res: any): string {
    const raw = String(res?.message ?? res?.status ?? '');
    if (raw.includes('.no-auto-update')) return $t('settings.updateBlockedFlag');
    if (res?.status === 'already_in_progress') return $t('settings.updateAlreadyRunning');
    if (raw.toLowerCase().includes('scan')) return $t('settings.updateBlockedScan');
    if (raw.toLowerCase().includes('playing') || raw.toLowerCase().includes('zone'))
      return $t('settings.updateBlockedPlaying');
    return raw || $t('settings.updateBlockedUnknown');
  }

  async function installUpdate() {
    updateInstalling = true;
    updateRefusal = '';
    try {
      // Server returns immediately ("started"). Download runs in the
      // background; we poll /update/status until it completes.
      // force=true : le bouton est cliqué juste sous l'avertissement de coupure,
      // donc la garde serveur ne doit pas re-refuser ce que l'utilisateur vient
      // d'accepter.
      const res = await api.installUpdate(true);
      // Un refus explicite du serveur (409) : on le DIT et on s'arrête. Sans
      // ça, l'interface entrait dans 180 s d'attente d'un redémarrage qui
      // n'arriverait jamais, et l'utilisateur voyait un bouton mort là où le
      // serveur avait répondu clairement (#412 — vécu sur une machine portant
      // un drapeau .no-auto-update).
      if (res && res.ok === false) {
        updateInstalling = false;
        updateRefusal = updateRefusalMessage(res);
        return;
      }
      // Docker : le serveur répond 200 — ce n'est pas une erreur, c'est une
      // consigne. Le binaire vit dans une couche d'image en lecture seule,
      // donc aucune installation n'a démarré et aucun redémarrage ne viendra.
      //
      // Sans ce test, `ok === true` laissait passer, et l'interface entrait
      // dans les 180 s d'attente ci-dessous pour un redémarrage qui n'arrive
      // jamais : bouton mort pendant trois minutes, message du serveur jeté
      // (Alex Campbell, Tune en conteneur — « the browser update function
      // doesn't work, I had to force the update in docker »).
      if (res && res.status === 'docker') {
        updateInstalling = false;
        updateRefusal = res.message || $t('settings.updateDockerHint');
        return;
      }
    } catch (e) {
      // Old server (≤ v0.7.41) blocked the request for the full
      // download and the browser reported 'Failed to fetch' even though
      // the install actually completed. Treat as expected and fall
      // through to the polling+reload loop.
      console.warn('install fetch failed, server may be downloading:', e);
    }

    // Poll /update/status until the server restarts on the new version.
    const oldVersion = updateInfo?.current_version;
    const start = Date.now();
    // Whether we've observed the server go DOWN (a poll that threw =
    // connection refused while it restarts). Combined with a later successful
    // poll, this is a platform-independent "it restarted" signal — used as a
    // backstop when the version string can't be compared.
    let sawServerDown = false;
    while (Date.now() - start < 180_000) {
      await new Promise((r) => setTimeout(r, 3_000));
      let status: any = null;
      try {
        status = await api.getUpdateStatus();
      } catch {
        // Connection refused → the server is restarting. Remember it and keep
        // polling; the next successful poll means it's back up.
        sawServerDown = true;
        continue;
      }

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

      // Detect completion two ways, either sufficient:
      //  1. the version bumped — read the AUTHORITATIVE `current_version` from
      //     /update/status (NOT checkForUpdate(), whose field is `current`, so
      //     `info.current_version` was always undefined and the reload never
      //     fired — the whole bug: button stuck on "Installation…" on Linux/
      //     macOS browsers; #JP Robbe);
      //  2. we saw the server drop and it's now back up with no update running
      //     (covers a missing/unknown oldVersion and any platform).
      const cur: string | undefined = status?.current_version;
      const versionBumped = !!cur && !!oldVersion && cur !== oldVersion;
      const restarted = sawServerDown && !status?.update_in_progress;
      if (versionBumped || restarted) {
        updateDone = true;
        updateInstalling = false;
        setTimeout(() => window.location.reload(), 1500);
        return;
      }
    }
    // Timeout backstop: do a final status check; reload if the version moved.
    try {
      const status: any = await api.getUpdateStatus();
      if (status?.current_version && status.current_version !== oldVersion) {
        updateDone = true;
        updateInstalling = false;
        setTimeout(() => window.location.reload(), 1500);
        return;
      }
    } catch { /* ignore */ }
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

  // Manual add by IP:port — robust when multicast auto-discovery is blocked
  // (Docker macvlan, Windows firewall — the reported case).
  let peerAddHost = $state('');
  let peerAddPort = $state(8888);
  let peerAdding = $state(false);
  async function addPeer() {
    const host = peerAddHost.trim();
    if (!host) return;
    peerAdding = true;
    try {
      await api.addTunePeer(host, Number(peerAddPort) || 8888);
      peerAddHost = '';
      await fetchTunePeers();
    } catch (e: any) {
      notifications.error(e?.message || $t('settings.peerAddError'));
    }
    peerAdding = false;
  }
  async function removePeer(peer: api.TunePeer) {
    try {
      await api.removeTunePeer(peer.host, peer.port);
      await fetchTunePeers();
    } catch (e: any) {
      notifications.error(e?.message || $t('common.error'));
    }
  }

  // --- Appliance (Tune OS): host WiFi configuration ---
  let wifiStatus = $state<api.ApplianceStatus | null>(null);
  let wifiNetworks = $state<api.ApplianceWifiNetwork[]>([]);
  let wifiScanning = $state(false);
  let wifiConnecting = $state(false);
  let wifiSelectedSsid = $state<string | null>(null);
  let wifiPassword = $state('');
  let wifiError = $state('');
  let wifiSuccessSsid = $state('');
  let wifiLoaded = false; // plain var: load once per session, not reactive

  async function loadWifiStatus() {
    try {
      wifiStatus = await api.getApplianceStatus();
    } catch (e) {
      console.error('Appliance status error:', e);
    }
  }

  async function scanWifi() {
    wifiScanning = true;
    wifiError = '';
    try {
      const r = await api.applianceWifiScan();
      wifiNetworks = r.networks ?? [];
    } catch (e: any) {
      wifiError = e?.message ?? String(e);
    }
    wifiScanning = false;
  }

  function selectWifi(ssid: string) {
    wifiSelectedSsid = wifiSelectedSsid === ssid ? null : ssid;
    wifiPassword = '';
    wifiError = '';
    wifiSuccessSsid = '';
  }

  async function connectWifi() {
    if (!wifiSelectedSsid) return;
    const ssid = wifiSelectedSsid;
    wifiConnecting = true;
    wifiError = '';
    wifiSuccessSsid = '';
    try {
      await api.applianceWifiConnect(ssid, wifiPassword || undefined);
      wifiSuccessSsid = ssid;
      wifiSelectedSsid = null;
      wifiPassword = '';
      await loadWifiStatus();
      await scanWifi();
    } catch (e: any) {
      wifiError = e?.message ?? String(e);
    }
    wifiConnecting = false;
  }

  async function forgetWifi(ssid: string) {
    try {
      await api.applianceWifiForget(ssid);
      await loadWifiStatus();
      await scanWifi();
    } catch (e: any) {
      wifiError = e?.message ?? String(e);
    }
  }

  $effect(() => {
    if (settingsTab === 'network' && config?.appliance && !wifiLoaded) {
      wifiLoaded = true;
      loadWifiStatus();
      scanWifi();
    }
  });

  // --- Appliance (Tune OS): data relocation (docs/DATA-RELOCATION.md) ---
  let dataStatus = $state<api.ApplianceDataStatus | null>(null);
  let dataVolumes = $state<api.ApplianceVolume[]>([]);
  let dataMoving = $state(false);
  let dataDone = $state(false);
  let dataError = $state('');
  let dataLoaded = false; // plain var: load once, not reactive

  async function loadDataStorage() {
    try {
      dataStatus = await api.getApplianceDataStatus();
      const storage = await api.getApplianceStorage();
      dataVolumes = storage.volumes;
      dataDisks = storage.disks ?? [];
      dataUnmounted = storage.unmounted_partitions ?? [];
    } catch (e) {
      console.error('Appliance storage error:', e);
    }
  }

  function fmtBytes(n: number): string {
    if (!n) return '0 o';
    const u = ['o', 'Ko', 'Mo', 'Go', 'To'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
  }

  async function relocateData(vol: api.ApplianceVolume) {
    if (!vol.uuid || dataMoving) return;
    const name = vol.label || vol.device;
    if (!(await dialogs.confirm($t('settings.dataMoveConfirm').replace('{disk}', name), { danger: true }))) return;
    // Le garde `dataMoving` en tête de fonction a été évalué AVANT la modale.
    // L'ancien confirm() natif bloquait le fil : rien ne pouvait s'intercaler.
    // La modale, elle, rend la main — un second clic (autre volume, ou le même)
    // franchit le garde pendant que la première attend, et deux relocalisations
    // partent. On revérifie donc après coup.
    if (dataMoving) return;
    dataMoving = true;
    dataError = '';
    dataDone = false;
    try {
      await api.applianceRelocateData(vol.uuid);
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000));
        dataStatus = await api.getApplianceDataStatus();
        const j = dataStatus?.job;
        if (!j) continue;
        if (j.phase === 'done') {
          dataDone = true;
          await api.restartServer().catch(() => {});
          break;
        }
        if (j.phase === 'failed') {
          dataError = j.error || 'failed';
          break;
        }
      }
    } catch (e: any) {
      dataError = e?.message ?? String(e);
    }
    dataMoving = false;
  }

  // Accès depuis un autre appareil (copie d'URL)
  let copiedUrl = $state('');

  // Inventaire disques (cas Gil : SATA interne non monté) + install-to-disk
  let dataDisks = $state<api.ApplianceDisk[]>([]);
  let dataUnmounted = $state<api.ApplianceUnmountedPartition[]>([]);
  let musicMountBusy = $state('');
  let musicMountMsg = $state('');
  let installBusy = $state(false);
  let installDone = $state(false);
  let installWritten = $state(0);
  let installError = $state('');

  async function useAsMusicSource(part: api.ApplianceUnmountedPartition) {
    if (musicMountBusy) return;
    musicMountBusy = part.uuid;
    musicMountMsg = '';
    try {
      const r = await api.applianceMountVolume(part.uuid);
      await api.addMusicDir(r.mount_path);
      musicMountMsg = $t('settings.diskMusicAdded').replace('{name}', part.label || part.name);
      await loadDataStorage();
    } catch (e: any) {
      musicMountMsg = e?.message ?? String(e);
    }
    musicMountBusy = '';
  }

  async function installToDisk(disk: api.ApplianceDisk) {
    if (installBusy) return;
    const typed = await dialogs.prompt(
      $t('settings.installConfirmPrompt')
        .replace('{disk}', `${disk.name} (${disk.size} ${disk.model})`.trim())
    );
    if (typed !== 'EFFACER') return;
    // Même raison que pour `dataMoving` : le garde `installBusy` a été évalué
    // avant la saisie, qui rend la main. Une installation qui efface un disque
    // ne doit pas pouvoir partir en double.
    if (installBusy) return;
    installBusy = true;
    installError = '';
    installDone = false;
    try {
      await api.applianceInstallToDisk(disk.name);
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000));
        const st = await api.applianceInstallStatus();
        installWritten = st.written_bytes;
        if (st.phase === 'done') {
          installDone = true;
          break;
        }
        if (st.phase === 'failed') {
          installError = st.error || 'failed';
          break;
        }
      }
    } catch (e: any) {
      installError = e?.message ?? String(e);
    }
    installBusy = false;
  }

  $effect(() => {
    if (settingsTab === 'system' && config?.appliance && !dataLoaded) {
      dataLoaded = true;
      loadDataStorage();
    }
  });

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
      notifications.success(get(t)('settings.deviceDeleted').replace('{name}', deviceName));
    } catch (e: any) {
      notifications.error(e?.message || get(t)('common.error'));
    }
  }

  async function handleClearAllDevices() {
    try {
      const result = await api.clearDevices();
      devices.set([]);
      notifications.success(get(t)('settings.devicesCleared').replace('{count}', String(result.cleared)));
    } catch (e: any) {
      notifications.error(e?.message || get(t)('common.error'));
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
    if (!(await dialogs.confirm(get(t)('settings.removeMusicDirConfirm'), { danger: true }))) return;
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
  let scanReport = $state<api.ScanReport | null>(null);
  let scanReportDbFailed = $derived(
    (scanReport?.db_insert_failed ?? 0) + (scanReport?.db_update_failed ?? 0)
  );
  let clearingLibrary = $state(false);

  async function handleClearLibrary() {
    if (!(await dialogs.confirm(get(t)('settings.clearLibraryConfirm'), { danger: true }))) return;
    clearingLibrary = true;
    try {
      const result = await api.clearLibrary();
      if (result) {
        scanMessage = get(t)('settings.libraryCleared');
        stats = await api.getStats();
      } else {
        scanMessage = get(t)('settings.deletionError');
      }
    } catch (e: any) {
      scanMessage = `${get(t)('common.error')}: ${e?.message || e}`;
    }
    clearingLibrary = false;
  }

  async function handleScan(full = false) {
    scanning = true;
    scanMessage = '';
    try {
      await api.triggerScan(undefined, full);
      scanMessage = full ? get(t)('settings.fullScanStarted') : get(t)('settings.scanStarted');
      notifications.success(full ? get(t)('settings.fullScanNotice') : get(t)('settings.scanLibraryStarted'));
    } catch (e: any) {
      if (e?.message?.includes('already') || e?.message?.includes('409')) {
        scanMessage = get(t)('settings.scanAlreadyRunning') + '...';
        notifications.success(get(t)('settings.scanAlreadyRunning'));
      } else {
        scanMessage = `${get(t)('common.error')}: ${e?.message || e}`;
        notifications.error(`${get(t)('settings.scanError')}: ${e?.message || e}`);
      }
      scanning = false;
    }
  }

  async function stopScan() {
    cancellingScan = true;
    try {
      await api.cancelScan();
    } catch (e) {
      console.error('Cancel scan error:', e);
    } finally {
      // Clear the local banner even on the 204 so the UI reflects the stop
      // immediately (the scan loop polls the AtomicBool and exits shortly).
      scanning = false;
      scanProgress = null;
      cancellingScan = false;
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
    const zoneId = get(zones)[0]?.id;
    if (zoneId == null) return;
    try {
      const res = await api.getStreamingQuality(zoneId);
      streamingQuality = res.quality ?? 'max';
    } catch {}
  }

  async function applyStreamingQuality() {
    const zoneId = get(zones)[0]?.id;
    if (zoneId == null) return;
    qualityLoading = true;
    try {
      await api.setStreamingQuality(zoneId, streamingQuality);
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
        // Le serveur renvoie { status: 'running'|'done'|'idle', enriched, total }
        // — pas { running, processed }. L'ancien contrat lisait des champs
        // inexistants : « 0/0 » affiché et poll arrêté au premier tick
        // (!undefined), d'où « l'enrichissement se termine immédiatement »
        // (Fabien-5, v0.9.13).
        batchEnrichCurrent = status.enriched ?? 0;
        batchEnrichTotal = status.total ?? 0;
        if (status.status !== 'running') {
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

  // --- Artist image enrichment (async: POST returns 202, work runs minutes) ---
  // Without progress the button looked like it "did nothing" (Bruno #1286): the
  // ~2s were just the 202 ack. Poll the status endpoint and show progress.
  let artistImgRunning = $state(false);
  let artistImgProcessed = $state(0);
  let artistImgTotal = $state(0);
  let artistImgRemaining = $state(0);
  let artistImgTimer: ReturnType<typeof setInterval> | null = $state(null);
  // Guards: the result setting persists the LAST run, so a fresh poll can read a
  // stale phase:"done" before the job writes. Only accept "done" once we've seen
  // real activity, and cap total polls so a stuck job can't spin forever.
  let artistImgSawActivity = false;
  let artistImgPolls = 0;

  async function startEnrichArtistImages() {
    if (artistImgTimer) { clearInterval(artistImgTimer); artistImgTimer = null; }
    artistImgRunning = true;
    artistImgProcessed = 0;
    artistImgTotal = 0;
    artistImgSawActivity = false;
    artistImgPolls = 0;
    try {
      const res = await api.enrichArtistImages();
      artistImgRemaining = res.artists_without_image ?? 0;
      if (artistImgRemaining === 0) {
        // Nothing missing → the job finishes instantly; don't imply work.
        artistImgRunning = false;
        notifications.info(get(t)('settings.enrichArtistImagesNoneMissing' as any));
        return;
      }
      enrichMsg = get(t)('settings.enrichArtistImagesStarted');
      setTimeout(() => (enrichMsg = ''), 5000);
      pollEnrichArtistImages();
    } catch {
      // The POST returns 202; a thrown error here is a transport hiccup — still
      // poll, the job most likely started.
      enrichMsg = get(t)('settings.enrichArtistImagesStarted');
      setTimeout(() => (enrichMsg = ''), 5000);
      pollEnrichArtistImages();
    }
  }

  function pollEnrichArtistImages() {
    if (artistImgTimer) clearInterval(artistImgTimer);
    artistImgTimer = setInterval(async () => {
      artistImgPolls += 1;
      try {
        const status = await api.enrichArtistImagesStatus();
        const r = status.result;
        artistImgRemaining = status.artists_without_image ?? artistImgRemaining;
        const phase = r?.phase;
        const processed = r?.processed ?? 0;
        // "Activity" = the current run is actually working (a non-done phase, or
        // it has processed at least one artist) — distinguishes it from the
        // stale done-result left by a previous run.
        if ((phase && phase !== 'done') || processed > 0) {
          artistImgSawActivity = true;
          artistImgProcessed = processed;
          artistImgTotal = r?.total ?? 0;
        }
        const done =
          (artistImgSawActivity && phase === 'done') ||
          artistImgRemaining === 0 ||
          artistImgPolls > 300; // ~30 min safety cap at 6s
        if (done) {
          artistImgRunning = false;
          if (artistImgTimer) { clearInterval(artistImgTimer); artistImgTimer = null; }
          notifications.success(get(t)('settings.enrichArtistImagesDone' as any));
        }
      } catch {
        // Transient error: keep the loop unless we've clearly exceeded the cap.
        if (artistImgPolls > 300) {
          artistImgRunning = false;
          if (artistImgTimer) { clearInterval(artistImgTimer); artistImgTimer = null; }
        }
      }
    }, 6000);
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

      // Reject an oversized file up front: a huge .m3u would exceed the server
      // body limit (413) or take a long time, leaving the UI stuck on "loading"
      // until a browser refresh (Dominique: 78 MB / 909k-entry dump).
      const MAX_IMPORT_MB = 25;
      if (file.size > MAX_IMPORT_MB * 1024 * 1024) {
        input.value = '';
        notifications.error(
          `Fichier trop volumineux (${Math.round(file.size / 1048576)} Mo, max ${MAX_IMPORT_MB} Mo)`,
        );
        return;
      }

      // Linn .dpl playlists import directly (no preview step) via their own
      // endpoint, which matches tracks to the library and creates the playlist.
      if (source === 'playlists' && file.name.toLowerCase().endsWith('.dpl')) {
        input.value = '';
        try {
          const r = await api.importLinnPlaylist(file);
          notifications.success(`${r.name} — ${r.matched}/${r.total_entries} ✓`);
        } catch (err: any) {
          notifications.error(err?.message ?? 'Error');
        }
        return;
      }

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

  // Display metadata fields (chips shown under track titles) — persisted via
  // the single field-catalog editor in the Library tab (saveMetadataFields).
  import { displayFields } from '../lib/stores/displayFields';

  // Use onMount (not $effect) to load data exactly once on component
  // creation.  The $effect(() => { untrack(() => { ... }) }) pattern
  // can re-trigger on batch flushes in certain Svelte 5 runtime versions,
  // flooding the server with API calls and starving the main thread so
  // sidebar clicks are never processed.
  onMount(() => {
    loadAll();
    // L'état du verrou vit côté serveur ; sans ce refresh, le toggle du
    // panneau Général afficherait « off » tant que la barre de lecture n'a
    // pas elle-même initialisé le store.
    refreshVolumeLock();
    // Last scan report is persisted server-side — show it across reloads.
    api.getScanReport()
      .then((r) => { if (r && r.total_files != null) scanReport = r; })
      .catch(() => {});
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
    loadEqExpertBands();
    loadIngestSettings();
    fetchYoutubeAuthStatus();
    if (pushEnabled) initPushNotifications();
  });

  // Shortcut capture/restore for a SPECIFIC settings sub-page (Elie): expose
  // the open tab so a shortcut records it, and re-open that tab when the
  // shortcut is activated (instead of always landing on "general").
  $effect(() => {
    (window as any).__tuneSettingsShortcut = () => settingsTab;
    const onRestore = (e: Event) => {
      const tab = (e as CustomEvent).detail?.settingsTab;
      // Passe par normalizeTab : un raccourci enregistré du temps où
      // « Multiroom » était un onglet doit rouvrir « Réseau », pas une page
      // vide (Elie enregistre ses raccourcis sur des sous-pages précises).
      if (typeof tab === 'string') settingsTab = normalizeTab(tab);
    };
    window.addEventListener('tune:shortcut-restore-settings', onRestore);
    return () => {
      window.removeEventListener('tune:shortcut-restore-settings', onRestore);
      delete (window as any).__tuneSettingsShortcut;
    };
  });

  // WS event subscription for scan/enrich progress — use $effect for
  // automatic cleanup on component destruction.
  $effect(() => {
    const unsub = tuneWS.onEvent((event) => {
      if (event.type === 'library.scan.progress') {
        scanning = true;
        // Merge, don't replace: post-scan events carry only a single field
        // ({pruned} / {artwork_backfilled}) and would otherwise wipe the
        // scanned/total counters mid-run.
        scanProgress = { ...(scanProgress ?? {}), ...event.data };
        api.getStats().then(s => { stats = s; }).catch(() => {});
      } else if (event.type === 'library.scan.completed') {
        scanning = false;
        scanProgress = null;
        scanningPath = null;
        const d = event.data ?? {};
        // The server event uses total_files/inserted; older builds sent
        // scanned/added — accept both so the toast never shows "?".
        scanMessage = get(t)('settings.scanCompleted')
          .replace('{scanned}', String(d.total_files ?? d.scanned ?? '?'))
          .replace('{added}', String(d.inserted ?? d.added ?? 0))
          .replace('{updated}', String(d.updated ?? 0))
          .replace('{removed}', String(d.removed ?? 0));
        notifications.success(scanMessage);
        if (!d.cancelled && !d.no_dirs && d.total_files != null) {
          scanReport = d;
        }
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

  // ─── Niveaux d'affichage (#1617) : règle d'or + compteur de masqués ──────
  //
  // `settingModified` matérialise la règle d'or : un réglage dont la valeur
  // diffère de son défaut reste TOUJOURS visible, quel que soit le niveau.
  // Les défauts client viennent de preferences.ts ; pour les réglages serveur,
  // le défaut est celui que le serveur applique quand la clé est absente
  // (mêmes tests que les `checked=`/`value=` des contrôles ci-dessous).
  // Les actions (boutons) n'ont pas de valeur, donc jamais « modifiées ».
  const settingModified = $derived.by((): Partial<Record<SettingKey, boolean>> => ({
    'general.lockVolume': $audiophileLockVolume,
    'general.crossfade': crossfadeEnabled,
    'general.crossfadeDuration': crossfadeDuration !== 3,
    'general.volumeDisplay': $preferences.volumeDisplay !== 'percent',
    'general.voiceCommand': (() => { try { return localStorage.getItem('tune_voice_ai_enabled') === 'true'; } catch { return false; } })(),
    'library.folderPlaylists': config?.scan_folder_playlists === true || config?.scan_folder_playlists === 'true',
    'library.importPlaylistFiles': config?.scan_import_playlists === false || config?.scan_import_playlists === 'false',
    'library.qualitySplit': config?.quality_split === false || config?.quality_split === 'false' || config?.quality_split === 0 || config?.quality_split === '0',
    'library.scanSchedule': scanScheduleEnabled,
    'library.scanScheduleTime': scanScheduleTime !== '03:00',
    'library.enrichOnScan': config?.enrich_on_scan === false || config?.enrich_on_scan === 'false',
    'library.lyricsLrclib': config?.lyrics_lrclib_enabled === true || config?.lyrics_lrclib_enabled === 'true',
    'library.replaygainAnalysis': config?.replaygain_analysis_enabled === false || config?.replaygain_analysis_enabled === 'false',
    'library.oxygenEnable': $preferences.oxygenEnabled,
    'library.oxygenView': $preferences.oxygenView !== 'detail',
    'library.metadataReadonly': !!config?.metadata_readonly,
    'library.ingestTemplate': !!ingestSettings?.template && ingestSettings.template !== ingestSettings.default_template,
    'library.discogsToken': !!config?.discogs_token_set,
    'library.metadataFields': metadataCategories.some((c) => c.fields.some((f) => !f.enabled)),
    'services.deezerArl': !!$streamingServicesStore['deezer']?.enabled,
    'services.spotifyConnect': !!spotifyConnect?.enabled,
    'services.zoneAutoCreate': config?.zone_auto_create === false,
    'services.followMe': $followMe,
    'services.perZoneLyricsOffset': $zones.some((z) => (z.lyrics_offset_ms ?? 0) !== 0),
    'services.perZoneFixedVolume': $zones.some((z) => !!z.fixed_volume),
    'services.perZoneDsdMode': $zones.some((z) => (z.dsd_mode ?? 'auto') !== 'auto'),
    'services.perZoneMaxSampleRate': $zones.some((z) => (z.max_sample_rate ?? 0) > 0),
    'services.zoneAdvanced': $zones.some((z) => !!z.alac_passthrough || !!z.dlna_lpcm),
    'services.squeezebox': !!config?.squeezebox_enabled,
    'services.hqplayer': hqplayerEnabled,
    'network.tuneServers': tunePeers.length > 0,
    'network.networkDevices': $preferences.hiddenDeviceIds.some((id) => id.startsWith('net:')),
    'network.replayGain': replayGainMode !== 'off',
    'network.replayGainPreamp': replayGainPreamp !== 0,
    'network.replayGainAntiClip': !replayGainPreventClipping,
    'network.wasapiMode': exclusiveMode,
    'network.audioBackend': audioBackend !== 'auto',
    'network.dsdNetwork': dsdLpcmStream,
    'network.eqBands': eqExpertBands !== 10,
    'network.tuneBridge': bridgeEnabled,
    'system.telemetry': cloudTelemetryEnabled,
    'system.communitySync': config?.community_sync_enabled === true || config?.community_sync_enabled === 'true',
    'system.logLevel': logLevel !== 'info',
  }));

  // Blocs qui ne se rendent pas du tout dans le contexte courant : exclus du
  // compteur « n réglages masqués » (rien à révéler en montant de niveau).
  const settingPresent = $derived.by((): Partial<Record<SettingKey, boolean>> => ({
    'system.dataLocation': !!config?.appliance,
    'network.applianceWifi': !!config?.appliance,
    'services.spotifyConnect': !!spotifyConnect,
    'services.perZoneLyricsOffset': $zones.length > 0,
    'services.perZoneFixedVolume': $zones.length > 0,
    'services.perZoneDsdMode': $zones.length > 0,
    'services.perZoneMaxSampleRate': $zones.length > 0,
    'services.zoneAdvanced': $zones.length > 0,
  }));

  /** Visibilité d'un réglage : niveau ≤ niveau choisi, OU valeur ≠ défaut. */
  function lvOk(key: SettingKey): boolean {
    return isSettingVisible(SETTING_LEVELS[key].level, settingsLevel, !!settingModified[key]);
  }
  /** Visibilité d'une section : au moins un de ses réglages est visible. */
  function lvAny(...keys: SettingKey[]): boolean {
    return keys.some(lvOk);
  }

  const hiddenCounts = $derived(hiddenCountByTab(
    settingsLevel,
    (k) => !!settingModified[k],
    (k) => settingPresent[k] !== false,
  ));
  const hiddenInCurrentTab = $derived(
    settingsTab === 'general' || settingsTab === 'library' || settingsTab === 'services'
      || settingsTab === 'network' || settingsTab === 'system'
      ? hiddenCounts[settingsTab] : 0,
  );

  const LEVEL_LABEL_KEYS: Record<SettingsLevel, string> = {
    beginner: 'settings.levelBeginner',
    intermediate: 'settings.levelIntermediate',
    expert: 'settings.levelExpert',
  };
</script>

<div class="settings-view">
  <h2>{$t('settings.title')}</h2>

  <!-- Niveau d'affichage (#1617) : segmented control discret, toujours
       visible à tout niveau — on peut toujours remonter. -->
  <div class="level-selector" role="radiogroup" aria-label={$t('settings.displayLevel' as any)}>
    <span class="level-selector-label">{$t('settings.displayLevel' as any)}</span>
    <div class="level-segments">
      {#each SETTINGS_LEVELS as level (level)}
        <button
          class="level-segment"
          class:active={settingsLevel === level}
          role="radio"
          aria-checked={settingsLevel === level}
          onclick={() => setSettingsLevel(level)}
        >
          {$t(LEVEL_LABEL_KEYS[level] as any)}
        </button>
      {/each}
    </div>
  </div>

  <div class="settings-tabs">
    <button class="settings-tab" class:active={settingsTab === 'general'} onclick={() => settingsTab = 'general'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="18" x2="18" y2="18" />
        <circle cx="19" cy="6" r="3" /><circle cx="19" cy="12" r="3" />
      </svg>
      {$t('settings.tabGeneral')}
    </button>
    <button class="settings-tab" class:active={settingsTab === 'library'} onclick={() => settingsTab = 'library'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
      {$t('settings.library')}
    </button>
    <button class="settings-tab" class:active={settingsTab === 'services'} onclick={() => settingsTab = 'services'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
      {$t('settings.tabServices')}
    </button>
    <button class="settings-tab" class:active={settingsTab === 'network'} onclick={() => settingsTab = 'network'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      {$t('settings.tabNetworkAudio')}
    </button>
    <button class="settings-tab" class:active={settingsTab === 'system'} onclick={() => settingsTab = 'system'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      {$t('settings.tabSystem')}
    </button>
    <button class="settings-tab" class:active={settingsTab === 'clap'} onclick={() => settingsTab = 'clap'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <path d="M2 12h2l2-7 3 14 3-10 2 5 2-2h6" />
      </svg>
      {$t('settings.tabClap' as any)}
    </button>
  </div>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      {$t('common.loading')}
    </div>
  {:else}
    {#if settingsTab === 'network'}
    <!-- Le multiroom n'avait pas de quoi remplir un onglet : trois champs, et
         il traite de la synchronisation entre zones — donc du même sujet que
         le reste de cet onglet. Un onglet de moins, et le réglage se trouve
         là où on le cherche. -->
    <div class:lv-hidden={!lvOk('network.multiroomOffsets')}>
      <MultiroomSettings />
    </div>
    {/if}

    {#if settingsTab === 'network'}
    <!-- Audio diagnostic -->
    <section class="settings-section audio-diagnostic">
      <h3>{$t('settings.audioDiagnostic')}</h3>
      <div class="diag-checks">
        <div class="diag-check">
          <span class="diag-icon">{$zones.length > 0 ? '✅' : '⚠️'}</span>
          <span class="diag-label">{$t('settings.playbackZones')}</span>
          <span class="diag-value">{$t('settings.zonesConfigured').replace('{n}', String($zones.length))}</span>
        </div>
        <div class="diag-check">
          <span class="diag-icon">{audioDevices.length > 0 ? '✅' : '⚠️'}</span>
          <span class="diag-label">{$t('settings.audioOutputs')}</span>
          <span class="diag-value">{$t('settings.outputsDetected').replace('{n}', String(audioDevices.length))}</span>
        </div>
        <div class="diag-check">
          <span class="diag-icon">{$devices.length > 0 ? '✅' : 'ℹ️'}</span>
          <span class="diag-label">{$t('settings.networkDevicesLabel')}</span>
          <span class="diag-value">{$t('settings.devicesFound').replace('{n}', String($devices.length))}</span>
        </div>
      </div>
      {#if $zones.length === 0 || audioDevices.length === 0}
        <p class="diag-hint">
          {#if $zones.length === 0}
            {$t('settings.noZonesHint')}
          {:else if audioDevices.length === 0}
            {$t('settings.noAudioOutputHint')}
          {/if}
        </p>
      {/if}
    </section>
    {/if}

    {#if settingsTab === 'system' && (config?.server_urls?.length ?? 0) > 0}
    <!-- Accès depuis un autre appareil (Android ne résout pas .local → IP) -->
    <section class="settings-section">
      <h3>{$t('settings.accessFromDevice')}</h3>
      <p class="diag-hint">{$t('settings.accessFromDeviceHint')}</p>
      <div class="wifi-list">
        {#each config?.server_urls ?? [] as url (url)}
          <div class="wifi-item">
            <div class="wifi-row" style="cursor: default;">
              <span class="wifi-ssid server-url">{url}</span>
            </div>
            <button
              class="scan-btn small"
              onclick={async () => { if (await copyText(url)) { copiedUrl = url; setTimeout(() => (copiedUrl = ''), 2000); } else { notifications.error($t('settings.copyFailed')); } }}
            >
              {copiedUrl === url ? $t('settings.urlCopied') : $t('settings.copyUrl')}
            </button>
          </div>
        {/each}
      </div>
    </section>
    {/if}

    {#if settingsTab === 'system' && config?.appliance}
    <!-- Appliance (Tune OS): data location (docs/DATA-RELOCATION.md) -->
    <section class="settings-section" class:lv-hidden={!lvOk('system.dataLocation')}>
      <h3>{$t('settings.dataLocation')}</h3>
      {#if dataStatus}
        <p class="diag-hint">
          {dataStatus.db_path} · {fmtBytes(dataStatus.data_size_bytes)} ·
          {dataStatus.on_external ? $t('settings.dataOnDisk') : $t('settings.dataOnKey')}
        </p>
      {/if}
      {#if dataDone}
        <p class="wifi-feedback success">{$t('settings.dataMoveDone')}</p>
      {/if}
      {#if dataError}
        <p class="wifi-feedback error">{dataError}</p>
      {/if}
      {#if dataMoving && dataStatus?.job}
        <div class="loading">
          <div class="spinner small"></div>
          {$t('settings.dataMoving')} — {fmtBytes(dataStatus.job.copied_bytes)} / {fmtBytes(dataStatus.job.total_bytes)}
        </div>
      {:else if !dataDone}
        <div class="wifi-list">
          {#each dataVolumes as vol (vol.device)}
            <div class="wifi-item">
              <div class="wifi-row" style="cursor: default;">
                <span class="wifi-ssid">{vol.label || vol.device}</span>
                <span class="wifi-sec">{vol.fs}</span>
                <span class="wifi-signal">
                  {$t('settings.dataFree').replace('{free}', fmtBytes(vol.free_bytes)).replace('{size}', fmtBytes(vol.size_bytes))}
                </span>
                {#if vol.is_data_target}<span class="wifi-inuse">{$t('settings.dataCurrent')}</span>{/if}
              </div>
              {#if !vol.is_data_target && vol.uuid}
                <button class="scan-btn small" onclick={() => relocateData(vol)} disabled={dataMoving}>
                  {$t('settings.dataMove')}
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
      {#if dataUnmounted.length > 0}
        <h4 class="wifi-subtitle">{$t('settings.disksDetected')}</h4>
        {#if musicMountMsg}<p class="wifi-feedback success">{musicMountMsg}</p>{/if}
        <div class="wifi-list">
          {#each dataUnmounted as part (part.uuid)}
            <div class="wifi-item">
              <div class="wifi-row" style="cursor: default;">
                <span class="wifi-ssid">{part.label || part.name}</span>
                <span class="wifi-sec">{part.fstype} · {part.disk_model || part.disk}{part.tran === 'usb' ? ' · USB' : ''}</span>
                <span class="wifi-signal">{part.size}</span>
              </div>
              <button
                class="scan-btn small"
                onclick={() => useAsMusicSource(part)}
                disabled={!!musicMountBusy}
              >
                {musicMountBusy === part.uuid ? '…' : $t('settings.diskUseAsMusic')}
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if dataDisks.some((d) => !d.is_boot && d.tran !== 'usb')}
        <h4 class="wifi-subtitle">{$t('settings.installTitle')}</h4>
        <p class="diag-hint">{$t('settings.installHint')}</p>
        {#if installDone}
          <p class="wifi-feedback success">{$t('settings.installDone')}</p>
        {:else if installBusy}
          <div class="loading">
            <div class="spinner small"></div>
            {$t('settings.installWriting')} — {fmtBytes(installWritten)}
          </div>
        {:else}
          {#if installError}<p class="wifi-feedback error">{installError}</p>{/if}
          <div class="wifi-list">
            {#each dataDisks.filter((d) => !d.is_boot && d.tran !== 'usb') as disk (disk.name)}
              <div class="wifi-item">
                <div class="wifi-row" style="cursor: default;">
                  <span class="wifi-ssid">{disk.name}</span>
                  <span class="wifi-sec">{disk.model}</span>
                  <span class="wifi-signal">{disk.size}</span>
                </div>
                <button class="scan-btn small danger" onclick={() => installToDisk(disk)}>
                  {$t('settings.installButton')}
                </button>
              </div>
            {/each}
          </div>
        {/if}
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
            {$t('settings.updateAvailable')} : <strong>v{updateInfo.latest_version}</strong>
            ({$t('settings.current')} : v{updateInfo.current_version})
          </span>
          {#if updateDmgReady}
            <span class="update-done">{$t('settings.dmgReady')}</span>
          {:else if updateDone}
            <span class="update-done">{$t('settings.installedRestarting')}</span>
          {:else if updateInstalling}
            <span class="update-btn" style="opacity:0.6">{$t('settings.installing')}</span>
          {:else}
            <button class="update-btn" onclick={installUpdate}>{$t('settings.updateButton')}</button>
          {/if}
          {#if playingZones > 0 && !updateDone && !updateInstalling}
            <div class="update-playing-warning">
              ⚠️ {$t('settings.updateStopsPlayback')}
            </div>
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
          onclick={restartServerAndReload}
        >
          {restarting ? $t('settings.restarting') : $t('settings.restartServer')}
        </button>
      </div>
    </section>
    {/if}

    {#if settingsTab === 'network' && config?.appliance}
    <!-- Appliance (Tune OS): host WiFi configuration -->
    <section class="settings-section">
      <h3>{$t('settings.applianceWifi')}</h3>
      <p class="diag-hint">
        {#if wifiStatus?.wifi_connected}
          {$t('settings.wifiConnectedTo').replace('{ssid}', wifiStatus?.wifi_ssid ?? '')}
        {:else}
          {$t('settings.wifiNotConnected')}
        {/if}
        {#if wifiStatus?.ethernet_connected}
          &nbsp;·&nbsp;{$t('settings.wifiEthernetOn')}
        {/if}
      </p>
      {#if wifiSuccessSsid}
        <p class="wifi-feedback success">{$t('settings.wifiConnectSuccess').replace('{ssid}', wifiSuccessSsid)}</p>
      {/if}
      {#if wifiError}
        <p class="wifi-feedback error">{wifiError}</p>
      {/if}
      {#if wifiScanning && wifiNetworks.length === 0}
        <div class="loading"><div class="spinner small"></div> {$t('settings.wifiScanning')}</div>
      {:else if wifiNetworks.length === 0}
        <p class="diag-hint">{$t('settings.wifiNoNetworks')}</p>
      {:else}
        <div class="wifi-list">
          {#each wifiNetworks as net (net.ssid)}
            <div class="wifi-item" class:selected={wifiSelectedSsid === net.ssid}>
              <button class="wifi-row" onclick={() => selectWifi(net.ssid)}>
                <span class="wifi-ssid">{net.ssid}</span>
                {#if net.security}<span class="wifi-sec">{net.security}</span>{/if}
                <span class="wifi-signal">{net.signal}%</span>
                {#if net.in_use}<span class="wifi-inuse">{$t('settings.wifiInUse')}</span>{/if}
              </button>
              {#if net.in_use}
                <button class="scan-btn small danger" onclick={() => forgetWifi(net.ssid)}>
                  {$t('settings.wifiForget')}
                </button>
              {/if}
              {#if wifiSelectedSsid === net.ssid && !net.in_use}
                <div class="wifi-connect-form">
                  {#if net.security}
                    <input
                      type="password"
                      placeholder={$t('settings.wifiPassword')}
                      bind:value={wifiPassword}
                      onkeydown={(e) => { if (e.key === 'Enter') connectWifi(); }}
                      disabled={wifiConnecting}
                    />
                  {/if}
                  <button class="scan-btn small" onclick={connectWifi} disabled={wifiConnecting || (!!net.security && !wifiPassword)}>
                    {#if wifiConnecting}<div class="spinner small"></div>{/if}
                    {$t('settings.wifiConnect')}
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
      <button class="scan-btn" onclick={scanWifi} disabled={wifiScanning} style="margin-top: 8px;">
        {$t('settings.wifiScan')}
      </button>
    </section>
    {/if}

    {#if settingsTab === 'network'}
    <!-- Tune Peers on the network -->
    <section class="settings-section" class:lv-hidden={!lvOk('network.tuneServers')}>
      <h3>{$t('settings.tuneServersOnNetwork')}</h3>
      {#if peersLoading}
        <div class="loading"><div class="spinner small"></div> {$t('settings.searching')}</div>
      {:else if tunePeers.length === 0}
        <p class="diag-hint">{$t('settings.noTunePeers')}</p>
      {:else}
        <div class="peers-list">
          {#each tunePeers as peer}
            <div class="peer-card">
              <div class="peer-info">
                <span class="peer-name">{peer.name}</span>
                <span class="peer-details">{peer.host}:{peer.port} — v{peer.version}</span>
                <span class="peer-stats">{peer.tracks} {$t('common.tracks')}, {$t('settings.peerZones').replace('{n}', String(peer.zones))}</span>
              </div>
              <div class="peer-actions">
                <button class="btn-secondary" onclick={() => window.open(`http://${peer.host}:${peer.port}`, '_blank')}>
                  {$t('settings.browse')}
                </button>
                <button class="btn-secondary" title={$t('settings.peerRemove')} onclick={() => removePeer(peer)}>✕</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Manual add by IP:port — the robust path when multicast auto-discovery
           is blocked (Docker macvlan, Windows firewall). -->
      <div class="peer-add">
        <input type="text" class="auth-input" placeholder={$t('settings.peerAddHostPlaceholder')} bind:value={peerAddHost}
               onkeydown={(e) => { if (e.key === 'Enter') addPeer(); }} disabled={peerAdding} />
        <input type="number" class="auth-input peer-add-port" placeholder="8888" bind:value={peerAddPort} disabled={peerAdding} />
        <button class="scan-btn small" onclick={addPeer} disabled={peerAdding || !peerAddHost.trim()}>
          {#if peerAdding}<div class="spinner small"></div>{/if}
          {$t('settings.peerAdd')}
        </button>
      </div>
      <p class="diag-hint">{$t('settings.peerAddHint')}</p>

      <button class="scan-btn" onclick={fetchTunePeers} disabled={peersLoading} style="margin-top: 8px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
        {$t('settings.refresh')}
      </button>
    </section>
    {/if}

    {#if settingsTab === 'general'}
    <!-- Playback / Crossfade -->
    <section class="settings-section">
      <h3>{$t('settings.playback')}</h3>
      <!-- Miroir du réglage du panneau « Chemin du signal » : le même état,
           exposé AUSSI ici — introuvable pour qui le cherche dans les
           Réglages, réflexe naturel pour ce type d'option (Bertrand, 12/08). -->
      <div class="setting-row" class:lv-hidden={!lvOk('general.lockVolume')}>
        <div class="setting-label">
          <span>{$t('audiophile.lockVolume' as any)}</span>
          <span class="setting-hint">{$t('audiophile.lockVolumeHelp' as any)}</span>
        </div>
        <label class="toggle">
          <input type="checkbox" checked={$audiophileLockVolume} onchange={async () => {
            try {
              await setVolumeLock(!$audiophileLockVolume);
              // En PURE, verrouiller remonte aussi la zone courante à 100 % —
              // même geste que l'interrupteur du chemin du signal.
              if ($audiophileLockVolume && $audiophileEnabled) {
                const zid = $currentZoneId;
                if (zid != null) await api.setVolume(zid, 1);
              }
            } catch { /* setVolumeLock a déjà restauré le store */ }
          }} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="setting-row" class:lv-hidden={!lvOk('general.crossfade')}>
        <div class="setting-label">
          <span>Crossfade</span>
          <span class="setting-hint">{$t('settings.crossfadeHint')}</span>
        </div>
        <label class="toggle">
          <input type="checkbox" bind:checked={crossfadeEnabled} onchange={() => applyCrossfade()} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      {#if crossfadeEnabled}
        <div class="setting-row" class:lv-hidden={!lvOk('general.crossfadeDuration')}>
          <div class="setting-label">
            <span>{$t('settings.duration')} : {crossfadeDuration}s</span>
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
      <div class="setting-row">
        <div class="setting-label">
          <span>{$t('settings.loopByDefault')}</span>
          <span class="setting-hint">{$t('settings.loopByDefaultHint')}</span>
        </div>
        <label class="toggle">
          <input type="checkbox" bind:checked={$loopByDefault} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </section>

    <!-- Voice AI -->
    <section class="settings-section" class:lv-hidden={!lvOk('general.voiceCommand')}>
      <h3>Tune Voice AI</h3>
      <div class="setting-row">
        <div class="setting-label">
          <span>{$t('settings.voiceCommand')}</span>
          <span class="setting-hint">{$t('settings.voiceCommandHint')}</span>
        </div>
        <label class="toggle">
          <input type="checkbox" checked={localStorage.getItem('tune_voice_ai_enabled') === 'true'} onchange={(e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            localStorage.setItem('tune_voice_ai_enabled', String(enabled));
            if (enabled) {
              navigator.mediaDevices?.getUserMedia({ audio: true }).then(() => {
                notifications.success($t('settings.micAuthorized'));
              }).catch(() => {
                notifications.error($t('settings.micDenied'));
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

      {#if scanning}
        <!-- Show the panel (and its Stop button) whenever a scan is running,
             from the polled `scanning` state — NOT gated on `scanProgress`,
             which only arrives via the scan_progress websocket event. On a
             polling-mode client (websocket unavailable) scanProgress stays
             null, so the old `scanning && scanProgress` hid the whole panel
             including the Stop button mid-scan (#1223, Benjithom). The
             progress details below stay guarded on scanProgress. -->
        <div class="scan-progress-panel">
          <div class="scan-progress-head">
            <span class="scan-progress-phase">{scanPhase}</span>
            {#if scanPercent !== null}
              <span class="scan-progress-pct">{scanPercent}%</span>
            {/if}
            <button class="scan-stop-btn" onclick={stopScan} disabled={cancellingScan}>
              {cancellingScan ? '…' : $t('settings.stopScan')}
            </button>
          </div>
          <div class="scan-progress-bar" class:indeterminate={scanPercent === null}>
            <div class="scan-progress-fill" style={scanPercent !== null ? `width:${scanPercent}%` : ''}></div>
          </div>
          {#if scanProgress}
            <div class="scan-progress-meta">
              {#if scanProgress.total}
                <span>{scanProgress.scanned ?? 0} / {scanProgress.total} {$t('settings.filesWord')}</span>
              {:else if scanProgress.scanned}
                <span>{scanProgress.scanned} {$t('settings.filesWord')}</span>
              {/if}
              {#if scanProgress.added != null}<span>+{scanProgress.added} {$t('settings.addedWord')}</span>{/if}
              {#if scanProgress.updated}<span>~{scanProgress.updated} {$t('settings.scanUpdatedWord')}</span>{/if}
              {#if scanProgress.skipped}<span>{scanProgress.skipped} {$t('settings.scanSkippedWord')}</span>{/if}
              {#if scanProgress.tracks_per_second}<span>{scanProgress.tracks_per_second} {$t('settings.scanPerSecond')}</span>{/if}
              {#if scanEta}<span>{$t('settings.scanEta')} {scanEta}</span>{/if}
            </div>
          {/if}
        </div>
      {/if}

      {#if scanReport && !scanning}
        <div class="scan-report">
          <div class="scan-report-head">{$t('settings.scanReportTitle' as any)}</div>
          <div class="scan-report-counts">
            <span>{scanReport.total_files ?? 0} {$t('settings.filesWord')}</span>
            <span>+{scanReport.inserted ?? 0} {$t('settings.addedWord')}</span>
            {#if scanReport.updated}<span>~{scanReport.updated} {$t('settings.scanUpdatedWord')}</span>{/if}
            {#if scanReport.skipped_unchanged}<span>{scanReport.skipped_unchanged} {$t('settings.scanReportUnchanged' as any)}</span>{/if}
            {#if scanReport.skipped_duplicate}<span>{scanReport.skipped_duplicate} {$t('settings.scanReportDuplicates' as any)}</span>{/if}
            {#if scanReport.metadata_timeout}<span class="warn">{scanReport.metadata_timeout} {$t('settings.scanReportTimeouts' as any)}</span>{/if}
            {#if scanReport.skipped_no_metadata}<span class="warn">{scanReport.skipped_no_metadata} {$t('settings.scanReportReadFailures' as any)}</span>{/if}
            {#if scanReportDbFailed}<span class="warn">{scanReportDbFailed} {$t('settings.scanReportDbFailures' as any)}</span>{/if}
          </div>
          {#if scanReport.missing_dirs?.length}
            <div class="scan-report-warning">
              <div class="scan-report-warning-title">{$t('settings.scanReportMissingDirs' as any)}</div>
              <ul>
                {#each (scanReport.missing_dir_reasons?.length ? scanReport.missing_dir_reasons : scanReport.missing_dirs) as d}
                  <li>{d}</li>
                {/each}
              </ul>
            </div>
          {/if}
          {#if scanReport.error_dirs?.length}
            <div class="scan-report-warning">
              <div class="scan-report-warning-title">{$t('settings.scanReportErrorDirs' as any)}</div>
              <ul>
                {#each scanReport.error_dirs as d}
                  <li>{d}</li>
                {/each}
              </ul>
            </div>
          {/if}
          {#if scanReport.failed_paths?.length}
            <details class="scan-report-failed">
              <summary>{scanReport.failed_paths.length} {$t('settings.scanReportFailedPaths' as any)}</summary>
              <ul>
                {#each scanReport.failed_paths.slice(0, 50) as p}
                  <li>{p}</li>
                {/each}
                {#if scanReport.failed_paths.length > 50}
                  <li>… (+{scanReport.failed_paths.length - 50})</li>
                {/if}
              </ul>
            </details>
          {/if}
        </div>
      {/if}

      {#if config}
        <div class="pref-grid" class:lv-hidden={!lvOk('library.folderPlaylists')}>
          <label class="pref-label">{$t('settings.folderPlaylists' as any)}<SettingHint k="settings.folderPlaylistsHelp" labelKey="settings.folderPlaylists" /></label>
          <label class="toggle-switch">
            <input type="checkbox" checked={config.scan_folder_playlists === true || config.scan_folder_playlists === 'true'} onchange={async (e) => { const val = (e.target as HTMLInputElement).checked; if (!config) return; config.scan_folder_playlists = val; await api.updateConfig({ scan_folder_playlists: val }); }} />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="pref-grid" class:lv-hidden={!lvOk('library.importPlaylistFiles')}>
          <label class="pref-label">{$t('settings.importPlaylistFiles' as any)}<SettingHint k="settings.importPlaylistFilesHelp" labelKey="settings.importPlaylistFiles" /></label>
          <label class="toggle-switch">
            <input type="checkbox" checked={config.scan_import_playlists !== false && config.scan_import_playlists !== 'false'} onchange={async (e) => { const val = (e.target as HTMLInputElement).checked; if (!config) return; config.scan_import_playlists = val; await api.updateConfig({ scan_import_playlists: val }); }} />
            <span class="toggle-slider"></span>
          </label>
        </div>
      {/if}

      <div class="action-buttons">
        <button class="scan-btn" onclick={() => handleScan(false)} disabled={scanning}>
          {#if scanning}
            <div class="spinner small"></div>
            {$t('settings.scanning')}{#if scanPercent !== null} — {scanPercent}%{/if}
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            {$t('settings.scanLibrary')}
          {/if}
        </button>
        <button class="scan-btn" class:lv-hidden={!lvOk('library.fullScan')} onclick={() => handleScan(true)} disabled={scanning} title={$t('settings.fullScanTitle')}>
          {#if scanning}
            <div class="spinner small"></div>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M21.5 2v6h-6" /><path d="M2.5 22v-6h6" /><path d="M22 11.5A10 10 0 0 0 3.2 7.2" /><path d="M2 12.5a10 10 0 0 0 18.8 4.2" />
            </svg>
            {$t('settings.fullScan')}
          {/if}
        </button>
        {#if scanMessage}
          <span class="scan-message">{scanMessage}</span>
        {/if}

        <button class="scan-btn" onclick={handleArtworkRescan} disabled={artworkScanning} use:tip={'tip.rescanArtwork'}>
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

        <button class="scan-btn danger-btn" class:lv-hidden={!lvOk('library.clearLibrary')} onclick={handleClearLibrary} disabled={clearingLibrary} use:tip={'tip.clearLibrary'}>
          {#if clearingLibrary}
            <div class="spinner small"></div>
            {$t('settings.deleting')}
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            {$t('settings.clearLibrary')}
          {/if}
        </button>
      </div>
    </section>

    <!-- Quality Split -->
    <section class="settings-section" class:lv-hidden={!lvOk('library.qualitySplit')}>
      <h3>{$t('settings.scanOptions')}</h3>
      <div class="setting-row">
        <div class="setting-label">
          <span>{$t('settings.qualitySplit')}</span>
          <span class="setting-hint">{$t('settings.qualitySplitHint')}</span>
        </div>
        <label class="toggle">
          <input type="checkbox" checked={!(config?.quality_split === false || config?.quality_split === 'false' || config?.quality_split === 0 || config?.quality_split === '0')} onchange={async (e) => {
            const val = (e.target as HTMLInputElement).checked;
            await api.apiPatch('/system/config', { quality_split: val });
            if (config) config.quality_split = val;
            notifications.success($t('settings.savedRescanFull'));
          }} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </section>

    <!-- Scan Schedule -->
    <section class="settings-section" class:lv-hidden={!lvAny('library.scanSchedule', 'library.scanScheduleTime')}>
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
    <section class="settings-section" class:lv-hidden={!lvAny('system.databaseInfo', 'system.databaseExportImport', 'system.searchReindex', 'system.databaseMigration')}>
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
              {$t('settings.exportDatabase')}
            </button>
            <button class="btn-secondary" onclick={() => dbImportFileInput?.click()} disabled={dbImporting}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {dbImporting ? $t('settings.importInProgress') : $t('settings.importFile')}
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
            <div class="migrate-result" class:ok={dbImportResult.startsWith($t('settings.importDbSuccess'))} class:error={dbImportResult.startsWith($t('settings.importDbError'))}>
              {dbImportResult}
            </div>
          {/if}
        </div>

        <!-- Rebuild search index -->
        <div class="db-importexport">
          <h4>{$t('settings.searchIndex')}</h4>
          <p class="db-hint" style="margin-top:0">{$t('settings.rebuildIndexHint')}</p>
          <div class="db-ie-actions">
            <button class="btn-secondary" onclick={rebuildFtsIndex} disabled={ftsRebuilding} use:tip={'tip.rebuildFts'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {ftsRebuilding ? $t('settings.rebuilding') : $t('settings.rebuildIndex')}
            </button>
          </div>
          {#if ftsResult}
            <div class="migrate-result" class:ok={ftsResult.startsWith($t('settings.ftsRebuilt'))} class:error={ftsResult.startsWith($t('common.error'))}>
              {ftsResult}
            </div>
          {/if}
        </div>

        <p class="db-hint">{$t('settings.dbSwitchInfo')}</p>

        <!-- Migration section -->
        {#if config.db_engine === 'sqlite'}
          <div class="db-migrate">
            <h4>{$t('settings.migrateToPostgres')}</h4>
            <div class="migrate-form">
              <input type="text" class="auth-input" placeholder="postgresql://user:password@localhost/tune" bind:value={pgUrl} />
              <div class="migrate-actions">
                <button class="btn-secondary" onclick={testPgConnection} disabled={!pgUrl || pgTesting}>
                  {pgTesting ? $t('settings.testing') : $t('settings.testConnection')}
                </button>
                <button class="btn-primary" onclick={migrateToPg} disabled={!pgTestOk || pgMigrating}>
                  {pgMigrating ? $t('settings.migrating') : $t('settings.migrate')}
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
            <h4>{$t('settings.migrateToSqlite')}</h4>
            <button class="btn-secondary" onclick={migrateToSqlite} disabled={pgMigrating}>
              {pgMigrating ? $t('settings.migrating') : $t('settings.migrateToSqliteBtn')}
            </button>
          </div>
        {/if}
      </div>
    </section>
    {/if}

    <!-- Library Import (Roon / Plex / Playlists) -->
    <section class="settings-section" class:lv-hidden={!lvOk('system.libraryImport')}>
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
            <input bind:this={importFileInputPlaylist} type="file" accept=".m3u,.m3u8,.pls,.dpl,.M3U,.M3U8,.PLS,.DPL" style="display:none"
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
                          <th>{$t('settings.columnTitle')}</th>
                          <th>{$t('settings.columnArtist')}</th>
                          <th>{$t('settings.columnStatus')}</th>
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
                          <tr><td colspan="3" class="more-rows">+ {importReport.details.length - 100} {$t('settings.rowsWord')}...</td></tr>
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

    <!-- Defaults for "Add content" (library ingest) -->
    <section class="settings-section" class:lv-hidden={!lvAny('library.ingestMode', 'library.ingestConflict', 'library.ingestDestRoot', 'library.ingestTemplate', 'library.ingestWriteTags')}>
      <h3>{$t('settings.ingest')}</h3>
      <p class="muted">{$t('settings.ingestDesc')}</p>

      {#if ingestSettings}
        <div class="ingest-grid">
          <label class="ingest-field">
            <span>{$t('settings.ingestMode')}</span>
            <select
              class="auth-input"
              value={ingestSettings.mode}
              onchange={(e) => saveIngest({ mode: e.currentTarget.value as 'move' | 'copy' })}
            >
              <option value="move">{$t('ingest.move')}</option>
              <option value="copy">{$t('ingest.copy')}</option>
            </select>
          </label>

          <label class="ingest-field">
            <span>{$t('settings.ingestConflict')}</span>
            <select
              class="auth-input"
              value={ingestSettings.conflict_policy}
              onchange={(e) => saveIngest({ conflict_policy: e.currentTarget.value as any })}
            >
              <option value="skip">{$t('ingest.policy.skip')}</option>
              <option value="rename">{$t('ingest.policy.rename')}</option>
              <option value="overwrite">{$t('ingest.policy.overwrite')}</option>
            </select>
          </label>

          <label class="ingest-field">
            <span>{$t('settings.ingestDestRoot')}</span>
            <select
              class="auth-input"
              value={ingestSettings.dest_root ?? ''}
              onchange={(e) => saveIngest({ dest_root: e.currentTarget.value })}
            >
              <option value="">{$t('settings.ingestDestRootAuto')}</option>
              {#each ingestSettings.music_dirs as dir}
                <option value={dir}>{dir}</option>
              {/each}
            </select>
          </label>

          <label class="ingest-field wide">
            <span>{$t('settings.ingestTemplate')}</span>
            <input
              type="text"
              class="auth-input"
              value={ingestSettings.template}
              placeholder={ingestSettings.default_template}
              onchange={(e) => saveIngest({ template: e.currentTarget.value })}
            />
            <small class="muted">{$t('ingest.templateHint')}</small>
          </label>
        </div>

        <label class="ingest-check">
          <input
            type="checkbox"
            checked={ingestSettings.write_tags}
            onchange={(e) => saveIngest({ write_tags: e.currentTarget.checked })}
          />
          <span>{$t('settings.ingestWriteTags')}</span>
        </label>

        {#if ingestError}
          <div class="music-dir-error">{ingestError}</div>
        {/if}
      {:else}
        <div class="spinner small"></div>
      {/if}
    </section>
    {/if}

    {#if settingsTab === 'network'}
    <!-- Network Devices (DLNA / AirPlay) -->
    <section class="settings-section" class:lv-hidden={!lvOk('network.networkDevices')}>
      <h3>{$t('settings.networkDevices')}</h3>
      <div class="devices-actions">
        <button class="scan-btn small" onclick={showAllDevices}>{$t('settings.showAll')}</button>
        <button class="scan-btn small" onclick={hideAllDevices}>{$t('settings.hideAll')}</button>
        <button class="scan-btn small danger" onclick={handleClearAllDevices} use:tip={'tip.clearDevices'}>{$t('settings.clearDevices')}</button>
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
      <div class="about-row" style="margin-bottom: 0.75rem" class:lv-hidden={!lvOk('network.audioBackend')}>
        <span class="about-label">{$t('settings.audioBackend')}</span>
        <select class="log-level-select" value={audioBackend} onchange={(e) => changeAudioBackend((e.target as HTMLSelectElement).value)}>
          <option value="auto">{$t('settings.autoDefault')}</option>
          <option value="wasapi">WASAPI</option>
          <option value="asio">ASIO (bit-perfect)</option>
        </select>
      </div>
      {#if audioBackend === 'wasapi'}
      <div class="about-row" style="margin-bottom: 0.75rem" class:lv-hidden={!lvOk('network.wasapiMode')}>
        <span class="about-label">Mode WASAPI</span>
        <select class="log-level-select" value={exclusiveMode ? 'exclusive' : 'shared'} onchange={(e) => { const v = (e.target as HTMLSelectElement).value; if ((v === 'exclusive') !== exclusiveMode) toggleExclusiveMode(); }}>
          <option value="shared">{$t('settings.sharedDefault')}</option>
          <option value="exclusive">{$t('settings.exclusiveBitPerfect')}</option>
        </select>
      </div>
      {/if}
      <div class="about-row" style="margin-bottom: 0.35rem" class:lv-hidden={!lvOk('network.replayGain')}>
        <span class="about-label">{$t('settings.replayGain')}</span>
        <select class="log-level-select" value={replayGainMode} onchange={(e) => { replayGainMode = (e.target as HTMLSelectElement).value; saveReplayGain({ replaygain_mode: replayGainMode }); }}>
          <option value="off">{$t('settings.replayGainOff')}</option>
          <option value="track">{$t('settings.replayGainTrack')}</option>
          <option value="album">{$t('settings.replayGainAlbum')}</option>
        </select>
      </div>
      <p class="muted" style="margin-top: 0; margin-bottom: 0.75rem" class:lv-hidden={!lvOk('network.replayGain')}>{$t('settings.replayGainHint')}</p>
      {#if replayGainMode !== 'off'}
        <div class="about-row" style="margin-bottom: 0.75rem" class:lv-hidden={!lvOk('network.replayGainPreamp')}>
          <span class="about-label">{$t('settings.replayGainPreamp')}</span>
          <select class="log-level-select" value={String(replayGainPreamp)} onchange={(e) => { replayGainPreamp = Number((e.target as HTMLSelectElement).value); saveReplayGain({ replaygain_preamp_db: replayGainPreamp }); }}>
            {#each [-6, -3, 0, 3, 6] as db}
              <option value={String(db)}>{db > 0 ? `+${db}` : db} dB</option>
            {/each}
          </select>
        </div>
        <div class="about-row" style="margin-bottom: 0.75rem" class:lv-hidden={!lvOk('network.replayGainAntiClip')}>
          <span class="about-label">{$t('settings.replayGainPreventClipping')}</span>
          <select class="log-level-select" value={replayGainPreventClipping ? 'on' : 'off'} onchange={(e) => { replayGainPreventClipping = (e.target as HTMLSelectElement).value === 'on'; saveReplayGain({ replaygain_prevent_clipping: replayGainPreventClipping }); }}>
            <option value="on">{$t('eq.enabled')}</option>
            <option value="off">{$t('eq.disabled')}</option>
          </select>
        </div>
      {/if}
      <!-- Source du gain (#1627) : l'interrupteur d'analyse vivait dans la
           section Métadonnées, à un écran d'ici — le lien entre les deux était
           invisible (question de Bebelalu55, #1382 : « Tune utilise-t-il mes
           tags rsgain ? »). Même réglage serveur (`replaygain_analysis_enabled`,
           via updateConfig), pure présentation : avec le sélecteur ci-dessus,
           le bloc dit les trois modes — Désactivé / Tags des fichiers (coche
           décochée) / Tags + analyse (coche cochée). Les tags des fichiers
           priment TOUJOURS, l'analyse ne fait que combler les manques.
           Visible même en mode Désactivé : le balayage tourne aussi dans ce
           cas (pré-remplissage silencieux), et il doit rester coupable quand
           la bibliothèque est sur un partage réseau chargé (Philippe, forum
           #1310). Coche allumée par défaut : un réglage absent vaut vrai côté
           serveur, d'où le test sur !== false. -->
      {#if config}
        <div class="about-row" style="margin-bottom: 0.35rem">
          <span class="about-label">{$t('settings.replaygainSource')}<SettingHint k="settings.replaygainAnalysisHelp" labelKey="settings.replaygainSource" /></span>
          <label class="toggle-switch">
            <input type="checkbox" checked={config.replaygain_analysis_enabled !== false && config.replaygain_analysis_enabled !== 'false'} onchange={async (e) => { const val = (e.target as HTMLInputElement).checked; if (!config) return; config.replaygain_analysis_enabled = val; await api.updateConfig({ replaygain_analysis_enabled: val }); }} />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <p class="muted" style="margin-top: 0; margin-bottom: 0.75rem">{(config.replaygain_analysis_enabled !== false && config.replaygain_analysis_enabled !== 'false') ? $t('settings.replaygainSourceTagsAnalysis') : $t('settings.replaygainSourceTagsOnly')}</p>
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
      <!-- Play on THIS device (browser output) — works even on a headless
           server or in remote mode, where the server has no audio output. -->
      <p class="settings-note" style="margin-top: 0.5rem">{$t('settings.playHereHint')}</p>
      <div class="settings-actions">
        <button class="action-btn" onclick={createBrowserZoneHere} disabled={creatingBrowserZone}>
          {#if creatingBrowserZone}<div class="spinner small"></div>{/if}
          {$t('settings.createBrowserZone')}
        </button>
      </div>
    </section>

    <!-- DSD streaming to network (DLNA) renderers -->
    <section class="settings-section" class:lv-hidden={!lvOk('network.dsdNetwork')}>
      <h3>{$t('settings.dsdNetworkTitle')}</h3>
      <p class="muted" style="margin-bottom: 1rem">{$t('settings.dsdNetworkHint')}</p>
      <div class="about-row">
        <span class="about-label">{$t('settings.dsdNetworkLabel')}</span>
        <select
          class="log-level-select"
          value={dsdLpcmStream ? 'stream' : 'file'}
          onchange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            if ((v === 'stream') !== dsdLpcmStream) toggleDsdLpcmStream();
          }}
        >
          <option value="file">{$t('settings.dsdOptionFile')}</option>
          <option value="stream">{$t('settings.dsdOptionStream')}</option>
        </select>
      </div>
    </section>

    <!-- Résolution de l'égaliseur Expert (10/15/31 bandes) -->
    <section class="settings-section" class:lv-hidden={!lvOk('network.eqBands')}>
      <h3>{$t('settings.eqBandsTitle')}</h3>
      <p class="muted" style="margin-bottom: 1rem">{$t('settings.eqBandsHint')}</p>
      <div class="about-row">
        <span class="about-label">{$t('settings.eqBandsLabel')}</span>
        <select
          class="log-level-select"
          value={String(eqExpertBands)}
          onchange={(e) => changeEqExpertBands(parseInt((e.target as HTMLSelectElement).value))}
        >
          <option value="10">{$t('settings.eqBands10')}</option>
          <option value="15">{$t('settings.eqBands15')}</option>
          <option value="31">{$t('settings.eqBands31')}</option>
        </select>
      </div>
    </section>

    <!-- Tune Bridge (Remote Access) -->
    <section class="settings-section" class:lv-hidden={!lvOk('network.tuneBridge')}>
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
    <section class="settings-section" class:lv-hidden={!lvAny('library.metadataReadonly', 'library.enrichOnScan', 'library.lyricsLrclib', 'library.replaygainAnalysis')}>
      <h3>{$t('metadata.title')}</h3>
      <div class="pref-grid">
        <label class="pref-label" class:lv-hidden={!lvOk('library.metadataReadonly')}>{$t('settings.metadataReadonly')}<SettingHint k="settings.metadataReadonlyHelp" labelKey="settings.metadataReadonly" /></label>
        <label class="toggle-switch" class:lv-hidden={!lvOk('library.metadataReadonly')}>
          <input type="checkbox" checked={config.metadata_readonly} onchange={async (e) => { const val = (e.target as HTMLInputElement).checked; if (!config) return; config.metadata_readonly = val; await api.updateConfig({ metadata_readonly: val }); }} />
          <span class="toggle-slider"></span>
        </label>

        <label class="pref-label">{$t('settings.enrichOnScan')}<SettingHint k="settings.enrichOnScanHelp" labelKey="settings.enrichOnScan" /></label>
        <label class="toggle-switch">
          <input type="checkbox" checked={config.enrich_on_scan !== false && config.enrich_on_scan !== 'false'} onchange={async (e) => { const val = (e.target as HTMLInputElement).checked; if (!config) return; config.enrich_on_scan = val; await api.updateConfig({ enrich_on_scan: val }); }} />
          <span class="toggle-slider"></span>
        </label>

        <label class="pref-label">{$t('settings.lyricsLrclib')}<SettingHint k="settings.lyricsLrclibHelp" labelKey="settings.lyricsLrclib" /></label>
        <label class="toggle-switch">
          <input type="checkbox" checked={config.lyrics_lrclib_enabled === true || config.lyrics_lrclib_enabled === 'true'} onchange={async (e) => { const val = (e.target as HTMLInputElement).checked; if (!config) return; config.lyrics_lrclib_enabled = val; await api.updateConfig({ lyrics_lrclib_enabled: val }); }} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </section>
    {/if}

    <!-- Oxygen advanced library view (parameterizable) -->
    <section class="settings-section" class:lv-hidden={!lvAny('library.oxygenEnable', 'library.oxygenView')}>
      <h3>{$t('oxygen.settingsTitle')} <span class="license-badge premium">Premium</span></h3>
      <div class="pref-grid">
        <label class="pref-label" for="oxy-enable">{$t('oxygen.enable')}<SettingHint k="oxygen.enableHelp" labelKey="oxygen.enable" /></label>
        <!-- Le titre porte sur le label, pas sur l'input : un input desactive
             ne recoit pas les evenements souris dans plusieurs navigateurs, et
             l'infobulle ne s'afficherait jamais. Sans elle, la case grisee se
             lit comme un bug et non comme une fonction payante (JP Borderies,
             9 aout 2026 : « je n'arrive pas a cocher la ligne »). -->
        <label class="toggle-switch" title={$isPremium ? null : $t('oxygen.premiumOnly')}>
          <input id="oxy-enable" type="checkbox" checked={$preferences.oxygenEnabled && $isPremium} disabled={!$isPremium}
            onchange={(e) => preferences.update((p) => ({ ...p, oxygenEnabled: (e.target as HTMLInputElement).checked }))} />
          <span class="toggle-slider"></span>
        </label>

        <label class="pref-label" for="oxy-view">{$t('oxygen.defaultView')}<SettingHint k="oxygen.defaultViewHelp" labelKey="oxygen.defaultView" /></label>
        <select id="oxy-view" class="pref-select" value={$preferences.oxygenView}
          onchange={(e) => preferences.update((p) => ({ ...p, oxygenView: (e.target as HTMLSelectElement).value as OxygenViewMode }))}>
          <option value="detail">{$t('oxygen.detailsTable')}</option>
          <option value="album">Albums (groupé)</option>
          <option value="grid">Grille de pochettes</option>
        </select>
      </div>
      <p class="settings-note">{$t('oxygen.description')}</p>

      {#if $preferences.oxygenEnabled}
      <div class="pref-grid" style="margin-top: 6px;" class:lv-hidden={!lvOk('library.oxygenFacets')}>
        <label class="pref-label">{$t('oxygen.facetsLabel')}<SettingHint k="oxygen.facetsHelp" labelKey="oxygen.facetsLabel" /></label>
        <div style="display:flex;flex-wrap:wrap;gap:10px 16px;">
          {#each OXYGEN_FACETS_ALL as f}
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--tune-text-secondary);cursor:pointer;">
              <input type="checkbox" checked={$preferences.oxygenFacets.includes(f)}
                onchange={(e) => preferences.update((p) => {
                  const on = (e.target as HTMLInputElement).checked;
                  const s = new Set(p.oxygenFacets);
                  if (on) s.add(f); else s.delete(f);
                  return { ...p, oxygenFacets: OXYGEN_FACETS_ALL.filter((x) => s.has(x)) };
                })} />
              {$t('oxygen.facet.' + f)}
            </label>
          {/each}
        </div>
      </div>
      <div class="pref-grid" style="margin-top: 6px;" class:lv-hidden={!lvOk('library.oxygenFacetLimit')}>
        <label class="pref-label" for="oxy-facet-limit">{$t('oxygen.facetValues')}<SettingHint k="oxygen.facetHelp" labelKey="oxygen.facetValues" /></label>
        <select id="oxy-facet-limit" class="pref-select" value={String($preferences.oxygenFacetLimit)}
          onchange={(e) => preferences.update((p) => ({ ...p, oxygenFacetLimit: Number((e.target as HTMLSelectElement).value) }))}>
          <option value="50">{$t('oxygen.facet50')}</option>
          <option value="100">100</option>
          <option value="200">200</option>
          <option value="500">500</option>
          <option value="0">{$t('oxygen.facetAll')}</option>
        </select>
      </div>
      <div class="settings-actions">
        <button class="action-btn" onclick={() => activeView.set('oxygen')}>{$t('oxygen.open')}</button>
      </div>
      {/if}
    </section>

    <!-- Enrichment -->
    {#if config}
    <section class="settings-section" class:lv-hidden={!lvAny('library.batchEnrich', 'library.enrichArtwork', 'library.discogsToken', 'library.writeTags')}>
      <h3>{$t('settings.enrichment')}</h3>

      <!-- 1) Métadonnées (MusicBrainz) — bouton unique avec barre de progression -->
      <h4 class="enrich-group-title">{$t('settings.enrichMetadataTitle')}</h4>
      <div class="settings-actions">
        <button class="action-btn" onclick={startBatchEnrich} disabled={batchEnrichRunning}>
          {#if batchEnrichRunning}
            {$t('settings.batchEnrichRunning').replace('{current}', String(batchEnrichCurrent)).replace('{total}', String(batchEnrichTotal))}
          {:else}
            {$t('settings.batchEnrich')}
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
      <p class="settings-note">{$t('settings.enrichMetadataNote')}</p>

      <!-- 2) Pochettes & images -->
      <h4 class="enrich-group-title">{$t('settings.enrichArtworkTitle')}</h4>
      <div class="settings-actions">
        <button class="action-btn" onclick={async () => { await api.triggerEnrich(); enrichMsg = $t('settings.enrichStarted'); setTimeout(() => enrichMsg = '', 3000); }}>
          {$t('settings.enrichNow')}
        </button>
        <button class="action-btn" style="margin-left: 8px;" onclick={startEnrichArtistImages} disabled={artistImgRunning}>
          {$t('settings.enrichArtistImages')}
        </button>
        {#if enrichMsg}<span class="action-feedback">{enrichMsg}</span>{/if}
      </div>
      {#if artistImgRunning}
        <div class="enrich-progress" style="margin-top: 8px;">
          <div class="enrich-progress-bar">
            <div class="enrich-progress-fill" style="width: {artistImgTotal > 0 ? Math.min(100, Math.round((artistImgProcessed / artistImgTotal) * 100)) : 8}%"></div>
          </div>
          <span class="enrich-progress-text">
            {#if artistImgTotal > 0}
              {artistImgProcessed} / {artistImgTotal} · {$t('settings.enrichArtistImagesRemaining').replace('{n}', String(artistImgRemaining))}
            {:else}
              {$t('settings.enrichArtistImagesWorking')} · {$t('settings.enrichArtistImagesRemaining').replace('{n}', String(artistImgRemaining))}
            {/if}
          </span>
        </div>
      {/if}
      <p class="settings-note">{$t('settings.enrichArtworkNote')}</p>
      <div class="pref-grid" style="margin-top: 8px;" class:lv-hidden={!lvOk('library.discogsToken')}>
        <label class="pref-label">{$t('settings.discogsToken')}<SettingHint k="settings.discogsTokenHelp" labelKey="settings.discogsToken" /></label>
        <span class="pref-value">
          {#if config.discogs_token_set}
            <span class="badge-ok">{$t('settings.discogsTokenSet')}</span>
          {:else}
            <span class="badge-warn">{$t('settings.discogsTokenNotSet')}</span>
          {/if}
        </span>
      </div>
      <p class="settings-note" class:lv-hidden={!lvOk('library.discogsToken')}>{$t('settings.discogsFallbackNote')}</p>
      <p class="settings-note" class:lv-hidden={!lvOk('library.discogsToken')}>{$t('settings.discogsEnvHint')}</p>

      <!-- 3) Fichiers — action qui modifie les fichiers sur disque -->
      <h4 class="enrich-group-title" class:lv-hidden={!lvOk('library.writeTags')}>{$t('settings.enrichFilesTitle')}</h4>
      <div class="settings-actions" class:lv-hidden={!lvOk('library.writeTags')}>
        <button class="action-btn" onclick={async () => { await api.writeAllTags(); enrichMsg = $t('settings.writeTagsStarted'); setTimeout(() => enrichMsg = '', 5000); }}>
          {$t('settings.writeTags')}
        </button>
      </div>
      <p class="settings-note settings-note-warn" class:lv-hidden={!lvOk('library.writeTags')}>{$t('settings.writeTagsWarning')}</p>

      <p class="settings-note">{$t('settings.autoEnrichPremiumNote')}</p>
    </section>
    {/if}
    {/if}

    <!-- L'UI d'avancement de l'analyse acoustique était introuvable, enfouie
         en bas de Bibliothèque → Métadonnées (Bertrand, 12/08) : onglet dédié
         « CLAP » demandé explicitement. Bloc DÉPLACÉ ici, pas dupliqué. -->
    {#if settingsTab === 'clap'}
    {#if config}
    <section class="settings-section">
      <h3>{$t('settings.tabClap' as any)}</h3>
      <p class="settings-note">{$t('settings.acousticAnalysisHelp')}</p>
      <div class="pref-grid">
        <!-- Prérequis de la recherche par ambiance. Le serveur sait lire et
             écrire ce réglage depuis toujours, mais rien ne l'exposait : l'écran
             Ambiance restait donc vide sans qu'aucun geste ne puisse y remédier
             (retour Fabien). -->
        <label class="pref-label">{$t('settings.acousticAnalysis')}<SettingHint k="settings.acousticAnalysisHelp" labelKey="settings.acousticAnalysis" /></label>
        <label class="toggle-switch">
          <input type="checkbox" checked={config.audio_embedding_enabled === true || config.audio_embedding_enabled === 'true'} onchange={async (e) => { const val = (e.target as HTMLInputElement).checked; if (!config) return; config.audio_embedding_enabled = val; await api.updateConfig({ audio_embedding_enabled: val }); await refreshAcousticStatus(); }} />
          <span class="toggle-slider"></span>
        </label>

        <!-- Combien de machine l'analyse a le droit de prendre. Elle décode dix
             secondes par piste et fait tourner un réseau dessus : sur un
             Raspberry Pi, ou sur le serveur qui sert aussi la musique, la
             cadence par défaut se remarque. -->
        {#if $acousticEnabled}
          <label class="pref-label" for="acoustic-throttle">{$t('acoustic.throttle')}<SettingHint k="acoustic.throttleHelp" labelKey="acoustic.throttle" /></label>
          <select id="acoustic-throttle" class="pref-select"
                  value={$acousticStatus?.throttle ?? 'equilibre'}
                  onchange={async (e) => { await api.updateConfig({ audio_embedding_throttle: (e.target as HTMLSelectElement).value }); await refreshAcousticStatus(); }}>
            <option value="eco">{$t('acoustic.throttleEco')}</option>
            <option value="equilibre">{$t('acoustic.throttleBalanced')}</option>
            <option value="rapide">{$t('acoustic.throttleFast')}</option>
          </select>

          <span class="pref-label">{$t('acoustic.progress')}</span>
          <AcousticProgress />
        {/if}
      </div>
    </section>
    {/if}
    {/if}

    {#if settingsTab === 'general'}
    <!-- Preferences -->
    <section class="settings-section">
      <h3>{$t('settings.interface')}</h3>
      <div class="pref-grid">
        <label class="pref-label" for="pref-theme">{$t('settings.theme')}<SettingHint k="settings.themeHelp" labelKey="settings.theme" /></label>
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

        <label class="pref-label" for="pref-lang">{$t('settings.language')}<SettingHint k="settings.languageHelp" labelKey="settings.language" /></label>
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

        <label class="pref-label" for="pref-startup">{$t('settings.startupView')}<SettingHint k="settings.startupViewHelp" labelKey="settings.startupView" /></label>
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

        <label class="pref-label" for="pref-zone">{$t('settings.defaultZone')}<SettingHint k="settings.defaultZoneHelp" labelKey="settings.defaultZone" /></label>
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

        <label class="pref-label" for="pref-volume" class:lv-hidden={!lvOk('general.volumeDisplay')}>{$t('settings.volumeDisplay')}<SettingHint k="settings.volumeDisplayHelp" labelKey="settings.volumeDisplay" /></label>
        <select id="pref-volume" class="pref-select" class:lv-hidden={!lvOk('general.volumeDisplay')} value={$preferences.volumeDisplay}
          onchange={(e) => {
            const volumeDisplay = (e.target as HTMLSelectElement).value as VolumeDisplay;
            preferences.update((p) => ({ ...p, volumeDisplay }));
          }}>
          <option value="percent">{$t('settings.percent')}</option>
          <option value="dB">{$t('settings.decibels')}</option>
        </select>

        <label class="pref-label" for="pref-tooltips">{$t('settings.tooltips')}</label>
        <select id="pref-tooltips" class="pref-select" value={$preferences.tooltipsEnabled ? 'on' : 'off'}
          onchange={(e) => {
            const tooltipsEnabled = (e.target as HTMLSelectElement).value === 'on';
            preferences.update((p) => ({ ...p, tooltipsEnabled }));
          }}>
          <option value="on">{$t('settings.tooltipsOn')}</option>
          <option value="off">{$t('settings.tooltipsOff')}</option>
        </select>
        <p class="pref-hint">{$t('settings.tooltipsHint')}</p>
      </div>
    </section>

    <!-- Champs de métadonnées : un SEUL éditeur, dans l'onglet Bibliothèque
         (« Metadata Fields Configuration »). Il y en avait un second ici,
         branché sur $displayFields pendant que l'autre lisait field.enabled —
         deux cases pour le même champ qui pouvaient diverger jusqu'au reload. -->
    {/if}

    {#if settingsTab === 'services'}
    <!-- Services & Tokens bridge — the page was orphaned from navigation
         (forum #1113) and its entry here only said « Last.fm », so nobody
         looking for the Discogs/Genius/ListenBrainz tokens ever clicked it
         (Bertrand). Name every token service it actually hosts. -->
    <section class="settings-section" class:lv-hidden={!lvOk('services.tokensBridge')}>
      <h3>Services &amp; Tokens</h3>
      <p class="settings-note">{$t('settings.serviceTokensBridgeHelp' as any)}</p>
      <div class="service-list">
        <div class="service-card">
          <div class="service-header">
            <span class="service-name">MusicBrainz · Discogs · Last.fm · Genius · ListenBrainz</span>
            <div class="service-header-actions">
              <button class="scan-btn" onclick={() => activeView.set('services')}>Services &amp; Tokens →</button>
            </div>
          </div>
        </div>
      </div>
    </section>
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
                        <button class="disconnect-btn" onclick={handleYoutubeDisconnect} use:tip={'tip.disconnectAccount'}>{$t('settings.disconnect')}</button>
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
                  <div class="service-auth-form" class:lv-hidden={!lvOk('services.deezerArl')}>
                    <p class="auth-hint">{$t('settings.deezerArlHint')}</p>
                    <input
                      class="auth-input"
                      type="password"
                      autocomplete="off"
                      bind:value={deezerArl}
                      placeholder={$t('settings.deezerArlPlaceholder')}
                    />
                    {#if deezerAuthError}
                      <p class="auth-error">{deezerAuthError}</p>
                    {/if}
                    <button
                      class="scan-btn"
                      onclick={handleDeezerAuth}
                      disabled={deezerAuthLoading || !deezerArl.trim()}
                    >
                      {#if deezerAuthLoading}
                        <div class="spinner small"></div>
                        {$t('settings.connecting')}
                      {:else}
                        {$t('settings.deezerConnect')}
                      {/if}
                    </button>
                  </div>
                {:else if name === 'youtube'}
                  <div class="service-auth-form">
                    {#if youtubeVerificationUrl}
                      <p class="auth-hint">{$t('settings.youtubeLink')}</p>
                      {#if youtubeUserCode}
                        <p class="yt-user-code" title={$t('settings.youtubeCopyCode')} onclick={async () => { if (await copyText(youtubeUserCode ?? '')) notifications.success($t('settings.youtubeCopied')); else notifications.error($t('settings.copyFailed')); }}>{youtubeUserCode}</p>
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

        <!-- YouTube playback (managed yt-dlp helper) -->
        <div class="yt-playback" class:lv-hidden={!lvOk('services.youtubePlayback')}>
          <div class="yt-playback-head">
            <span class="yt-playback-title">{$t('settings.youtubePlaybackTitle')}</span>
            {#if ytPlaybackInstalled}
              <span class="badge-ok">{$t('settings.youtubePlaybackReady')}{ytPlaybackVersion ? ` (${ytPlaybackVersion})` : ''}</span>
            {/if}
          </div>
          <p class="settings-note">{$t('settings.youtubePlaybackHelp')}</p>
          {#if !ytPlaybackInstalled}
            <button class="action-btn" onclick={enableYoutubePlayback} disabled={ytPlaybackBusy}>
              {#if ytPlaybackBusy}
                <div class="spinner small"></div>
                {$t('settings.youtubePlaybackDownloading')}
              {:else}
                {$t('settings.youtubePlaybackEnable')}
              {/if}
            </button>
          {/if}
          {#if ytPlaybackStatus.startsWith('failed')}
            <p class="auth-error">{ytPlaybackStatus}</p>
          {/if}
        </div>
    </section>

    <!-- Spotify Connect (receiver) -->
    {#if spotifyConnect}
      <section class="settings-section" class:lv-hidden={!lvOk('services.spotifyConnect')}>
        <h3>Spotify Connect</h3>
        <p class="section-hint">
          {$t('settings.spotifyConnectHint')}
        </p>

        {#if !spotifyConnect.binary_available}
          <p class="auth-error">
            {$t('settings.librespotNotDetected')} (<code>brew install librespot</code> /
            <code>apt install librespot</code>).
          </p>
        {:else}
          <div class="form-row">
            <label for="sc-zone">{$t('settings.targetZone')}</label>
            <select id="sc-zone" bind:value={spotifyConnectZoneId} disabled={spotifyConnect.enabled || spotifyConnectBusy}>
              <option value={null}>—</option>
              {#each $zones as z (z.id)}
                <option value={z.id}>{z.name}</option>
              {/each}
            </select>
          </div>
          <div class="form-row">
            <label for="sc-name">{$t('settings.deviceNameOptional')}</label>
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
                {$t('settings.pleaseWait')}
              {:else if spotifyConnect.enabled}
                {$t('settings.disable')}
              {:else}
                {$t('settings.enable')}
              {/if}
            </button>
            {#if spotifyConnect.enabled}
              <span class="status-pill" class:active={spotifyConnect.active}>
                {spotifyConnect.active ? '● ' + $t('settings.playing') : '○ ' + $t('settings.waiting')}
              </span>
            {/if}
          </div>
        {/if}
      </section>
    {/if}

    <!-- Zone auto-create -->
    {#if config}
      <section class="settings-section" class:lv-hidden={!lvOk('services.zoneAutoCreate')}>
        <h3>{$t('settings.zoneAutoCreate' as any)}</h3>
        <div class="pref-grid">
          <label class="pref-label">{$t('settings.zoneAutoCreateLabel' as any)}<SettingHint k="settings.zoneAutoCreateHint" labelKey="settings.zoneAutoCreateLabel" /></label>
          <label class="toggle-switch">
            <input type="checkbox" checked={config.zone_auto_create ?? true} onchange={async (e) => { const val = (e.target as HTMLInputElement).checked; if (!config) return; config.zone_auto_create = val; await api.updateConfig({ zone_auto_create: val }); }} />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </section>
    {/if}

    <!-- Follow me: pause the zone you leave when switching zones (client pref) -->
    <section class="settings-section" class:lv-hidden={!lvOk('services.followMe')}>
      <h3>{$t('settings.followMe' as any)}</h3>
      <div class="pref-grid">
        <label class="pref-label">{$t('settings.followMeLabel' as any)}<SettingHint k="settings.followMeHint" labelKey="settings.followMeLabel" /></label>
        <label class="toggle-switch">
          <input type="checkbox" bind:checked={$followMe} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </section>

    <!-- Zone audio settings (DSD mode, gapless, fixed volume) -->
    {#if $zones.length > 0}
      <section class="settings-section" class:lv-hidden={!lvAny('services.perZoneLyricsOffset', 'services.perZoneFixedVolume', 'services.perZoneDsdMode', 'services.perZoneMaxSampleRate', 'services.zoneAdvanced')}>
        <h3>{$t('settings.perZoneSettings')}</h3>
        <p class="section-hint">{$t('settings.perZoneHint')}</p>
        <div class="zone-settings-list">
          {#each [{ key: 'local', label: $t('settings.zoneGroupLocal') }, { key: 'network', label: $t('settings.zoneGroupNetwork') }] as grp (grp.key)}
            {@const groupZones = $zones.filter((z) => (grp.key === 'local' ? isLocalZone(z) : !isLocalZone(z)))}
            {#if groupZones.length}
              <div class="zone-group-header">{grp.label}</div>
              {#each groupZones as z (z.id)}
                {@const badge = zoneBadge(z.output_type)}
                {@const hint = zoneDeviceHint(z)}
                <div class="zone-card">
                  <div class="zone-card-head">
                    <span class="zone-card-name">{z.name}</span>
                    <span class="zone-badge zone-badge-{badge.cls}">{badge.label}</span>
                    {#if hint}<span class="zone-card-dev">{hint}</span>{/if}
                    {#if !isLocalZone(z)}
                      <span class="zone-online" class:offline={z.online === false}>
                        <span class="zone-online-dot"></span>{z.online === false ? $t('settings.zoneOffline') : $t('settings.zoneOnline')}
                      </span>
                    {/if}
                  </div>
                  <div class="zone-card-row">
                    <label class="zone-setting-label" class:lv-hidden={!lvOk('services.perZoneDsdMode')}>
                      <span>DSD</span>
                      <select
                        class="zone-select"
                        value={z.dsd_mode ?? 'auto'}
                        onchange={async (e) => {
                          const mode = (e.target as HTMLSelectElement).value;
                          if (z.id == null) return;
                          await api.updateZoneDsdMode(z.id, mode);
                        }}
                      >
                        <option value="auto">Auto</option>
                        <option value="native">{$t('settings.dsdNative')}</option>
                        <option value="dop">DoP</option>
                        <option value="pcm">{$t('settings.dsdPcm')}</option>
                      </select>
                    </label>
                    <label class="zone-setting-label" class:lv-hidden={!lvOk('services.perZoneLyricsOffset')} title={$t('settings.lyricsOffsetHint' as any)}>
                      <span>{$t('settings.lyricsOffset' as any)}</span>
                      <select
                        class="zone-select"
                        value={String(z.lyrics_offset_ms ?? 0)}
                        onchange={async (e) => {
                          const ms = Number((e.target as HTMLSelectElement).value);
                          if (z.id == null) return;
                          z.lyrics_offset_ms = ms;
                          await api.updateZoneLyricsOffset(z.id, ms);
                        }}
                      >
                        {#each [0, 1000, 2000, 3000, 4000, 5000, 7000, 10000, 15000, 20000] as ms}
                          <option value={String(ms)}>{ms === 0 ? $t('settings.lyricsOffsetNone' as any) : `+${ms / 1000} s`}</option>
                        {/each}
                      </select>
                    </label>
                    <label class="zone-setting-label" class:lv-hidden={!lvOk('services.perZoneMaxSampleRate')} title={$t('settings.maxSampleRateHint')}>
                      <span>{$t('settings.maxSampleRate')}</span>
                      <select
                        class="zone-select"
                        value={String(z.max_sample_rate ?? 0)}
                        onchange={async (e) => {
                          const v = Number((e.target as HTMLSelectElement).value);
                          if (z.id == null) return;
                          await api.updateZoneMaxSampleRate(z.id, v > 0 ? v : null);
                        }}
                      >
                        <option value="0">{$t('settings.maxSampleRateNone')}</option>
                        <option value="48000">48 kHz</option>
                        <option value="88200">88.2 kHz</option>
                        <option value="96000">96 kHz</option>
                        <option value="176400">176.4 kHz</option>
                        <option value="192000">192 kHz</option>
                        <option value="352800">352.8 kHz</option>
                        <option value="384000">384 kHz</option>
                        <option value="705600">705.6 kHz</option>
                        <option value="1411200">1411.2 kHz</option>
                      </select>
                    </label>
                    <!-- Le serveur gérait ce réglage depuis toujours, mais
                         aucun écran ne l'exposait : le commentaire du bloc le
                         promettait, le contrôle n'existait pas. Or c'est LA
                         condition du DoP qui survit — sans lui, un volume à
                         100 % est rabaissé à 20 % à chaque redémarrage par le
                         garde-fou anti-réveil (tune-server-rust#1616, Cyrille
                         forum 1320). Activer épingle aussi le volume à 100 %
                         en base : on le reflète localement sans attendre. -->
                    <label class="zone-setting-label zone-setting-checkbox" title={$t('settings.fixedVolumeHint')}>
                      <input
                        type="checkbox"
                        checked={z.fixed_volume ?? false}
                        onchange={async (e) => {
                          const input = e.target as HTMLInputElement;
                          const enabled = input.checked;
                          if (z.id == null) return;
                          // Sur une zone RÉSEAU, activer envoie 100 % à
                          // l'appareil lui-même (SetVolume au renderer) :
                          // l'ampli part à fond — vécu par Cyrille sur son
                          // Yamaha (forum 1320, réponse #21), très
                          // désagréable et risqué pour les enceintes. On
                          // demande confirmation AVANT, en nommant la
                          // conséquence. Sur une zone locale, rien à
                          // confirmer : 100 % logiciel est justement le but.
                          if (enabled && !isLocalZone(z)) {
                            const ok = await dialogs.confirm($t('settings.fixedVolumeNetConfirm'), { danger: true });
                            if (!ok) {
                              input.checked = false;
                              return;
                            }
                          }
                          z.fixed_volume = enabled;
                          if (enabled) z.volume = 100;
                          await api.updateZoneFixedVolume(z.id, enabled);
                        }}
                      />
                      <span>{$t('settings.fixedVolume')}</span>
                    </label>
                  </div>
                  {#if dopCappedToPcm(z)}
                    <p class="zone-warn">{$t('settings.maxSampleRateDsdCap')}</p>
                  {/if}
                  {#if dsdWantsBitPerfect(z)}
                    {#if (z.volume ?? 100) < 100}
                      <p class="zone-warn">{$t('settings.dsdDspVolume')}</p>
                    {/if}
                    {#if replayGainMode !== 'off'}
                      <p class="zone-warn">{$t('settings.dsdDspReplayGain')}</p>
                    {/if}
                    {#if z.id != null && zoneEqEnabled[z.id]}
                      <p class="zone-warn">{$t('settings.dsdDspEq')}</p>
                    {/if}
                  {/if}
                  {#if zoneHasAdvanced(z)}
                    <details class="zone-adv" class:lv-hidden={!lvOk('services.zoneAdvanced')}>
                      <summary class="zone-adv-summary">{$t('settings.zoneAdvanced')}</summary>
                      <div class="zone-adv-body">
                        {#if ['dlna', 'openhome'].includes(z.output_type ?? '')}
                          <!-- Coherent per-renderer panel: discovery check + format
                               overrides (FLAC/WAV/LPCM/16-bit) with the server's
                               precedence. Owns LPCM + 16-bit, so no standalone
                               duplicate checkboxes here. -->
                          <RendererConfig zone={z} />
                        {:else}
                          <label class="zone-setting-label zone-setting-checkbox" title={$t('settings.alacPassthroughHint')}>
                            <input
                              type="checkbox"
                              checked={z.alac_passthrough ?? false}
                              onchange={async (e) => {
                                if (z.id == null) return;
                                await api.updateZoneAlacPassthrough(z.id, (e.target as HTMLInputElement).checked);
                              }}
                            />
                            <span>{$t('settings.alacPassthrough')}</span>
                          </label>
                          <label class="zone-setting-label zone-setting-checkbox" title={$t('settings.dlnaLpcmHint')}>
                            <input
                              type="checkbox"
                              checked={z.dlna_lpcm ?? false}
                              onchange={async (e) => {
                                if (z.id == null) return;
                                await api.updateZoneDlnaLpcm(z.id, (e.target as HTMLInputElement).checked);
                              }}
                            />
                            <span>{$t('settings.dlnaLpcm')}</span>
                          </label>
                        {/if}
                      </div>
                    </details>
                  {/if}
                </div>
              {/each}
            {/if}
          {/each}
        </div>
      </section>
    {/if}

    <!-- Squeezebox / Lyrion Music Server -->
    {#if config}
      <section class="settings-section" class:lv-hidden={!lvOk('services.squeezebox')}>
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
      <section class="settings-section" class:lv-hidden={!lvOk('services.hqplayer')}>
        <h3>HQPlayer</h3>
        <p class="section-hint">{$t('settings.hqplayerHint')}</p>

        <div class="setting-row">
          <div class="setting-label">
            <span>{$t('settings.enableHqplayer')}</span>
          </div>
          <label class="toggle">
            <input type="checkbox" checked={hqplayerEnabled} onchange={() => toggleHqplayer()} disabled={hqplayerSaving} />
            <span class="toggle-slider"></span>
          </label>
        </div>

        {#if hqplayerEnabled}
          <div class="setting-row" style="margin-top: 0.5rem;">
            <div class="setting-label">
              <span>{$t('settings.hqplayerIp')}</span>
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
                {hqplayerSaving ? $t('settings.saving') : $t('common.save')}
              </button>
            </div>
          </div>

          <div class="setting-row" style="margin-top: 0.5rem;">
            <div class="setting-label">
              <span>{$t('settings.status')}</span>
            </div>
            <div>
              {#if hqplayerChecking}
                <div class="spinner small"></div>
              {:else if hqplayerReachable === true}
                <span class="squeezebox-status-badge connected">{$t('settings.connected')}</span>
                <span class="muted" style="margin-left: 8px;">HQPlayer @ {hqplayerStatusHost}:{hqplayerStatusPort}</span>
              {:else if hqplayerReachable === false}
                <span class="squeezebox-status-badge disconnected">{$t('settings.unreachable')}</span>
                {#if hqplayerStatusMessage}
                  <span class="muted" style="margin-left: 8px;">{hqplayerStatusMessage}</span>
                {/if}
              {:else}
                <span class="muted">{$t('settings.notTested')}</span>
              {/if}
              <button class="scan-btn small" onclick={checkHqplayer} disabled={hqplayerChecking} style="margin-left: 8px;">
                {$t('settings.testConnection')}
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
    <section class="settings-section" class:lv-hidden={!lvOk('system.configExportImport')}>
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

    <section class="settings-section" class:lv-hidden={!lvOk('system.exportCsv')}>
      <h3>{$t('settings.exportCsv')}</h3>
      <p class="section-hint">{$t('settings.exportCsvHint')}</p>
      <div class="db-ie-actions">
        <button class="btn-secondary" onclick={async () => { csvExporting = 'albums'; try { await api.exportAlbumsCsv(); } catch (e) { notifications.error($t('common.error') + ' : ' + (errText(e) ?? $t('common.serverUnreachable'))); } finally { csvExporting = null; } }} disabled={csvExporting !== null}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {csvExporting === 'albums' ? $t('settings.exportInProgress') : $t('settings.albums') + ' (CSV)'}
        </button>
        <button class="btn-secondary" onclick={async () => { csvExporting = 'tracks'; try { await api.exportTracksCsv(); } catch (e) { notifications.error($t('common.error') + ' : ' + (errText(e) ?? $t('common.serverUnreachable'))); } finally { csvExporting = null; } }} disabled={csvExporting !== null}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {csvExporting === 'tracks' ? $t('settings.exportInProgress') : $t('settings.tracks') + ' (CSV)'}
        </button>
        <button class="btn-secondary" onclick={async () => { csvExporting = 'artists'; try { await api.exportArtistsCsv(); } catch (e) { notifications.error($t('common.error') + ' : ' + (errText(e) ?? $t('common.serverUnreachable'))); } finally { csvExporting = null; } }} disabled={csvExporting !== null}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {csvExporting === 'artists' ? $t('settings.exportInProgress') : $t('settings.artists') + ' (CSV)'}
        </button>
      </div>
    </section>
    {/if}

    {#if settingsTab === 'library'}
    <!-- Metadata Fields Configuration -->
    <section class="settings-section" class:lv-hidden={!lvOk('library.metadataFields')}>
      <h3>{$t('metadata.title')}</h3>
      <p class="meta-fields-hint">{$t('settings.metaFieldsHint')}</p>
      {#if !metadataLoading && metadataCategories.length > 0}
        <button
          type="button"
          class="meta-fields-selectall"
          onclick={() => setAllMetadataFields(!allMetadataFieldsEnabled)}
        >
          {allMetadataFieldsEnabled
            ? $t('settings.metaFieldsDeselectAll')
            : $t('settings.metaFieldsSelectAll')}
        </button>
      {/if}
      {#if metadataLoading}
        <div class="loading"><div class="spinner small"></div> {$t('common.loading')}</div>
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
          <div class="cloud-row"><div class="spinner small"></div> {$t('common.loading')}</div>
        {:else if cloudSsoEmail}
          <div class="cloud-row">
            {#if cloudSsoAvatar}
              <img src={cloudSsoAvatar} alt="" class="cloud-avatar" />
            {:else}
              <span class="cloud-status-dot connected"></span>
            {/if}
            <span class="cloud-status-text">{$t('settings.connectedAs')} <strong>{cloudSsoName || cloudSsoEmail}</strong></span>
            <button class="scan-btn small danger-btn" onclick={cloudSsoDisconnect} disabled={cloudSsoDisconnecting}>
              {cloudSsoDisconnecting ? $t('common.loading') : $t('settings.signOut')}
            </button>
          </div>
        {:else if cloudSsoConfigured}
          <div class="cloud-row">
            <span class="cloud-status-dot disconnected"></span>
            <span class="cloud-status-text">{$t('settings.notConnected')}</span>
            <button class="scan-btn small" onclick={cloudSsoConnect}>{$t('settings.signIn')}</button>
          </div>
        {:else}
          <div class="cloud-row">
            <span class="cloud-status-dot disconnected"></span>
            <span class="cloud-status-text">{$t('settings.cloudComingSoon')}</span>
            <span style="margin-left:0.5em;font-size:0.85em"><a href="https://mozaiklabs.fr" target="_blank" rel="noopener noreferrer" style="color:var(--tune-accent)">{$t('settings.learnMore')}</a></span>
          </div>
        {/if}
      </div>

      <!-- Telemetry -->
      <div class="cloud-subsection" class:lv-hidden={!lvOk('system.telemetry')}>
        <div class="cloud-toggle-row">
          <div class="cloud-toggle-label">
            <span>{$t('settings.telemetry')}</span>
            <span class="cloud-toggle-hint">{$t('settings.telemetryHint')}</span>
          </div>
          <label class="cloud-toggle">
            <input type="checkbox" checked={cloudTelemetryEnabled} onchange={toggleCloudTelemetry} disabled={cloudTelemetryLoading} />
            <span class="cloud-toggle-slider"></span>
          </label>
        </div>
        {#if cloudTelemetryInstanceId}
          <div class="cloud-instance-id">{$t('settings.instance')} : <code>{cloudTelemetryInstanceId}</code></div>
        {/if}
      </div>

      <!-- Community metadata sync (opt-in). The server-side loop (resolve
           MBIDs, pull/push enrichments and Vademecum extra) shipped in
           v0.9.24 but had NO web UI — the flag was only settable via SQL. -->
      <div class="cloud-subsection" class:lv-hidden={!lvOk('system.communitySync')}>
        <div class="cloud-toggle-row">
          <div class="cloud-toggle-label">
            <span>{$t('settings.communitySync')}</span>
            <span class="cloud-toggle-hint">{$t('settings.communitySyncHint')}</span>
          </div>
          <label class="cloud-toggle">
            <input
              type="checkbox"
              checked={config?.community_sync_enabled === true || config?.community_sync_enabled === 'true'}
              onchange={async (e) => { const val = (e.target as HTMLInputElement).checked; if (!config) return; config.community_sync_enabled = val; await api.updateConfig({ community_sync_enabled: val }); }}
            />
            <span class="cloud-toggle-slider"></span>
          </label>
        </div>
      </div>

      <!-- Plugins marketplace link -->
      <div class="cloud-subsection" class:lv-hidden={!lvOk('system.browsePlugins')}>
        <button class="scan-btn" onclick={() => activeView.set('plugins')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M20 16V7a2 2 0 0 0-2-2h-3a2 2 0 0 1-2-2 2 2 0 0 0-2 2H8a2 2 0 0 0-2 2v3a2 2 0 0 1 2 2 2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h3a2 2 0 0 1 2 2 2 2 0 0 0 2-2h3a2 2 0 0 0 2-2z"/>
          </svg>
          {$t('settings.browsePlugins')}
        </button>
      </div>
    </section>

    <!-- Licence Tune Premium -->
    <section class="settings-section">
      <h3>{$t('settings.tunePremiumLicense')}</h3>

      <!-- Tier badge -->
      <div class="license-tier-row">
        {#if $isPremium}
          <span class="license-badge premium">Premium</span>
        {:else}
          <span class="license-badge free">Free</span>
        {/if}
        {#if $licenseState.expiresAt}
          <span class="license-expires">{$t('settings.expiresOn')} {new Date($licenseState.expiresAt).toLocaleDateString('fr-FR')}</span>
        {/if}
      </div>

      {#if $licenseState.sessionConflict}
        <!-- Licence flottante : active sur un autre serveur du même compte -->
        <div class="license-conflict-banner" role="status">
          <svg class="license-conflict-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          <div class="license-conflict-text">
            <strong>{$t('settings.licenseSessionConflictTitle')}</strong>
            <span>
              {#if $licenseState.sessionConflict.active_server}
                {$t('settings.licenseSessionConflictBodyNamed').replace('{server}', $licenseState.sessionConflict.active_server)}
              {:else}
                {$t('settings.licenseSessionConflictBody')}
              {/if}
            </span>
          </div>
        </div>
      {/if}

      {#if $licenseState.licenseKey}
        <!-- Active license display -->
        <div class="license-active-row">
          <span class="license-key-display">{maskLicenseKey($licenseState.licenseKey)}</span>
          <div class="license-actions">
            <button class="scan-btn small" onclick={handleValidateLicense} disabled={licenseValidating || licenseCooldown}>
              {licenseValidating ? $t('settings.validating') : $t('settings.validate')}
            </button>
            <button class="scan-btn small danger-btn" onclick={handleDeactivateLicense} disabled={licenseDeactivating}>
              {licenseDeactivating ? $t('settings.deactivating') : $t('settings.deactivate')}
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
          <button class="scan-btn" onclick={handleActivateLicense} disabled={licenseActivating || !licenseKeyInput.trim() || licenseCooldown}>
            {licenseActivating ? $t('settings.activating') : $t('settings.activate')}
          </button>
        </div>
        {#if licenseError}
          <div class="license-error">{licenseError}</div>
        {/if}
      {/if}

      <!-- Features list -->
      {#if Object.keys($licenseState.features).length > 0}
        <div class="license-features">
          <h4 class="cloud-label">{$t('settings.features')}</h4>
          <div class="license-features-grid">
            {#each Object.entries($licenseState.features) as [key, feat]}
              {@const state = !feat.enabled ? 'locked' : (feat.available === false ? 'unavail' : 'avail')}
              {@const clickable = state === 'avail' && !!FEATURE_TARGET[key]}
              <div
                class="license-feature-item"
                class:avail={state === 'avail'}
                class:unavail={state === 'unavail'}
                class:locked={state === 'locked'}
                class:clickable
                role={clickable ? 'button' : undefined}
                tabindex={clickable ? 0 : undefined}
                onclick={() => clickable && openFeature(key)}
                onkeydown={(e) => { if (clickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openFeature(key); } }}
              >
                <span class="license-feature-icon">{state === 'avail' ? '✓' : state === 'unavail' ? '✕' : '🔒'}</span>
                <span class="license-feature-name">{feat.display_name}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="license-footer">
        <a href="https://mozaiklabs.fr/pricing" target="_blank" rel="noopener noreferrer" class="license-pricing-link">
          {$t('settings.viewPricing')}
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
              {$t('settings.updateAvailable')} : <strong>v{updateInfo.latest_version}</strong>
              ({$t('settings.current')} : v{updateInfo.current_version})
            </span>
            {#if updateDmgReady}
              <span class="update-done">{$t('settings.dmgDownloadedMac')}</span>
            {:else if updateDone}
              <span class="update-done">{$t('settings.installed')}</span>
              <button
                class="update-btn"
                disabled={restarting}
                onclick={restartServerAndReload}
              >
                {restarting ? $t('settings.restarting') : $t('settings.restartServer')}
              </button>
            {:else if updateInfo.installable === false}
              <span class="update-done" title={updateInfo.install_hint ?? ''}>
                ⚠️ {$t('settings.sourceInstallNote')}
              </span>
            {:else}
              <button class="update-btn" onclick={installUpdate} disabled={updateInstalling}>
                {updateInstalling ? $t('settings.installing') : $t('settings.install')}
              </button>
            {/if}
          </div>
          {#if updateInfo.installable === false && updateInfo.install_hint}
            <div class="install-hint">{updateInfo.install_hint}</div>
          {/if}
          {#if updateRefusal}
            <div class="update-refusal">⛔ {updateRefusal}</div>
          {/if}
          {#if playingZones > 0 && updateInfo.installable !== false && !updateDone && !updateDmgReady && !updateInstalling}
            <div class="update-playing-warning">
              ⚠️ {$t('settings.updateStopsPlayback')}
            </div>
          {/if}
        {:else if clientStale}
          <div class="about-row">
            <span class="about-label">{$t('settings.updates')}</span>
            <span class="about-value" style="color: var(--tune-warning, #e0a800)">⚠️ {$t('settings.clientServerMismatch')}</span>
          </div>
        {:else}
          <div class="about-row">
            <span class="about-label">{$t('settings.updates')}</span>
            <span class="about-value" style="color: var(--tune-accent)">✓ {$t('settings.upToDate')}</span>
          </div>
        {/if}

        <!-- Diagnostics bundle (Windows-friendly support tool) -->
        <div class="about-row" style="margin-top: 0.75rem" class:lv-hidden={!lvOk('system.diagnostics')}>
          <span class="about-label">Diagnostics</span>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button
              class="scan-btn"
              onclick={downloadDiagnostics}
              disabled={diagDownloading}
              title={$t('settings.downloadDiagTitle')}
            >
              {#if diagDownloading}
                <div class="spinner small"></div>
                {$t('settings.preparing')}
              {:else}
                {$t('settings.downloadDiag')}
              {/if}
            </button>
            <button
              class="scan-btn"
              onclick={downloadLogs}
              disabled={logsDownloading}
              title={$t('settings.downloadLogsTitle')}
            >
              {#if logsDownloading}
                <div class="spinner small"></div>
              {:else}
                {$t('settings.downloadLogs')}
              {/if}
            </button>
          </div>
        </div>

        <!-- Log Level -->
        <div class="about-row" style="margin-top: 0.75rem" class:lv-hidden={!lvOk('system.logLevel')}>
          <span class="about-label">{$t('settings.logLevel')}</span>
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
        <div class="about-row" style="margin-top: 0.75rem" class:lv-hidden={!lvOk('system.apiDocs')}>
          <span class="about-label">{$t('settings.apiDocs' as any)}</span>
          <!-- Points at the live endpoint catalog. The old "/docs" path had no
               server route, so the SPA fallback served index.html → the link
               dead-ended back on Home (forum #1186). This endpoint exists,
               renders as JSON in-browser, and the tune_session cookie carries
               auth on the new-tab navigation when auth is enabled. -->
          <a
            class="scan-btn"
            href="/api/v1/system/api-docs"
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

    <!-- Indice de découvrabilité (#1617) : ce que le niveau courant masque
         dans CET onglet, avec le geste pour le révéler. Les réglages modifiés
         ne comptent pas — la règle d'or les laisse visibles. -->
    {#if hiddenInCurrentTab > 0 && settingsLevel !== 'expert'}
      <p class="hidden-settings-hint">
        {$t('settings.hiddenSettingsCount' as any).replace('{n}', String(hiddenInCurrentTab))}
        <button class="hidden-settings-raise" onclick={() => setSettingsLevel(nextLevel(settingsLevel))}>
          {$t('settings.hiddenSettingsRaise' as any)}
        </button>
      </p>
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
  /* Barre d'onglets figée au défilement (#1237, Jean). */
  .settings-tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 4px;
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--tune-bg);
    margin-top: calc(-1 * var(--space-lg));
    padding-top: var(--space-lg);
    padding-bottom: 8px;
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

  /* Même traitement visuel que .install-hint : c'est le même registre — une
     conséquence à connaître avant de cliquer, pas une erreur. */
  /* Refus explicite du serveur : doit se lire, pas se deviner (#412). */
  .update-refusal {
    margin-top: 8px;
    padding: 8px 10px;
    border-radius: var(--radius-sm, 6px);
    background: rgba(229, 72, 77, 0.12);
    border: 1px solid var(--tune-error, #e5484d);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 12.5px;
    line-height: 1.45;
  }

  .update-playing-warning {
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

  /* Sous le sélecteur, sur toute la largeur de la grille : une phrase qui dit
     à quoi sert le réglage, là où le libellé seul ne suffit pas. */
  .pref-hint {
    grid-column: 1 / -1;
    margin: calc(-1 * var(--space-sm)) 0 0;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    opacity: 0.85;
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

  .scan-report {
    margin: 8px 0 12px;
    padding: 12px 14px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md, 8px);
    background: var(--tune-surface, rgba(127, 127, 127, 0.06));
    font-size: 13px;
  }
  .scan-report-head {
    font-weight: 600;
    margin-bottom: 6px;
  }
  .scan-report-counts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    opacity: 0.85;
  }
  .scan-report-counts .warn { color: var(--tune-warning, #e0a030); }
  .scan-report-warning {
    margin-top: 10px;
    padding: 8px 10px;
    border-left: 3px solid var(--tune-warning, #e0a030);
    background: rgba(224, 160, 48, 0.08);
    border-radius: 4px;
  }
  .scan-report-warning-title { font-weight: 600; margin-bottom: 4px; }
  .scan-report-warning ul,
  .scan-report-failed ul {
    margin: 4px 0 0;
    padding-left: 18px;
    word-break: break-all;
    opacity: 0.85;
  }
  .scan-report-failed { margin-top: 10px; }
  .scan-report-failed summary { cursor: pointer; color: var(--tune-warning, #e0a030); }

  .scan-progress-panel {
    margin: 8px 0 12px;
    padding: 12px 14px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md, 8px);
    background: var(--tune-surface, rgba(127, 127, 127, 0.06));
  }
  .scan-progress-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .scan-progress-phase { margin-right: auto; }
  .scan-stop-btn {
    border: 1px solid var(--tune-border);
    background: transparent;
    color: var(--tune-text, inherit);
    padding: 3px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 12px;
    white-space: nowrap;
  }
  .scan-stop-btn:hover:not(:disabled) {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }
  .scan-stop-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .scan-progress-phase { font-size: 13px; font-weight: 600; color: var(--tune-text); }
  .scan-progress-pct { font-size: 13px; font-weight: 700; color: var(--tune-accent); font-variant-numeric: tabular-nums; }
  .scan-progress-bar {
    height: 6px;
    border-radius: 3px;
    background: var(--tune-border);
    overflow: hidden;
    position: relative;
  }
  .scan-progress-fill {
    height: 100%;
    background: var(--tune-accent);
    border-radius: 3px;
    transition: width 0.3s ease-out;
  }
  .scan-progress-bar.indeterminate .scan-progress-fill {
    width: 35%;
    position: absolute;
    animation: scan-indeterminate 1.2s ease-in-out infinite;
  }
  @keyframes scan-indeterminate {
    0% { left: -35%; }
    100% { left: 100%; }
  }
  .scan-progress-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin-top: 8px;
    font-size: 12px;
    color: var(--tune-text-secondary);
    font-variant-numeric: tabular-nums;
  }

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
  .enrich-group-title {
    margin: var(--space-lg) 0 var(--space-sm);
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-secondary, var(--text-muted));
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .settings-note-warn {
    color: var(--warning, var(--text-warning, #d08b2c));
  }
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
    display: flex;
    gap: 6px;
  }
  .peer-add {
    display: flex;
    gap: 8px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .peer-add .auth-input {
    flex: 1;
    min-width: 160px;
  }
  .peer-add .peer-add-port {
    flex: 0 0 90px;
    min-width: 0;
  }

  .server-url {
    font-family: monospace;
    font-size: 14px;
    user-select: all;
  }

  .wifi-subtitle {
    margin: 16px 0 8px;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--tune-text-secondary, #888);
  }

  /* Appliance WiFi section */
  .wifi-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .wifi-item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    /* Fallback translucide : --tune-bg-secondary n'existe pas dans le thème,
       un fallback clair (#f5f5f5) rendait le SSID blanc sur blanc (Stéphane) */
    background: var(--tune-bg-secondary, rgba(255, 255, 255, 0.05));
    border-radius: 8px;
  }
  .wifi-item.selected {
    outline: 1px solid var(--tune-accent, #4a90d9);
  }
  .wifi-row {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 10px;
    padding: 6px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--tune-text-primary);
    text-align: left;
    min-width: 0;
  }
  .wifi-ssid {
    font-weight: 600;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wifi-sec,
  .wifi-signal {
    font-size: 12px;
    color: var(--tune-text-secondary, #888);
    flex-shrink: 0;
  }
  .wifi-inuse {
    font-size: 11px;
    font-weight: 600;
    color: var(--tune-accent, #4a90d9);
    flex-shrink: 0;
  }
  .wifi-connect-form {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-basis: 100%;
    padding: 4px 6px 8px;
  }
  .wifi-connect-form input {
    flex: 1;
    padding: 6px 10px;
    border: 1px solid var(--tune-border, rgba(128, 128, 128, 0.35));
    border-radius: 6px;
    background: var(--tune-bg, transparent);
    color: var(--tune-text-primary);
    font-size: 13px;
  }
  .wifi-feedback {
    font-size: 13px;
    margin: 4px 0 8px;
  }
  .wifi-feedback.success {
    color: var(--tune-success, #2e9e5b);
  }
  .wifi-feedback.error {
    color: var(--tune-danger, #d9534f);
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

  .license-conflict-banner {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    margin-bottom: var(--space-md);
    border: 1px solid var(--tune-warning, #f59e0b);
    border-radius: 8px;
    background: color-mix(in srgb, var(--tune-warning, #f59e0b) 12%, transparent);
  }

  .license-conflict-icon {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--tune-warning, #f59e0b);
  }

  .license-conflict-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-family: var(--font-body);
    font-size: 13px;
    line-height: 1.4;
    color: var(--tune-text);
  }

  .license-conflict-text strong {
    font-weight: 600;
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

  /* Three states: green = licensed & available, red = licensed but not yet
     available, grey = not licensed (locked). */
  .license-feature-item.avail {
    color: var(--tune-text);
    background: rgba(74, 222, 128, 0.06);
  }

  .license-feature-item.unavail {
    color: var(--tune-text);
    background: rgba(239, 68, 68, 0.06);
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
    font-weight: 700;
  }

  .license-feature-item.avail .license-feature-icon {
    color: #4ade80;
  }

  .license-feature-item.unavail .license-feature-icon {
    color: #ef4444;
  }

  .license-feature-item.locked .license-feature-icon {
    color: var(--tune-text-muted);
    opacity: 0.7;
  }

  /* Available features with a destination are clickable and open their page. */
  .license-feature-item.clickable {
    cursor: pointer;
  }

  .license-feature-item.clickable:hover {
    background: rgba(74, 222, 128, 0.16);
  }

  .license-feature-item.clickable:focus-visible {
    outline: 2px solid #4ade80;
    outline-offset: 1px;
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
  .meta-fields-selectall {
    align-self: flex-start;
    margin-bottom: var(--space-md);
    padding: 6px 12px;
    font-family: var(--font-label);
    font-size: 13px;
    color: var(--tune-text);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    cursor: pointer;
  }
  .meta-fields-selectall:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
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

  .zone-settings-list { display: flex; flex-direction: column; gap: 12px; }
  .zone-group-header {
    font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--tune-text-muted); display: flex; align-items: center; gap: 10px; margin: 6px 0 -2px;
  }
  .zone-group-header::after { content: ''; flex: 1; height: 1px; background: var(--tune-border, #333); opacity: 0.5; }
  .zone-card {
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.04);
    border: 1px solid var(--tune-border, #333); border-radius: var(--radius-md, 8px);
    padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;
  }
  .zone-card-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .zone-card-name { font-size: 14px; font-weight: 600; color: var(--tune-text); }
  .zone-card-dev { font-size: 11px; color: var(--tune-text-muted); opacity: 0.8; font-family: var(--font-mono, ui-monospace, monospace); }
  .zone-badge { font-size: 10.5px; font-weight: 700; letter-spacing: 0.02em; padding: 2px 8px; border-radius: 5px; white-space: nowrap; }
  .zone-badge-local   { color: #a98bff; background: rgba(169, 139, 255, 0.14); }
  .zone-badge-browser { color: #7fb0ff; background: rgba(127, 176, 255, 0.14); }
  .zone-badge-airplay { color: #5aa0f2; background: rgba(90, 160, 242, 0.14); }
  .zone-badge-dlna    { color: #f27ac0; background: rgba(242, 122, 192, 0.14); }
  .zone-badge-cast    { color: #42c07a; background: rgba(66, 192, 122, 0.14); }
  .zone-badge-other   { color: var(--tune-text-muted); background: rgba(150, 150, 150, 0.14); }
  .zone-online { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: #42c07a; }
  .zone-online.offline { color: var(--tune-text-muted); }
  .zone-online-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 3px rgba(66, 192, 122, 0.15); }
  .zone-online.offline .zone-online-dot { box-shadow: none; }
  .zone-card-row { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; }
  .zone-setting-label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--tune-text-muted); }
  /* Même gabarit que .rc-warn (RendererConfig) : un réglage qui en annule
     silencieusement un autre se dit sous le réglage, pas dans une infobulle. */
  .zone-warn { margin: 2px 0 0; font-size: 12px; line-height: 1.4; color: var(--tune-warning, #d29922); }
  .zone-setting-checkbox { cursor: pointer; }
  .zone-select {
    padding: 4px 8px; font-size: 12px; border-radius: var(--radius-sm, 4px);
    border: 1px solid var(--tune-border, #333); background: var(--tune-surface, #1a1a1a);
    color: var(--tune-text); cursor: pointer;
  }
  .zone-adv { border-top: 1px dashed var(--tune-border, #333); }
  .zone-adv-summary {
    cursor: pointer; font-size: 12.5px; font-weight: 600; color: var(--tune-accent, #6366f1);
    list-style: none; padding: 8px 0 2px; display: inline-flex; align-items: center; gap: 6px; user-select: none;
  }
  .zone-adv-summary::-webkit-details-marker { display: none; }
  .zone-adv-summary::before { content: '▸'; font-size: 10px; transition: transform 0.15s; display: inline-block; }
  .zone-adv[open] .zone-adv-summary::before { transform: rotate(90deg); }
  .zone-adv-body { display: flex; flex-wrap: wrap; gap: 14px 20px; padding-top: 8px; }

  /* "Add content" defaults */
  .ingest-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 14px;
    margin-top: 12px;
  }
  .ingest-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 13px;
    color: var(--tune-text-muted);
    min-width: 0;
  }
  .ingest-field.wide {
    grid-column: 1 / -1;
  }
  .ingest-field small {
    font-size: 11px;
    line-height: 1.45;
  }
  .ingest-check {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
    font-size: 13px;
    color: var(--tune-text);
  }
  /* Réglages au-dessus du niveau d'affichage choisi (#1617) : masqués sans
     être démontés, pour que leur état et leurs chargements survivent au
     changement de niveau. `!important` : la classe se pose aussi sur des
     éléments qui portent leur propre display (flex, grid…). */
  .lv-hidden {
    display: none !important;
  }

  /* Sélecteur de niveau d'affichage : discret, sous le titre. */
  .level-selector {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: -8px;
  }

  .level-selector-label {
    font-size: 12px;
    color: var(--tune-text-secondary, #9ca3af);
  }

  .level-segments {
    display: inline-flex;
    border: 1.5px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    overflow: hidden;
  }

  .level-segment {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    padding: 4px 12px;
    border: none;
    background: transparent;
    color: var(--tune-text-secondary, #9ca3af);
    cursor: pointer;
    transition: all 0.15s ease-out;
  }

  .level-segment:hover {
    color: var(--tune-text, #e5e7eb);
  }

  .level-segment.active {
    background: var(--tune-accent);
    color: white;
  }

  /* « n réglages masqués — passez au niveau supérieur » en pied d'onglet. */
  .hidden-settings-hint {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--tune-text-secondary, #9ca3af);
  }

  .hidden-settings-raise {
    background: none;
    border: none;
    padding: 0;
    font-size: 12px;
    color: var(--tune-accent);
    cursor: pointer;
    text-decoration: underline;
  }
</style>

<script lang="ts">
  /**
   * Réglages du nouveau client (direction Levente).
   *
   * Structure réorganisée demandée par Bertrand (27/08) — voir lib/v2Settings,
   * qui en est la SOURCE UNIQUE, partagée avec la recherche du menu avatar.
   *
   * Densité par niveau : chaque onglet et chaque section porte un `min`. En
   * Essentiel on ne voit que l'ossature ; Avancé et Expert révèlent le reste,
   * sans jamais réorganiser ce qui était déjà là (stabilité spatiale).
   *
   * ÉTAT DU PORTAGE : l'ossature et la navigation sont en place ; le contenu
   * des sections est repris une à une depuis l'écran actuel (8 300 lignes).
   * Chaque section non encore reprise le dit explicitement et renvoie vers
   * l'écran actuel — jamais un cadre vide qui laisserait croire à un réglage
   * absent.
   */
  import { t } from '../../lib/i18n';
  import { get } from 'svelte/store';
  import { dialogs } from '../../lib/stores/dialogs';
  import { emphaseParts } from '../../lib/i18nEmphase';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { formatNumber, copyText, errText } from '../../lib/utils';
  import { isPushEnabled, setPushEnabled } from '../../lib/notifications-push';
  import { followMe, zones, currentZoneId } from '../../lib/stores/zones';
  import * as api from '../../lib/api';
  import { notifications } from '../../lib/stores/notifications';
  import { etiquetteCaracteristiques } from '../../lib/caracteristiquesPeripherique';
  import type { LocalAudioDevice } from '../../lib/types';
  import { devices } from '../../lib/stores/devices';
  import { audiophileEnabled, audiophileLockVolume, setVolumeLock, refreshVolumeLock } from '../../lib/stores/audiophile';
  import { loopByDefault } from '../../lib/stores/loopByDefault';
  import { licenseState, loadLicense } from '../../lib/stores/license';
  import { locale, localeNames, type Locale } from '../../lib/i18n';
  import { V2_THEMES, type V2Theme } from '../../lib/v2Theme';
  import type { StartupView, VolumeDisplay } from '../../lib/stores/preferences';
  import { activeView } from '../../lib/stores/navigation';
  import { v2SettingsTarget } from '../../lib/stores/v2SettingsNav';
  import { V2_SETTINGS, type V2SettingsTabId, tabLabel } from '../../lib/v2Settings';
  import PluginsV2 from './PluginsV2.svelte';
  /**
   * Bloc « Avancé · renderer » du client actuel, REPRIS tel quel.
   *
   * L'onglet Appareils du v2 n'affichait que quatre champs (DSD, fréquence
   * max, décalage paroles, volume fixe) là où le client actuel en propose
   * sept de plus : test de découverte, FLAC natif, ALAC direct, AAC direct,
   * WAV forcé 16/24 bits, plafond 16 bits, retard au démarrage.
   *
   * Rien de tout cela n'était à écrire : `RendererConfig` existe, ses appels
   * d'API aussi. Le composant n'était simplement pas monté ici. Le dupliquer
   * en version v2 imposerait de corriger deux fois chaque défaut du DLNA —
   * c'est le raisonnement qui a déjà fait reprendre `TransportBar` telle
   * quelle, et le pont de thème de `tune-v2.css` est fait pour ça.
   */
  import RendererConfig from '../RendererConfig.svelte';
  import '../../styles/tune-v2.css';

  const level = $derived($preferences.settingsLevel);
  const tabs = $derived(V2_SETTINGS.filter((t2) => atLeast(level, t2.min)));

  let tabId = $state<V2SettingsTabId>('general');
  let highlight = $state<string | null>(null);

  // Cible venue de la recherche du menu avatar : consommée UNE fois, sinon un
  // retour ultérieur sur les Réglages rejouerait l'ancienne cible.
  $effect(() => {
    const target = $v2SettingsTarget;
    if (!target) return;
    tabId = target.tab;
    highlight = target.section ?? null;
    v2SettingsTarget.set(null);
  });

  const tab = $derived(tabs.find((x) => x.id === tabId) ?? tabs[0]);
  const sections = $derived((tab?.sections ?? []).filter((s) => atLeast(level, s.min)));
  const hiddenCount = $derived((tab?.sections.length ?? 0) - sections.length);

  // ── Sections REELLEMENT portees ────────────────────────────────────────
  // Chacune s'adosse a la meme API/au meme store que l'ecran actuel : le
  // reglage est partage, jamais duplique.

  // « Zones de lecture » — config serveur `zone_auto_create` (defaut true).
  let autoCreate = $state<boolean | null>(null);
  let autoCreateBusy = $state(false);
  $effect(() => {
    api.getConfig()
      .then((c: any) => { autoCreate = c?.zone_auto_create ?? true; })
      .catch(() => { autoCreate = null; });
  });
  async function setAutoCreate(v: boolean) {
    autoCreateBusy = true;
    const before = autoCreate;
    autoCreate = v;
    try { await api.updateConfig({ zone_auto_create: v }); }
    catch { autoCreate = before; }   // pas d'etat menteur si le serveur refuse
    finally { autoCreateBusy = false; }
  }

  // « Qualite streaming » — reglage PAR ZONE.
  //
  // Divergence assumee avec l'ecran actuel, qui applique toujours a
  // `zones[0]` : sur une installation multi-room, regler la qualite depuis
  // les Reglages touchait donc une zone au hasard plutot que celle qu'on
  // ecoute. On vise ici la zone COURANTE (repli sur la premiere), et on
  // affiche son nom pour qu'il n'y ait aucun doute sur la cible.
  const qualityZoneId = $derived($currentZoneId ?? $zones[0]?.id ?? null);
  const qualityZoneName = $derived($zones.find((z) => z.id === qualityZoneId)?.name ?? null);
  const QUALITIES = [
    { v: 'max',   k: 'settings.qualityMax' },
    { v: 'hires', k: 'settings.qualityHires' },
    { v: 'cd',    k: 'settings.qualityCd' },
    { v: 'low',   k: 'settings.qualityLow' },
  ];
  let quality = $state<string>('max');
  let qualityBusy = $state(false);
  $effect(() => {
    const zid = qualityZoneId;
    if (zid == null) return;
    api.getStreamingQuality(zid)
      .then((r) => { quality = r.quality ?? 'max'; })
      .catch(() => {});
  });
  async function setQuality(v: string) {
    const zid = qualityZoneId;
    if (zid == null) return;
    const before = quality;
    quality = v;
    qualityBusy = true;
    try { await api.setStreamingQuality(zid, v); }
    catch { quality = before; }
    finally { qualityBusy = false; }
  }

  // « Sorties audio locales » — plusieurs reglages serveur + la liste des
  // peripheriques. Meme cles de config que l'ecran actuel, donc partage.
  //
  // Repartition par niveau, pour que l'Essentiel ne voie que ce qu'il peut
  // decider seul : la liste des sorties et « lire ici ». Le moteur audio,
  // le mode WASAPI et le detail ReplayGain n'apparaissent qu'au-dessus.
  let audioBackend = $state('wasapi');
  let exclusiveMode = $state(false);
  let rgMode = $state('off');
  let rgPreamp = $state(0);
  let rgAntiClip = $state(true);
  let rgAnalysis = $state(true);
  let audioDevices = $state<LocalAudioDevice[]>([]);
  let devicesLoaded = $state(false);
  let creatingBrowserZone = $state(false);

  $effect(() => {
    api.getConfig()
      .then((c: any) => {
        // `audio_backend` d'abord : c'est la cle que renvoie le serveur recent,
        // `local_audio_backend` restant pour les versions anterieures.
        audioBackend = c?.audio_backend ?? c?.local_audio_backend ?? 'wasapi';
        exclusiveMode = c?.local_exclusive_mode ?? false;
        rgMode = c?.replaygain_mode ?? 'off';
        rgPreamp = Number(c?.replaygain_preamp_db ?? 0);
        rgAntiClip = c?.replaygain_prevent_clipping ?? true;
        // Absent cote serveur vaut VRAI : d'ou le test sur !== false.
        rgAnalysis = c?.replaygain_analysis_enabled !== false && c?.replaygain_analysis_enabled !== 'false';
      })
      .catch(() => {});
    api.withTimeout(api.getAudioDevices(), 8_000, '/devices/audio')
      .then((d) => { audioDevices = d ?? []; })
      .catch(() => { audioDevices = []; })
      .finally(() => { devicesLoaded = true; });
  });

  /** Ecrit une cle de config et restaure l'etat anterieur si le serveur refuse. */
  async function patch(fields: Record<string, unknown>, revert: () => void, okMsg?: string) {
    try {
      await api.updateConfig(fields);
      if (okMsg) notifications.success(okMsg);
    } catch {
      revert();
      notifications.error('Enregistrement impossible');
    }
  }
  function setBackend(v: string) {
    const beforeB = audioBackend, beforeE = exclusiveMode;
    // ASIO est exclusif par construction : le forcer evite un etat incoherent.
    const nextExclusive = v === 'asio' ? true : exclusiveMode;
    audioBackend = v; exclusiveMode = nextExclusive;
    patch({ local_audio_backend: v, local_exclusive_mode: nextExclusive },
      () => { audioBackend = beforeB; exclusiveMode = beforeE; },
      `${$t('settings.audioBackend' as any)} : ${v.toUpperCase()}. ${$t('settings.restartServerNeeded' as any)}`);
  }
  function setExclusive(v: boolean) {
    const before = exclusiveMode; exclusiveMode = v;
    patch({ local_exclusive_mode: v }, () => { exclusiveMode = before; },
      $t('settings.restartServerNeeded' as any));
  }
  function setRgMode(v: string) {
    const before = rgMode; rgMode = v;
    patch({ replaygain_mode: v }, () => { rgMode = before; });
  }
  function setRgPreamp(v: number) {
    const before = rgPreamp; rgPreamp = v;
    patch({ replaygain_preamp_db: v }, () => { rgPreamp = before; });
  }
  function setRgAntiClip(v: boolean) {
    const before = rgAntiClip; rgAntiClip = v;
    patch({ replaygain_prevent_clipping: v }, () => { rgAntiClip = before; });
  }
  function setRgAnalysis(v: boolean) {
    const before = rgAnalysis; rgAnalysis = v;
    patch({ replaygain_analysis_enabled: v }, () => { rgAnalysis = before; });
  }
  function toggleDevice(prefixedId: string) {
    preferences.update((pr) => {
      const ids = pr.hiddenDeviceIds;
      const hidden = ids.includes(prefixedId);
      return { ...pr, hiddenDeviceIds: hidden ? ids.filter((i) => i !== prefixedId) : [...ids, prefixedId] };
    });
  }
  async function createBrowserZoneHere() {
    creatingBrowserZone = true;
    try {
      const zone: any = await api.createZone($t('settings.thisComputer' as any), 'browser');
      if (zone?.id != null) currentZoneId.set(zone.id);
      notifications.success($t('settings.browserZoneCreated' as any));
    } catch (err: any) {
      notifications.error(err?.message ?? 'Erreur');
    }
    creatingBrowserZone = false;
  }

  // « Appareils reseau » — liste decouverte (DLNA, AirPlay, Cast, BluOS,
  // OpenHome), visibilite par appareil, suppression, et appairage AirPlay.
  //
  // La liste est remplie ICI, et c'est indispensable : `fetchDevices()` vit
  // dans App.svelte, que le mode `?v2` ne monte JAMAIS (ShellV2 le remplace).
  // Sans ce chargement, le store restait vide et la section affichait
  // « Aucun appareil detecte » sur toute installation — un etat vide qui
  // ressemblait a une reponse, alors que rien n'avait ete demande au serveur.
  let netLoaded = $state(false);
  let netError = $state(false);
  $effect(() => {
    api.getDevices()
      .then((d) => { devices.set(d ?? []); netError = false; })
      .catch(() => { netError = true; })
      .finally(() => { netLoaded = true; });
  });
  //
  // « Tout afficher » ne revele QUE les appareils reseau et « tout masquer »
  // ne masque QUE ceux-la : les sorties audio locales (prefixe `audio:`) ont
  // leur propre liste, les melanger ferait ressurgir une sortie que
  // l'utilisateur avait volontairement decochee a cote.
  function showAllNet() {
    preferences.update((pr) => ({ ...pr, hiddenDeviceIds: pr.hiddenDeviceIds.filter((i) => i.startsWith('audio:')) }));
  }
  function hideAllNet() {
    const netIds = $devices.map((d) => `net:${d.id}`);
    preferences.update((pr) => ({
      ...pr,
      hiddenDeviceIds: [...pr.hiddenDeviceIds.filter((i) => i.startsWith('audio:')), ...netIds],
    }));
  }
  async function deleteDevice(deviceId: string, name: string) {
    try {
      await api.deleteDevice(deviceId);
      devices.update((l) => l.filter((d) => d.id !== deviceId));
      notifications.success($t('settings.deviceDeleted' as any).replace('{name}', name));
    } catch (e: any) {
      notifications.error(e?.message || $t('common.error' as any));
    }
  }
  async function clearDevices() {
    try {
      const r = await api.clearDevices();
      devices.set([]);
      notifications.success($t('settings.devicesCleared' as any).replace('{count}', String(r.cleared)));
    } catch (e: any) {
      notifications.error(e?.message || $t('common.error' as any));
    }
  }
  function netLabel(type: string): string {
    return type === 'airplay2' ? 'AirPlay 2' : type === 'airplay' ? 'AirPlay'
      : type === 'chromecast' ? 'Cast' : type === 'bluos' ? 'BluOS'
      : type === 'openhome' ? 'OpenHome' : 'DLNA';
  }

  // Appairage AirPlay : le recepteur affiche un code a l'ecran, l'utilisateur
  // le recopie. Un seul appairage a la fois — l'etat porte l'appareil vise.
  let pairId = $state<string | null>(null);
  let pairPin = $state('');
  let pairBusy = $state(false);
  let pairAwaiting = $state(false);
  let pairMsg = $state<string | null>(null);
  async function startPairing(deviceId: string) {
    pairId = deviceId; pairPin = ''; pairBusy = true; pairAwaiting = false; pairMsg = null;
    try {
      const res = await api.beginPairing(deviceId);
      if (res.status === 'awaiting_pin') { pairAwaiting = true; pairMsg = res.message || null; }
    } catch {
      pairMsg = $t('pairing.error' as any); pairId = null;
    }
    pairBusy = false;
  }
  async function submitPin() {
    if (!pairId || !pairPin.trim()) return;
    pairBusy = true;
    try {
      const res = await api.submitPairingPin(pairId, pairPin.trim());
      if (res.status === 'paired') {
        pairMsg = $t('pairing.success' as any);
        setTimeout(() => { pairId = null; pairMsg = null; }, 2000);
      }
    } catch {
      pairMsg = $t('pairing.error' as any);
    }
    pairBusy = false; pairAwaiting = false;
  }
  function cancelPairing() { pairId = null; pairAwaiting = false; pairPin = ''; pairMsg = null; }

  // « DSD vers renderer reseau » — diffuser le transcodage au lieu d'ecrire
  // un fichier temporaire bloquant (corrige les silences/delais en DSD
  // 256/512 sur certains renderers DLNA).
  let dsdStream = $state(false);
  // « Resolution de l'egaliseur Expert » — cle serveur partagee par tous les
  // clients ; la vue Egaliseur la relit a l'ouverture.
  let eqBands = $state(10);
  $effect(() => {
    api.getConfig().then((c: any) => { dsdStream = c?.dsd_lpcm_stream ?? false; }).catch(() => {});
    api.getEqExpertSettings()
      .then((r) => { eqBands = r.expert_bands; })
      .catch(() => {});   // serveur anterieur : on garde la valeur par defaut
  });
  function setDsdStream(v: boolean) {
    const before = dsdStream; dsdStream = v;
    patch({ dsd_lpcm_stream: v }, () => { dsdStream = before; },
      $t((v ? 'settings.dsdStreamOn' : 'settings.dsdStreamOff') as any));
  }
  async function setEqBands(n: number) {
    const before = eqBands; eqBands = n;
    try { eqBands = (await api.setEqExpertSettings(n)).expert_bands; }
    catch { eqBands = before; notifications.error('Enregistrement impossible'); }
  }

  // ── Squeezebox / Lyrion ────────────────────────────────────────────────
  // L'activation ne suffit pas : c'est la DECOUVERTE qui fait apparaitre les
  // lecteurs, d'ou le rafraichissement automatique a l'activation.
  let sbEnabled = $state(false);
  let sbStatus = $state<api.SqueezeboxStatus | null>(null);
  let sbHost = $state('');
  let sbSaving = $state(false);
  let sbLoading = $state(false);
  let sbCreating = $state<string | null>(null);

  async function refreshSqueezebox() {
    sbLoading = true;
    try {
      sbStatus = await api.getSqueezeboxStatus();
      if (sbStatus?.lms_host) sbHost = sbStatus.lms_host;
    } catch { /* serveur sans Squeezebox */ }
    sbLoading = false;
  }
  async function toggleSqueezebox() {
    sbSaving = true;
    const next = !sbEnabled;
    try {
      await api.updateConfig({ squeezebox_enabled: next });
      sbEnabled = next;
      if (next) await refreshSqueezebox(); else sbStatus = null;
    } catch (e: any) { notifications.error(e?.message ?? 'Erreur'); }
    sbSaving = false;
  }
  async function saveSqueezeboxHost() {
    sbSaving = true;
    try {
      await api.updateConfig({ lms_host: sbHost.trim() || null });
      await refreshSqueezebox();
      notifications.success($t('common.saved' as any));
    } catch (e: any) { notifications.error(e?.message ?? 'Erreur'); }
    sbSaving = false;
  }
  async function discoverSqueezebox() {
    sbLoading = true;
    try { sbStatus = await api.discoverSqueezebox(); }
    catch (e: any) { notifications.error(e?.message ?? 'Erreur'); }
    sbLoading = false;
  }
  async function zoneFromPlayer(pl: api.SqueezeboxPlayer) {
    sbCreating = pl.id;
    try {
      await api.createZoneFromSqueezebox(pl.id, pl.name);
      notifications.success($t('settings.squeezeboxZoneCreated' as any).replace('{name}', pl.name));
    } catch (e: any) { notifications.error(e?.message ?? 'Erreur'); }
    sbCreating = null;
  }

  // ── HQPlayer ───────────────────────────────────────────────────────────
  // Config et etat vivent sur /hqplayer/*, pas dans la config systeme.
  let hqEnabled = $state(false);
  let hqHost = $state('');
  let hqPort = $state(4321);
  let hqSaving = $state(false);
  let hqChecking = $state(false);
  let hqReachable = $state<boolean | null>(null);
  let hqStatusHost = $state('');
  let hqStatusPort = $state(0);
  let hqStatusMsg = $state('');

  $effect(() => {
    api.getConfig().then((c: any) => { sbEnabled = c?.squeezebox_enabled ?? false; }).catch(() => {});
    api.apiFetch('/hqplayer/config')
      .then((c: any) => { hqEnabled = c?.hqplayer_enabled ?? false; hqHost = c?.hqplayer_host ?? ''; hqPort = c?.hqplayer_port ?? 4321; })
      .catch(() => {});
  });
  async function saveHq(enabled = hqEnabled) {
    hqSaving = true;
    try {
      await api.apiPost('/hqplayer/config', { hqplayer_host: hqHost.trim(), hqplayer_port: hqPort, hqplayer_enabled: enabled });
      hqEnabled = enabled;
      if (enabled) await checkHq();
    } catch (e: any) { notifications.error(e?.message ?? 'Erreur'); }
    hqSaving = false;
  }
  async function checkHq() {
    hqChecking = true;
    try {
      // Le serveur sonde 4321 puis 8019 : la reponse peut prendre quelques
      // secondes. `connected` est le champ reel du backend.
      const st: any = await api.apiFetch('/hqplayer/status');
      hqReachable = st?.connected ?? false;
      hqStatusHost = st?.host ?? hqHost;
      hqStatusPort = st?.port ?? hqPort;
      hqStatusMsg = st?.message ?? '';
    } catch {
      hqReachable = false; hqStatusHost = hqHost; hqStatusPort = hqPort; hqStatusMsg = '';
    }
    hqChecking = false;
  }

  // ── Tune Bridge (acces distant) ────────────────────────────────────────
  // Le jeton n'est renvoye QU'A L'ACTIVATION et jamais relu ensuite : le
  // statut le remet volontairement a vide. D'ou l'avertissement affiche —
  // si l'utilisateur ne le copie pas maintenant, il est perdu.
  let brEnabled = $state(false);
  let brConnected = $state(false);
  let brServerId = $state('');
  let brUrl = $state('');
  let brToken = $state('');
  let brBusy = $state(false);
  $effect(() => {
    api.apiFetch('/cloud/bridge/status')
      .then((d: any) => {
        brEnabled = !!d?.enabled; brConnected = !!d?.connected;
        brServerId = d?.server_id || ''; brUrl = d?.access_url || ''; brToken = '';
      })
      .catch(() => {});   // route absente sur un serveur anterieur
  });
  async function toggleBridge() {
    brBusy = true;
    try {
      if (brEnabled) {
        await api.apiPost('/cloud/bridge/disable');
        brEnabled = false; brConnected = false; brUrl = ''; brToken = '';
      } else {
        const d: any = await api.apiPost('/cloud/bridge/enable');
        brEnabled = true;
        brServerId = d?.server_id || ''; brUrl = d?.access_url || ''; brToken = d?.bridge_token || '';
      }
    } catch (e: any) {
      notifications.error(e?.message ?? 'Erreur');
    }
    brBusy = false;
  }

  // ── Serveurs Tune sur le reseau ────────────────────────────────────────
  // L'ajout manuel par IP:port est le chemin robuste quand la decouverte
  // multicast est bloquee (Docker macvlan, pare-feu Windows).
  let peers = $state<api.TunePeer[]>([]);
  let peersBusy = $state(false);
  let peerHost = $state('');
  let peerPort = $state(8888);
  let peerAdding = $state(false);
  async function fetchPeers() {
    peersBusy = true;
    try { peers = await api.withTimeout(api.getTunePeers(), 8_000, '/peers'); }
    catch { /* silencieux : la decouverte peut echouer sans que ce soit une panne */ }
    peersBusy = false;
  }
  $effect(() => { fetchPeers(); });
  async function addPeer() {
    const host = peerHost.trim();
    if (!host) return;
    peerAdding = true;
    try { await api.addTunePeer(host, Number(peerPort) || 8888); peerHost = ''; await fetchPeers(); }
    catch (e: any) { notifications.error(e?.message || $t('settings.peerAddError' as any)); }
    peerAdding = false;
  }
  async function removePeer(pr: api.TunePeer) {
    try { await api.removeTunePeer(pr.host, pr.port); await fetchPeers(); }
    catch (e: any) { notifications.error(e?.message || $t('common.error' as any)); }
  }

  // ── Wi-Fi de l'appliance (Tune OS) ─────────────────────────────────────
  // N'a de sens QUE sur une appliance : ailleurs, le reseau est gere par le
  // systeme hote. La section se declare donc indisponible plutot que
  // d'afficher un scanner qui ne repondra jamais.
  let isAppliance = $state<boolean | null>(null);
  let wifiStatus = $state<api.ApplianceStatus | null>(null);
  let wifiNets = $state<api.ApplianceWifiNetwork[]>([]);
  let wifiScanning = $state(false);
  let wifiConnecting = $state(false);
  let wifiSel = $state<string | null>(null);
  let wifiPwd = $state('');
  let wifiErr = $state('');
  let wifiOk = $state('');

  $effect(() => {
    api.getConfig().then(async (c: any) => {
      isAppliance = !!c?.appliance;
      if (!isAppliance) return;
      try { wifiStatus = await api.getApplianceStatus(); } catch { /* ignore */ }
      await scanWifi();
    }).catch(() => { isAppliance = null; });
  });
  async function scanWifi() {
    wifiScanning = true; wifiErr = '';
    try { wifiNets = (await api.applianceWifiScan()).networks ?? []; }
    catch (e: any) { wifiErr = e?.message ?? String(e); }
    wifiScanning = false;
  }
  function selectWifi(ssid: string) {
    wifiSel = wifiSel === ssid ? null : ssid;
    wifiPwd = ''; wifiErr = ''; wifiOk = '';
  }
  async function connectWifi() {
    if (!wifiSel) return;
    const ssid = wifiSel;
    wifiConnecting = true; wifiErr = ''; wifiOk = '';
    try {
      await api.applianceWifiConnect(ssid, wifiPwd || undefined);
      wifiOk = ssid; wifiSel = null; wifiPwd = '';
      try { wifiStatus = await api.getApplianceStatus(); } catch { /* ignore */ }
      await scanWifi();
    } catch (e: any) { wifiErr = e?.message ?? String(e); }
    wifiConnecting = false;
  }
  async function forgetWifi(ssid: string) {
    try {
      await api.applianceWifiForget(ssid);
      try { wifiStatus = await api.getApplianceStatus(); } catch { /* ignore */ }
      await scanWifi();
    } catch (e: any) { wifiErr = e?.message ?? String(e); }
  }

  // ── Lecture ────────────────────────────────────────────────────────────
  // VERROU DE VOLUME : double bascule volontaire. Le premier geste ARME et
  // affiche l'avertissement rouge ; seul le second APPLIQUE. Verrouiller
  // envoie le volume a 100 % sur l'ampli — un clic unique serait dangereux.
  // Deverrouiller, lui, est immediat : couper n'a rien de risque.
  let lockArme = $state(false);
  $effect(() => { refreshVolumeLock().catch(() => {}); });

  async function unlockVolume() {
    lockArme = false;
    try { await setVolumeLock(false); } catch { /* le store se restaure seul */ }
  }
  async function confirmLockVolume() {
    lockArme = false;
    try {
      // Ce second geste EST l'accord explicite transmis au serveur ; le
      // premier n'avait fait qu'afficher l'avertissement.
      await setVolumeLock(true, true);
      if ($audiophileLockVolume && $audiophileEnabled) {
        const zid = $currentZoneId;
        if (zid != null) await api.setVolume(zid, 1);
      }
    } catch { /* setVolumeLock a deja restaure le store */ }
  }

  // Crossfade — reglage PAR ZONE, meme divergence assumee que la qualite
  // streaming : on vise la zone courante et non `zones[0]`.
  let xfEnabled = $state(false);
  let xfDuration = $state(3);
  $effect(() => {
    const zid = qualityZoneId;
    if (zid == null) return;
    api.getCrossfade(zid)
      .then((r) => { xfEnabled = r.enabled ?? false; xfDuration = r.duration ?? 3; })
      .catch(() => {});
  });
  async function applyCrossfade() {
    const zid = qualityZoneId;
    if (zid == null) return;
    try { await api.setCrossfade(zid, xfEnabled, xfDuration); } catch { /* ignore */ }
  }

  // ── Tune Voice AI ──────────────────────────────────────────────────────
  // Preference purement locale (pas de config serveur) : le micro appartient
  // au navigateur. On DEMANDE l'autorisation a l'activation et on retombe a
  // faux si elle est refusee — sinon la case reste cochee pour une fonction
  // qui ne peut pas marcher.
  let voiceOn = $state(false);
  $effect(() => {
    try { voiceOn = localStorage.getItem('tune_voice_ai_enabled') === 'true'; } catch { voiceOn = false; }
  });
  async function setVoice(v: boolean) {
    voiceOn = v;
    try { localStorage.setItem('tune_voice_ai_enabled', String(v)); } catch { /* ignore */ }
    if (!v) return;
    try {
      await navigator.mediaDevices?.getUserMedia({ audio: true });
      notifications.success($t('settings.micAuthorized' as any));
    } catch {
      notifications.error($t('settings.micDenied' as any));
      voiceOn = false;
      try { localStorage.setItem('tune_voice_ai_enabled', 'false'); } catch { /* ignore */ }
    }
  }

  // ── Interface ──────────────────────────────────────────────────────────
  // On expose le theme DU CLIENT V2 (six palettes), pas `preferences.theme`
  // qui pilote l'app historique : le proposer ici donnerait un reglage sans
  // effet visible: exactement le genre de piege qu'on veut eviter.
  function setV2Theme(t: V2Theme) { preferences.update((pr) => ({ ...pr, v2Theme: t })); }
  const STARTUP: { v: StartupView; k: string }[] = [
    { v: 'home', k: 'nav.home' }, { v: 'nowplaying', k: 'nav.nowplaying' },
    { v: 'library', k: 'nav.library' }, { v: 'queue', k: 'nav.queue' },
    { v: 'playlists', k: 'nav.playlists' }, { v: 'search', k: 'nav.search' },
    { v: 'settings', k: 'nav.settings' },
  ];

  // ── Services de streaming : connexion ──────────────────────────────────
  //
  // Deux flux, et il faut les distinguer :
  //   - IDENTIFIANTS (Qobuz) : l'utilisateur saisit ses codes, le serveur
  //     repond `authenticated`.
  //   - CODE D'APPAREIL (Tidal, Spotify, YouTube) : le serveur renvoie une
  //     URL et un code a recopier sur un autre ecran, puis on SONDE l'etat
  //     jusqu'a ce qu'il bascule.
  //
  // Le mot de passe n'est jamais conserve : il est efface des que la reponse
  // arrive, succes ou echec.
  let svcs = $state<Record<string, any>>({});
  let svcBusy = $state<string | null>(null);
  let svcErr = $state<Record<string, string | null>>({});
  let cred = $state<Record<string, { user: string; pass: string }>>({});
  let deviceFlow = $state<Record<string, { url: string; code: string | null } | undefined>>({});
  let polls: Record<string, ReturnType<typeof setInterval>> = {};

  $effect(() => {
    api.getStreamingServices()
      .then((r) => {
        svcs = r ?? {};
        // Les entrees d'identifiants sont creees ICI, au chargement, et non
        // a la volee pendant le rendu : muter l'etat pendant qu'on rend
        // relance le rendu en boucle.
        const next = { ...cred };
        for (const k of Object.keys(svcs)) if (!next[k]) next[k] = { user: '', pass: '' };
        cred = next;
      })
      .catch(() => {});
    return () => { Object.values(polls).forEach(clearInterval); polls = {}; };
  });
  /** Qobuz attend des identifiants ; les autres passent par un code. */
  function usesPassword(name: string): boolean { return name === 'qobuz'; }

  function stopPoll(name: string) {
    if (polls[name]) { clearInterval(polls[name]); delete polls[name]; }
  }
  function startPoll(name: string) {
    stopPoll(name);
    polls[name] = setInterval(async () => {
      try {
        const st = await api.getStreamingServiceStatus(name);
        if (st?.authenticated) {
          stopPoll(name);
          svcs = { ...svcs, [name]: { ...svcs[name], ...st } };
          deviceFlow = { ...deviceFlow, [name]: undefined };
          svcBusy = null;
        }
      } catch { /* le sondage peut echouer sans que ce soit une panne */ }
    }, 3000);
  }

  async function connectSvc(name: string) {
    svcBusy = name;
    svcErr = { ...svcErr, [name]: null };
    try {
      const c = cred[name];
      const body = usesPassword(name) ? { username: c?.user ?? '', password: c?.pass ?? '' } : undefined;
      const res = await api.authenticateStreaming(name, body);
      // Le mot de passe ne survit pas a la reponse, quelle qu'elle soit.
      if (cred[name]) cred = { ...cred, [name]: { user: cred[name].user, pass: '' } };
      if (res?.authenticated) {
        svcs = { ...svcs, [name]: { ...svcs[name], authenticated: true } };
        svcBusy = null;
      } else if (res?.verification_url) {
        const raw = res.verification_url;
        const url = raw.startsWith('http') ? raw : `https://${raw}`;
        deviceFlow = { ...deviceFlow, [name]: { url, code: res.user_code ?? null } };
        startPoll(name);   // svcBusy reste pose : l'attente fait partie du flux
      } else {
        svcErr = { ...svcErr, [name]: usesPassword(name) ? get(t)('settings.errCredentialsRejected') : get(t)('settings.errNoAuthLink') };
        svcBusy = null;
      }
    } catch {
      svcErr = { ...svcErr, [name]: get(t)('settings.errConnectFailed') };
      svcBusy = null;
    }
  }
  async function disconnectSvc(name: string) {
    stopPoll(name);
    deviceFlow = { ...deviceFlow, [name]: undefined };
    try {
      await api.disconnectStreaming(name);
      svcs = { ...svcs, [name]: { ...svcs[name], authenticated: false, username: null } };
    } catch { svcErr = { ...svcErr, [name]: get(t)('settings.errDisconnectFailed') }; }
  }
  function cancelFlow(name: string) {
    stopPoll(name);
    deviceFlow = { ...deviceFlow, [name]: undefined };
    svcBusy = null;
  }

  // ── Systeme : a propos, licence, sante ────────────────────────────────
  //
  // La derive client/serveur est SIGNALEE. Le client web est embarque dans la
  // release du serveur : quand les deux numeros different, c'est qu'un vieux
  // client est servi — et tout ce qui suit (404 inattendus, licence « FREE »
  // erronee, journaux vides) devient inexplicable si on ne le voit pas.
  const CLIENT_VERSION: string = (globalThis as any).__APP_VERSION__ ?? '';
  let serverVersion = $state<string | null>(null);
  let updateInfo = $state<any | null>(null);
  let health = $state<{ status: string; components?: Record<string, boolean> } | null>(null);
  let stats = $state<{ tracks: number; albums: number; artists: number; zones: number; devices: number } | null>(null);
  const clientStale = $derived(!!serverVersion && !!CLIENT_VERSION && serverVersion !== CLIENT_VERSION);

  $effect(() => {
    api.apiFetch('/system/update/check')
      .then((d: any) => {
        serverVersion = d?.current_version ?? d?.current ?? null;
        updateInfo = d?.update_available ? d : null;
      })
      .catch(() => { serverVersion = null; });
    api.getHealth().then((h) => { health = h; }).catch(() => { health = null; });
    api.getStats().then((st) => { stats = st; }).catch(() => { stats = null; });
  });

  // Licence : la cle n'est jamais reaffichee en clair une fois activee — on
  // montre ses derniers caracteres, assez pour la reconnaitre, pas assez pour
  // la recopier depuis une capture d'ecran.
  let licKey = $state('');
  let licBusy = $state(false);
  let licErr = $state<string | null>(null);
  const lic = $derived($licenseState);
  function maskKey(k: string | null): string {
    if (!k) return '';
    return k.length <= 4 ? '••••' : `••••-${k.slice(-4)}`;
  }
  async function activateLic() {
    const k = licKey.trim();
    if (!k || licBusy) return;
    licBusy = true; licErr = null;
    try {
      await api.activateLicense(k);
      licKey = '';
      await loadLicense();
    } catch (e: any) {
      licErr = e?.message ?? get(t)('settings.errActivationRejected');
    }
    licBusy = false;
  }
  async function deactivateLic() {
    if (licBusy) return;
    licBusy = true; licErr = null;
    try { await api.deactivateLicense(); await loadLicense(); }
    catch { licErr = get(t)('settings.errDeactivateFailed'); }
    licBusy = false;
  }

  // ── Bibliotheque : dossiers, analyse, planification ───────────────────
  let musicDirs = $state<string[]>([]);
  let newDir = $state('');
  let dirBusy = $state(false);
  let scanning = $state(false);
  let scanReport = $state<any | null>(null);
  let qualitySplit = $state(true);
  let schedOn = $state(false);
  let schedTime = $state('03:00');
  let schedBusy = $state(false);
  let libErr = $state<string | null>(null);

  async function refreshLibrary() {
    try {
      const c: any = await api.getConfig();
      musicDirs = Array.isArray(c?.music_dirs) ? c.music_dirs : [];
      // Absent vaut VRAI cote serveur, et les valeurs peuvent arriver en
      // chaine ('false') aussi bien qu'en booleen.
      qualitySplit = !(c?.quality_split === false || c?.quality_split === 'false'
        || c?.quality_split === 0 || c?.quality_split === '0');
    } catch { libErr = get(t)('settings.errConfigUnavailable'); }
    try {
      const sch: any = await api.getScanSchedule();
      schedOn = !!sch?.enabled; schedTime = sch?.time ?? '03:00';
    } catch { /* route absente sur un serveur anterieur */ }
  }
  $effect(() => { refreshLibrary(); });

  // L'etat d'analyse est sonde UNIQUEMENT pendant une analyse.
  $effect(() => {
    api.getScanStatus().then((s) => { scanning = !!s?.scanning; }).catch(() => {});
  });
  $effect(() => {
    if (!scanning) return;
    const h = setInterval(async () => {
      try {
        const s = await api.getScanStatus();
        scanning = !!s?.scanning;
        if (!scanning) { scanReport = await api.getScanReport().catch(() => null); await refreshLibrary(); }
      } catch { /* ignore */ }
    }, 2500);
    return () => clearInterval(h);
  });

  async function addDir() {
    const path = newDir.trim();
    if (!path || dirBusy) return;
    dirBusy = true; libErr = null;
    try {
      const r = await api.addMusicDir(path);
      musicDirs = r?.music_dirs ?? musicDirs;
      newDir = '';
    } catch (e: any) { libErr = e?.message ?? get(t)('settings.errFolderRejected'); }
    dirBusy = false;
  }
  /** Retirer un dossier ne SUPPRIME aucun fichier : on le dit dans l'ecran,
   *  sinon le bouton fait peur a juste titre. */
  async function removeDir(path: string) {
    if (dirBusy) return;
    dirBusy = true; libErr = null;
    try {
      const r = await api.removeMusicDir(path);
      musicDirs = r?.music_dirs ?? musicDirs.filter((d) => d !== path);
    } catch { libErr = get(t)('settings.errRemoveFailed'); }
    dirBusy = false;
  }
  async function scan(full: boolean) {
    try { await api.triggerScan(undefined, full); scanning = true; scanReport = null; }
    catch { libErr = get(t)('settings.errScanStartFailed'); }
  }
  async function stopScan() {
    try { await api.cancelScan(); scanning = false; } catch { /* deja finie */ }
  }
  async function setQualitySplit(v: boolean) {
    const before = qualitySplit; qualitySplit = v;
    try { await api.updateConfig({ quality_split: v }); notifications.success(get(t)('settings.savedNeedsFullScan')); }
    catch { qualitySplit = before; libErr = get(t)('settings.errSaveFailed'); }
  }
  async function saveSchedule() {
    schedBusy = true;
    try {
      const r: any = await api.setScanSchedule(schedTime, schedOn);
      schedOn = !!r?.enabled; schedTime = r?.time ?? schedTime;
    } catch { libErr = get(t)('settings.errScheduleNotSaved'); }
    schedBusy = false;
  }

  // ── Reglages par zone ─────────────────────────────────────────────────
  const RATES: { v: number; l: string }[] = [
    { v: 0, l: 'Aucune limite' }, { v: 48000, l: '48 kHz' }, { v: 88200, l: '88,2 kHz' },
    { v: 96000, l: '96 kHz' }, { v: 176400, l: '176,4 kHz' }, { v: 192000, l: '192 kHz' },
    { v: 352800, l: '352,8 kHz' }, { v: 384000, l: '384 kHz' }, { v: 705600, l: '705,6 kHz' },
    { v: 1411200, l: '1411,2 kHz' },
  ];
  const OFFSETS = [0, 1000, 2000, 3000, 4000, 5000, 7000, 10000, 15000, 20000];
  const isLocalZone = (z: any) => (z?.output_type ?? 'local') === 'local' || z?.output_type === 'browser';

  /** Confirmation ARMEE pour le volume fixe sur une zone RESEAU.
   *
   *  Activer envoie 100 % a l'appareil lui-meme : l'ampli part a fond
   *  (tune-server-rust#1616, Cyrille forum 1320). L'ecran actuel exige de
   *  TAPER « 100 », comme on exige de taper EFFACER avant d'ecraser un
   *  disque — un simple « OK » se clique sans lire. On garde cette exigence,
   *  en dialogue INTEGRE : les dialogues natifs sont bannis des vues web. */
  let fvAsk = $state<number | null>(null);
  let fvTyped = $state('');
  let zoneErr = $state<string | null>(null);

  async function applyFixedVolume(z: any, enabled: boolean, confirmed = false) {
    if (z?.id == null) return;
    try {
      const up = await api.updateZoneFixedVolume(z.id, enabled, confirmed);
      zones.update((l) => l.map((x) => (x.id === z.id ? { ...x, ...up } : x)));
    } catch { zoneErr = get(t)('settings.errSettingRejected'); }
  }
  function askFixedVolume(z: any, enabled: boolean) {
    zoneErr = null;
    // Couper n'a rien de dangereux : immediat. Une zone LOCALE non plus —
    // 100 % logiciel est justement le but.
    if (!enabled || isLocalZone(z)) { applyFixedVolume(z, enabled); return; }
    fvAsk = z.id; fvTyped = '';
  }
  function confirmFixedVolume(z: any) {
    if (fvTyped.trim() !== '100') return;
    const target = z;
    fvAsk = null; fvTyped = '';
    applyFixedVolume(target, true, true);
  }
  async function setZoneField(z: any, fn: () => Promise<any>) {
    if (z?.id == null) return;
    try { const up = await fn(); zones.update((l) => l.map((x) => (x.id === z.id ? { ...x, ...up } : x))); }
    catch { zoneErr = get(t)('settings.errSettingNotSaved'); }
  }

  // ── CLAP (analyse acoustique) ─────────────────────────────────────────
  let clapOn = $state(false);
  let clapThrottle = $state('equilibre');
  let clapAnalysed = $state(0);
  let clapAvailable = $state<boolean | null>(null);
  async function refreshClap() {
    try {
      const c: any = await api.getConfig();
      clapOn = c?.audio_embedding_enabled === true || c?.audio_embedding_enabled === 'true';
      clapThrottle = c?.audio_embedding_throttle ?? 'equilibre';
    } catch { /* ignore */ }
    try {
      const st = await api.getAcousticStatus();
      clapAvailable = !!st?.available;
      clapAnalysed = st?.analysed_tracks ?? 0;
      if (st) clapOn = !!st.enabled;
    } catch { clapAvailable = null; }
  }
  $effect(() => { refreshClap(); });
  async function setClap(v: boolean) {
    const before = clapOn; clapOn = v;
    try { await api.updateConfig({ audio_embedding_enabled: v }); await refreshClap(); }
    catch { clapOn = before; }
  }
  async function setThrottle(v: string) {
    const before = clapThrottle; clapThrottle = v;
    try { await api.updateConfig({ audio_embedding_throttle: v }); }
    catch { clapThrottle = before; }
  }

  // ── Acces depuis un autre appareil ────────────────────────────────────
  let serverUrls = $state<string[]>([]);
  let copied = $state<string | null>(null);
  $effect(() => {
    api.getConfig().then((c: any) => { serverUrls = Array.isArray(c?.server_urls) ? c.server_urls : []; }).catch(() => {});
  });
  async function copyUrl(u: string) {
    if (await copyText(u)) { copied = u; setTimeout(() => { if (copied === u) copied = null; }, 2000); }
    else notifications.error(get(t)('settings.errCopyFailed'));
  }

  // ── Spotify Connect (recepteur) ───────────────────────────────────────
  // Le recepteur transforme une ZONE en enceinte visible depuis l'appli
  // Spotify. Il lui faut donc une zone cible : sans zone, l'activer n'a
  // aucun sens et l'ecran le dit plutot que d'echouer a l'appel.

  // ── Jetons de services ────────────────────────────────────────────────────
  //
  // Portage de `ServiceTokensView` (client actuel) dans la section « Services &
  // Jetons ». L'écran v2 se contentait de renvoyer vers l'ancien client ; c'est
  // vrai, cet écran existe — mais l'utilisateur n'a pas à changer de client pour
  // poser un jeton.
  //
  // Rien n'est réinventé : `listServiceTokens` / `saveServiceToken` /
  // `testServiceToken` / `deleteServiceToken` existent déjà, et la liste des
  // services comme leurs champs viennent du SERVEUR. Ajouter un service demain
  // ne demandera donc aucune ligne ici.
  //
  // 🔴 Les champs restent VIDES à l'affichage, toujours. `get_config` caviarde
  // les secrets (`tune_core::secrets`), donc le client ne détient jamais la
  // valeur en clair : un formulaire pré-rempli réécrirait la version masquée et
  // DÉTRUIRAIT le jeton, sans qu'aucune erreur ne le signale. Le placeholder dit
  // « déjà configuré », l'envoi ne porte que ce qui a été tapé.

  // ── Installation de la mise à jour ────────────────────────────────────────
  //
  // L'écran annonçait la version disponible et renvoyait ailleurs pour
  // l'installer. `POST /system/update/install` existe ; le travail n'est pas de
  // poser un bouton, c'est de rendre le REFUS lisible.
  //
  // Le serveur répond 409 avec un motif — drapeau `.no-auto-update`, zone en
  // lecture, scan en cours, installation déjà lancée — et `fetch` ne lève pas
  // sur un 409. Sans ce traitement, l'interface entrait dans trois minutes
  // d'attente d'un redémarrage qui n'arriverait jamais, et jetait l'explication
  // que le serveur venait de donner (#412, vécu sur une machine portant le
  // drapeau).
  // L'avertissement de coupure AFFIRME que de la musique joue : l'afficher
  // toujours serait faux. Même dérivé que le client actuel.
  const zonesEnLecture = $derived($zones.filter((z: any) => z.state === 'playing').length);

  // ── Restauration de configuration ─────────────────────────────────────────
  //
  // `api.importConfig()` existait, mais l'écran s'en tenait à distance, et le
  // commentaire disait pourquoi : « un écran qui le propose sans le flux de
  // confirmation complet inviterait à une fausse manœuvre ». La prudence était
  // juste — la réponse n'était pas de renvoyer ailleurs, c'était d'écrire le
  // flux.
  //
  // 🔴 Le client actuel importe SANS AUCUNE confirmation : fichier choisi,
  // fichier appliqué. On ne reprend donc pas son geste tel quel, on ajoute ce
  // qui lui manque — la restauration ÉCRASE dossiers, zones et réglages audio,
  // et rien ne la défait.
  //
  // Confirmation par SAISIE, comme le volume fixe de cet écran : un mot à taper
  // ne se clique pas par réflexe. Le fichier est lu et analysé AVANT de
  // demander confirmation — inutile de faire taper un mot pour un fichier
  // illisible.
  let rstFile: HTMLInputElement | null = $state(null);
  let rstData = $state<any | null>(null);
  let rstName = $state('');
  let rstTyped = $state('');
  let rstBusy = $state(false);

  async function rstChoisi(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    sysErr = null; rstTyped = '';
    try {
      rstData = JSON.parse(await f.text());
      rstName = f.name;
    } catch {
      rstData = null; rstName = '';
      sysErr = get(t)('settings.restoreConfigBadFile');
    }
  }

  function rstAnnuler() { rstData = null; rstName = ''; rstTyped = ''; }

  async function rstConfirmer() {
    if (!rstData) return;
    rstBusy = true; sysErr = null;
    try {
      await api.importConfig(rstData);
      notifications.success(get(t)('settings.importConfigSuccess'));
      rstAnnuler();
    } catch (e: any) {
      sysErr = `${get(t)('settings.importConfigError')} : ${e?.message ?? e}`;
    }
    rstBusy = false;
  }

  let updBusy = $state(false);
  let updRefus = $state('');
  let updDone = $state(false);
  let updDmg = $state<string | null>(null);

  /** Traduit le refus du serveur. Repris tel quel du client actuel. */
  function updMotifRefus(res: any): string {
    const brut = String(res?.message ?? res?.status ?? '');
    if (brut.includes('.no-auto-update')) return get(t)('settings.updateBlockedFlag');
    if (res?.status === 'already_in_progress') return get(t)('settings.updateAlreadyRunning');
    if (brut.toLowerCase().includes('scan')) return get(t)('settings.updateBlockedScan');
    if (brut.toLowerCase().includes('playing') || brut.toLowerCase().includes('zone'))
      return get(t)('settings.updateBlockedPlaying');
    return brut || get(t)('settings.updateBlockedUnknown');
  }

  async function installerMaj() {
    updBusy = true; updRefus = ''; updDone = false; updDmg = null;
    const versionAvant = updateInfo?.current_version ?? serverVersion;
    try {
      // `force` : le bouton est cliqué juste sous l'avertissement de coupure,
      // donc la garde serveur ne doit pas re-refuser ce que l'utilisateur vient
      // d'accepter.
      const res: any = await api.installUpdate(true);
      if (res && res.ok === false) { updBusy = false; updRefus = updMotifRefus(res); return; }
      // Docker : le serveur répond 200 — ce n'est pas une erreur, c'est une
      // consigne. Le binaire vit dans une couche d'image en lecture seule :
      // aucune installation n'a démarré, aucun redémarrage ne viendra. Sans ce
      // test, `ok === true` laissait passer et le bouton restait mort trois
      // minutes (Alex Campbell, Tune en conteneur).
      if (res && res.status === 'docker') {
        updBusy = false; updRefus = res.message || get(t)('settings.updateDockerHint'); return;
      }
    } catch {
      // Un vieux serveur bloquait la requête pendant tout le téléchargement et
      // le navigateur rendait « Failed to fetch » alors que l'installation
      // aboutissait. On enchaîne donc sur la surveillance.
    }

    // Surveillance jusqu'au redémarrage sur la nouvelle version.
    let vuHorsService = false;
    const limite = Date.now() + 180_000;
    while (Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 3000));
      let st: any = null;
      try { st = await api.getUpdateStatus(); } catch { vuHorsService = true; continue; }
      if (st?.phase === 'dmg_ready') { updDmg = st.dmg_path || '~/Downloads'; updBusy = false; return; }
      if (st?.phase === 'failed') { updBusy = false; updRefus = get(t)('settings.updateBlockedUnknown'); return; }
      // Deux détections, chacune suffisante : la version a bougé, ou le serveur
      // est retombé puis revenu sans mise à jour en cours.
      const courante: string | undefined = st?.current_version;
      if ((courante && versionAvant && courante !== versionAvant) || (vuHorsService && !st?.update_in_progress)) {
        updDone = true; updBusy = false;
        setTimeout(() => window.location.reload(), 1500);
        return;
      }
    }
    updBusy = false;
  }

  let stk = $state<any[]>([]);
  let stkLoading = $state(true);
  let stkBusy = $state<string | null>(null);
  let stkEdit = $state<Record<string, Record<string, string>>>({});
  let lfmToken = $state<string | null>(null);

  async function loadTokens() {
    stkLoading = true;
    try {
      stk = await api.listServiceTokens();
      const buf: Record<string, Record<string, string>> = {};
      for (const s of stk) {
        buf[s.id] = {};
        for (const f of s.fields ?? []) buf[s.id][f.key] = '';
      }
      stkEdit = buf;
    } catch (e: any) {
      notifications.error(`${get(t)('serviceTokens.loadError')} : ${e?.message ?? e}`);
      stk = [];
    }
    stkLoading = false;
  }
  $effect(() => { void loadTokens(); });

  /** Pastille d'état — reprise telle quelle du client actuel. */
  function stkDot(s: any): { color: string; label: string } {
    if (s.kind === 'no_auth') return { color: '#22c55e', label: get(t)('serviceTokens.statusAvailable') };
    if (!s.configured) return { color: 'transparent', label: get(t)('serviceTokens.statusNotConfigured') };
    if (s.valid === true) return { color: '#22c55e', label: get(t)('serviceTokens.statusValid') };
    if (s.valid === false) return { color: '#ef4444', label: get(t)('serviceTokens.statusInvalid') };
    if (s.source === 'env') return { color: '#eab308', label: get(t)('serviceTokens.statusEnv') };
    return { color: '#eab308', label: get(t)('serviceTokens.statusUntested') };
  }

  async function stkSave(s: any) {
    const data = stkEdit[s.id];
    // Un envoi vide effacerait le jeton en place : on refuse plutôt que d'agir.
    if (!data || Object.values(data).every((v) => !v?.trim())) {
      notifications.error(get(t)('serviceTokens.noValueEntered'));
      return;
    }
    stkBusy = s.id;
    try {
      const r: any = await api.saveServiceToken(s.id, data);
      if (r?.valid === true) notifications.success(`${s.name} : ${r.validation_message ?? get(t)('serviceTokens.tokenValid')}`);
      else if (r?.valid === false) notifications.error(`${s.name} : ${r.validation_message ?? get(t)('serviceTokens.validationFailed')}`);
      else notifications.success(`${s.name} : ${get(t)('serviceTokens.savedNoValidation')}`);
      await loadTokens();
    } catch (e: any) {
      notifications.error(`${get(t)('serviceTokens.error')} : ${e?.message ?? e}`);
    }
    stkBusy = null;
  }

  async function stkTest(s: any) {
    stkBusy = s.id;
    try {
      const r: any = await api.testServiceToken(s.id);
      if (r?.valid === true) notifications.success(`${s.name} : ${r.validation_message ?? 'OK'}`);
      else if (r?.valid === false) notifications.error(`${s.name} : ${r.validation_message ?? get(t)('serviceTokens.failed')}`);
      else notifications.info(r?.validation_message ?? get(t)('serviceTokens.noValidationAvailable'));
      await loadTokens();
    } catch (e: any) {
      notifications.error(`${get(t)('serviceTokens.testError')} : ${e?.message ?? e}`);
    }
    stkBusy = null;
  }

  async function stkRemove(s: any) {
    // Geste destructif : confirmation EN PAGE. `window.confirm` est interdit
    // par scripts/check-native-dialogs.mjs.
    const ok = await dialogs.confirm(
      get(t)('serviceTokens.confirmRemove').replace('{name}', s.name),
      { danger: true },
    );
    if (!ok) return;
    stkBusy = s.id;
    try {
      await api.deleteServiceToken(s.id);
      notifications.success(`${s.name} : ${get(t)('serviceTokens.tokenDeleted')}`);
      await loadTokens();
    } catch (e: any) {
      notifications.error(`${get(t)('serviceTokens.error')} : ${e?.message ?? e}`);
    }
    stkBusy = null;
  }

  // Last.fm s'authentifie en OAuth : on ouvre la page d'autorisation, puis
  // l'utilisateur revient valider. Le jeton intermédiaire ne vit qu'ici.
  async function lfmStart() {
    stkBusy = 'lastfm';
    lfmToken = null;
    try {
      const r: any = await api.lastfmGetAuthToken();
      lfmToken = r.token;
      window.open(r.auth_url, '_blank', 'noopener');
    } catch (e: any) {
      notifications.error(`Last.fm : ${e?.message ?? e}`);
    }
    stkBusy = null;
  }

  async function lfmFinish() {
    if (!lfmToken) return;
    stkBusy = 'lastfm';
    try {
      const r: any = await api.lastfmGetSession(lfmToken);
      notifications.success(`Last.fm : ${get(t)('serviceTokens.lastfmConnected')}${r?.username ? ` (${r.username})` : ''}`);
      lfmToken = null;
      await loadTokens();
    } catch (e: any) {
      notifications.error(`Last.fm : ${e?.message ?? e}`);
    }
    stkBusy = null;
  }

  async function lfmScrobble(on: boolean) {
    stkBusy = 'lastfm';
    try {
      await api.lastfmToggleScrobble(on);
      await loadTokens();
    } catch (e: any) {
      notifications.error(`Last.fm : ${e?.message ?? e}`);
    }
    stkBusy = null;
  }

  async function lfmDisconnect() {
    const ok = await dialogs.confirm(get(t)('serviceTokens.confirmDisconnect'), { danger: true });
    if (!ok) return;
    stkBusy = 'lastfm';
    try {
      await api.lastfmDisconnect();
      notifications.success(`Last.fm : ${get(t)('serviceTokens.accountDisconnected')}`);
      await loadTokens();
    } catch (e: any) {
      notifications.error(`Last.fm : ${e?.message ?? e}`);
    }
    stkBusy = null;
  }

  let spc = $state<any | null>(null);
  let spcZone = $state<number | null>(null);
  let spcName = $state('');
  let spcBusy = $state(false);
  let spcErr = $state<string | null>(null);
  $effect(() => {
    api.getSpotifyConnectStatus()
      .then((st: any) => {
        spc = st;
        spcZone = st?.zone_id ?? $currentZoneId ?? null;
        spcName = st?.device_name ?? '';
      })
      .catch(() => { spc = null; });
  });
  async function toggleSpc(on: boolean) {
    spcBusy = true; spcErr = null;
    try {
      if (on) {
        if (spcZone == null) { spcErr = get(t)('settings.errPickZoneToExpose'); spcBusy = false; return; }
        await api.enableSpotifyConnect(spcZone, spcName.trim() || null);
      } else {
        await api.disableSpotifyConnect();
      }
      spc = await api.getSpotifyConnectStatus();
    } catch (e: any) { spcErr = e?.message ?? get(t)('settings.errActionFailed'); }
    spcBusy = false;
  }

  // ── Base de donnees / exports ─────────────────────────────────────────
  let dbEngine = $state<string | null>(null);
  let dbConnected = $state<boolean | null>(null);
  let dbPath = $state<string | null>(null);
  let dataLoc = $state<string | null>(null);
  let csvBusy = $state<string | null>(null);
  let cfgBusy = $state(false);
  let sysErr = $state<string | null>(null);

  $effect(() => {
    api.getConfig()
      .then((c: any) => {
        dbEngine = c?.db_engine ?? null;
        dbConnected = c?.db_connected ?? null;
        dbPath = c?.db_path ?? null;
        dataLoc = c?.data_dir ?? c?.data_location ?? null;
      })
      .catch(() => {});
  });

  async function exportCsv(kind: 'albums' | 'tracks' | 'artists') {
    csvBusy = kind; sysErr = null;
    try {
      if (kind === 'albums') await api.exportAlbumsCsv();
      else if (kind === 'tracks') await api.exportTracksCsv();
      else await api.exportArtistsCsv();
    } catch (e) { sysErr = `Export impossible : ${errText(e) ?? 'serveur injoignable'}`; }
    csvBusy = null;
  }
  async function doExportConfig() {
    cfgBusy = true; sysErr = null;
    try { await api.exportConfig(); }
    catch { sysErr = get(t)('settings.errConfigExportFailed'); }
    cfgBusy = false;
  }

  // ── Enrichissement (lot) ──────────────────────────────────────────────
  // Les DEUX passes sont asynchrones : le POST rend la main tout de suite et
  // le travail dure des minutes. On lance, puis on suit — et on renvoie vers
  // Tune Health, ou l'avancement de tous les chantiers vit au meme endroit.
  let enrichRunning = $state(false);
  let enrichDone = $state(0);
  let enrichTotal = $state(0);
  let coversMissing = $state<number | null>(null);
  let enrichErr = $state<string | null>(null);

  async function refreshEnrich() {
    try {
      const st = await api.getBatchEnrichStatus();
      enrichRunning = st?.status === 'running';
      enrichDone = st?.enriched ?? 0; enrichTotal = st?.total ?? 0;
    } catch { /* route absente */ }
    try {
      const a = await api.enrichArtistImagesStatus();
      coversMissing = a?.artists_without_image ?? null;
    } catch { coversMissing = null; }
  }
  $effect(() => { refreshEnrich(); });
  $effect(() => {
    if (!enrichRunning) return;
    const h = setInterval(refreshEnrich, 4000);
    return () => clearInterval(h);
  });
  async function startEnrich() {
    enrichErr = null;
    try { await api.startBatchEnrich(); enrichRunning = true; await refreshEnrich(); }
    catch { enrichErr = get(t)('settings.errStartFailed'); }
  }
  async function startCovers() {
    enrichErr = null;
    try { await api.enrichArtistImages(); await refreshEnrich(); }
    catch { enrichErr = get(t)('settings.errStartFailed'); }
  }

  // ── Rangement des fichiers importes ───────────────────────────────────
  let ingest = $state<any | null>(null);
  let ingestErr = $state<string | null>(null);
  $effect(() => {
    api.getIngestSettings().then((r: any) => { ingest = r; }).catch(() => { ingest = null; });
  });
  async function saveIngest(patch: Record<string, unknown>) {
    const before = ingest;
    ingest = { ...ingest, ...patch };
    try { const r: any = await api.updateIngestSettings(patch as any); if (r) ingest = r; }
    catch { ingest = before; ingestErr = get(t)('settings.errSettingNotSaved'); }
  }

  // ── Notifications ─────────────────────────────────────────────────────
  // Preference purement LOCALE (ce navigateur), pas un reglage de compte :
  // l'ecran le dit, sinon on la croit synchronisee entre appareils.
  let pushOn = $state(false);
  $effect(() => { try { pushOn = isPushEnabled(); } catch { pushOn = false; } });
  function togglePush(v: boolean) {
    pushOn = v;
    try { setPushEnabled(v); } catch { /* stockage indisponible */ }
  }

  function title(s: { titleKey?: string; title?: string; id: string }): string {
    return s.titleKey ? $t(s.titleKey as any) : (s.title ?? s.id);
  }
  function go(id: V2SettingsTabId) { tabId = id; highlight = null; }
</script>

<section class="v2-settings tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">Configuration</div>
      <h1>{$t('settings.titleV2' as any)}</h1>
    </div>
  </header>

  <nav class="tabs" aria-label="{$t('settings.sectionsNav' as any)}">
    {#each tabs as x (x.id)}
      <button class="tab" class:on={x.id === tabId} onclick={() => go(x.id)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d={x.icon} /></svg>
        <span>{tabLabel(x, (k) => $t(k as any))}</span>
      </button>
    {/each}
  </nav>

  <div class="body">
    <div class="pane">
      {#if tab}
        <div class="panehead">
          {#if hiddenCount > 0}
            <span class="masked">{hiddenCount} section{hiddenCount > 1 ? 's' : ''} de plus à un niveau supérieur</span>
          {/if}
          {#if !atLeast(level, 'expert')}
            <span class="masked">{$t('settings.levelsOpenMoreTabs' as any)}</span>
          {/if}
        </div>

        {#each sections as s (s.id)}
          <section class="card" class:hl={highlight === s.id}>
            <div class="cardhead">
              <h3>{title(s)}</h3>
            </div>

            {#if s.id === 'playback'}
              <div class="row">
                <div class="lbl">
                  <span>{$t('audiophile.lockVolume' as any)}</span>
                  <span class="hint">{$t('audiophile.lockVolumeHelp' as any)}</span>
                </div>
                <label class="sw">
                  <input type="checkbox" checked={$audiophileLockVolume || lockArme}
                    onchange={() => { if ($audiophileLockVolume) unlockVolume(); else lockArme = !lockArme; }} />
                  <span class="slider"></span>
                </label>
              </div>
              {#if lockArme && !$audiophileLockVolume}
                <div class="danger-box">
                  <p>{$t('audiophile.lockVolumeWarn' as any)}</p>
                  <label class="confirm">
                    <span class="sw">
                      <input type="checkbox" checked={false} onchange={confirmLockVolume} />
                      <span class="slider"></span>
                    </span>
                    <span>{$t('audiophile.lockVolumeConfirm' as any)}</span>
                  </label>
                </div>
              {/if}

              <div class="row">
                <div class="lbl">
                  <span>Fondu enchaîné</span>
                  <span class="hint">{$t('settings.crossfadeHint' as any)}{qualityZoneName ? ` — zone ${qualityZoneName}` : ''}</span>
                </div>
                <label class="sw">
                  <input type="checkbox" bind:checked={xfEnabled} onchange={applyCrossfade} disabled={qualityZoneId == null} />
                  <span class="slider"></span>
                </label>
              </div>
              {#if xfEnabled}
                <div class="row">
                  <div class="lbl"><span>{$t('settings.duration' as any)} : {xfDuration} s</span></div>
                  <input class="rng" type="range" min="1" max="12" step="1" bind:value={xfDuration} onchange={applyCrossfade} />
                </div>
              {/if}

              <div class="row">
                <div class="lbl">
                  <span>{$t('settings.loopByDefault' as any)}</span>
                  <span class="hint">{$t('settings.loopByDefaultHint' as any)}</span>
                </div>
                <label class="sw">
                  <input type="checkbox" bind:checked={$loopByDefault} />
                  <span class="slider"></span>
                </label>
              </div>

            {:else if s.id === 'voice'}
              <div class="row">
                <div class="lbl">
                  <span>{$t('settings.voiceCommand' as any)}</span>
                  <span class="hint">{$t('settings.voiceCommandHint' as any)}</span>
                </div>
                <label class="sw">
                  <input type="checkbox" checked={voiceOn} onchange={(e) => setVoice((e.currentTarget as HTMLInputElement).checked)} />
                  <span class="slider"></span>
                </label>
              </div>

            {:else if s.id === 'interface'}
              <div class="row">
                <div class="lbl">
                  <span>{$t('settings.theme' as any)}</span>
                  <span class="hint">{$t('settings.themePalettesHint' as any)}</span>
                </div>
                <div class="themerow">
                  {#each V2_THEMES as th (th.id)}
                    <button class="sw2" class:on={$preferences.v2Theme === th.id} title={th.label} aria-label={th.label}
                      aria-pressed={$preferences.v2Theme === th.id}
                      style="--sw-bg:{th.swatch[0]}; --sw-acc:{th.swatch[1]}"
                      onclick={() => setV2Theme(th.id)}></button>
                  {/each}
                </div>
              </div>

              <div class="row">
                <div class="lbl"><span>{$t('settings.language' as any)}</span></div>
                <select class="sel" value={$preferences.language ?? 'fr'}
                  onchange={(e) => { const l = (e.currentTarget as HTMLSelectElement).value as Locale;
                    preferences.update((pr) => ({ ...pr, language: l })); locale.set(l); }}>
                  {#each Object.entries(localeNames) as [code, name] (code)}
                    <option value={code}>{name}</option>
                  {/each}
                </select>
              </div>

              <div class="row">
                <div class="lbl"><span>{$t('settings.startupView' as any)}</span></div>
                <select class="sel" value={$preferences.startupView}
                  onchange={(e) => preferences.update((pr) => ({ ...pr, startupView: (e.currentTarget as HTMLSelectElement).value as StartupView }))}>
                  {#each STARTUP as o (o.v)}<option value={o.v}>{$t(o.k as any)}</option>{/each}
                </select>
              </div>

              <div class="row">
                <div class="lbl"><span>{$t('settings.defaultZone' as any)}</span></div>
                <select class="sel" value={$preferences.defaultZoneId ?? ''}
                  onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value;
                    const dz = v ? Number(v) : null;
                    preferences.update((pr) => ({ ...pr, defaultZoneId: dz }));
                    api.setDefaultZone(dz).catch(() => {}); }}>
                  <option value="">{$t('settings.autoZone' as any)}</option>
                  {#each $zones as z (z.id)}<option value={z.id}>{z.name}</option>{/each}
                </select>
              </div>

              {#if atLeast(level, 'intermediate')}
                <div class="row">
                  <div class="lbl"><span>{$t('settings.volumeDisplay' as any)}</span></div>
                  <div class="seg4">
                    <button class:on={$preferences.volumeDisplay === 'percent'}
                      onclick={() => preferences.update((pr) => ({ ...pr, volumeDisplay: 'percent' as VolumeDisplay }))}>{$t('settings.percent' as any)}</button>
                    <button class:on={$preferences.volumeDisplay === 'dB'}
                      onclick={() => preferences.update((pr) => ({ ...pr, volumeDisplay: 'dB' as VolumeDisplay }))}>{$t('settings.decibels' as any)}</button>
                  </div>
                </div>
                <!-- Niveau EXPERT seulement : la ligne technique n'existe pas
                     en dessous, proposer de l'afficher n'aurait aucun effet. -->
                {#if atLeast(level, 'expert')}
                  <div class="row">
                    <div class="lbl">
                      <span>{$t('settings.albumTechLine' as any)}</span>
                      <span class="hint">{$t('settings.albumTechLineHint' as any)}</span>
                    </div>
                    <label class="sw">
                      <input type="checkbox" checked={$preferences.v2AlbumTechLine}
                        onchange={(e) => preferences.update((pr) => ({ ...pr, v2AlbumTechLine: (e.currentTarget as HTMLInputElement).checked }))} />
                      <span class="slider"></span>
                    </label>
                  </div>
                {/if}
                <div class="row">
                  <div class="lbl">
                    <span>{$t('settings.tooltips' as any)}</span>
                    <span class="hint">{$t('settings.tooltipsHint' as any)}</span>
                  </div>
                  <label class="sw">
                    <input type="checkbox" checked={$preferences.tooltipsEnabled}
                      onchange={(e) => preferences.update((pr) => ({ ...pr, tooltipsEnabled: (e.currentTarget as HTMLInputElement).checked }))} />
                    <span class="slider"></span>
                  </label>
                </div>
              {/if}

            {:else if s.id === 'devices'}
              <!-- Section volontairement COURTE : le v2 a un ecran Zones dedie
                   et une section « Appareils reseau » dans Audio. Redupliquer
                   les listes ici, c'est garantir qu'elles divergeront. -->
              <p class="hint">
                {#if $devices.length || $zones.length}
                  <b>{formatNumber($devices.length)}</b> appareil{$devices.length > 1 ? 's' : ''} découvert{$devices.length > 1 ? 's' : ''}
                  sur le réseau, <b>{formatNumber($zones.length)}</b> zone{$zones.length > 1 ? 's' : ''} configurée{$zones.length > 1 ? 's' : ''}.
                {:else}
                  Aucun appareil découvert, aucune zone configurée.
                {/if}
              </p>
              <p class="hint">
                Les zones se créent et se règlent dans l'écran <b>Zones</b>. La visibilité des
                appareils réseau et des sorties locales se règle dans <b>Audio</b>.
              </p>
              <div class="inline" style="margin-top:12px">
                <button class="lnk" onclick={() => activeView.set('zonemanager')}>{$t('settings.openZones' as any)}</button>
                <button class="lnk" onclick={() => (tabId = 'audio')}>{$t('settings.goToAudio' as any)}</button>
              </div>

            {:else if s.id === 'metadata'}
              <p class="hint">
                Les champs affichés dans la bibliothèque et l'ordre des colonnes se règlent
                dans l'écran <b>{$t('metadata.title' as any)}</b> du Studio — c'est là que vivent aussi les
                propositions de la communauté et les albums douteux.
              </p>

            {:else if s.id === 'enrichment'}
              <div class="row">
                <div class="lbl">
                  <span>{$t('settings.enrichMetadata' as any)}</span>
                  <span class="hint">{$t('settings.enrichMetadataHint' as any)}</span>
                </div>
                <button class="lnk" disabled={enrichRunning} onclick={startEnrich}>
                  {enrichRunning ? 'En cours…' : 'Lancer'}
                </button>
              </div>
              {#if enrichRunning && enrichTotal > 0}
                <div class="bar2"><span style="width:{Math.min(100, Math.round((enrichDone / enrichTotal) * 100))}%"></span></div>
                <div class="hint">{formatNumber(enrichDone)} sur {formatNumber(enrichTotal)}</div>
              {/if}

              <div class="row">
                <div class="lbl">
                  <span>Portraits d'artistes</span>
                  <span class="hint">
                    {#if coversMissing != null}{formatNumber(coversMissing)} artistes sans portrait.{:else}Recherche les portraits manquants.{/if}
                  </span>
                </div>
                <button class="lnk" onclick={startCovers}>Lancer</button>
              </div>
              <p class="hint">{#each emphaseParts($t('settings.acousticPassesHint' as any)) as _p}{#if _p.fort}<b>{_p.texte}</b>{:else}{_p.texte}{/if}{/each}</p>
              {#if enrichErr}<div class="errline">{enrichErr}</div>{/if}

            {:else if s.id === 'ingest'}
              {#if !ingest}
                <p class="hint">{$t('settings.ingestUnavailable' as any)}</p>
              {:else}
                <p class="hint">
                  Comment Tune range les fichiers que vous importez. Ne concerne PAS les
                  dossiers déjà déclarés : ceux-là sont lus sur place, jamais déplacés.
                </p>
                <div class="row">
                  <div class="lbl"><span>{$t('settings.ingestMode' as any)}</span></div>
                  <div class="seg4">
                    <button class:on={ingest.mode === 'copy'} onclick={() => saveIngest({ mode: 'copy' })}>Copier</button>
                    <button class:on={ingest.mode === 'move'} onclick={() => saveIngest({ mode: 'move' })}>{$t('ingest.move' as any)}</button>
                  </div>
                </div>
                <div class="row">
                  <div class="lbl">
                    <span>En cas de conflit</span>
                    <span class="hint">{$t('settings.ingestConflictHint' as any)}</span>
                  </div>
                  <div class="seg4">
                    <button class:on={ingest.conflict_policy === 'skip'} onclick={() => saveIngest({ conflict_policy: 'skip' })}>Ignorer</button>
                    <button class:on={ingest.conflict_policy === 'rename'} onclick={() => saveIngest({ conflict_policy: 'rename' })}>Renommer</button>
                    <button class:on={ingest.conflict_policy === 'overwrite'} onclick={() => saveIngest({ conflict_policy: 'overwrite' })}>{$t('settings.ingestOverwrite' as any)}</button>
                  </div>
                </div>
                <div class="row">
                  <div class="lbl">
                    <span>Dossier de destination</span>
                    <span class="hint">Vide = {ingest.effective_dest_root ?? 'le premier dossier de musique'}.</span>
                  </div>
                  <input class="txt wide" type="text" placeholder={ingest.effective_dest_root ?? ''}
                    value={ingest.dest_root ?? ''}
                    onchange={(e) => saveIngest({ dest_root: (e.currentTarget as HTMLInputElement).value.trim() || null })} />
                </div>
                <div class="row">
                  <div class="lbl">
                    <span>{$t('ingest.template' as any)}</span>
                    <span class="hint">{$t('settings.defaultValueColon' as any)} <code>{ingest.default_template}</code></span>
                  </div>
                  <input class="txt wide" type="text" value={ingest.template ?? ''}
                    onchange={(e) => saveIngest({ template: (e.currentTarget as HTMLInputElement).value })} />
                </div>
                <div class="row">
                  <div class="lbl">
                    <span>{$t('settings.writeTags' as any)}</span>
                    <span class="hint">{$t('settings.writeTagsHint' as any)}</span>
                  </div>
                  <label class="sw">
                    <input type="checkbox" checked={ingest.write_tags}
                      onchange={(e) => saveIngest({ write_tags: (e.currentTarget as HTMLInputElement).checked })} />
                    <span class="slider"></span>
                  </label>
                </div>
                {#if ingestErr}<div class="errline">{ingestErr}</div>{/if}
              {/if}

            {:else if s.id === 'oxygen'}
              <div class="row">
                <div class="lbl">
                  <span>Vue Oxygen</span>
                  <span class="hint">{$t('settings.facetsNavHint' as any)}</span>
                </div>
                <label class="sw">
                  <input type="checkbox" checked={$preferences.oxygenEnabled}
                    onchange={(e) => preferences.update((pr) => ({ ...pr, oxygenEnabled: (e.currentTarget as HTMLInputElement).checked }))} />
                  <span class="slider"></span>
                </label>
              </div>
              {#if $preferences.oxygenEnabled}
                <div class="row">
                  <div class="lbl">
                    <span>{$t('oxygen.facetValues' as any)}</span>
                    <span class="hint">{$t('settings.facetValuesHint' as any)}</span>
                  </div>
                  <input class="txt time" type="number" min="0" max="2000" step="50"
                    value={$preferences.oxygenFacetLimit}
                    onchange={(e) => preferences.update((pr) => ({ ...pr, oxygenFacetLimit: Number((e.currentTarget as HTMLInputElement).value) || 0 }))} />
                </div>
              {/if}

            {:else if s.id === 'push'}
              <div class="row">
                <div class="lbl">
                  <span>Notifications</span>
                  <span class="hint">
                    Fin d'analyse, erreurs de lecture. Réglage propre à <b>ce navigateur</b> —
                    il ne suit pas votre profil d'un appareil à l'autre.
                  </span>
                </div>
                <label class="sw">
                  <input type="checkbox" checked={pushOn}
                    onchange={(e) => togglePush((e.currentTarget as HTMLInputElement).checked)} />
                  <span class="slider"></span>
                </label>
              </div>

            {:else if s.id === 'cloud'}
              <p class="hint">{#each emphaseParts($t('settings.cloudScopeHint' as any)) as _p}{#if _p.fort}<b>{_p.texte}</b>{:else}{_p.texte}{/if}{/each}</p>

            {:else if s.id === 'import'}
              <p class="hint">
                L'import d'une bibliothèque existante (Roon, Plex, dossiers structurés) reste
                dans le client actuel : c'est un assistant en plusieurs étapes, et le reprendre
                à moitié exposerait à des imports partiels difficiles à défaire.
              </p>

            {:else if s.id === 'database'}
              <div class="rows">
                <div class="kv">
                  <span>Moteur</span>
                  <b>{dbEngine === 'sqlite' ? 'SQLite' : dbEngine === 'postgres' || dbEngine === 'postgresql' ? 'PostgreSQL' : (dbEngine ?? '—')}</b>
                </div>
                <div class="kv">
                  <span>Connexion</span>
                  <b class="hs" class:ok={dbConnected === true}>{dbConnected === null ? '—' : dbConnected ? 'établie' : 'rompue'}</b>
                </div>
                {#if dbPath}
                  <div class="kv"><span>Fichier</span><b class="mono">{dbPath}</b></div>
                {/if}
              </div>
              {#if dbConnected === false}
                <div class="warnbox">
                  La base n'est pas jointe : la bibliothèque et les zones ne peuvent ni être lues
                  ni écrites. C'est la première chose à régler avant tout autre diagnostic.
                </div>
              {/if}

            {:else if s.id === 'dataLoc'}
              <div class="rows">
                <div class="kv"><span>{$t('settings.dataLocation' as any)}</span><b class="mono">{dataLoc ?? '—'}</b></div>
              </div>
              <p class="hint">{$t('settings.dataLocationHint' as any)}</p>

            {:else if s.id === 'exportCsv'}
              <p class="hint">
                Un instantané de la bibliothèque en CSV, pour un tableur ou un inventaire.
                L'export ne modifie rien.
              </p>
              <div class="inline" style="margin-top:12px">
                <button class="lnk" disabled={csvBusy !== null} onclick={() => exportCsv('albums')}>
                  {csvBusy === 'albums' ? 'Export…' : 'Albums (CSV)'}
                </button>
                <button class="lnk" disabled={csvBusy !== null} onclick={() => exportCsv('tracks')}>
                  {csvBusy === 'tracks' ? 'Export…' : 'Titres (CSV)'}
                </button>
                <button class="lnk" disabled={csvBusy !== null} onclick={() => exportCsv('artists')}>
                  {csvBusy === 'artists' ? 'Export…' : 'Artistes (CSV)'}
                </button>
              </div>
              {#if sysErr}<div class="errline">{sysErr}</div>{/if}

            {:else if s.id === 'config'}
              <p class="hint">{#each emphaseParts($t('settings.configBackupHint' as any)) as _p}{#if _p.fort}<b>{_p.texte}</b>{:else}{_p.texte}{/if}{/each}</p>
              <div class="inline" style="margin-top:12px">
                <button class="lnk" disabled={cfgBusy} onclick={doExportConfig}>
                  {cfgBusy ? $t('common.loading' as any) : $t('settings.exportConfig' as any)}
                </button>
                <button class="lnk" disabled={rstBusy} onclick={() => rstFile?.click()}>
                  {$t('settings.restoreConfig' as any)}
                </button>
                <input class="hidden-file" type="file" accept="application/json,.json"
                  bind:this={rstFile} onchange={rstChoisi} />
              </div>

              {#if rstData}
                <div class="fvbox">
                  <p>{#each emphaseParts($t('settings.restoreConfigWarning' as any)) as _p}{#if _p.fort}<b>{_p.texte}</b>{:else}{_p.texte}{/if}{/each}</p>
                  <p class="hint"><b class="mono">{rstName}</b></p>
                  <p class="hint">{#each emphaseParts($t('settings.restoreConfigType' as any)) as _p}{#if _p.fort}<b>{_p.texte}</b>{:else}{_p.texte}{/if}{/each}</p>
                  <div class="inline">
                    <input class="txt" type="text" bind:value={rstTyped}
                      placeholder={$t('settings.restoreConfigWord' as any)}
                      onkeydown={(e) => { if (e.key === 'Escape') rstAnnuler(); }} />
                    <button class="lnk danger"
                      disabled={rstBusy || rstTyped.trim() !== $t('settings.restoreConfigWord' as any)}
                      onclick={rstConfirmer}>
                      {rstBusy ? $t('common.loading' as any) : $t('settings.confirm' as any)}
                    </button>
                    <button class="lnk" disabled={rstBusy} onclick={rstAnnuler}>{$t('common.cancel' as any)}</button>
                  </div>
                </div>
              {/if}
              {#if sysErr}<div class="errline">{sysErr}</div>{/if}

            {:else if s.id === 'accessFrom'}
              <p class="hint">
                Ces adresses ouvrent Tune depuis un autre appareil du même réseau — téléphone,
                tablette, autre ordinateur. Elles ne sortent pas de votre réseau local.
              </p>
              {#if !serverUrls.length}
                <p class="hint">{$t('settings.noPublishedAddress' as any)}</p>
              {:else}
                <div class="urls">
                  {#each serverUrls as u (u)}
                    <div class="url">
                      <span class="up">{u}</span>
                      <button class="lnk" onclick={() => copyUrl(u)}>{copied === u ? 'Copiée' : 'Copier'}</button>
                    </div>
                  {/each}
                </div>
              {/if}

            {:else if s.id === 'plugins'}
              <!-- L'écran des Extensions, monté ICI. Même geste que la
                   Bibliothèque dans les Serveurs multimédia : on rend le
                   composant, on ne le recopie pas. -->
              <PluginsV2 />

            {:else if s.id === 'tokens'}
              <p class="hint">
                Les jetons <b>MusicBrainz</b>, <b>Discogs</b>, <b>Last.fm</b>, <b>Genius</b> et
                <b>ListenBrainz</b> servent à l'enrichissement des métadonnées et au scrobbling.
              </p>

              {#if stkLoading}
                <div class="state">{$t('common.loading' as any)}</div>
              {:else if !stk.length}
                <p class="hint">{$t('serviceTokens.loadError' as any)}</p>
              {:else}
                {#each stk as sv (sv.id)}
                  {@const d = stkDot(sv)}
                  <div class="svc">
                    <div class="svchead">
                      <span class="svcdot" style:background={d.color}></span>
                      <span class="svcname">{sv.name}</span>
                      <span class="svcstate">{d.label}</span>
                    </div>
                    {#if sv.purpose}<p class="hint">{sv.purpose}</p>{/if}
                    {#if sv.validation_message}
                      <p class="hint" class:bad={sv.valid === false}>{sv.validation_message}</p>
                    {/if}

                    {#if sv.fields?.length}
                      <div class="svcfields">
                        {#each sv.fields as f (f.key)}
                          <label class="svcfield">
                            <span>{f.label}</span>
                            <input
                              type={f.type}
                              bind:value={stkEdit[sv.id][f.key]}
                              placeholder={sv.configured ? $t('serviceTokens.configuredPlaceholder' as any) : ''}
                              autocomplete="off" />
                          </label>
                        {/each}
                      </div>
                      <div class="inline">
                        <button class="lnk" disabled={stkBusy === sv.id} onclick={() => stkSave(sv)}>
                          {stkBusy === sv.id ? $t('common.loading' as any) : $t('serviceTokens.saveValidate' as any)}
                        </button>
                        {#if sv.configured && sv.source === 'db'}
                          <button class="lnk" disabled={stkBusy === sv.id} onclick={() => stkTest(sv)}>{$t('serviceTokens.test' as any)}</button>
                          <button class="lnk danger" disabled={stkBusy === sv.id} onclick={() => stkRemove(sv)}>{$t('common.delete' as any)}</button>
                        {/if}
                      </div>
                    {/if}

                    {#if sv.help_url}
                      <a class="lnk" href={sv.help_url} target="_blank" rel="noopener noreferrer">{$t('serviceTokens.howToGetToken' as any)}</a>
                    {/if}

                    {#if sv.id === 'lastfm' && sv.configured}
                      <div class="svcsub">
                        {#if sv.scrobble_authenticated}
                          <div class="kv">
                            <span>{sv.lastfm_username ? `${$t('serviceTokens.connected' as any)} : ${sv.lastfm_username}` : $t('serviceTokens.accountConnected' as any)}</span>
                          </div>
                          <label class="sw">
                            <input type="checkbox" checked={sv.scrobble_enabled}
                              disabled={stkBusy === 'lastfm'}
                              onchange={(e) => lfmScrobble((e.currentTarget as HTMLInputElement).checked)} />
                            <span class="slider"></span>
                          </label>
                          <button class="lnk danger" disabled={stkBusy === 'lastfm'} onclick={lfmDisconnect}>{$t('serviceTokens.disconnectLastfm' as any)}</button>
                        {:else if lfmToken}
                          <p class="hint">{$t('serviceTokens.pendingText' as any)}</p>
                          <button class="lnk" disabled={stkBusy === 'lastfm'} onclick={lfmFinish}>{$t('serviceTokens.authorizedContinue' as any)}</button>
                        {:else}
                          <button class="lnk" disabled={stkBusy === 'lastfm'} onclick={lfmStart}>{$t('serviceTokens.connectLastfm' as any)}</button>
                        {/if}
                      </div>
                    {/if}
                  </div>
                {/each}
              {/if}

            {:else if s.id === 'spotify'}
              {#if spc && spc.available === false}
                <p class="hint">
                  Le récepteur Spotify Connect n'est pas disponible sur ce serveur.
                  {#if spc.reason}<br />{spc.reason}{/if}
                </p>
              {:else}
                <p class="hint">
                  Expose une zone comme enceinte dans l'application Spotify : elle apparaît
                  dans la liste des appareils, et la lecture arrive sur cette zone.
                </p>
                <div class="row">
                  <div class="lbl">
                    <span>{$t('settings.enableReceiver' as any)}</span>
                    {#if spc?.active}<span class="hint">Actif{#if spc.device_name} sous le nom « {spc.device_name} »{/if}.</span>{/if}
                  </div>
                  <label class="sw">
                    <input type="checkbox" checked={!!spc?.enabled} disabled={spcBusy}
                      onchange={(e) => toggleSpc((e.currentTarget as HTMLInputElement).checked)} />
                    <span class="slider"></span>
                  </label>
                </div>
                {#if !spc?.enabled}
                  <div class="row">
                    <div class="lbl"><span>{$t('settings.exposedZone' as any)}</span>
                      <span class="hint">{$t('settings.spotifyReceiverHint' as any)}</span></div>
                    <select class="sel" value={String(spcZone ?? '')}
                      onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; spcZone = v ? Number(v) : null; }}>
                      <option value="">{$t('settings.pickZone' as any)}</option>
                      {#each $zones as z (z.id)}<option value={String(z.id)}>{z.name}</option>{/each}
                    </select>
                  </div>
                  <div class="row">
                    <div class="lbl"><span>Nom affiché</span>
                      <span class="hint">{$t('settings.blankForDefaultName' as any)}</span></div>
                    <input class="txt" type="text" placeholder="Tune — Salon" bind:value={spcName} />
                  </div>
                {/if}
                {#if spcErr}<div class="errline">{spcErr}</div>{/if}
              {/if}

            {:else if s.id === 'perZone'}
              {#if !$zones.length}
                <p class="hint">{$t('settings.noZoneCreateOne' as any)}</p>
              {:else}
                <p class="hint">{$t('settings.perZoneScopeHint' as any)}</p>
                <div class="zlist">
                  {#each $zones as z (z.id)}
                    <div class="zc">
                      <div class="zch">
                        <span class="zn">{z.name}</span>
                        <span class="zt">{isLocalZone(z) ? 'sortie locale' : 'sortie réseau'}</span>
                      </div>
                      <div class="zr">
                        <label class="zf">
                          <span>DSD</span>
                          <select class="sel sm" value={z.dsd_mode ?? 'auto'}
                            onchange={(e) => setZoneField(z, () => api.updateZoneDsdMode(z.id as number, (e.currentTarget as HTMLSelectElement).value))}>
                            <option value="auto">Auto</option><option value="native">Natif</option>
                            <option value="dop">DoP</option><option value="pcm">PCM</option>
                          </select>
                        </label>
                        <label class="zf">
                          <span>{$t('settings.maxSampleRate' as any)}</span>
                          <select class="sel sm" value={String(z.max_sample_rate ?? 0)}
                            onchange={(e) => { const v = Number((e.currentTarget as HTMLSelectElement).value);
                              setZoneField(z, () => api.updateZoneMaxSampleRate(z.id as number, v > 0 ? v : null)); }}>
                            {#each RATES as r (r.v)}<option value={String(r.v)}>{r.l}</option>{/each}
                          </select>
                        </label>
                        <label class="zf">
                          <span>{$t('settings.lyricsOffset' as any)}</span>
                          <select class="sel sm" value={String(z.lyrics_offset_ms ?? 0)}
                            onchange={(e) => { const ms = Number((e.currentTarget as HTMLSelectElement).value);
                              setZoneField(z, () => api.updateZoneLyricsOffset(z.id as number, ms)); }}>
                            {#each OFFSETS as ms (ms)}<option value={String(ms)}>{ms === 0 ? 'Aucun' : `+${ms / 1000} s`}</option>{/each}
                          </select>
                        </label>
                        <label class="zf chk">
                          <input type="checkbox" checked={z.fixed_volume ?? false}
                            onchange={(e) => askFixedVolume(z, (e.currentTarget as HTMLInputElement).checked)} />
                          <span>Volume fixe</span>
                        </label>
                        <label class="zf chk">
                          <input type="checkbox" checked={z.mono_downmix ?? false}
                            onchange={(e) => setZoneField(z, () => api.updateZoneMonoDownmix(z.id as number, (e.currentTarget as HTMLInputElement).checked))} />
                          <span>{$t('zoneConfig.monoTitle' as any)}</span>
                        </label>
                      </div>

                      <!--
                        Sortie mono : VISIBLE sur toutes les zones, et l'écran dit
                        quand elle n'agira pas (Bertrand, 04/09/2026).

                        Le serveur accepte, persiste et republie `mono_downmix`
                        pour n'importe quelle zone, mais ne l'applique que sur une
                        sortie locale. Le taire là où il est inerte le rendrait
                        introuvable : sur cette installation, une seule zone est
                        locale et c'est un puits. Le montrer sans rien dire serait
                        pire — c'est le defaut que le serveur a lui-même corrigé
                        avec #3254, en publiant des codes de raison.

                        La règle reprise est celle du client actuel :
                        `output_type !== 'local'`. Le serveur en pose une seconde,
                        le mode PURE, que la fiche de zone ne publie pas — on ne
                        l'affirme donc pas ici plutôt que de la deviner.
                      -->
                      {#if (z.output_type ?? '') !== 'local'}
                        <p class="monote">{$t('zoneConfig.monoLocalOnly' as any)}</p>
                      {/if}

                      <!-- Renderers réseau SEULEMENT : ces réglages décrivent ce
                           qu'on envoie sur le fil (protocole, conteneur, profondeur).
                           Une sortie locale ne négocie rien — le bloc n'y aurait pas
                           de sens, et `probeRendererCapabilities` n'a rien à interroger. -->
                      {#if ['dlna', 'openhome'].includes(z.output_type ?? '')}
                        <details class="radv">
                          <summary>{$t('devices.rendererConfig' as any)}</summary>
                          <RendererConfig zone={z} />
                        </details>
                      {/if}

                      {#if fvAsk === z.id}
                        <div class="fvbox">
                          <p>{#each emphaseParts($t('settings.fixedVolumeWarning' as any)) as _p}{#if _p.fort}<b>{_p.texte}</b>{:else}{_p.texte}{/if}{/each}</p>
                          <div class="inline">
                            <input class="txt time" type="text" placeholder="100" bind:value={fvTyped}
                              onkeydown={(e) => { if (e.key === 'Enter') confirmFixedVolume(z); if (e.key === 'Escape') fvAsk = null; }} />
                            <button class="lnk danger" disabled={fvTyped.trim() !== '100'} onclick={() => confirmFixedVolume(z)}>Confirmer</button>
                            <button class="lnk" onclick={() => { fvAsk = null; fvTyped = ''; }}>Annuler</button>
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
                {#if zoneErr}<div class="errline">{zoneErr}</div>{/if}
              {/if}

            {:else if s.id === 'clap'}
              {#if clapAvailable === false}
                <p class="hint">{$t('settings.noAcousticModule' as any)}</p>
              {:else}
                <div class="row">
                  <div class="lbl">
                    <span>{$t('settings.acousticAnalysis' as any)}</span>
                    <span class="hint">{$t('settings.acousticAnalysisHelp' as any)}</span>
                  </div>
                  <label class="sw">
                    <input type="checkbox" checked={clapOn}
                      onchange={(e) => setClap((e.currentTarget as HTMLInputElement).checked)} />
                    <span class="slider"></span>
                  </label>
                </div>
                {#if clapOn}
                  <div class="row">
                    <div class="lbl">
                      <span>{$t('acoustic.throttle' as any)}</span>
                      <span class="hint">
                        L'analyse décode dix secondes par piste et y fait tourner un réseau.
                        Sur un Raspberry Pi, ou sur le serveur qui sert aussi la musique, la cadence se remarque.
                      </span>
                    </div>
                    <div class="seg4">
                      <button class:on={clapThrottle === 'eco'} onclick={() => setThrottle('eco')}>{$t('acoustic.throttleEco' as any)}</button>
                      <button class:on={clapThrottle === 'equilibre'} onclick={() => setThrottle('equilibre')}>{$t('acoustic.throttleBalanced' as any)}</button>
                      <button class:on={clapThrottle === 'rapide'} onclick={() => setThrottle('rapide')}>{$t('acoustic.throttleFast' as any)}</button>
                    </div>
                  </div>
                  <p class="hint">{formatNumber(clapAnalysed)} titres analysés. L'avancement se suit dans <b>Processing</b>.</p>
                {/if}
              {/if}

            {:else if s.id === 'library'}
              <div class="row">
                <div class="lbl">
                  <span>{$t('settings.scanLibraryV2' as any)}</span>
                  <span class="hint">
                    L'analyse rapide ne relit que ce qui a changé. L'analyse complète relit
                    tout — nécessaire après un changement d'option de découpage.
                  </span>
                </div>
                <div class="inline">
                  {#if scanning}
                    <span class="badge up">analyse en cours</span>
                    <button class="lnk danger" onclick={stopScan}>{$t('common.stop' as any)}</button>
                  {:else}
                    <button class="lnk" onclick={() => scan(false)}>Analyse rapide</button>
                    <button class="lnk" onclick={() => scan(true)}>{$t('settings.fullScanV2' as any)}</button>
                  {/if}
                </div>
              </div>
              {#if scanReport}
                <div class="okbox">
                  Dernière passe — {formatNumber(scanReport.inserted ?? 0)} ajoutés,
                  {formatNumber(scanReport.updated ?? 0)} mis à jour,
                  {formatNumber(scanReport.skipped ?? 0)} ignorés.
                  {#if scanReport.failed_paths?.length}
                    <b>{scanReport.failed_paths.length} chemin(s) en échec.</b>
                  {/if}
                </div>
              {/if}
              {#if libErr}<div class="errline">{libErr}</div>{/if}

            {:else if s.id === 'musicDirs'}
              <div class="row">
                <div class="lbl">
                  <span>{$t('settings.addFolder' as any)}</span>
                  <span class="hint">{$t('settings.serverPathHint' as any)}</span>
                </div>
                <div class="inline">
                  <input class="txt wide" type="text" placeholder="/Volumes/Musique" bind:value={newDir}
                    disabled={dirBusy} onkeydown={(e) => { if (e.key === 'Enter') addDir(); }} />
                  <button class="lnk" disabled={dirBusy || !newDir.trim()} onclick={addDir}>Ajouter</button>
                </div>
              </div>
              {#if musicDirs.length}
                <div class="dirs">
                  {#each musicDirs as d (d)}
                    <div class="dir">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                      <span class="dp">{d}</span>
                      <button class="del" disabled={dirBusy} onclick={() => removeDir(d)} aria-label="Retirer ce dossier">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  {/each}
                </div>
                <p class="hint">{#each emphaseParts($t('settings.removeFolderHint' as any)) as _p}{#if _p.fort}<b>{_p.texte}</b>{:else}{_p.texte}{/if}{/each}</p>
              {:else}
                <p class="hint">{$t('settings.noFolderDeclared' as any)}</p>
              {/if}
              {#if libErr}<div class="errline">{libErr}</div>{/if}

            {:else if s.id === 'scanOpts'}
              <div class="row">
                <div class="lbl">
                  <span>{$t('settings.qualitySplit' as any)}</span>
                  <span class="hint">{$t('settings.qualitySplitHint' as any)}</span>
                </div>
                <label class="sw">
                  <input type="checkbox" checked={qualitySplit}
                    onchange={(e) => setQualitySplit((e.currentTarget as HTMLInputElement).checked)} />
                  <span class="slider"></span>
                </label>
              </div>
              <p class="hint">{#each emphaseParts($t('settings.needsFullScanHint' as any)) as _p}{#if _p.fort}<b>{_p.texte}</b>{:else}{_p.texte}{/if}{/each}</p>

            {:else if s.id === 'scanSched'}
              <div class="row">
                <div class="lbl">
                  <span>Analyse automatique</span>
                  <span class="hint">{$t('settings.scanScheduleHint' as any)}</span>
                </div>
                <label class="sw">
                  <input type="checkbox" bind:checked={schedOn} onchange={saveSchedule} disabled={schedBusy} />
                  <span class="slider"></span>
                </label>
              </div>
              {#if schedOn}
                <div class="row">
                  <div class="lbl"><span>Heure</span></div>
                  <input class="txt time" type="time" bind:value={schedTime} onchange={saveSchedule} disabled={schedBusy} />
                </div>
                <p class="hint">Prochaine analyse à <b>{schedTime}</b>.</p>
              {:else}
                <p class="hint">{$t('settings.noScanScheduled' as any)}</p>
              {/if}

            {:else if s.id === 'about'}
              <div class="rows">
                <div class="kv"><span>{$t('settings.clientVersionV2' as any)}</span><b>{CLIENT_VERSION || '—'}</b></div>
                <div class="kv"><span>{$t('settings.serverVersionV2' as any)}</span><b>{serverVersion ?? '…'}</b></div>
              </div>
              {#if clientStale}
                <!-- Le client web est embarque dans la release du serveur :
                     deux numeros differents = un vieux client est servi. -->
                <div class="warnbox">
                  Le client affiché ({CLIENT_VERSION}) ne correspond pas au serveur ({serverVersion}).
                  Un ancien client est servi : videz le cache du navigateur, et vérifiez que la
                  release a bien reconstruit le client web.
                </div>
              {/if}
              {#if updateInfo?.latest_version}
                <div class="okbox">
                  {$t('settings.updateAvailable' as any)} : <b>v{updateInfo.latest_version}</b>
                  (v{updateInfo.current_version ?? serverVersion})
                </div>
                {#if zonesEnLecture > 0 && !updDone && !updBusy}
                  <p class="hint">{$t('settings.updateStopsPlayback' as any)}</p>
                {/if}
                <div class="inline">
                  <button class="lnk" disabled={updBusy} onclick={installerMaj}>
                    {updBusy ? $t('common.loading' as any) : $t('settings.updateButton' as any)}
                  </button>
                </div>
                {#if updRefus}<div class="warnbox">{updRefus}</div>{/if}
                {#if updDmg}<div class="okbox">{updDmg}</div>{/if}
                {#if updDone}<div class="okbox">{$t('settings.updateDoneReloading' as any)}</div>{/if}
              {/if}

            {:else if s.id === 'license'}
              <div class="rows">
                <div class="kv">
                  <span>Palier</span>
                  <b class="tierb" class:prem={lic.tier !== 'free'}>{lic.tier}</b>
                </div>
                {#if lic.licenseKey}
                  <div class="kv"><span>Clé</span><b class="mono">{maskKey(lic.licenseKey)}</b></div>
                {/if}
                {#if lic.expiresAt}
                  <div class="kv"><span>{$t('settings.expiresOn' as any)}</span><b>{new Date(lic.expiresAt).toLocaleDateString('fr-FR')}</b></div>
                {/if}
                <div class="kv"><span>{$t('settings.allowedZones' as any)}</span><b>{lic.zoneLimit}</b></div>
              </div>

              {#if lic.sessionConflict}
                <!-- Le premium est suspendu ici parce que la licence est active
                     ailleurs : le dire, sinon l'utilisateur croit avoir perdu
                     ses fonctions. -->
                <div class="warnbox">
                  Cette licence est actuellement active sur un autre serveur. Les fonctions
                  premium sont suspendues ici tant qu'elle y reste ouverte.
                </div>
              {/if}

              {#if lic.licenseKey}
                <div class="row">
                  <div class="lbl"><span>{$t('settings.releaseLicense' as any)}</span>
                    <span class="hint">{$t('settings.releaseLicenseHint' as any)}</span></div>
                  <button class="lnk danger" disabled={licBusy} onclick={deactivateLic}>{$t('settings.disable' as any)}</button>
                </div>
              {:else}
                <div class="row">
                  <div class="lbl"><span>{$t('settings.activateLicense' as any)}</span>
                    <span class="hint">{$t('settings.licenceKeyByEmail' as any)}</span></div>
                  <div class="inline">
                    <input class="txt" type="text" placeholder="XXXX-XXXX-XXXX" bind:value={licKey}
                      disabled={licBusy} onkeydown={(e) => { if (e.key === 'Enter') activateLic(); }} />
                    <button class="lnk" disabled={licBusy || !licKey.trim()} onclick={activateLic}>
                      {licBusy ? '…' : 'Activer'}
                    </button>
                  </div>
                </div>
              {/if}
              {#if licErr}<div class="errline">{licErr}</div>{/if}

            {:else if s.id === 'health'}
              <div class="rows">
                <div class="kv">
                  <span>{$t('settings.status' as any)}</span>
                  <b class="hs" class:ok={health?.status === 'ok' || health?.status === 'healthy'}>{health?.status ?? 'inconnu'}</b>
                </div>
                {#if stats}
                  <div class="kv"><span>Titres</span><b>{formatNumber(stats.tracks)}</b></div>
                  <div class="kv"><span>Albums</span><b>{formatNumber(stats.albums)}</b></div>
                  <div class="kv"><span>Artistes</span><b>{formatNumber(stats.artists)}</b></div>
                  <div class="kv"><span>Zones</span><b>{formatNumber(stats.zones)}</b></div>
                  <div class="kv"><span>Appareils</span><b>{formatNumber(stats.devices)}</b></div>
                {/if}
              </div>
              {#if health?.components && Object.keys(health.components).length}
                <div class="comps">
                  {#each Object.entries(health.components) as [name, ok] (name)}
                    <span class="comp" class:ok>{name}</span>
                  {/each}
                </div>
              {/if}
              <p class="hint">{#each emphaseParts($t('settings.backgroundTasksHint' as any)) as _p}{#if _p.fort}<b>{_p.texte}</b>{:else}{_p.texte}{/if}{/each}</p>

            {:else if s.id === 'streaming'}
              {#if !Object.keys(svcs).length}
                <p class="hint">{$t('settings.noServiceConfigured' as any)}</p>
              {:else}
                <div class="svclist">
                  {#each Object.entries(svcs) as [name, st] (name)}
                    {@const flow = deviceFlow[name]}
                    <div class="svc">
                      <div class="sname">
                        {name}
                        <span class="sst" class:ok={st.authenticated} class:off={!st.enabled}>
                          {!st.enabled ? 'désactivé' : st.authenticated ? 'connecté' : 'non connecté'}
                        </span>
                        {#if st.username}<em>{st.username}</em>{/if}
                        {#if st.subscription}<em class="sub">{st.subscription}</em>{/if}
                      </div>

                      {#if st.authenticated}
                        <button class="lnk danger" onclick={() => disconnectSvc(name)}>{$t('settings.signOut' as any)}</button>

                      {:else if flow}
                        <!-- Code d'appareil : on affiche le code et le lien, et on
                             sonde en fond jusqu'à ce que le service confirme. -->
                        <div class="flow">
                          {#if flow.code}<code class="ucode">{flow.code}</code>{/if}
                          <a class="lnk" href={flow.url} target="_blank" rel="noopener">{$t('settings.openSignInPage' as any)}</a>
                          <span class="waiting">En attente de confirmation…</span>
                          <button class="lnk" onclick={() => cancelFlow(name)}>Annuler</button>
                        </div>

                      {:else if usesPassword(name) && cred[name]}
                        <div class="inline">
                          <input class="txt" type="text" placeholder="Identifiant" autocomplete="username"
                            bind:value={cred[name].user} disabled={svcBusy === name} />
                          <input class="txt" type="password" placeholder="Mot de passe" autocomplete="current-password"
                            bind:value={cred[name].pass} disabled={svcBusy === name}
                            onkeydown={(e) => { if (e.key === 'Enter') connectSvc(name); }} />
                          <button class="lnk" disabled={svcBusy === name || !cred[name]?.user || !cred[name]?.pass}
                            onclick={() => connectSvc(name)}>{svcBusy === name ? '…' : 'Se connecter'}</button>
                        </div>

                      {:else}
                        <button class="lnk" disabled={svcBusy === name || !st.enabled}
                          onclick={() => connectSvc(name)}>{svcBusy === name ? '…' : 'Se connecter'}</button>
                      {/if}

                      {#if svcErr[name]}<div class="serr">{svcErr[name]}</div>{/if}
                    </div>
                  {/each}
                </div>
              {/if}

            {:else if s.id === 'wifi'}
              {#if isAppliance === false}
                <p class="hint">{$t('settings.wifiApplianceOnly' as any)}</p>
              {:else if isAppliance === null}
                <p class="hint">Serveur injoignable.</p>
              {:else}
                <p class="hint">
                  {#if wifiStatus?.wifi_connected}
                    {$t('settings.wifiConnectedTo' as any).replace('{ssid}', wifiStatus?.wifi_ssid ?? '')}
                  {:else}
                    {$t('settings.wifiNotConnected' as any)}
                  {/if}
                  {#if wifiStatus?.ethernet_connected}&nbsp;·&nbsp;{$t('settings.wifiEthernetOn' as any)}{/if}
                </p>
                {#if wifiOk}<p class="okline">{$t('settings.wifiConnectSuccess' as any).replace('{ssid}', wifiOk)}</p>{/if}
                {#if wifiErr}<p class="warn">{wifiErr}</p>{/if}
                {#if wifiScanning && !wifiNets.length}
                  <p class="hint">{$t('settings.wifiScanning' as any)}</p>
                {:else if !wifiNets.length}
                  <p class="hint">{$t('settings.wifiNoNetworks' as any)}</p>
                {:else}
                  <div class="devlist">
                    {#each wifiNets as net (net.ssid)}
                      <div class="wifi" class:sel={wifiSel === net.ssid}>
                        <button class="wrow" onclick={() => selectWifi(net.ssid)}>
                          <span class="dn">{net.ssid}</span>
                          {#if net.security}<span class="dt">{net.security}</span>{/if}
                          <span class="dh">{net.signal}%</span>
                          {#if net.in_use}<span class="badge up">{$t('settings.wifiInUse' as any)}</span>{/if}
                        </button>
                        {#if net.in_use}
                          <button class="lnk danger" onclick={() => forgetWifi(net.ssid)}>{$t('settings.wifiForget' as any)}</button>
                        {:else if wifiSel === net.ssid}
                          <div class="inline">
                            {#if net.security}
                              <input class="txt" type="password" placeholder={$t('settings.wifiPassword' as any)}
                                bind:value={wifiPwd} disabled={wifiConnecting}
                                onkeydown={(e) => { if (e.key === 'Enter') connectWifi(); }} />
                            {/if}
                            <button class="lnk" onclick={connectWifi} disabled={wifiConnecting || (!!net.security && !wifiPwd)}>
                              {wifiConnecting ? '…' : $t('settings.wifiConnect' as any)}
                            </button>
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
                <div class="foot">
                  <span class="hint"></span>
                  <button class="lnk" onclick={scanWifi} disabled={wifiScanning}>{$t('settings.wifiScan' as any)}</button>
                </div>
              {/if}

            {:else if s.id === 'bridge'}
              <div class="row">
                <div class="lbl">
                  <span>{$t('settings.remoteAccess' as any)}</span>
                  <span class="hint">{$t('settings.remoteAccessHint' as any)}</span>
                </div>
                <button class="lnk" class:danger={brEnabled} onclick={toggleBridge} disabled={brBusy}>
                  {brBusy ? '…' : brEnabled ? 'Désactiver' : 'Activer'}
                </button>
              </div>
              {#if brEnabled}
                <div class="row">
                  <div class="lbl"><span>{$t('settings.status' as any)}</span></div>
                  <span class="badge" class:up={brConnected}>{brConnected ? 'Connecté' : 'Déconnecté'}</span>
                </div>
                <div class="row">
                  <div class="lbl"><span>{$t('settings.serverIdLabel' as any)}</span></div>
                  <span class="mono">{brServerId}</span>
                </div>
                {#if brUrl}
                  <div class="row">
                    <div class="lbl"><span>{$t('settings.accessAddress' as any)}</span></div>
                    <a class="mono link" href={brUrl} target="_blank" rel="noopener">{brUrl}</a>
                  </div>
                {/if}
                {#if brToken}
                  <div class="tok">
                    <span class="tlab">Jeton</span>
                    <code>{brToken}</code>
                    <span class="warnline">{$t('settings.copyTokenNowWarning' as any)}</span>
                  </div>
                {/if}
                {#if !brConnected}
                  <p class="warn">{$t('settings.restartToReachRelay' as any)}</p>
                {/if}
              {/if}

            {:else if s.id === 'tuneServers'}
              {#if peersBusy && !peers.length}
                <p class="hint">{$t('settings.searching' as any)}</p>
              {:else if !peers.length}
                <p class="hint">{$t('settings.noTunePeers' as any)}</p>
              {:else}
                <div class="devlist">
                  {#each peers as pr (pr.host + ':' + pr.port)}
                    <div class="dev net">
                      <span class="dn">{pr.name}</span>
                      <span class="dh">{pr.host}:{pr.port} — v{pr.version}</span>
                      <span class="dt">{pr.tracks} {$t('common.tracks' as any)} · {$t('settings.peerZones' as any).replace('{n}', String(pr.zones))}</span>
                      <button class="lnk" onclick={() => window.open(`http://${pr.host}:${pr.port}`, '_blank')}>{$t('settings.browse' as any)}</button>
                      <button class="del" onclick={() => removePeer(pr)} aria-label={$t('settings.peerRemove' as any)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
              <div class="row">
                <div class="lbl">
                  <span>{$t('settings.peerAdd' as any)}</span>
                  <span class="hint">{$t('settings.peerAddHint' as any)}</span>
                </div>
                <div class="inline">
                  <input class="txt" type="text" placeholder={$t('settings.peerAddHostPlaceholder' as any)}
                    bind:value={peerHost} disabled={peerAdding}
                    onkeydown={(e) => { if (e.key === 'Enter') addPeer(); }} />
                  <input class="txt num" type="number" placeholder="8888" bind:value={peerPort} disabled={peerAdding} />
                  <button class="lnk" onclick={addPeer} disabled={peerAdding || !peerHost.trim()}>{$t('settings.peerAdd' as any)}</button>
                  <button class="lnk" onclick={fetchPeers} disabled={peersBusy}>{$t('settings.refresh' as any)}</button>
                </div>
              </div>

            {:else if s.id === 'squeezebox'}
              <div class="row">
                <div class="lbl">
                  <span>{$t('settings.squeezeboxEnabled' as any)}</span>
                  <span class="hint">{$t('settings.squeezeboxHint' as any)}</span>
                </div>
                <label class="sw">
                  <input type="checkbox" checked={sbEnabled} disabled={sbSaving} onchange={toggleSqueezebox} />
                  <span class="slider"></span>
                </label>
              </div>
              {#if sbEnabled}
                <div class="row">
                  <div class="lbl">
                    <span>{$t('settings.squeezeboxLmsHost' as any)}</span>
                    {#if sbStatus?.lms_discovered && sbStatus?.lms_host}
                      <span class="hint">{$t('settings.squeezeboxLmsDetected' as any).replace('{host}', sbStatus.lms_host)}</span>
                    {/if}
                  </div>
                  <div class="inline">
                    <input class="txt" type="text" placeholder={$t('settings.squeezeboxLmsPlaceholder' as any)}
                      bind:value={sbHost} disabled={sbSaving}
                      onkeydown={(e) => { if (e.key === 'Enter') saveSqueezeboxHost(); }} />
                    <button class="lnk" onclick={saveSqueezeboxHost} disabled={sbSaving}>
                      {sbSaving ? $t('settings.squeezeboxSaving' as any) : $t('common.save' as any)}
                    </button>
                  </div>
                </div>
                <div class="subhead">
                  <span>{$t('settings.squeezeboxPlayers' as any)}</span>
                  <button class="lnk" onclick={discoverSqueezebox} disabled={sbLoading}>
                    {sbLoading ? $t('settings.squeezeboxRefreshing' as any) : $t('settings.squeezeboxRefresh' as any)}
                  </button>
                </div>
                {#if sbStatus?.players?.length}
                  <div class="devlist">
                    {#each sbStatus.players as pl (pl.id)}
                      <div class="dev net">
                        <span class="badge" class:up={pl.connected}>{pl.connected ? $t('settings.squeezeboxConnected' as any) : $t('settings.squeezeboxDisconnected' as any)}</span>
                        <span class="dn">{pl.name}</span>
                        <span class="dh">{pl.model} — {pl.ip}</span>
                        <button class="lnk" onclick={() => zoneFromPlayer(pl)} disabled={sbCreating === pl.id || !pl.connected}>
                          {sbCreating === pl.id ? $t('settings.squeezeboxCreatingZone' as any) : $t('settings.squeezeboxCreateZone' as any)}
                        </button>
                      </div>
                    {/each}
                  </div>
                {:else if !sbLoading}
                  <p class="hint">{$t('settings.squeezeboxNoPlayers' as any)}</p>
                {/if}
              {/if}

            {:else if s.id === 'hqplayer'}
              <div class="row">
                <div class="lbl">
                  <span>{$t('settings.enableHqplayer' as any)}</span>
                  <span class="hint">{$t('settings.hqplayerHint' as any)}</span>
                </div>
                <label class="sw">
                  <input type="checkbox" checked={hqEnabled} disabled={hqSaving} onchange={(e) => saveHq((e.currentTarget as HTMLInputElement).checked)} />
                  <span class="slider"></span>
                </label>
              </div>
              {#if hqEnabled}
                <div class="row">
                  <div class="lbl"><span>{$t('settings.hqplayerIp' as any)}</span></div>
                  <div class="inline">
                    <input class="txt" type="text" placeholder="192.168.1.100" bind:value={hqHost} disabled={hqSaving}
                      onkeydown={(e) => { if (e.key === 'Enter') saveHq(); }} />
                    <input class="txt num" type="number" placeholder="4321" bind:value={hqPort} disabled={hqSaving} />
                    <button class="lnk" onclick={() => saveHq()} disabled={hqSaving}>
                      {hqSaving ? $t('settings.saving' as any) : $t('common.save' as any)}
                    </button>
                  </div>
                </div>
                <div class="row">
                  <div class="lbl">
                    <span>{$t('settings.status' as any)}</span>
                    {#if hqReachable === true}
                      <span class="hint">HQPlayer @ {hqStatusHost}:{hqStatusPort}</span>
                    {:else if hqReachable === false && hqStatusMsg}
                      <span class="hint">{hqStatusMsg}</span>
                    {/if}
                  </div>
                  <div class="inline">
                    {#if hqChecking}
                      <span class="badge">…</span>
                    {:else if hqReachable === true}
                      <span class="badge up">{$t('settings.connected' as any)}</span>
                    {:else if hqReachable === false}
                      <span class="badge">{$t('settings.unreachable' as any)}</span>
                    {:else}
                      <span class="hint">{$t('settings.notTested' as any)}</span>
                    {/if}
                    <button class="lnk" onclick={checkHq} disabled={hqChecking}>{$t('settings.testConnection' as any)}</button>
                  </div>
                </div>
              {/if}

            {:else if s.id === 'audioDiag'}
              <!-- Bilan de sante : trois compteurs qui disent d'un coup d'oeil
                   si la chaine est jouable. Les valeurs viennent des memes
                   stores que le reste de l'ecran, donc jamais desynchronisees. -->
              <div class="diag">
                <div class="dl">
                  <span class="di" class:ok={$zones.length > 0}>{$zones.length > 0 ? '✓' : '!'}</span>
                  <span class="dlab">{$t('settings.playbackZones' as any)}</span>
                  <span class="dval">{$t('settings.zonesConfigured' as any).replace('{n}', String($zones.length))}</span>
                </div>
                <div class="dl">
                  <span class="di" class:ok={audioDevices.length > 0}>{audioDevices.length > 0 ? '✓' : '!'}</span>
                  <span class="dlab">{$t('settings.audioOutputs' as any)}</span>
                  <span class="dval">{$t('settings.outputsDetected' as any).replace('{n}', String(audioDevices.length))}</span>
                </div>
                <div class="dl">
                  <span class="di info" class:ok={$devices.length > 0}>{$devices.length > 0 ? '✓' : 'i'}</span>
                  <span class="dlab">{$t('settings.networkDevicesLabel' as any)}</span>
                  <span class="dval">{$t('settings.devicesFound' as any).replace('{n}', String($devices.length))}</span>
                </div>
              </div>
              {#if $zones.length === 0}
                <p class="warn">{$t('settings.noZonesHint' as any)}</p>
              {:else if audioDevices.length === 0}
                <p class="warn">{$t('settings.noAudioOutputHint' as any)}</p>
              {/if}

            {:else if s.id === 'dsd'}
              <div class="row">
                <div class="lbl">
                  <span>{$t('settings.dsdNetworkLabel' as any)}</span>
                  <span class="hint">{$t('settings.dsdNetworkHint' as any)}</span>
                </div>
                <div class="seg4">
                  <button class:on={!dsdStream} onclick={() => setDsdStream(false)}>{$t('settings.dsdOptionFile' as any)}</button>
                  <button class:on={dsdStream} onclick={() => setDsdStream(true)}>{$t('settings.dsdOptionStream' as any)}</button>
                </div>
              </div>

            {:else if s.id === 'eqBands'}
              <div class="row">
                <div class="lbl">
                  <span>{$t('settings.eqBandsLabel' as any)}</span>
                  <span class="hint">{$t('settings.eqBandsHint' as any)}</span>
                </div>
                <div class="seg4">
                  <button class:on={eqBands === 10} onclick={() => setEqBands(10)}>{$t('settings.eqBands10' as any)}</button>
                  <button class:on={eqBands === 15} onclick={() => setEqBands(15)}>{$t('settings.eqBands15' as any)}</button>
                  <button class:on={eqBands === 31} onclick={() => setEqBands(31)}>{$t('settings.eqBands31' as any)}</button>
                </div>
              </div>

            {:else if s.id === 'netDevices'}
              <div class="acts">
                <button class="lnk" onclick={showAllNet}>{$t('settings.showAll' as any)}</button>
                <button class="lnk" onclick={hideAllNet}>{$t('settings.hideAll' as any)}</button>
                <button class="lnk danger" onclick={clearDevices}>{$t('settings.clearDevices' as any)}</button>
              </div>
              <div class="devlist">
                {#each $devices as d (d.id)}
                  {@const pid = `net:${d.id}`}
                  {@const isAir = d.type === 'airplay' || d.type === 'airplay2'}
                  <div class="dev net">
                    <input type="checkbox" checked={!$preferences.hiddenDeviceIds.includes(pid)}
                      onchange={() => toggleDevice(pid)} aria-label={`Afficher ${d.name}`} />
                    <span class="dn">{d.name}</span>
                    <span class="dt">{netLabel(d.type)}</span>
                    {#if d.host}<span class="dh">{d.host}</span>{/if}
                    {#if isAir}
                      {#if pairId === d.id && pairAwaiting}
                        <input class="pin" type="text" placeholder={$t('pairing.pinPlaceholder' as any)}
                          bind:value={pairPin} disabled={pairBusy}
                          onkeydown={(e) => { if (e.key === 'Enter') submitPin(); if (e.key === 'Escape') cancelPairing(); }} />
                        <button class="lnk" onclick={submitPin} disabled={pairBusy || !pairPin.trim()}>{$t('pairing.submit' as any)}</button>
                        <button class="lnk" onclick={cancelPairing}>{$t('pairing.cancel' as any)}</button>
                      {:else if pairId === d.id && pairMsg}
                        <span class="pmsg">{pairMsg}</span>
                      {:else}
                        <button class="lnk" onclick={() => startPairing(d.id)} disabled={pairBusy}>
                          {pairBusy && pairId === d.id ? $t('pairing.pairing' as any) : $t('pairing.pair' as any)}
                        </button>
                      {/if}
                    {/if}
                    <button class="del" onclick={() => deleteDevice(d.id, d.name)} aria-label={$t('settings.deleteDevice' as any)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                {:else}
                  <p class="hint">
                    {#if !netLoaded}Recherche des appareils…
                    {:else if netError}Liste indisponible — serveur injoignable.
                    {:else}{$t('settings.noNetworkDevices' as any)}{/if}
                  </p>
                {/each}
              </div>

            {:else if s.id === 'localAudio'}
              {#if atLeast(level, 'expert')}
                <div class="row">
                  <div class="lbl"><span>{$t('settings.audioBackend' as any)}</span></div>
                  <div class="seg4">
                    <button class:on={audioBackend === 'auto'} onclick={() => setBackend('auto')}>{$t('settings.autoDefault' as any)}</button>
                    <button class:on={audioBackend === 'wasapi'} onclick={() => setBackend('wasapi')}>WASAPI</button>
                    <button class:on={audioBackend === 'asio'} onclick={() => setBackend('asio')}>ASIO</button>
                  </div>
                </div>
                {#if audioBackend === 'wasapi'}
                  <div class="row">
                    <div class="lbl"><span>Mode WASAPI</span></div>
                    <div class="seg4">
                      <button class:on={!exclusiveMode} onclick={() => setExclusive(false)}>{$t('settings.sharedDefault' as any)}</button>
                      <button class:on={exclusiveMode} onclick={() => setExclusive(true)}>{$t('settings.exclusiveBitPerfect' as any)}</button>
                    </div>
                  </div>
                {/if}
              {/if}

              {#if atLeast(level, 'intermediate')}
                <div class="row">
                  <div class="lbl">
                    <span>{$t('settings.replayGain' as any)}</span>
                    <span class="hint">{$t('settings.replayGainHint' as any)}</span>
                  </div>
                  <div class="seg4">
                    <button class:on={rgMode === 'off'} onclick={() => setRgMode('off')}>{$t('settings.replayGainOff' as any)}</button>
                    <button class:on={rgMode === 'track'} onclick={() => setRgMode('track')}>{$t('settings.replayGainTrack' as any)}</button>
                    <button class:on={rgMode === 'album'} onclick={() => setRgMode('album')}>{$t('settings.replayGainAlbum' as any)}</button>
                  </div>
                </div>
                {#if rgMode !== 'off' && atLeast(level, 'expert')}
                  <div class="row">
                    <div class="lbl"><span>{$t('settings.replayGainPreamp' as any)}</span></div>
                    <div class="seg4">
                      {#each [-6, -3, 0, 3, 6] as db (db)}
                        <button class:on={rgPreamp === db} onclick={() => setRgPreamp(db)}>{db > 0 ? `+${db}` : db} dB</button>
                      {/each}
                    </div>
                  </div>
                  <div class="row">
                    <div class="lbl"><span>{$t('settings.replayGainPreventClipping' as any)}</span></div>
                    <label class="sw">
                      <input type="checkbox" checked={rgAntiClip} onchange={(e) => setRgAntiClip((e.currentTarget as HTMLInputElement).checked)} />
                      <span class="slider"></span>
                    </label>
                  </div>
                {/if}
                <div class="row">
                  <div class="lbl">
                    <span>{$t('settings.replaygainSource' as any)}</span>
                    <span class="hint">{rgAnalysis ? $t('settings.replaygainSourceTagsAnalysis' as any) : $t('settings.replaygainSourceTagsOnly' as any)}</span>
                  </div>
                  <label class="sw">
                    <input type="checkbox" checked={rgAnalysis} onchange={(e) => setRgAnalysis((e.currentTarget as HTMLInputElement).checked)} />
                    <span class="slider"></span>
                  </label>
                </div>
              {/if}

              <div class="devlist">
                {#each audioDevices as d (d.id)}
                  {@const pid = `audio:${d.id}`}
                  <label class="dev">
                    <input type="checkbox" checked={!$preferences.hiddenDeviceIds.includes(pid)} onchange={() => toggleDevice(pid)} />
                    <span class="dn">{d.name}</span>
                    <span class="dt">{etiquetteCaracteristiques(d)}</span>
                  </label>
                {:else}
                  <p class="hint">{devicesLoaded ? $t('settings.noAudioDevices' as any) : 'Recherche des sorties…'}</p>
                {/each}
              </div>

              <div class="foot">
                <span class="hint">{$t('settings.playHereHint' as any)}</span>
                <button class="lnk" onclick={createBrowserZoneHere} disabled={creatingBrowserZone}>
                  {creatingBrowserZone ? 'Création…' : $t('settings.createBrowserZone' as any)}
                </button>
              </div>

            {:else if s.id === 'zoneAutoCreate'}
              <div class="row">
                <div class="lbl">
                  <span>{$t('settings.zoneAutoCreateLabel' as any)}</span>
                  <span class="hint">{$t('settings.zoneAutoCreateHint' as any)}</span>
                </div>
                {#if autoCreate === null}
                  <span class="unavail">Serveur injoignable</span>
                {:else}
                  <label class="sw">
                    <input type="checkbox" checked={autoCreate} disabled={autoCreateBusy}
                      onchange={(e) => setAutoCreate((e.currentTarget as HTMLInputElement).checked)} />
                    <span class="slider"></span>
                  </label>
                {/if}
              </div>

            {:else if s.id === 'streamQuality'}
              <div class="row">
                <div class="lbl">
                  <span>{$t('settings.streamingQuality' as any)}</span>
                  <span class="hint">
                    {#if qualityZoneName}
                      S'applique à la zone <b>{qualityZoneName}</b>. Chaque zone a sa propre qualité.
                    {:else}
                      Aucune zone active — sélectionnez une zone pour régler sa qualité.
                    {/if}
                  </span>
                </div>
                <div class="seg4">
                  {#each QUALITIES as opt (opt.v)}
                    <button class:on={quality === opt.v} disabled={qualityBusy || qualityZoneId == null}
                      onclick={() => setQuality(opt.v)}>{$t(opt.k as any)}</button>
                  {/each}
                </div>
              </div>

            {:else if s.id === 'followMe'}
              <!-- Section réellement portée : même store que l'écran actuel,
                   donc le réglage est partagé, pas dupliqué. -->
              <div class="row">
                <div class="lbl">
                  <span>{$t('settings.followMeLabel' as any)}</span>
                  <span class="hint">{$t('settings.followMeHint' as any)}</span>
                </div>
                <label class="sw">
                  <input type="checkbox" bind:checked={$followMe} />
                  <span class="slider"></span>
                </label>
              </div>
            {/if}
          </section>
        {/each}

        {#if !sections.length}
          <div class="empty">{$t('settings.nothingAtThisLevel' as any)}</div>
        {/if}
      {/if}
    </div>
  </div>
</section>

<style>
  .v2-settings{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .top{padding:24px 30px 12px; padding-right:96px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}

  /* Onglets horizontaux : une barre laterale existe deja a gauche, une
     seconde aurait mange la largeur utile et brouille la hierarchie. */
  .tabs{display:flex; gap:4px; padding:4px 30px 0; overflow-x:auto; scrollbar-width:none;
    border-bottom:1px solid var(--v2-line); flex:0 0 auto}
  .tabs::-webkit-scrollbar{display:none}
  .tab{position:relative; display:inline-flex; align-items:center; gap:8px; padding:11px 14px 13px; border:0;
    background:transparent; color:var(--v2-txt2); font:600 13.5px var(--v2-sans); cursor:pointer;
    white-space:nowrap; transition:.15s}
  .tab svg{width:16px; height:16px; flex:0 0 auto}
  .tab:hover{color:var(--v2-txt)}
  .tab.on{color:var(--v2-txt)}
  .tab.on svg{color:var(--v2-acc1)}
  /* Souligne actif : cale sur le filet du conteneur, d'ou le -1px. */
  .tab.on::after{content:""; position:absolute; left:10px; right:10px; bottom:-1px; height:2px; border-radius:2px;
    background:linear-gradient(90deg,var(--v2-acc1),var(--v2-acc2))}

  .body{flex:1; min-height:0; display:flex; padding:0 30px}
  .pane{flex:1; overflow-y:auto; padding:16px 4px 40px; display:flex; flex-direction:column; gap:14px}
  .pane::-webkit-scrollbar{width:9px}.pane::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .panehead{display:flex; align-items:baseline; gap:16px; flex-wrap:wrap}
  .panehead:empty{display:none}
  .masked{font:11px var(--v2-mono); color:var(--v2-txt3)}

  .card{border:1px solid var(--v2-line); border-radius:14px; background:var(--v2-surface2); padding:16px 18px}
  .card.hl{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .cardhead{display:flex; align-items:baseline; gap:12px; flex-wrap:wrap}
  .cardhead h3{font-size:15px; font-weight:700}

  .row{display:flex; align-items:center; justify-content:space-between; gap:20px; margin-top:12px}
  .lbl{display:flex; flex-direction:column; gap:4px; min-width:0}
  .lbl span:first-child{font-size:13.5px; font-weight:500}
  .hint{font-size:11.5px; line-height:1.45; color:var(--v2-txt3)}
  .sw{position:relative; flex:0 0 auto; width:44px; height:25px; cursor:pointer}
  .sw input{position:absolute; opacity:0; width:0; height:0}
  .slider{position:absolute; inset:0; border-radius:999px; background:var(--v2-line2); transition:.18s}
  .slider::before{content:""; position:absolute; left:3px; top:3px; width:19px; height:19px; border-radius:50%;
    background:var(--v2-knob); transition:.18s}
  .sw input:checked + .slider{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw input:checked + .slider::before{transform:translateX(19px)}
  .sw input:focus-visible + .slider{box-shadow:0 0 0 3px var(--v2-focus)}

  .bar2{margin-top:12px; height:6px; border-radius:4px; background:var(--v2-line); overflow:hidden}
  .bar2 span{display:block; height:100%; border-radius:4px;
    background:linear-gradient(90deg,var(--v2-acc1),var(--v2-acc2)); transition:width .4s}
  .hint code{font:11px var(--v2-mono); color:var(--v2-acc2)}
  .urls{display:flex; flex-direction:column; gap:1px; margin-top:12px}
  .url{display:flex; align-items:center; justify-content:space-between; gap:16px; padding:9px 10px; border-radius:8px}
  .url:hover{background:var(--v2-hover)}
  .up{font:12.5px var(--v2-mono); color:var(--v2-acc-tint); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .zlist{display:flex; flex-direction:column; gap:9px; margin-top:12px}
  .zc{padding:13px 15px; border-radius:12px; border:1px solid var(--v2-line); background:var(--v2-bg)}
  .zch{display:flex; align-items:baseline; gap:11px}
  .zn{font-size:14px; font-weight:700}
  .zt{font:9.5px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .zr{display:flex; gap:18px; flex-wrap:wrap; margin-top:12px}
  .zf{display:flex; flex-direction:column; gap:5px}
  .zf > span{font:10px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .zf.chk{flex-direction:row; align-items:center; gap:8px; align-self:flex-end; padding-bottom:8px; cursor:pointer}
  .zf.chk input{accent-color:var(--v2-acc1); width:15px; height:15px; cursor:pointer}
  .zf.chk span{font:12px var(--v2-sans); text-transform:none; letter-spacing:0; color:var(--v2-txt2)}
  .sel.sm{min-width:130px; height:32px; font-size:12.5px}
  /* Repliable, comme dans le client actuel : sept réglages de plus déployés
     en permanence sur chacune des 14 zones noieraient les quatre courants. */
  .monote{margin-top:9px; font-size:12px; line-height:1.55; color:var(--v2-txt3)}
  .radv{margin-top:13px; border-top:1px solid var(--v2-line); padding-top:11px}
  .radv summary{cursor:pointer; font:600 12px var(--v2-mono); letter-spacing:.05em;
    color:var(--v2-acc1); list-style:none}
  .radv summary::-webkit-details-marker{display:none}
  .radv summary::before{content:'▸ '; display:inline-block; transition:transform .12s}
  .radv[open] summary::before{content:'▾ '}
  .radv > :global(.rc){margin-top:11px}
  .fvbox{margin-top:13px; padding:12px 14px; border-radius:10px; border:1px solid var(--v2-danger-bd)}
  .fvbox p{font-size:12.5px; line-height:1.55; color:var(--v2-txt2)}
  .fvbox b{color:var(--v2-txt)}
  .fvbox .inline{margin-top:11px}
  .txt.wide{width:320px}
  .txt.time{width:130px; font-family:var(--v2-mono)}
  .dirs{display:flex; flex-direction:column; gap:1px; margin-top:12px}
  .dir{display:grid; grid-template-columns:20px 1fr auto; align-items:center; gap:12px; padding:8px 10px; border-radius:8px}
  .dir:hover{background:var(--v2-hover)}
  .dir svg{width:16px; height:16px; color:var(--v2-txt3)}
  .dp{font:12.5px var(--v2-mono); color:var(--v2-txt2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .rows{display:flex; flex-direction:column; gap:1px; margin-top:12px}
  .kv{display:flex; align-items:baseline; justify-content:space-between; gap:20px; padding:9px 10px; border-radius:8px}
  .kv:hover{background:var(--v2-hover)}
  .kv span{font-size:13px; color:var(--v2-txt2)}
  .kv b{font:600 13px var(--v2-sans); color:var(--v2-txt)}
  .kv b.mono{font-family:var(--v2-mono); font-size:12px}
  .tierb{text-transform:uppercase; font-family:var(--v2-mono); font-size:11px; letter-spacing:.1em; color:var(--v2-txt3)}
  .tierb.prem{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2));
    border-radius:999px; padding:3px 11px}
  .hs{font-family:var(--v2-mono); font-size:12px; color:var(--v2-danger)}
  .hs.ok{color:var(--v2-acc1)}
  .warnbox,.okbox{margin-top:14px; padding:12px 15px; border-radius:11px; font-size:12.5px; line-height:1.55}
  .warnbox{color:var(--v2-txt2); border:1px solid var(--v2-danger-bd)}
  .okbox{color:var(--v2-txt2); border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .warnbox b,.okbox b{color:var(--v2-txt)}
  .errline{margin-top:10px; font-size:12px; color:var(--v2-danger)}
  .comps{display:flex; gap:6px; flex-wrap:wrap; margin-top:14px}
  .comp{font:10px var(--v2-mono); padding:3px 9px; border-radius:999px;
    color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .comp.ok{color:var(--v2-acc1); border-color:var(--v2-acc2)}
  .svclist{display:flex; flex-direction:column; gap:2px; margin-top:12px}
  .svc{display:flex; align-items:center; gap:16px; flex-wrap:wrap; padding:12px 10px; border-radius:10px}
  .svc:hover{background:var(--v2-hover)}
  .sname{display:flex; align-items:baseline; gap:10px; flex:1; min-width:0; font-size:14px; font-weight:600;
    text-transform:capitalize}
  .sst{font:9px var(--v2-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--v2-danger)}
  .sst.ok{color:var(--v2-acc1)} .sst.off{color:var(--v2-txt3)}
  .sname em{font:11px var(--v2-mono); font-style:normal; color:var(--v2-txt3); text-transform:none}
  .sname em.sub{color:var(--v2-acc2)}
  .flow{display:flex; align-items:center; gap:11px; flex-wrap:wrap}
  .ucode{font:700 15px var(--v2-mono); letter-spacing:.22em; color:var(--v2-acc-tint);
    border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); border-radius:9px; padding:6px 13px}
  .waiting{font:11px var(--v2-mono); color:var(--v2-txt3)}
  .serr{flex-basis:100%; font-size:11.5px; color:var(--v2-danger)}
  .unavail{font:11px var(--v2-mono); color:var(--v2-txt3); flex:0 0 auto}
  .lbl b{color:var(--v2-acc-tint); font-weight:700}
  .seg4{display:flex; gap:2px; padding:3px; border-radius:12px; flex:0 0 auto;
    background:var(--v2-surface2); border:1px solid var(--v2-line)}
  .seg4 button{border:0; background:transparent; color:var(--v2-txt2); font:600 11.5px var(--v2-sans);
    padding:7px 11px; border-radius:9px; cursor:pointer; transition:.15s; white-space:nowrap}
  .seg4 button:hover:not(:disabled){color:var(--v2-txt)}
  .seg4 button.on{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .seg4 button:disabled{opacity:.5; cursor:default}
  .devlist{display:flex; flex-direction:column; gap:1px; margin-top:12px}
  .dev{display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:11px; padding:8px 10px;
    border-radius:9px; cursor:pointer; color:var(--v2-txt2)}
  .dev:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .dev input{accent-color:var(--v2-acc1); width:15px; height:15px; cursor:pointer}
  .dev .dn{font-size:13px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .dev .dt{font:10px var(--v2-mono); color:var(--v2-acc2); flex:0 0 auto}
  .danger-box{margin-top:12px; padding:13px 15px; border-radius:11px;
    border:1px solid var(--v2-danger-bd); background:var(--v2-acc-soft)}
  .danger-box p{font-size:12.5px; line-height:1.5; color:var(--v2-txt2)}
  .confirm{display:flex; align-items:center; gap:12px; margin-top:12px; cursor:pointer; font-size:13px; font-weight:600}
  .rng{flex:0 0 auto; width:200px; accent-color:var(--v2-acc1)}
  .sel{flex:0 0 auto; height:34px; min-width:180px; border-radius:9px; border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:13px var(--v2-sans); padding:0 10px; outline:none; cursor:pointer}
  .sel:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .themerow{display:flex; gap:7px; flex:0 0 auto}
  .sw2{position:relative; width:30px; height:30px; border-radius:9px; cursor:pointer; padding:0;
    border:1px solid var(--v2-line2); background:var(--sw-bg); transition:.15s}
  .sw2::after{content:""; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
    width:52%; height:52%; border-radius:50%; background:var(--sw-acc)}
  .sw2:hover{transform:translateY(-1px); border-color:var(--sw-acc)}
  .sw2.on{border-color:var(--sw-acc); box-shadow:0 0 0 2px var(--v2-surface2), 0 0 0 3px var(--sw-acc)}
  .wifi{display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:6px 8px; border-radius:9px}
  .wifi:hover,.wifi.sel{background:var(--v2-hover)}
  .wrow{display:flex; align-items:center; gap:11px; flex:1; min-width:0; border:0; background:transparent;
    color:var(--v2-txt2); cursor:pointer; text-align:left; padding:6px 0; font-family:inherit}
  .wifi.sel .wrow{color:var(--v2-txt)}
  .okline{margin-top:10px; padding:9px 12px; border-radius:10px; font-size:12px; color:var(--v2-acc-tint);
    border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .mono{font:11.5px var(--v2-mono); color:var(--v2-txt2); word-break:break-all; text-align:right}
  a.link{color:var(--v2-acc-tint); text-decoration:none}
  a.link:hover{text-decoration:underline}
  .tok{display:flex; flex-direction:column; gap:7px; margin-top:12px; padding:12px;
    border-radius:10px; border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .tok .tlab{font:10px var(--v2-mono); letter-spacing:.14em; text-transform:uppercase; color:var(--v2-txt3)}
  .tok code{font:11.5px var(--v2-mono); color:var(--v2-txt); word-break:break-all}
  .warnline{font-size:11.5px; line-height:1.45; color:var(--v2-acc-tint)}
  .inline{display:flex; align-items:center; gap:8px; flex-wrap:wrap; flex:0 0 auto}
  .txt{height:34px; border-radius:9px; border:1px solid var(--v2-line2); background:var(--v2-surface2);
    color:var(--v2-txt); font:13px var(--v2-sans); padding:0 11px; outline:none; width:210px}
  .txt.num{width:78px; font-family:var(--v2-mono)}
  .txt:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .subhead{display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:16px;
    padding-top:12px; border-top:1px solid var(--v2-line); font:700 12px var(--v2-sans); color:var(--v2-txt2)}
  .badge{font:10px var(--v2-mono); letter-spacing:.05em; padding:3px 9px; border-radius:999px; flex:0 0 auto;
    color:var(--v2-txt3); border:1px solid var(--v2-line2)}
  .badge.up{color:var(--v2-acc-tint); border-color:var(--v2-acc2); background:var(--v2-acc-soft)}
  .diag{display:flex; flex-direction:column; gap:2px; margin-top:12px}
  .dl{display:grid; grid-template-columns:24px 1fr auto; align-items:center; gap:11px; padding:8px 4px}
  .di{width:20px; height:20px; border-radius:50%; display:grid; place-items:center; font:700 11px var(--v2-sans);
    color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .di.info{color:var(--v2-txt3); border-color:var(--v2-line2)}
  .di.ok{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .dlab{font-size:13px; color:var(--v2-txt2)}
  .dval{font:11px var(--v2-mono); color:var(--v2-txt3)}
  .warn{margin-top:10px; padding:10px 12px; border-radius:10px; font-size:12px; line-height:1.45;
    color:var(--v2-txt2); border:1px solid var(--v2-danger-bd); background:var(--v2-acc-soft)}
  .acts{display:flex; gap:8px; flex-wrap:wrap; margin-top:12px}
  .lnk.danger:hover{border-color:var(--v2-danger-bd); color:var(--v2-danger)}
  .dev.net{grid-template-columns:auto minmax(0,1fr) auto auto auto; cursor:default}
  .dev .dh{font:10px var(--v2-mono); color:var(--v2-txt3); flex:0 0 auto}
  .dev .pin{width:110px; height:28px; border-radius:8px; border:1px solid var(--v2-acc2);
    background:var(--v2-surface2); color:var(--v2-txt); font:12px var(--v2-mono); padding:0 9px; outline:none}
  .dev .pmsg{font:11px var(--v2-sans); color:var(--v2-acc-tint)}
  .del{width:26px; height:26px; border-radius:7px; border:1px solid transparent; background:transparent;
    color:var(--v2-txt3); cursor:pointer; display:grid; place-items:center; flex:0 0 auto}
  .del:hover{border-color:var(--v2-danger-bd); color:var(--v2-danger)}
  .del svg{width:13px; height:13px}
  .foot{display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-top:14px;
    padding-top:12px; border-top:1px solid var(--v2-line)}
  .foot .hint{flex:1; min-width:200px}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:999px; padding:6px 13px; font:600 11.5px var(--v2-sans)}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .empty{padding:30px 4px; color:var(--v2-txt3); font-size:14px}
  .svc{border:1px solid var(--v2-line2); border-radius:12px; padding:14px; margin-top:12px}
  .svchead{display:flex; align-items:center; gap:9px}
  .svcdot{width:9px; height:9px; border-radius:50%; border:1px solid var(--v2-line2); flex:none}
  .svcname{font-weight:700}
  .svcstate{margin-left:auto; font:10px var(--v2-mono); letter-spacing:.06em; color:var(--v2-txt3)}
  .svcfields{display:flex; flex-direction:column; gap:8px; margin-top:10px}
  .svcfield{display:flex; flex-direction:column; gap:4px; font-size:12.5px; color:var(--v2-txt2)}
  .svcfield input{width:100%}
  .svcsub{margin-top:12px; padding-top:10px; border-top:1px solid var(--v2-line2);
    display:flex; align-items:center; gap:12px; flex-wrap:wrap}
  .bad{color:var(--v2-bad, #ef4444)}
  .hidden-file{display:none}
</style>

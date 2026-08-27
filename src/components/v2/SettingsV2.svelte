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
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { followMe, zones, currentZoneId } from '../../lib/stores/zones';
  import * as api from '../../lib/api';
  import { notifications } from '../../lib/stores/notifications';
  import { etiquetteCaracteristiques } from '../../lib/caracteristiquesPeripherique';
  import type { LocalAudioDevice } from '../../lib/types';
  import { devices } from '../../lib/stores/devices';
  import { audiophileEnabled, audiophileLockVolume, setVolumeLock, refreshVolumeLock } from '../../lib/stores/audiophile';
  import { loopByDefault } from '../../lib/stores/loopByDefault';
  import { locale, localeNames, type Locale } from '../../lib/i18n';
  import { V2_THEMES, type V2Theme } from '../../lib/v2Theme';
  import type { StartupView, VolumeDisplay } from '../../lib/stores/preferences';
  import { activeView } from '../../lib/stores/navigation';
  import { v2SettingsTarget } from '../../lib/stores/v2SettingsNav';
  import { V2_SETTINGS, type V2SettingsTabId } from '../../lib/v2Settings';
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
        svcErr = { ...svcErr, [name]: usesPassword(name) ? 'Identifiants refusés.' : "Le service n'a pas renvoyé de lien." };
        svcBusy = null;
      }
    } catch {
      svcErr = { ...svcErr, [name]: 'Connexion impossible.' };
      svcBusy = null;
    }
  }
  async function disconnectSvc(name: string) {
    stopPoll(name);
    deviceFlow = { ...deviceFlow, [name]: undefined };
    try {
      await api.disconnectStreaming(name);
      svcs = { ...svcs, [name]: { ...svcs[name], authenticated: false, username: null } };
    } catch { svcErr = { ...svcErr, [name]: 'Déconnexion impossible.' }; }
  }
  function cancelFlow(name: string) {
    stopPoll(name);
    deviceFlow = { ...deviceFlow, [name]: undefined };
    svcBusy = null;
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
      <h1>Réglages</h1>
    </div>
  </header>

  <nav class="tabs" aria-label="Sections des réglages">
    {#each tabs as x (x.id)}
      <button class="tab" class:on={x.id === tabId} onclick={() => go(x.id)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d={x.icon} /></svg>
        <span>{x.label}</span>
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
            <span class="masked">Les niveaux Avancé et Expert ouvrent d'autres onglets.</span>
          {/if}
        </div>

        {#each sections as s (s.id)}
          <section class="card" class:hl={highlight === s.id}>
            <div class="cardhead">
              <h3>{title(s)}</h3>
              {#if s.from !== tab.id}<span class="moved">déplacé depuis « {s.from} »</span>{/if}
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
                  <span>Thème</span>
                  <span class="hint">Six palettes. Réglage propre au nouveau client — le thème de l'interface actuelle reste séparé.</span>
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

            {:else if s.id === 'streaming'}
              {#if !Object.keys(svcs).length}
                <p class="hint">Aucun service configuré sur ce serveur.</p>
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
                        <button class="lnk danger" onclick={() => disconnectSvc(name)}>Se déconnecter</button>

                      {:else if flow}
                        <!-- Code d'appareil : on affiche le code et le lien, et on
                             sonde en fond jusqu'à ce que le service confirme. -->
                        <div class="flow">
                          {#if flow.code}<code class="ucode">{flow.code}</code>{/if}
                          <a class="lnk" href={flow.url} target="_blank" rel="noopener">Ouvrir la page de connexion</a>
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
                <p class="hint">Réservé aux appliances Tune OS — ici, le réseau est géré par le système hôte.</p>
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
                  <span>Accès distant</span>
                  <span class="hint">Joindre votre serveur Tune depuis n'importe où — sans VPN ni ouverture de port.</span>
                </div>
                <button class="lnk" class:danger={brEnabled} onclick={toggleBridge} disabled={brBusy}>
                  {brBusy ? '…' : brEnabled ? 'Désactiver' : 'Activer'}
                </button>
              </div>
              {#if brEnabled}
                <div class="row">
                  <div class="lbl"><span>État</span></div>
                  <span class="badge" class:up={brConnected}>{brConnected ? 'Connecté' : 'Déconnecté'}</span>
                </div>
                <div class="row">
                  <div class="lbl"><span>Identifiant du serveur</span></div>
                  <span class="mono">{brServerId}</span>
                </div>
                {#if brUrl}
                  <div class="row">
                    <div class="lbl"><span>Adresse d'accès</span></div>
                    <a class="mono link" href={brUrl} target="_blank" rel="noopener">{brUrl}</a>
                  </div>
                {/if}
                {#if brToken}
                  <div class="tok">
                    <span class="tlab">Jeton</span>
                    <code>{brToken}</code>
                    <span class="warnline">Copiez-le maintenant : il ne sera plus jamais affiché. Redémarrez le serveur pour l'activer.</span>
                  </div>
                {/if}
                {#if !brConnected}
                  <p class="warn">Redémarrez le serveur pour qu'il se connecte au relais.</p>
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
            {:else}
              <div class="todo">
                <span>Contenu repris depuis l'écran actuel — pas encore porté ici.</span>
                <button class="lnk" onclick={() => activeView.set('settings')}>Ouvrir dans l'écran actuel</button>
              </div>
            {/if}
          </section>
        {/each}

        {#if !sections.length}
          <div class="empty">Rien à ce niveau d'interface. Passez en Avancé ou Expert depuis le menu avatar.</div>
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
  .moved{font:10px var(--v2-mono); letter-spacing:.06em; color:var(--v2-txt3);
    border:1px solid var(--v2-line2); border-radius:999px; padding:2px 8px}

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
  .todo{display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-top:10px;
    font-size:12px; color:var(--v2-txt3)}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:999px; padding:6px 13px; font:600 11.5px var(--v2-sans)}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .empty{padding:30px 4px; color:var(--v2-txt3); font-size:14px}
</style>

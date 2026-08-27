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

            {#if s.id === 'netDevices'}
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

<script lang="ts">
  import { zones, currentZoneId } from '../lib/stores/zones';
  import { devices, unboundDevices } from '../lib/stores/devices';
  import { connectionState } from '../lib/stores/connection';
  import { activeView, type View } from '../lib/stores/navigation';
  import { activeStreamingService } from '../lib/stores/streaming';
  import * as api from '../lib/api';
  import type { DiscoveredDevice, LocalAudioDevice, OutputType, Zone, ZoneGroupResponse, StreamingServiceStatus } from '../lib/types';
  import ZoneConfigModal from './ZoneConfigModal.svelte';

  function handleSelectZone(zoneId: number) {
    currentZoneId.set(zoneId);
  }

  let showCreateZone = $state(false);
  let newZoneName = $state('');
  let newZoneOutputType = $state<OutputType>('local');
  let newZoneDeviceId = $state<string | undefined>(undefined);

  let configZone = $state<Zone | null>(null);
  let zoneGroups = $state<ZoneGroupResponse[]>([]);
  let audioDevices = $state<LocalAudioDevice[]>([]);

  async function fetchGroups() {
    try {
      zoneGroups = await api.listGroups();
    } catch (e) {
      console.error('Fetch groups error:', e);
    }
  }

  async function fetchAudioDevices() {
    try {
      audioDevices = await api.getAudioDevices();
    } catch (e) {
      console.error('Fetch audio devices error:', e);
    }
  }

  let streamingServices = $state<Record<string, StreamingServiceStatus>>({});

  async function fetchStreamingServices() {
    try {
      streamingServices = await api.getStreamingServices();
    } catch { /* ignore */ }
  }

  let activeServices = $derived(
    Object.entries(streamingServices)
      .filter(([, s]) => s.enabled && s.authenticated)
      .map(([name]) => name)
  );

  function streamingLabel(name: string): string {
    const labels: Record<string, string> = {
      tidal: 'TIDAL',
      qobuz: 'Qobuz',
      youtube: 'YouTube',
      amazon: 'Amazon',
    };
    return labels[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
  }

  function navigateStreaming(service: string) {
    activeStreamingService.set(service);
    activeView.set('streaming');
  }

  // Fetch groups, audio devices, and streaming services on mount
  fetchGroups();
  fetchAudioDevices();
  fetchStreamingServices();

  function openConfig(zone: Zone, e: MouseEvent) {
    e.stopPropagation();
    configZone = zone;
    fetchGroups();
  }

  async function handleDeleteZone(id: number) {
    try {
      await api.deleteZone(id);
      zones.update((zs) => zs.filter((z) => z.id !== id));
      let curId: number | null = null;
      currentZoneId.subscribe((v) => (curId = v))();
      if (curId === id) {
        const remaining = $zones.filter((z) => z.id !== id);
        currentZoneId.set(remaining.length > 0 ? remaining[0].id : null);
      }
      configZone = null;
    } catch (e) {
      console.error('Delete zone error:', e);
    }
  }

  async function handleGroupChanged() {
    await fetchGroups();
    try {
      const zoneList = await api.getZones();
      zones.set(zoneList);
    } catch (e) {
      console.error('Refetch zones error:', e);
    }
    configZone = null;
  }

  function getZoneGroupId(zone: Zone): string | null {
    if (!zone.id) return null;
    const group = zoneGroups.find(g => g.zone_ids.includes(zone.id!));
    return group?.group_id ?? zone.group_id ?? null;
  }

  // Simple color palette for group indicators
  const groupColors = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#14b8a6'];
  function groupColor(groupId: string): string {
    let hash = 0;
    for (let i = 0; i < groupId.length; i++) hash = (hash * 31 + groupId.charCodeAt(i)) | 0;
    return groupColors[Math.abs(hash) % groupColors.length];
  }

  async function createZone() {
    if (!newZoneName.trim()) return;
    try {
      const zone = await api.createZone(newZoneName.trim(), newZoneOutputType, newZoneDeviceId);
      zones.update((zs) => [...zs, zone]);
      if (zone.id !== null) currentZoneId.set(zone.id);
      newZoneName = '';
      newZoneOutputType = 'local';
      newZoneDeviceId = undefined;
      showCreateZone = false;
    } catch (e) {
      console.error('Create zone error:', e);
    }
  }

  async function createZoneFromAudioDevice(device: LocalAudioDevice) {
    try {
      const zone = await api.createZone(device.name, 'local', device.name);
      zones.update((zs) => [...zs, zone]);
      if (zone.id !== null) currentZoneId.set(zone.id);
    } catch (e) {
      console.error('Create zone from audio device error:', e);
    }
  }

  async function createZoneFromDevice(device: DiscoveredDevice) {
    try {
      const zone = await api.createZone(device.name, device.type, device.id);
      zones.update((zs) => [...zs, zone]);
      if (zone.id !== null) currentZoneId.set(zone.id);
    } catch (e) {
      console.error('Create zone from device error:', e);
    }
  }

  function deviceTypeIcon(type: OutputType): string {
    switch (type) {
      case 'dlna': return 'DLNA';
      case 'airplay': return 'AirPlay';
      default: return 'Local';
    }
  }

  function navigate(view: View) {
    activeView.set(view);
  }

  function stateIcon(state: string): string {
    switch (state) {
      case 'connected': return '\u25CF';
      case 'connecting': return '\u25D0';
      default: return '\u25CB';
    }
  }

  function stateColor(state: string): string {
    switch (state) {
      case 'connected': return 'var(--tune-success)';
      case 'connecting': return 'var(--tune-warning)';
      default: return 'var(--tune-text-muted)';
    }
  }

  // Resizable sidebar
  let resizing = $state(false);

  function startResize(e: MouseEvent) {
    e.preventDefault();
    resizing = true;
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(200, Math.min(480, ev.clientX));
      document.documentElement.style.setProperty('--sidebar-width', `${w}px`);
    };
    const onUp = () => {
      resizing = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <h1 class="logo">Tune</h1>
    <div class="connection-status">
      <span class="state-dot" style="color: {stateColor($connectionState)}">
        {stateIcon($connectionState)}
      </span>
      <span class="state-text truncate">{$connectionState}</span>
    </div>
  </div>

  <nav class="nav-section">
    <span class="section-label">NAVIGATION</span>
    <button class="nav-item" class:active={$activeView === 'home'} onclick={() => navigate('home')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
      Accueil
    </button>
    <button class="nav-item" class:active={$activeView === 'nowplaying'} onclick={() => navigate('nowplaying')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
      Lecture en cours
    </button>
    <button class="nav-item" class:active={$activeView === 'library'} onclick={() => navigate('library')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
      Bibliotheque
    </button>
    <button class="nav-item" class:active={$activeView === 'queue'} onclick={() => navigate('queue')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
      File d'attente
    </button>
    <button class="nav-item" class:active={$activeView === 'playlists'} onclick={() => navigate('playlists')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
      Playlists
    </button>
    <button class="nav-item" class:active={$activeView === 'history'} onclick={() => navigate('history')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
      Historique
    </button>
    <button class="nav-item" class:active={$activeView === 'search'} onclick={() => navigate('search')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      Recherche
    </button>
    <button class="nav-item" class:active={$activeView === 'settings'} onclick={() => navigate('settings')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
      Parametres
    </button>
  </nav>

  {#if activeServices.length > 0}
    <nav class="nav-section services-section">
      <span class="section-label">SERVICES</span>
      {#each activeServices as svc}
        <button
          class="nav-item"
          class:active={$activeView === 'streaming' && $activeStreamingService === svc}
          onclick={() => navigateStreaming(svc)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
          {streamingLabel(svc)}
        </button>
      {/each}
    </nav>
  {/if}

  <div class="zones-section">
    <div class="zones-header">
      <span class="section-label">ZONES</span>
      <button class="add-zone-btn" onclick={() => showCreateZone = !showCreateZone} title="Nouvelle zone">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
    </div>
    {#if showCreateZone}
      <div class="create-zone">
        <input
          type="text"
          placeholder="Nom de la zone"
          bind:value={newZoneName}
          onkeydown={(e) => e.key === 'Enter' && createZone()}
        />
        <select class="create-zone-type" bind:value={newZoneOutputType} onchange={() => { newZoneDeviceId = undefined; }}>
          <option value="local">Local</option>
          <option value="dlna">DLNA</option>
          <option value="airplay">AirPlay</option>
        </select>
        {#if newZoneOutputType !== 'local'}
          <select class="create-zone-device" bind:value={newZoneDeviceId}>
            <option value={undefined}>-- Device --</option>
            {#each $devices.filter(d => d.type === newZoneOutputType && d.available) as dev}
              <option value={dev.id}>{dev.name}</option>
            {/each}
          </select>
        {/if}
        <button class="create-zone-confirm" onclick={createZone}>OK</button>
      </div>
    {/if}
    <div class="zones-list">
      {#each $zones as zone}
        {@const gid = getZoneGroupId(zone)}
        <button
          class="zone-item"
          class:active={zone.id === $currentZoneId}
          onclick={() => zone.id !== null && handleSelectZone(zone.id)}
        >
          {#if gid}
            <span class="zone-group-dot" style="background: {groupColor(gid)}" title="Groupe actif"></span>
          {/if}
          <span class="zone-name truncate">{zone.name}</span>
          <span class="zone-meta">
            {#if zone.output_type && zone.output_type !== 'local'}
              <span class="zone-type-badge">{deviceTypeIcon(zone.output_type)}</span>
            {/if}
            {#if zone.state === 'playing'}
              <span class="zone-playing">
                <svg viewBox="0 0 10 12" fill="currentColor" width="10" height="12"><polygon points="0,0 10,6 0,12" /></svg>
              </span>
            {/if}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span class="zone-config-btn" onclick={(e) => openConfig(zone, e)} title="Configurer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            </span>
          </span>
        </button>
      {/each}
      {#if $zones.length === 0}
        <div class="empty-state">Aucune zone</div>
      {/if}
    </div>
  </div>

  <div class="devices-section">
    <span class="section-label">APPAREILS</span>
    <div class="devices-list">
      {#each audioDevices as audioDevice}
        <div class="device-item">
          <span class="device-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></svg>
          </span>
          <span class="device-name truncate">{audioDevice.name}</span>
          <span class="device-type-tag">USB</span>
          <button class="device-add-btn" onclick={() => createZoneFromAudioDevice(audioDevice)} title="Creer une zone">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </div>
      {/each}
      {#each $devices as device}
        <div class="device-item" class:unavailable={!device.available}>
          <span class="device-icon">
            {#if device.type === 'airplay'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" /></svg>
            {:else if device.type === 'dlna'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="2" y="7" width="20" height="15" rx="2" ry="2" /><polyline points="17 2 12 7 7 2" /></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
            {/if}
          </span>
          <span class="device-name truncate">{device.name}</span>
          <span class="device-type-tag">{deviceTypeIcon(device.type)}</span>
          {#if device.available}
            <button class="device-add-btn" onclick={() => createZoneFromDevice(device)} title="Creer une zone">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
          {:else}
            <span class="device-status offline" title="Hors ligne">&#x25CB;</span>
          {/if}
        </div>
      {/each}
      {#if audioDevices.length === 0 && $devices.length === 0}
        <div class="empty-state">Recherche d'appareils...</div>
      {/if}
    </div>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resize-handle" onmousedown={startResize}></div>
</aside>

{#if configZone}
  <ZoneConfigModal
    zone={configZone}
    allZones={$zones}
    groups={zoneGroups}
    onClose={() => configZone = null}
    onDelete={handleDeleteZone}
    onGroupChanged={handleGroupChanged}
  />
{/if}

<style>
  .sidebar {
    grid-column: 1;
    grid-row: 1 / -1;
    background: var(--tune-surface);
    border-right: 1px solid var(--tune-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding-bottom: var(--transport-height);
    position: relative;
  }

  .resize-handle {
    position: absolute;
    top: 0;
    right: -3px;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    z-index: 10;
  }

  .resize-handle:hover,
  .resize-handle:active {
    background: var(--tune-accent);
    opacity: 0.4;
  }

  .sidebar-header {
    padding: var(--space-lg) 18px;
    border-bottom: 1px solid var(--tune-border);
  }

  .logo {
    font-family: var(--font-label);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.5px;
    color: var(--tune-text);
    margin-bottom: var(--space-xs);
  }

  .connection-status {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }

  .state-dot {
    font-size: 10px;
  }

  .state-text {
    max-width: 180px;
  }

  .section-label {
    display: block;
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--tune-text-muted);
    padding: 0 18px;
    margin-bottom: 6px;
  }

  .nav-section {
    padding: var(--space-md) 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 7px 18px;
    background: none;
    border: none;
    border-radius: 0;
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: all 0.12s ease-out;
  }

  .nav-item:hover {
    background: var(--tune-surface-hover);
    color: var(--tune-text);
  }

  .nav-item.active {
    background: var(--tune-surface-selected);
    color: var(--tune-text);
  }

  .nav-item svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    opacity: 0.8;
  }

  .services-section {
    border-top: 1px solid var(--tune-border);
    padding-top: var(--space-md);
  }

  .zones-section {
    flex: 1 1 0;
    min-height: 60px;
    overflow-y: auto;
    padding: var(--space-md) 0;
  }

  .zones-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-right: 18px;
    margin-bottom: 6px;
  }

  .zones-header .section-label {
    margin-bottom: 0;
  }

  .add-zone-btn {
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-muted);
    border-radius: var(--radius-sm);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s ease-out;
  }

  .add-zone-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .create-zone {
    display: flex;
    gap: 4px;
    padding: 4px 18px 8px;
  }

  .create-zone input {
    flex: 1;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 12px;
    outline: none;
  }

  .create-zone input:focus {
    border-color: var(--tune-accent);
  }

  .create-zone-confirm {
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 12px;
  }

  .zones-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .zone-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 18px;
    background: none;
    border: none;
    border-radius: 0;
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: all 0.12s ease-out;
  }

  .zone-item:hover {
    background: var(--tune-surface-hover);
    color: var(--tune-text);
  }

  .zone-item.active {
    background: var(--tune-surface-selected);
    color: var(--tune-text);
  }

  .zone-name {
    flex: 1;
  }

  .zone-playing {
    color: var(--tune-success);
    font-size: 10px;
    display: flex;
    align-items: center;
  }

  .zone-playing svg {
    width: 10px;
    height: 10px;
  }

  .zone-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .zone-type-badge {
    font-family: var(--font-label);
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tune-text-muted);
    background: var(--tune-bg);
    padding: 1px 5px;
    border-radius: var(--radius-sm);
  }

  .create-zone-type,
  .create-zone-device {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 4px 6px;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 11px;
    outline: none;
    max-width: 90px;
  }

  .create-zone-type:focus,
  .create-zone-device:focus {
    border-color: var(--tune-accent);
  }

  .devices-section {
    border-top: 1px solid var(--tune-border);
    padding: var(--space-md) 0 var(--space-sm);
    overflow-y: auto;
    flex: 0 0 auto;
    max-height: 35%;
  }

  .devices-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .device-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 18px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    transition: opacity 0.12s ease-out;
  }

  .device-item.unavailable {
    opacity: 0.4;
  }

  .device-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    opacity: 0.6;
  }

  .device-name {
    flex: 1;
    min-width: 0;
  }

  .device-type-tag {
    font-family: var(--font-label);
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tune-text-muted);
    background: var(--tune-bg);
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .device-add-btn {
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-muted);
    border-radius: var(--radius-sm);
    cursor: pointer;
    padding: 1px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.12s ease-out;
  }

  .device-add-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .device-status {
    font-size: 8px;
    flex-shrink: 0;
  }

  .device-status.offline {
    color: var(--tune-text-muted);
  }

  .empty-state {
    padding: var(--space-md) 18px;
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 13px;
  }

  .zone-group-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .zone-config-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--tune-text-muted);
    opacity: 0;
    transition: opacity 0.12s, color 0.12s;
    padding: 2px;
    border-radius: var(--radius-sm);
  }

  .zone-item:hover .zone-config-btn,
  .zone-item.active .zone-config-btn {
    opacity: 1;
  }

  .zone-config-btn:hover {
    color: var(--tune-accent);
  }

  @media (max-width: 768px) {
    .sidebar {
      display: none;
    }
  }
</style>

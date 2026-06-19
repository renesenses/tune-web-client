<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { zones, currentZoneId } from '../lib/stores/zones';
  import { devices, unboundDevices } from '../lib/stores/devices';
  import { connectionState, reconnectAttempts } from '../lib/stores/connection';
  import { activeView, type View } from '../lib/stores/navigation';
  import { resetLibraryNavigation } from '../lib/stores/library';
  import { activeStreamingService, streamingServices as streamingServicesStore } from '../lib/stores/streaming';
  import { preferences } from '../lib/stores/preferences';
  import { t } from '../lib/i18n';
  import * as api from '../lib/api';
  import type { DiscoveredDevice, LocalAudioDevice, OutputType, Zone, ZoneGroupResponse, StreamingServiceStatus } from '../lib/types';
  import ZoneConfigModal from './ZoneConfigModal.svelte';
  import ProfileSelector from './ProfileSelector.svelte';
  import { notifications } from '../lib/stores/notifications';
  import { updateAvailable, latestVersion } from '../lib/stores/updates';

  function handleSelectZone(zoneId: number) {
    currentZoneId.set(zoneId);
  }

  // Display the server version (single source of truth) — falls back to
  // the client build version (__APP_VERSION__) until the API responds.
  //
  // Use onMount (not $effect) to fetch exactly once.  The previous
  // $effect(() => { untrack(() => { ... }) }) pattern can re-trigger
  // on batch flushes in certain Svelte 5 runtime versions, creating an
  // infinite API-call loop that starves the main thread and blocks
  // sidebar click events (same class of bug fixed in DiagnosticsView).
  let serverVersion = $state<string | null>(null);
  let sidebarDestroyed = false;
  onMount(() => {
    api.checkForUpdate()
      .then((r) => { if (!sidebarDestroyed && r?.current_version) serverVersion = r.current_version; })
      .catch(() => { /* keep fallback */ });
  });

  // Health monitor status (shared store, also updated by App.svelte on WS events)
  import { healthStatus } from '../lib/stores/health';
  // Poll health status every 60s
  let healthInterval: ReturnType<typeof setInterval> | null = null;
  function fetchHealthStatus() {
    api.getHealthMonitor()
      .then((r) => { healthStatus.set(r.status); })
      .catch(() => { /* ignore */ });
  }
  fetchHealthStatus();
  healthInterval = setInterval(fetchHealthStatus, 60_000);

  onDestroy(() => {
    sidebarDestroyed = true;
    if (healthInterval) clearInterval(healthInterval);
  });

  let showCreateZone = $state(false);
  let newZoneName = $state('');
  let newZoneOutputType = $state<OutputType>('local');
  let newZoneDeviceId = $state<string | undefined>(undefined);
  // v0.8.0 multi-room — Snapcast/Sonos device pickers fetched lazily
  // when the user opens the modal and picks the matching type. Kept
  // local to the component so we don't spam the API on every render.
  let snapcastClients = $state<{id: string; name: string; connected: boolean}[]>([]);
  let sonosSpeakers = $state<{uid: string; name: string; ip: string}[]>([]);
  let multiroomLoading = $state(false);

  let configZone = $state<Zone | null>(null);
  let zoneGroups = $state<ZoneGroupResponse[]>([]);
  let audioDevices = $state<LocalAudioDevice[]>([]);

  let visibleAudioDevices = $derived(
    audioDevices.filter(d => !$preferences.hiddenDeviceIds.includes(`audio:${d.id}`))
  );
  let visibleNetDevices = $derived(
    $devices.filter(d => !$preferences.hiddenDeviceIds.includes(`net:${d.id}`))
  );

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

  async function fetchStreamingServices() {
    try {
      streamingServicesStore.set(await api.getStreamingServices());
    } catch { /* ignore */ }
  }

  let activeServices = $derived(
    Object.entries($streamingServicesStore)
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

  function handleZoneRenamed(id: number, name: string) {
    zones.update((zs) => zs.map((z) => z.id === id ? { ...z, name } : z));
    if (configZone && configZone.id === id) {
      configZone = { ...configZone, name };
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
      // v0.8.0: bind the discovered Snapcast client to the new zone now
      // that we have its zone_id. Also a no-op for non-snapcast types.
      if (newZoneOutputType === 'snapcast' && newZoneDeviceId && zone.id !== null) {
        try { await api.assignSnapcastClient(newZoneDeviceId, zone.id); } catch (e) { console.error(e); }
      }
      newZoneName = '';
      newZoneOutputType = 'local';
      newZoneDeviceId = undefined;
      showCreateZone = false;
    } catch (e) {
      console.error('Create zone error:', e);
    }
  }

  // v0.8.0 multi-room — load device candidates when the user picks
  // a Snapcast / Sonos type in the create-zone modal. Lazy so we
  // don't hit the API for every Sidebar render.
  async function loadMultiroomDevices(type: OutputType) {
    if (type !== 'snapcast' && type !== 'sonos') return;
    multiroomLoading = true;
    try {
      if (type === 'snapcast') {
        snapcastClients = await api.listSnapcastClients();
      } else {
        sonosSpeakers = await api.listSonosSpeakers();
      }
    } catch (e) {
      console.error('multiroom_devices_load_failed', e);
    } finally {
      multiroomLoading = false;
    }
  }

  async function createZoneFromAudioDevice(device: LocalAudioDevice) {
    try {
      const zone = await api.createZone(device.name, 'local', device.name);
      zones.update((zs) => [...zs, zone]);
      if (zone.id !== null) currentZoneId.set(zone.id);
    } catch (e: any) {
      const msg = e?.message || e?.detail || String(e);
      notifications.error(`Impossible de créer la zone : ${msg}`);
      console.error('Create zone from audio device error:', e);
    }
  }

  async function createZoneFromDevice(device: DiscoveredDevice) {
    try {
      const zone = await api.createZone(device.name, device.type, device.id);
      zones.update((zs) => [...zs, zone]);
      if (zone.id !== null) currentZoneId.set(zone.id);
    } catch (e: any) {
      const msg = e?.message || e?.detail || String(e);
      notifications.error(`Impossible de créer la zone : ${msg}`);
      console.error('Create zone from device error:', e);
    }
  }

  // --- AirPlay pairing ---
  let pairingDeviceId = $state<string | null>(null);
  let pairingPin = $state('');
  let pairingLoading = $state(false);
  let pairingAwaitingPin = $state(false);
  let pairedDeviceIds = $state<Set<string>>(new Set());

  async function startPairing(deviceId: string, e: MouseEvent) {
    e.stopPropagation();
    pairingDeviceId = deviceId;
    pairingPin = '';
    pairingLoading = true;
    pairingAwaitingPin = false;
    try {
      const res = await api.beginPairing(deviceId);
      if (res.status === 'awaiting_pin') {
        pairingAwaitingPin = true;
      } else if (res.status === 'paired') {
        pairedDeviceIds = new Set([...pairedDeviceIds, deviceId]);
        notifications.success($t('pairing.success'));
        pairingDeviceId = null;
      }
    } catch {
      notifications.error($t('pairing.error'));
      pairingDeviceId = null;
    }
    pairingLoading = false;
  }

  async function submitPairingPin() {
    if (!pairingDeviceId || !pairingPin.trim()) return;
    pairingLoading = true;
    try {
      const res = await api.submitPairingPin(pairingDeviceId, pairingPin.trim());
      if (res.status === 'paired') {
        pairedDeviceIds = new Set([...pairedDeviceIds, pairingDeviceId]);
        notifications.success($t('pairing.success'));
        pairingDeviceId = null;
      } else {
        notifications.error($t('pairing.error'));
      }
    } catch {
      notifications.error($t('pairing.error'));
    }
    pairingLoading = false;
    pairingAwaitingPin = false;
  }

  function cancelPairing(e?: Event) {
    e?.stopPropagation();
    pairingDeviceId = null;
    pairingAwaitingPin = false;
    pairingPin = '';
    pairingLoading = false;
  }

  function deviceTypeIcon(type: OutputType): string {
    switch (type) {
      case 'dlna': return 'DLNA';
      case 'airplay': return 'AirPlay';
      case 'chromecast': return 'Cast';
      case 'bluos': return 'BluOS';
      case 'openhome': return 'OpenHome';
      case 'local': return 'USB';
      default: return type?.toUpperCase() ?? 'Local';
    }
  }

  function navigate(view: View) {
    if (view === 'library') resetLibraryNavigation();
    activeView.set(view);
  }

  function stateIcon(state: string): string {
    switch (state) {
      case 'connected': return '\u25CF';
      case 'polling': return '\u25CF';
      case 'connecting':
      case 'reconnecting': return '\u25D0';
      case 'disconnected': return '\u25CB';
      default: return '\u25CB';
    }
  }

  function stateColor(state: string): string {
    switch (state) {
      case 'connected': return 'var(--tune-success)';
      case 'polling': return 'var(--tune-success)';
      case 'connecting':
      case 'reconnecting': return 'var(--tune-warning)';
      case 'disconnected': return 'var(--tune-error, #ef4444)';
      default: return 'var(--tune-text-muted)';
    }
  }

  function stateLabel(state: string, attempts: number): string {
    switch (state) {
      case 'connected': return $t('settings.connected');
      case 'polling': return $t('settings.connected');
      case 'connecting': return $t('settings.connecting');
      case 'reconnecting': return attempts > 1 ? `${$t('settings.reconnecting')} (${attempts})...` : `${$t('settings.reconnecting')}...`;
      case 'disconnected': return $t('settings.disconnected');
      default: return $t('settings.notConnected');
    }
  }

  // --- Zone drag-and-drop reordering ---
  let dragZoneId = $state<number | null>(null);
  let dragOverZoneId = $state<number | null>(null);
  let dragInsertBefore = $state(false); // true = insert before target, false = after
  let touchDragZoneId = $state<number | null>(null);
  let touchCurrentY = $state(0);
  let touchStartY = $state(0);
  let touchDragEl = $state<HTMLElement | null>(null);
  let touchClone = $state<HTMLElement | null>(null);

  // Load persisted zone order from localStorage
  function loadZoneOrder(): number[] {
    try {
      const raw = localStorage.getItem('tune-zone-order');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function saveZoneOrder(ids: number[]) {
    localStorage.setItem('tune-zone-order', JSON.stringify(ids));
  }

  // Sorted zones: respect saved order, new zones at end
  let sortedZones = $derived.by(() => {
    const order = loadZoneOrder();
    const zoneList = $zones;
    if (order.length === 0) return zoneList;
    const orderMap = new Map(order.map((id, i) => [id, i]));
    return [...zoneList].sort((a, b) => {
      const ai = a.id !== null ? orderMap.get(a.id) : undefined;
      const bi = b.id !== null ? orderMap.get(b.id) : undefined;
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return 0;
    });
  });

  function handleZoneDragStart(e: DragEvent, zoneId: number | null) {
    if (zoneId === null) return;
    dragZoneId = zoneId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(zoneId));
    }
  }

  function handleZoneDragOver(e: DragEvent, zoneId: number | null) {
    if (dragZoneId === null || zoneId === null || zoneId === dragZoneId) {
      dragOverZoneId = null;
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dragOverZoneId = zoneId;
    // Determine if we insert before or after based on mouse Y position
    const target = (e.currentTarget as HTMLElement);
    const rect = target.getBoundingClientRect();
    dragInsertBefore = e.clientY < rect.top + rect.height / 2;
  }

  function handleZoneDragLeave() {
    dragOverZoneId = null;
  }

  function handleZoneDrop(e: DragEvent) {
    e.preventDefault();
    if (dragZoneId === null || dragOverZoneId === null) {
      dragZoneId = null;
      dragOverZoneId = null;
      return;
    }
    reorderZones(dragZoneId, dragOverZoneId, dragInsertBefore);
    dragZoneId = null;
    dragOverZoneId = null;
  }

  function handleZoneDragEnd() {
    dragZoneId = null;
    dragOverZoneId = null;
  }

  function reorderZones(fromId: number, toId: number, before: boolean) {
    const ids = sortedZones.map(z => z.id).filter((id): id is number => id !== null);
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return;
    // Remove from original position
    ids.splice(fromIdx, 1);
    // Find new insert position
    let insertIdx = ids.indexOf(toId);
    if (!before) insertIdx += 1;
    ids.splice(insertIdx, 0, fromId);
    saveZoneOrder(ids);
  }

  // --- Touch drag for mobile ---
  function handleTouchStart(e: TouchEvent, zoneId: number | null, el: HTMLElement) {
    // Only activate from the drag handle
    const target = e.target as HTMLElement;
    if (!target.closest('.zone-drag-handle')) return;
    if (zoneId === null) return;
    e.preventDefault();
    touchDragZoneId = zoneId;
    touchStartY = e.touches[0].clientY;
    touchCurrentY = e.touches[0].clientY;
    touchDragEl = el;
    // Create a visual clone
    const clone = el.cloneNode(true) as HTMLElement;
    clone.classList.add('zone-drag-clone');
    clone.style.position = 'fixed';
    clone.style.left = el.getBoundingClientRect().left + 'px';
    clone.style.top = el.getBoundingClientRect().top + 'px';
    clone.style.width = el.getBoundingClientRect().width + 'px';
    clone.style.zIndex = '9999';
    clone.style.pointerEvents = 'none';
    clone.style.opacity = '0.85';
    clone.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';
    document.body.appendChild(clone);
    touchClone = clone;
    el.style.opacity = '0.3';
  }

  function handleTouchMove(e: TouchEvent) {
    if (touchDragZoneId === null || !touchClone || !touchDragEl) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    touchCurrentY = y;
    const startRect = touchDragEl.getBoundingClientRect();
    const offsetY = y - touchStartY;
    touchClone.style.top = (startRect.top + offsetY) + 'px';

    // Determine which zone we're over
    const zonesListEl = touchDragEl.parentElement;
    if (!zonesListEl) return;
    const children = Array.from(zonesListEl.children) as HTMLElement[];
    dragOverZoneId = null;
    for (const child of children) {
      const rect = child.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) {
        const id = parseInt(child.dataset.zoneId ?? '', 10);
        if (!isNaN(id) && id !== touchDragZoneId) {
          dragOverZoneId = id;
          dragInsertBefore = y < rect.top + rect.height / 2;
        }
        break;
      }
    }
  }

  function handleTouchEnd() {
    if (touchDragZoneId !== null && dragOverZoneId !== null) {
      reorderZones(touchDragZoneId, dragOverZoneId, dragInsertBefore);
    }
    // Clean up
    if (touchClone) {
      touchClone.remove();
      touchClone = null;
    }
    if (touchDragEl) {
      touchDragEl.style.opacity = '';
      touchDragEl = null;
    }
    touchDragZoneId = null;
    dragOverZoneId = null;
  }

  // REGLAGES section collapse — persisted in localStorage
  let reglagesOpen = $state(localStorage.getItem('tune-reglages-open') === 'true');
  function toggleReglages() {
    reglagesOpen = !reglagesOpen;
    localStorage.setItem('tune-reglages-open', String(reglagesOpen));
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
    <h1 class="logo"><a href="https://mozaiklabs.fr/forum" target="_blank" rel="noopener noreferrer" class="logo-link" title="Forum Mozaiklabs"><img src="/tune-logo.png" alt="Tune" class="logo-img" /></a> <span class="version">{#if $updateAvailable}<button class="version-link" onclick={() => navigate('settings')} title="Mise à jour disponible">v{serverVersion ?? __APP_VERSION__}<span class="version-update-dot"></span><span class="version-latest">v{$latestVersion}</span></button>{:else}v{serverVersion ?? __APP_VERSION__}{/if}</span>
      <button class="whatsnew-btn" onclick={() => window.dispatchEvent(new CustomEvent('tune:open-whatsnew'))} title={$t('whatsnew.title')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </button>
    </h1>
    <div class="connection-status">
      <span class="state-dot" style="color: {stateColor($connectionState)}">
        {stateIcon($connectionState)}
      </span>
      <span class="state-text truncate">{stateLabel($connectionState, $reconnectAttempts)}</span>
      {#if $connectionState === 'polling'}
        <span class="polling-badge" title="Mode polling actif (WebSocket indisponible)">P</span>
      {/if}
      {#if $healthStatus !== 'ok'}
        <span class="health-dot" class:health-warning={$healthStatus === 'warning'} class:health-critical={$healthStatus === 'critical'} title="Serveur : {$healthStatus}"></span>
      {/if}
    </div>
  </div>

  <ProfileSelector />

  <!-- GROUP 1: NAVIGATION (daily use) -->
  <nav class="nav-section">
    <span class="section-label">{$t('nav.navigation')}</span>
    <button class="nav-item" class:active={$activeView === 'home'} onclick={() => navigate('home')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
      {$t('nav.home')}
    </button>
    <button class="nav-item" class:active={$activeView === 'nowplaying'} onclick={() => navigate('nowplaying')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
      {$t('nav.nowplaying')}
    </button>
    <button class="nav-item" class:active={$activeView === 'library'} onclick={() => navigate('library')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
      {$t('nav.library')}
    </button>
    <button class="nav-item" class:active={$activeView === 'playlists' || $activeView === 'playlistmanager' || $activeView === 'smartplaylists'} onclick={() => navigate('playlistmanager')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
      {$t('nav.playlists')}
    </button>
    <button class="nav-item" class:active={$activeView === 'smart-ai'} onclick={() => navigate('smart-ai')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 0 1 4 4c0 1.1-.9 2-2 2h-4a2 2 0 0 1-2-2 4 4 0 0 1 4-4z"/><path d="M8 8v2a4 4 0 0 0 8 0V8"/><path d="M12 14v4"/><path d="M8 22h8"/><circle cx="7" cy="12" r="1"/><circle cx="17" cy="12" r="1"/></svg>
      Smart AI
      <span class="badge-new">NEW</span>
    </button>
    <button class="nav-item" class:active={$activeView === 'collections' || $activeView === 'smartcollections'} onclick={() => navigate('collections')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
      Collections
    </button>
    <button class="nav-item" class:active={$activeView === 'favorites'} onclick={() => navigate('favorites')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
      {$t('nav.favorites')}
    </button>
    <button class="nav-item" class:active={$activeView === 'search'} onclick={() => navigate('search')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      {$t('nav.search')}
    </button>
    <button class="nav-item" class:active={$activeView === 'history'} onclick={() => navigate('history')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
      {$t('nav.history')}
    </button>
    <button class="nav-item" class:active={$activeView === 'dashboard'} onclick={() => navigate('dashboard')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
      {$t('nav.dashboard')}
    </button>
  </nav>

  <!-- GROUP 2: SERVICES (streaming + media) -->
  <nav class="nav-section services-section">
    <span class="section-label">{$t('nav.services')}</span>
    {#each activeServices as svc}
      <button
        class="nav-item"
        class:active={$activeView === 'streaming' && $activeStreamingService === svc}
        onclick={() => navigateStreaming(svc)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
        {streamingLabel(svc)}
        <span class="connected-dot"></span>
      </button>
    {/each}
    <button class="nav-item" class:active={$activeView === 'radios'} onclick={() => navigate('radios')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"></path><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5"></path><line x1="12" y1="19" x2="12" y2="22"></line><path d="M8 22h8"></path></svg>
      {$t('nav.radios')}
    </button>
    <button class="nav-item" class:active={$activeView === 'radiofavorites'} onclick={() => navigate('radiofavorites')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
      Favoris Radio
    </button>
    <button class="nav-item" class:active={$activeView === 'podcasts'} onclick={() => navigate('podcasts')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
      Podcasts
    </button>
    <button class="nav-item" class:active={$activeView === 'mediaservers'} onclick={() => navigate('mediaservers')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></svg>
      {$t('nav.mediaservers')}
    </button>
    <button class="nav-item" class:active={$activeView === 'browse'} onclick={() => navigate('browse')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
      {$t('nav.browse')}
    </button>
  </nav>

  <!-- GROUP 3: REGLAGES (admin, collapsible) -->
  <nav class="nav-section reglages-section">
    <button class="section-label-toggle" onclick={toggleReglages}>
      <span class="section-label">{$t('nav.reglages')}</span>
      <svg class="chevron" class:open={reglagesOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="6 9 12 15 18 9"></polyline></svg>
    </button>
    <div class="reglages-items" class:reglages-open={reglagesOpen}>
      <button class="nav-item" class:active={$activeView === 'settings'} onclick={() => navigate('settings')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        {$t('nav.settings')}
        {#if $updateAvailable}
          <span class="badge-update">MAJ</span>
        {/if}
      </button>
      <button class="nav-item" class:active={$activeView === 'equalizer'} onclick={() => navigate('equalizer')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
        {$t('nav.equalizer')}
      </button>
      <button class="nav-item" class:active={$activeView === 'metadata'} onclick={() => navigate('metadata')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
        {$t('nav.maintenance')}
        <span class="badge-new">POC</span>
      </button>
      <button class="nav-item" class:active={$activeView === 'services'} onclick={() => navigate('services')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Services & Tokens
      </button>
      <button class="nav-item" class:active={$activeView === 'genretree'} onclick={() => navigate('genretree')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v6"/><circle cx="12" cy="10" r="2"/><path d="M12 12v3"/><path d="M5 17a3 3 0 1 0 6 0 3 3 0 0 0-6 0zm8 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0z"/><path d="M8 14h8"/><path d="M8 14v3"/><path d="M16 14v3"/></svg>
        Arbre des genres
      </button>
      <button class="nav-item" class:active={$activeView === 'plugins'} onclick={() => navigate('plugins')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 16V7a2 2 0 0 0-2-2h-3a2 2 0 0 1-2-2 2 2 0 0 0-2 2H8a2 2 0 0 0-2 2v3a2 2 0 0 1 2 2 2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h3a2 2 0 0 1 2 2 2 2 0 0 0 2-2h3a2 2 0 0 0 2-2z"/></svg>
        {$t('nav.plugins')}
      </button>
      <button class="nav-item" class:active={$activeView === 'zonemanager'} onclick={() => navigate('zonemanager')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 20h.01"></path><path d="M7 20v-4"></path><path d="M12 20v-8"></path><path d="M17 20V8"></path><path d="M22 4v16"></path></svg>
        {$t('nav.zonemanager')}
        <span class="badge-new">POC</span>
      </button>
      <button class="nav-item" class:active={$activeView === 'dj'} onclick={() => navigate('dj')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /><line x1="12" y1="2" x2="12" y2="5" /></svg>
        Mode DJ
        <span class="badge-new">POC</span>
      </button>
      <button class="nav-item" class:active={$activeView === 'party'} onclick={() => navigate('party')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
        Party
        <span class="badge-new">POC</span>
      </button>
      <button class="nav-item" class:active={$activeView === 'alarms'} onclick={() => navigate('alarms')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l2 2"></path><path d="M5 3L2 6"></path><path d="M22 6l-3-3"></path></svg>
        {$t('nav.alarms')}
      </button>
      <button class="nav-item" class:active={$activeView === 'diagnostics'} onclick={() => navigate('diagnostics')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10"></path><path d="M18 20V4"></path><path d="M6 20v-4"></path></svg>
        {$t('nav.diagnostics')}
      </button>
      <button class="nav-item" class:active={$activeView === 'admin'} onclick={() => navigate('admin')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg>
        {$t('nav.admin')}
      </button>
      <button class="nav-item" class:active={$activeView === 'bridge'} onclick={() => navigate('bridge')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
        Bridge
      </button>
    </div>
  </nav>


  <div class="zones-section">
    <div class="zones-header">
      <span class="section-label">{$t('zone.zones')}</span>
      <button class="add-zone-btn" onclick={() => showCreateZone = !showCreateZone} title={$t('zone.newZone')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
    </div>
    {#if showCreateZone}
      <div class="create-zone">
        <input
          type="text"
          placeholder={$t('zone.zoneName')}
          bind:value={newZoneName}
          onkeydown={(e) => e.key === 'Enter' && createZone()}
        />
        <select class="create-zone-type" bind:value={newZoneOutputType} onchange={() => { newZoneDeviceId = undefined; loadMultiroomDevices(newZoneOutputType); }}>
          <option value="local">Local</option>
          <option value="dlna">DLNA</option>
          <option value="airplay">AirPlay</option>
          <option value="snapcast">Snapcast</option>
          <option value="sonos">Sonos</option>
        </select>
        {#if newZoneOutputType === 'dlna' || newZoneOutputType === 'airplay'}
          <select class="create-zone-device" bind:value={newZoneDeviceId}>
            <option value={undefined}>{$t('zone.selectDevice')}</option>
            {#each $devices.filter(d => d.type === newZoneOutputType && d.available) as dev}
              <option value={dev.id}>{dev.name}</option>
            {/each}
          </select>
        {:else if newZoneOutputType === 'snapcast'}
          <select class="create-zone-device" bind:value={newZoneDeviceId}>
            <option value={undefined}>{multiroomLoading ? '…' : $t('zone.selectDevice')}</option>
            {#each snapcastClients as cli}
              <option value={cli.id}>{cli.name}{cli.connected ? '' : ' (offline)'}</option>
            {/each}
          </select>
        {:else if newZoneOutputType === 'sonos'}
          <select class="create-zone-device" bind:value={newZoneDeviceId}>
            <option value={undefined}>{multiroomLoading ? '…' : $t('zone.selectDevice')}</option>
            {#each sonosSpeakers as sp}
              <option value={sp.uid}>{sp.name} ({sp.ip})</option>
            {/each}
          </select>
        {/if}
        <button class="create-zone-confirm" onclick={createZone}>OK</button>
      </div>
    {/if}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="zones-list" ontouchmove={handleTouchMove} ontouchend={handleTouchEnd}>
      {#each sortedZones as zone}
        {@const gid = getZoneGroupId(zone)}
        <button
          class="zone-item"
          class:active={zone.id === $currentZoneId}
          class:is-playing={zone.state === 'playing'}
          class:is-paused={zone.state === 'paused'}
          class:is-dragging={dragZoneId === zone.id || touchDragZoneId === zone.id}
          class:drag-over-before={dragOverZoneId === zone.id && dragInsertBefore}
          class:drag-over-after={dragOverZoneId === zone.id && !dragInsertBefore}
          draggable="true"
          data-zone-id={zone.id}
          ondragstart={(e) => handleZoneDragStart(e, zone.id)}
          ondragover={(e) => handleZoneDragOver(e, zone.id)}
          ondragleave={handleZoneDragLeave}
          ondrop={handleZoneDrop}
          ondragend={handleZoneDragEnd}
          ontouchstart={(e) => handleTouchStart(e, zone.id, e.currentTarget as HTMLElement)}
          onclick={() => zone.id !== null && handleSelectZone(zone.id)}
        >
          <span class="zone-drag-handle" title="Drag to reorder">
            <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
          </span>
          <div class="zone-left">
            {#if gid}
              <span class="zone-group-dot" style="background: {groupColor(gid)}" title={$t('zone.activeGroup')}></span>
            {/if}
            <span class="zone-state-icon">
              {#if zone.state === 'playing'}
                <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" class="state-playing"><polygon points="5,3 19,12 5,21" /></svg>
              {:else if zone.state === 'paused'}
                <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" class="state-paused"><rect x="5" y="3" width="4" height="18" rx="1" /><rect x="15" y="3" width="4" height="18" rx="1" /></svg>
              {:else}
                <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" class="state-stopped"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
              {/if}
            </span>
            <div class="zone-text">
              <span class="zone-name truncate">{zone.name}</span>
              {#if zone.current_track && (zone.state === 'playing' || zone.state === 'paused')}
                <span class="zone-track truncate">{zone.current_track.title}{zone.current_track.artist_name ? ` - ${zone.current_track.artist_name}` : ''}</span>
              {/if}
            </div>
          </div>
          <span class="zone-meta">
            {#if zone.output_type && zone.output_type !== 'local'}
              <span class="zone-type-badge">{deviceTypeIcon(zone.output_type)}</span>
            {/if}
            <span class="zone-config-btn" onclick={(e) => openConfig(zone, e)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openConfig(zone, e as any); }}} title={$t('zone.configure')} aria-label={$t('zone.configure')} role="button" tabindex={0}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            </span>
          </span>
        </button>
      {/each}
      {#if $zones.length === 0}
        <div class="empty-state">{$t('zone.noZone')}</div>
      {/if}
    </div>
  </div>

  <div class="devices-section">
    <span class="section-label">{$t('zone.devices')}</span>
    <div class="devices-list">
      {#each visibleAudioDevices as audioDevice}
        <div class="device-item">
          <span class="device-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></svg>
          </span>
          <span class="device-name truncate">{audioDevice.name}</span>
          <span class="device-type-tag">{$t('settings.usb')}</span>
          <button class="device-add-btn" onclick={() => createZoneFromAudioDevice(audioDevice)} title={$t('zone.createZone')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </div>
      {/each}
      {#each visibleNetDevices as device}
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
          {#if device.type === 'airplay' && !pairedDeviceIds.has(device.id)}
            <svg class="device-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          {/if}
          <span class="device-name truncate">{device.name}</span>
          <span class="device-type-tag">{deviceTypeIcon(device.type)}</span>
          {#if device.available}
            {#if device.type === 'airplay' && !pairedDeviceIds.has(device.id)}
              {#if pairingDeviceId === device.id && pairingAwaitingPin}
                <!-- Inline PIN input -->
                <div class="pairing-inline">
                  <input
                    type="text"
                    class="pairing-pin-input"
                    placeholder={$t('pairing.pinPlaceholder')}
                    bind:value={pairingPin}
                    onkeydown={(e) => { if (e.key === 'Enter') submitPairingPin(); if (e.key === 'Escape') cancelPairing(e); }}
                    disabled={pairingLoading}
                  />
                  <button class="pairing-submit-btn" onclick={submitPairingPin} disabled={pairingLoading || !pairingPin.trim()}>
                    {$t('pairing.submit')}
                  </button>
                  <button class="pairing-cancel-btn" onclick={(e) => cancelPairing(e)} title={$t('pairing.cancel')} aria-label={$t('pairing.cancel')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              {:else if pairingDeviceId === device.id && pairingLoading}
                <div class="pairing-spinner"></div>
              {:else}
                <button class="device-pair-btn" onclick={(e) => startPairing(device.id, e)} title={$t('pairing.pair')}>
                  {$t('pairing.pair')}
                </button>
              {/if}
            {/if}
            {#if !$zones.some(z => z.output_device_id === device.id)}
            <button class="device-add-btn" onclick={() => createZoneFromDevice(device)} title={$t('zone.createZone')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
            {:else}
            <span class="device-bound" title="Zone existante">&#x2713;</span>
            {/if}
          {:else}
            <span class="device-status offline" title={$t('zone.offline')}>&#x25CB;</span>
          {/if}
        </div>
      {/each}
      {#if visibleAudioDevices.length === 0 && visibleNetDevices.length === 0}
        <div class="empty-state">{$t('zone.searchingDevices')}</div>
      {/if}
    </div>
  </div>
  <div class="resize-handle" onmousedown={startResize} role="separator" aria-label="Resize sidebar" tabindex={0}></div>
</aside>

{#if configZone}
  <ZoneConfigModal
    zone={configZone}
    allZones={$zones}
    groups={zoneGroups}
    onClose={() => configZone = null}
    onDelete={handleDeleteZone}
    onGroupChanged={handleGroupChanged}
    onRenamed={handleZoneRenamed}
  />
{/if}

<style>
  .sidebar {
    grid-column: 1;
    grid-row: 1;
    background: var(--tune-surface);
    border-right: 1px solid var(--tune-border);
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    position: relative;
    /* Firefox / Windows standard scrollbar */
    scrollbar-width: thin;
    scrollbar-color: var(--tune-border) transparent;
  }

  .sidebar::-webkit-scrollbar {
    width: 6px;
  }
  .sidebar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
  }
  .sidebar::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.35);
  }
  .sidebar::-webkit-scrollbar-track {
    background: transparent;
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
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: var(--space-xs);
  }

  .logo-link {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
    transition: opacity 0.15s;
  }

  .logo-link:hover {
    opacity: 0.7;
  }

  .logo-img {
    height: 28px;
    width: auto;
  }

  .version {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 400;
    opacity: 0.5;
    color: var(--tune-text);
  }

  .whatsnew-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 2px;
    margin-left: 4px;
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
    transition: opacity 0.12s, color 0.12s;
    vertical-align: middle;
  }

  .whatsnew-btn:hover {
    opacity: 1;
    color: var(--tune-accent);
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

  .polling-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 3px;
    background: var(--tune-warning, #f59e0b);
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
    flex-shrink: 0;
    margin-left: 2px;
    cursor: help;
  }

  .health-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-left: 2px;
  }

  .health-warning {
    background: var(--tune-warning, #f59e0b);
    box-shadow: 0 0 4px var(--tune-warning, #f59e0b);
  }

  .health-critical {
    background: var(--tune-error, #ef4444);
    box-shadow: 0 0 4px var(--tune-error, #ef4444);
    animation: health-pulse 1.5s ease-in-out infinite;
  }

  @keyframes health-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
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

  .reglages-section {
    border-top: 1px solid var(--tune-border);
    padding-top: var(--space-md);
  }

  .section-label-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 18px;
    margin-bottom: 6px;
    width: 100%;
    text-align: left;
  }

  .section-label-toggle .section-label {
    padding: 0;
    margin-bottom: 0;
  }

  .section-label-toggle:hover .section-label {
    color: var(--tune-text-secondary);
  }

  /* Reglages items wrapper: hidden by default, shown when open */
  .reglages-items {
    display: none;
    flex-direction: column;
    gap: 1px;
  }
  .reglages-items.reglages-open {
    display: flex;
  }

  .chevron {
    width: 12px;
    height: 12px;
    color: var(--tune-text-muted);
    transition: transform 0.15s ease-out;
    transform: rotate(-90deg);
    flex-shrink: 0;
  }

  .chevron.open {
    transform: rotate(0deg);
  }

  .version-link {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  .version-link:hover {
    color: var(--tune-accent);
  }

  .version-latest {
    font-size: 10px;
    color: #dc2626;
    margin-left: 4px;
    font-weight: 600;
  }

  .version-update-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #dc2626;
    margin-left: 4px;
    vertical-align: middle;
    animation: badge-pulse 2s ease-in-out infinite;
  }

  .connected-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #4ade80;
    flex-shrink: 0;
    margin-left: auto;
  }

  .zones-section {
    flex: none;
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
    font-size: 14px;
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

  .zone-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .zone-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }

  .zone-name {
    flex: 1;
  }

  .zone-track {
    font-size: 10px;
    color: var(--tune-text-muted);
    line-height: 1.2;
  }

  .zone-state-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    width: 12px;
  }

  .state-playing { color: var(--tune-success); }
  .state-paused { color: var(--tune-warning); }
  .state-stopped { color: var(--tune-text-muted); opacity: 0.3; }

  .zone-item.is-playing { background: rgba(74, 222, 128, 0.05); }
  .zone-item.is-paused { background: rgba(245, 158, 11, 0.05); }

  .zone-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .zone-type-badge {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tune-text-muted);
    background: var(--tune-bg);
    padding: 2px 6px;
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
    flex: none;
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

  .device-bound {
    color: var(--tune-success, #10b981);
    font-size: 12px;
    flex-shrink: 0;
    opacity: 0.6;
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

  .device-lock-icon {
    flex-shrink: 0;
    opacity: 0.45;
    color: var(--tune-warning, #f59e0b);
  }

  .device-pair-btn {
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-muted);
    border-radius: var(--radius-sm);
    cursor: pointer;
    padding: 1px 6px;
    font-family: var(--font-label);
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    flex-shrink: 0;
    transition: all 0.12s ease-out;
  }

  .device-pair-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .pairing-inline {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
  }

  .pairing-pin-input {
    width: 52px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 2px 5px;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 11px;
    outline: none;
    text-align: center;
    letter-spacing: 1px;
  }

  .pairing-pin-input:focus {
    border-color: var(--tune-accent);
  }

  .pairing-submit-btn {
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    padding: 2px 6px;
    cursor: pointer;
    font-family: var(--font-label);
    font-size: 9px;
    font-weight: 600;
  }

  .pairing-submit-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .pairing-cancel-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: color 0.12s;
  }

  .pairing-cancel-btn:hover {
    color: var(--tune-danger, #ef4444);
  }

  .pairing-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
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
    cursor: pointer;
  }

  .zone-item:hover .zone-config-btn,
  .zone-item.active .zone-config-btn {
    opacity: 1;
  }

  .zone-config-btn:hover {
    color: var(--tune-accent);
  }

  /* --- Zone drag-and-drop --- */
  .zone-drag-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 14px;
    color: var(--tune-text-muted);
    opacity: 0;
    cursor: grab;
    transition: opacity 0.12s;
    touch-action: none;
  }

  .zone-item:hover .zone-drag-handle {
    opacity: 0.5;
  }

  .zone-drag-handle:hover {
    opacity: 1 !important;
    color: var(--tune-text-secondary);
  }

  .zone-drag-handle:active {
    cursor: grabbing;
  }

  .zone-item.is-dragging {
    opacity: 0.4;
    transform: scale(0.97);
    transition: opacity 0.15s, transform 0.15s;
  }

  .zone-item.drag-over-before {
    box-shadow: inset 0 2px 0 0 var(--tune-accent, #6366f1);
  }

  .zone-item.drag-over-after {
    box-shadow: inset 0 -2px 0 0 var(--tune-accent, #6366f1);
  }

  :global(.zone-drag-clone) {
    background: var(--tune-surface, #1a1a2e);
    border-radius: var(--radius-sm, 4px);
  }

  /* Touch devices: always show drag handle */
  @media (hover: none) and (pointer: coarse) {
    .zone-drag-handle {
      opacity: 0.4;
    }
  }

  /* Tablet: sidebar icônes seulement */
  @media (max-width: 1024px) {
    .sidebar {
      width: var(--sidebar-collapsed-width);
      overflow-x: hidden;
      overflow-y: auto;
    }
    .sidebar-header { padding: var(--space-md) 0; align-items: center; }
    .logo { justify-content: center; }
    .logo span, .version, .connection-status .state-text { display: none; }
    .section-label { display: none; }
    .nav-item { justify-content: center; padding: 12px 0; font-size: 0; }
    .nav-item svg { width: 20px; height: 20px; flex-shrink: 0; }
    /* Hide text badges in icon-only mode to prevent overflow */
    .badge-new, .badge-update { display: none; }
    .connected-dot { display: none; }
    /* Show settings section icons — hide toggle, force items visible */
    .services-section { display: none; }
    .section-label-toggle { display: none; }
    .reglages-items { display: flex; }
    .zones-section, .devices-section { display: none; }
    .resize-handle { display: none; }
  }

  .badge-new {
    margin-left: auto;
    background: var(--tune-accent, #6366f1);
    color: white;
    border-radius: 999px;
    padding: 0.05rem 0.4rem;
    font-size: 0.65rem;
    font-weight: 600;
  }

  .badge-update {
    margin-left: auto;
    background: #dc2626;
    color: white;
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    animation: badge-pulse 2s ease-in-out infinite;
  }

  @keyframes badge-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.6); }
    50% { box-shadow: 0 0 0 6px rgba(220, 38, 38, 0); }
  }

  /* Mobile: sidebar cachée (BottomTabBar prend le relais) */
  @media (max-width: 768px) {
    .sidebar { display: none; }
  }
</style>

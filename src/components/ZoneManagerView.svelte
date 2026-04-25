<script lang="ts">
  import { zones, currentZoneId } from '../lib/stores/zones';
  import { devices } from '../lib/stores/devices';
  import { notifications } from '../lib/stores/notifications';
  import { t } from '../lib/i18n';
  import * as api from '../lib/api';
  import type { Zone, ZoneGroupResponse, OutputType, DiscoveredDevice, StereoPairInfo } from '../lib/types';

  // --- State ---
  let zoneGroups = $state<ZoneGroupResponse[]>([]);
  let stereoPairs = $state<StereoPairInfo[]>([]);
  let loading = $state(true);

  // Selection
  let selectedZoneIds = $state<Set<number>>(new Set());

  // Create zone
  let showCreateZone = $state(false);
  let newZoneName = $state('');
  let newZoneOutputType = $state<OutputType>('local');
  let newZoneDeviceId = $state<string | undefined>(undefined);

  // Stereo pair creation
  let showStereoPairForm = $state(false);
  let stereoPairName = $state('');

  // Delete confirmation
  let confirmDeleteId = $state<number | null>(null);

  // Latency measurement
  let measuringLatency = $state<number | null>(null);
  let latencyResults = $state<Record<number, number>>({});

  // Group calibration
  let calibratingGroupId = $state<string | null>(null);
  // group_id -> { zone_id -> sync_delay_ms }
  let calibrationResults = $state<Record<string, Record<number, number>>>({});

  // Volume debounce
  let volumeTimers: Record<number, ReturnType<typeof setTimeout>> = {};

  // --- Computed ---
  let selectedCount = $derived(selectedZoneIds.size);
  let selectedZones = $derived($zones.filter(z => z.id !== null && selectedZoneIds.has(z.id)));
  let canGroup = $derived(selectedCount >= 2);
  let canStereoPair = $derived(
    selectedCount === 2 &&
    selectedZones.every(z => z.output_type === 'dlna')
  );

  // --- Data loading ---
  async function loadData() {
    loading = true;
    try {
      const [groups, pairs] = await Promise.all([
        api.listGroups(),
        api.listStereoPairs().catch(() => [] as StereoPairInfo[]),
      ]);
      zoneGroups = groups;
      stereoPairs = pairs;
    } catch (e) {
      console.error('ZoneManager load error:', e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    loadData();
  });

  // --- Zone helpers ---
  function getGroupForZone(zone: Zone): ZoneGroupResponse | null {
    if (zone.id === null) return null;
    return zoneGroups.find(g => g.zone_ids.includes(zone.id!)) ?? null;
  }

  function getStereoPairForZone(zone: Zone): StereoPairInfo | null {
    if (zone.id === null) return null;
    return stereoPairs.find(p =>
      (p.left_zone && p.left_zone.id === zone.id) ||
      (p.right_zone && p.right_zone.id === zone.id)
    ) ?? null;
  }

  function getChannelLabel(zone: Zone, pair: StereoPairInfo): string {
    if (pair.left_zone && pair.left_zone.id === zone.id) return $t('zone.leftChannel');
    if (pair.right_zone && pair.right_zone.id === zone.id) return $t('zone.rightChannel');
    return '';
  }

  function isLeader(zone: Zone, group: ZoneGroupResponse): boolean {
    return zone.id === group.leader_id;
  }

  const groupColors = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4'];

  function groupColor(groupId: string): string {
    let hash = 0;
    for (let i = 0; i < groupId.length; i++) hash = (hash * 31 + groupId.charCodeAt(i)) | 0;
    return groupColors[Math.abs(hash) % groupColors.length];
  }

  function outputTypeIcon(type: OutputType | undefined): string {
    switch (type) {
      case 'dlna': return 'DLNA';
      case 'airplay': return 'AirPlay';
      default: return 'Local';
    }
  }

  function stateLabel(state: string | undefined): string {
    switch (state) {
      case 'playing': return $t('zone.playing');
      case 'paused': return $t('zone.paused');
      case 'buffering': return $t('zone.buffering');
      default: return $t('zone.stopped');
    }
  }

  function stateClass(state: string | undefined): string {
    switch (state) {
      case 'playing': return 'state-playing';
      case 'paused': return 'state-paused';
      case 'buffering': return 'state-buffering';
      default: return 'state-stopped';
    }
  }

  // --- Selection ---
  function toggleSelect(zone: Zone) {
    if (zone.id === null) return;
    const next = new Set(selectedZoneIds);
    if (next.has(zone.id)) {
      next.delete(zone.id);
    } else {
      next.add(zone.id);
    }
    selectedZoneIds = next;
  }

  function clearSelection() {
    selectedZoneIds = new Set();
    showStereoPairForm = false;
  }

  function isSelected(zone: Zone): boolean {
    return zone.id !== null && selectedZoneIds.has(zone.id);
  }

  // --- Volume ---
  function onVolumeInput(zone: Zone, value: number) {
    if (zone.id === null) return;
    // Optimistic update in store
    zones.update(zs => zs.map(z => z.id === zone.id ? { ...z, volume: value } : z));
    // Debounce API call
    if (volumeTimers[zone.id]) clearTimeout(volumeTimers[zone.id]);
    volumeTimers[zone.id] = setTimeout(async () => {
      try {
        await api.setVolume(zone.id!, value);
      } catch (e) {
        console.error('Volume error:', e);
      }
    }, 100);
  }

  // --- Zone CRUD ---
  async function handleCreateZone() {
    if (!newZoneName.trim()) return;
    try {
      const zone = await api.createZone(newZoneName.trim(), newZoneOutputType, newZoneDeviceId);
      zones.update(zs => [...zs, zone]);
      if (zone.id !== null) currentZoneId.set(zone.id);
      notifications.success($t('zone.zoneCreated'));
      newZoneName = '';
      newZoneOutputType = 'local';
      newZoneDeviceId = undefined;
      showCreateZone = false;
    } catch (e: any) {
      notifications.error(e.message || 'Failed to create zone');
    }
  }

  async function handleDeleteZone(id: number) {
    try {
      await api.deleteZone(id);
      zones.update(zs => zs.filter(z => z.id !== id));
      notifications.success($t('zone.zoneDeleted'));
      confirmDeleteId = null;
      // If deleted zone was selected, remove from selection
      if (selectedZoneIds.has(id)) {
        const next = new Set(selectedZoneIds);
        next.delete(id);
        selectedZoneIds = next;
      }
      // If deleted zone was current, switch
      let curId: number | null = null;
      currentZoneId.subscribe(v => (curId = v))();
      if (curId === id) {
        const remaining = $zones.filter(z => z.id !== id);
        currentZoneId.set(remaining.length > 0 ? remaining[0].id : null);
      }
      await loadData();
    } catch (e: any) {
      notifications.error(e.message || 'Failed to delete zone');
    }
  }

  // --- Groups ---
  async function handleGroupSelected() {
    if (selectedCount < 2) return;
    const ids = Array.from(selectedZoneIds);
    const leaderId = ids[0];
    try {
      await api.groupZones(leaderId, ids);
      notifications.success($t('zone.groupCreated'));
      clearSelection();
      await loadData();
      // Refresh zones to get updated group_id
      const zoneList = await api.getZones();
      zones.set(zoneList);
    } catch (e: any) {
      notifications.error(e.message || $t('zone.groupError'));
    }
  }

  async function handleUngroupZone(group: ZoneGroupResponse) {
    try {
      await api.ungroupZones(group.group_id);
      notifications.success($t('zone.groupDissolved'));
      await loadData();
      const zoneList = await api.getZones();
      zones.set(zoneList);
    } catch (e: any) {
      notifications.error(e.message || $t('zone.ungroupError'));
    }
  }

  // --- Stereo Pairs ---
  function openStereoPairForm() {
    showStereoPairForm = true;
    stereoPairName = selectedZones.map(z => z.name).join(' + ');
  }

  async function handleCreateStereoPair() {
    if (!canStereoPair || !stereoPairName.trim()) return;
    const selected = Array.from(selectedZoneIds);
    // Find device IDs from zones
    const zone1 = $zones.find(z => z.id === selected[0]);
    const zone2 = $zones.find(z => z.id === selected[1]);
    if (!zone1?.output_device_id || !zone2?.output_device_id) {
      notifications.error('Both zones must have a device assigned');
      return;
    }
    try {
      await api.createStereoPair(stereoPairName.trim(), zone1.output_device_id, zone2.output_device_id);
      notifications.success($t('zone.stereoPairCreated'));
      clearSelection();
      showStereoPairForm = false;
      await loadData();
      const zoneList = await api.getZones();
      zones.set(zoneList);
    } catch (e: any) {
      notifications.error(e.message || 'Failed to create stereo pair');
    }
  }

  async function handleDissolveStereoPair(pairId: string) {
    try {
      await api.dissolveStereoPair(pairId);
      notifications.success($t('zone.stereoPairDissolved'));
      await loadData();
      const zoneList = await api.getZones();
      zones.set(zoneList);
    } catch (e: any) {
      notifications.error(e.message || 'Failed to dissolve stereo pair');
    }
  }

  // --- Latency ---
  async function handleMeasureLatency(zoneId: number) {
    measuringLatency = zoneId;
    try {
      const result = await api.measureLatency(zoneId);
      latencyResults = { ...latencyResults, [zoneId]: result.latency_ms };
    } catch (e: any) {
      notifications.error('Latency: ' + e.message);
    } finally {
      measuringLatency = null;
    }
  }

  async function handleCalibrateGroup(group: ZoneGroupResponse) {
    calibratingGroupId = group.group_id;
    try {
      const result = await api.calibrateGroup(group.group_id);
      calibrationResults = { ...calibrationResults, [group.group_id]: result.calibration ?? {} };
      notifications.success($t('zone.calibrate') + ' OK');
    } catch (e: any) {
      notifications.error('Calibration: ' + e.message);
    } finally {
      calibratingGroupId = null;
    }
  }

  // --- Create zone from device ---
  async function handleClearDevices() {
    try {
      const result = await api.clearDevices();
      devices.set([]);
      notifications.success(`${result.cleared} appareils supprimés`);
    } catch (e: any) {
      notifications.error(e?.message || 'Erreur');
    }
  }

  async function createZoneFromDevice(device: DiscoveredDevice) {
    try {
      const zone = await api.createZone(device.name, device.type, device.id);
      zones.update(zs => [...zs, zone]);
      if (zone.id !== null) currentZoneId.set(zone.id);
      notifications.success($t('zone.zoneCreated'));
    } catch (e: any) {
      notifications.error(e.message || 'Failed to create zone');
    }
  }

  // Unbound devices (not yet assigned to a zone)
  let unboundDevices = $derived(
    $devices.filter(dev => {
      if (!dev.available) return false;
      return !$zones.some(z => z.output_device_id === dev.id);
    })
  );

  // Sort zones: grouped zones together, then by name
  let sortedZones = $derived.by(() => {
    const zs = [...$zones];
    zs.sort((a, b) => {
      const gA = getGroupForZone(a);
      const gB = getGroupForZone(b);
      // Grouped zones first, then by group ID to cluster them
      if (gA && !gB) return -1;
      if (!gA && gB) return 1;
      if (gA && gB && gA.group_id !== gB.group_id) return gA.group_id.localeCompare(gB.group_id);
      return a.name.localeCompare(b.name);
    });
    return zs;
  });
</script>

<div class="zone-manager">
  <header class="zm-header">
    <div class="zm-title-row">
      <h1>{$t('zone.manager')}</h1>
      <span class="zone-count">{$zones.length}</span>
    </div>
    <div class="zm-actions">
      {#if selectedCount > 0}
        <span class="selection-info">{selectedCount} {$t('zone.selected')}</span>
        <button class="btn btn-ghost" onclick={clearSelection}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          {$t('zone.clearSelection')}
        </button>
        {#if canGroup}
          <button class="btn btn-primary" onclick={handleGroupSelected}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
            {$t('zone.group')}
          </button>
        {/if}
        {#if canStereoPair && !showStereoPairForm}
          <button class="btn btn-secondary" onclick={openStereoPairForm}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></svg>
            {$t('zone.createStereoPair')}
          </button>
        {/if}
      {/if}
      <button class="btn btn-ghost" onclick={loadData} disabled={loading} title={$t('zone.refresh')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" class:spinning={loading}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
      </button>
      <button class="btn btn-primary" onclick={() => showCreateZone = !showCreateZone}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        {$t('zone.newZone')}
      </button>
    </div>
  </header>

  <!-- Stereo pair creation form -->
  {#if showStereoPairForm}
    <div class="stereo-pair-form">
      <div class="form-row">
        <label class="form-label">{$t('zone.stereoPairName')}</label>
        <input
          type="text"
          class="form-input"
          bind:value={stereoPairName}
          placeholder={$t('zone.stereoPairName')}
          onkeydown={(e) => e.key === 'Enter' && handleCreateStereoPair()}
        />
      </div>
      <p class="form-hint">{$t('zone.selectTwoDlna')}</p>
      <div class="form-actions">
        <button class="btn btn-primary" onclick={handleCreateStereoPair} disabled={!stereoPairName.trim()}>
          {$t('zone.createStereoPair')}
        </button>
        <button class="btn btn-ghost" onclick={() => { showStereoPairForm = false; }}>
          {$t('common.cancel')}
        </button>
      </div>
    </div>
  {/if}

  <!-- Create zone form -->
  {#if showCreateZone}
    <div class="create-zone-panel">
      <div class="create-zone-fields">
        <input
          type="text"
          class="form-input"
          placeholder={$t('zone.zoneName')}
          bind:value={newZoneName}
          onkeydown={(e) => e.key === 'Enter' && handleCreateZone()}
        />
        <select class="form-select" bind:value={newZoneOutputType} onchange={() => { newZoneDeviceId = undefined; }}>
          <option value="local">Local</option>
          <option value="dlna">DLNA</option>
          <option value="airplay">AirPlay</option>
        </select>
        {#if newZoneOutputType !== 'local'}
          <select class="form-select" bind:value={newZoneDeviceId}>
            <option value={undefined}>{$t('zone.selectDevice')}</option>
            {#each $devices.filter(d => d.type === newZoneOutputType && d.available) as dev}
              <option value={dev.id}>{dev.name}</option>
            {/each}
          </select>
        {/if}
        <button class="btn btn-primary" onclick={handleCreateZone} disabled={!newZoneName.trim()}>
          {$t('common.create')}
        </button>
        <button class="btn btn-ghost" onclick={() => { showCreateZone = false; }}>
          {$t('common.cancel')}
        </button>
      </div>
    </div>
  {/if}

  <!-- Zones grid -->
  <section class="zm-section">
    <div class="zones-grid">
      {#each sortedZones as zone (zone.id)}
        {@const group = getGroupForZone(zone)}
        {@const pair = getStereoPairForZone(zone)}
        {@const selected = isSelected(zone)}
        <div
          class="zone-card"
          class:selected
          class:grouped={!!group}
          style={group ? `border-color: ${groupColor(group.group_id)}` : ''}
          onclick={() => toggleSelect(zone)}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelect(zone); }}}
          role="button"
          tabindex={0}
        >
          <!-- Card header -->
          <div class="card-header">
            <div class="card-title-row">
              {#if selected}
                <span class="check-indicator">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
                </span>
              {/if}
              {#if group}
                <span class="group-dot" style="background: {groupColor(group.group_id)}" title={group.group_id}></span>
              {/if}
              <span class="zone-name">{zone.name}</span>
              {#if pair}
                <span class="stereo-badge">{getChannelLabel(zone, pair)}</span>
              {/if}
            </div>
            <div class="card-badges">
              <span class="output-badge {zone.output_type ?? 'local'}">{outputTypeIcon(zone.output_type)}</span>
              <span class="state-badge {stateClass(zone.state)}">{stateLabel(zone.state)}</span>
            </div>
          </div>

          <!-- Current track -->
          {#if zone.current_track}
            <div class="card-track">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
              <span class="track-info">{zone.current_track.title}{zone.current_track.artist_name ? ` - ${zone.current_track.artist_name}` : ''}</span>
            </div>
          {/if}

          <!-- Volume + actions row -->
          <div class="card-controls" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
            <button
              class="btn-icon"
              onclick={(e) => { e.stopPropagation(); onVolumeInput(zone, (zone.volume ?? 0) > 0 ? 0 : 0.5); }}
              title={(zone.volume ?? 0) > 0 ? $t('zone.mute') : $t('zone.unmute')}
            >
              {#if (zone.volume ?? 0) === 0}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
              {:else if (zone.volume ?? 0) < 0.5}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
              {/if}
            </button>
            <input
              type="range" min="0" max="1" step="0.01"
              value={zone.volume ?? 0}
              oninput={(e) => onVolumeInput(zone, parseFloat(e.currentTarget.value))}
              class="volume-slider"
            />
            <span class="volume-pct">{Math.round((zone.volume ?? 0) * 100)}%</span>

            <!-- Latency -->
            <button
              class="btn-icon btn-icon-sm"
              onclick={(e) => { e.stopPropagation(); zone.id !== null && handleMeasureLatency(zone.id); }}
              disabled={measuringLatency === zone.id}
              title={$t('zone.latency')}
            >
              {#if measuringLatency === zone.id}
                <span class="spinner-sm"></span>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              {/if}
            </button>
            {#if zone.id !== null && latencyResults[zone.id] !== undefined}
              <span class="latency-tag">{latencyResults[zone.id]}ms</span>
            {/if}

            <!-- Delete -->
            {#if confirmDeleteId === zone.id}
              <div class="delete-confirm" onclick={(e) => e.stopPropagation()}>
                <span class="delete-confirm-text">{$t('zone.confirmDelete')}</span>
                <button class="btn btn-danger-sm" onclick={(e) => { e.stopPropagation(); zone.id !== null && handleDeleteZone(zone.id); }}>
                  {$t('common.delete')}
                </button>
                <button class="btn btn-ghost-sm" onclick={(e) => { e.stopPropagation(); confirmDeleteId = null; }}>
                  {$t('common.cancel')}
                </button>
              </div>
            {:else}
              <button
                class="btn-icon btn-icon-danger"
                onclick={(e) => { e.stopPropagation(); confirmDeleteId = zone.id; }}
                title={$t('zone.deleteZone')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              </button>
            {/if}
          </div>

          <!-- Group / Stereo info footer -->
          {#if group}
            <div class="card-footer" onclick={(e) => e.stopPropagation()}>
              <div class="group-info" style="border-color: {groupColor(group.group_id)}">
                {#if isLeader(zone, group)}
                  <span class="leader-tag">{$t('zone.leader')}</span>
                {/if}
                <span class="group-label" style="color: {groupColor(group.group_id)}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                  {$t('zone.activeGroup')}
                </span>
                {#if group.auto_synced}
                  <!-- Same manufacturer: sync is guaranteed, no calibration needed -->
                  <span class="auto-sync-badge" title={group.group_manufacturer}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><polyline points="20 6 9 17 4 12"/></svg>
                    {$t('zone.autoSynced')}
                  </span>
                {:else if isLeader(zone, group)}
                  <!-- Mixed brands: calibration recommended, only show on leader card -->
                  <button
                    class="btn-inline"
                    onclick={(e) => { e.stopPropagation(); handleCalibrateGroup(group); }}
                    disabled={calibratingGroupId === group.group_id}
                    title={$t('zone.calibrate')}
                  >
                    {#if calibratingGroupId === group.group_id}
                      <span class="spinner-sm"></span>
                    {:else}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    {/if}
                    {calibratingGroupId === group.group_id ? $t('zone.calibrating') : $t('zone.calibrate')}
                  </button>
                {/if}
                {#if calibrationResults[group.group_id]?.[zone.id!] !== undefined}
                  <span class="latency-tag">{calibrationResults[group.group_id][zone.id!]}ms</span>
                {/if}
                <button class="btn-inline danger" onclick={(e) => { e.stopPropagation(); handleUngroupZone(group); }}>
                  {$t('zone.ungroup')}
                </button>
              </div>
            </div>
          {/if}
          {#if pair}
            <div class="card-footer" onclick={(e) => e.stopPropagation()}>
              <div class="stereo-info">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></svg>
                <span>{$t('zone.stereoPair')}</span>
                <button class="btn-inline danger" onclick={(e) => { e.stopPropagation(); handleDissolveStereoPair(pair.stereo_pair_id); }}>
                  {$t('zone.dissolveStereoPair')}
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>

    {#if $zones.length === 0 && !loading}
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M2 20h.01"></path><path d="M7 20v-4"></path><path d="M12 20v-8"></path><path d="M17 20V8"></path><path d="M22 4v16"></path></svg>
        <p>{$t('zone.noZone')}</p>
      </div>
    {/if}
  </section>

  <!-- Available devices (unbound) -->
  {#if unboundDevices.length > 0 || $devices.length > 0}
    <section class="zm-section">
      <div class="section-header-row">
        <h2 class="section-title">{$t('zone.devices')}</h2>
        {#if $devices.length > 0}
          <button class="btn btn-ghost-sm btn-danger-text" onclick={handleClearDevices}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            {$t('zone.clearDevices')}
          </button>
        {/if}
      </div>
      <div class="devices-grid">
        {#each unboundDevices as device}
          <div class="device-card">
            <div class="device-info">
              <span class="device-icon">
                {#if device.type === 'airplay'}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" /></svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="2" y="7" width="20" height="15" rx="2" ry="2" /><polyline points="17 2 12 7 7 2" /></svg>
                {/if}
              </span>
              <span class="device-name">{device.name}</span>
              <span class="output-badge {device.type}">{outputTypeIcon(device.type)}</span>
            </div>
            <button class="btn btn-ghost-sm" onclick={() => createZoneFromDevice(device)} title={$t('zone.createZone')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              {$t('zone.createZone')}
            </button>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .zone-manager {
    padding: 24px 28px;
    max-width: 1200px;
  }

  /* Header */
  .zm-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 12px;
  }

  .zm-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .zm-title-row h1 {
    font-family: var(--font-label);
    font-size: 22px;
    font-weight: 700;
    color: var(--tune-text);
    margin: 0;
  }

  .zone-count {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    color: var(--tune-text-muted);
    background: var(--tune-bg);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
  }

  .zm-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .selection-info {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-accent);
    font-weight: 500;
  }

  /* Buttons */
  .btn {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 500;
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.12s ease-out;
    white-space: nowrap;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--tune-accent);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .btn-secondary {
    background: var(--tune-bg);
    color: var(--tune-text-secondary);
    border: 1px solid var(--tune-border);
  }

  .btn-secondary:hover:not(:disabled) {
    border-color: var(--tune-accent);
    color: var(--tune-text);
  }

  .btn-ghost {
    background: none;
    color: var(--tune-text-secondary);
  }

  .btn-ghost:hover:not(:disabled) {
    color: var(--tune-text);
    background: var(--tune-surface-hover);
  }

  .btn-ghost-sm {
    font-family: var(--font-body);
    font-size: 11px;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--tune-border);
    background: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.12s ease-out;
  }

  .btn-ghost-sm:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .btn-danger-sm {
    font-family: var(--font-body);
    font-size: 11px;
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid rgba(220, 38, 38, 0.3);
    background: rgba(220, 38, 38, 0.1);
    color: #ef4444;
    cursor: pointer;
  }

  .btn-danger-sm:hover {
    background: rgba(220, 38, 38, 0.2);
  }

  .btn-icon {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--tune-text-muted);
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.12s;
    flex-shrink: 0;
  }

  .btn-icon:hover {
    color: var(--tune-accent);
  }

  .btn-icon:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-icon-sm {
    padding: 2px;
  }

  .btn-icon-danger:hover {
    color: #ef4444;
  }

  .btn-inline {
    font-family: var(--font-body);
    font-size: 11px;
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    transition: all 0.12s;
    margin-left: auto;
  }

  .btn-inline:hover {
    color: var(--tune-text);
    background: var(--tune-surface-hover);
  }

  .btn-inline.danger:hover {
    color: #ef4444;
  }

  /* Stereo pair form */
  .stereo-pair-form {
    background: var(--tune-surface);
    border: 1px solid var(--tune-accent);
    border-radius: var(--radius-md, 8px);
    padding: 16px;
    margin-bottom: 16px;
  }

  .form-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .form-label {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tune-text-muted);
    min-width: 100px;
  }

  .form-input {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 6px 10px;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    outline: none;
    flex: 1;
  }

  .form-input:focus {
    border-color: var(--tune-accent);
  }

  .form-select {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 6px 10px;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 12px;
    outline: none;
  }

  .form-select:focus {
    border-color: var(--tune-accent);
  }

  .form-hint {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    margin: 0 0 8px;
  }

  .form-actions {
    display: flex;
    gap: 8px;
  }

  /* Create zone panel */
  .create-zone-panel {
    background: var(--tune-surface);
    border: 1px solid var(--tune-accent);
    border-radius: var(--radius-md, 8px);
    padding: 16px;
    margin-bottom: 16px;
  }

  .create-zone-fields {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  /* Section */
  .zm-section {
    margin-bottom: 24px;
  }

  .section-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .section-header-row .section-title {
    margin: 0;
  }

  .btn-danger-text {
    color: #ef4444 !important;
  }

  .btn-danger-text:hover {
    background: rgba(239, 68, 68, 0.1) !important;
  }

  .section-title {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--tune-text-muted);
    margin: 0 0 12px;
  }

  /* Zone grid */
  .zones-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 12px;
  }

  .zone-card {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md, 8px);
    padding: 14px 16px;
    cursor: pointer;
    transition: all 0.15s ease-out;
    display: flex;
    flex-direction: column;
    gap: 10px;
    user-select: none;
  }

  .zone-card:hover {
    border-color: var(--tune-text-muted);
  }

  .zone-card.selected {
    border-color: var(--tune-accent);
    background: rgba(124, 58, 237, 0.06);
  }

  .zone-card.grouped {
    border-width: 2px;
  }

  /* Card header */
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }

  .card-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .check-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: var(--tune-accent);
    color: white;
    flex-shrink: 0;
  }

  .group-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .zone-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .stereo-badge {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 700;
    color: white;
    background: #3b82f6;
    padding: 1px 6px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .card-badges {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .output-badge {
    font-family: var(--font-label);
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .output-badge.dlna {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
  }

  .output-badge.airplay {
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
  }

  .output-badge.local {
    background: rgba(34, 197, 94, 0.15);
    color: #4ade80;
  }

  .state-badge {
    font-family: var(--font-label);
    font-size: 9px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .state-playing {
    background: rgba(34, 197, 94, 0.15);
    color: #4ade80;
  }

  .state-paused {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
  }

  .state-buffering {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
  }

  .state-stopped {
    background: rgba(107, 114, 128, 0.15);
    color: var(--tune-text-muted);
  }

  /* Current track */
  .card-track {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    min-width: 0;
  }

  .card-track svg {
    flex-shrink: 0;
    opacity: 0.5;
  }

  .track-info {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Controls */
  .card-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: default;
  }

  .volume-slider {
    flex: 1;
    accent-color: var(--tune-accent);
    height: 4px;
    min-width: 60px;
  }

  .volume-pct {
    font-family: var(--font-label);
    font-size: 11px;
    color: var(--tune-text-muted);
    min-width: 32px;
    text-align: right;
  }

  .latency-tag {
    font-family: var(--font-label);
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
  }

  .spinner-sm {
    width: 12px;
    height: 12px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  /* Delete confirmation */
  .delete-confirm {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }

  .delete-confirm-text {
    font-family: var(--font-body);
    font-size: 11px;
    color: #ef4444;
  }

  /* Card footer */
  .card-footer {
    border-top: 1px solid var(--tune-border);
    padding-top: 8px;
  }

  .group-info, .stereo-info {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-secondary);
  }

  .leader-tag {
    font-family: var(--font-label);
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: rgba(124, 58, 237, 0.15);
    color: var(--tune-accent);
    padding: 1px 5px;
    border-radius: 3px;
  }

  .auto-sync-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-label);
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: rgba(34, 197, 94, 0.15);
    color: #4ade80;
    padding: 1px 6px;
    border-radius: 3px;
  }

  .group-label {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* Devices grid */
  .devices-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 8px;
  }

  .device-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md, 8px);
    padding: 10px 14px;
  }

  .device-info {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .device-icon {
    display: flex;
    align-items: center;
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  .device-name {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: var(--tune-text-muted);
    gap: 12px;
  }

  .empty-state p {
    font-family: var(--font-body);
    font-size: 14px;
    margin: 0;
  }

  /* Spinning refresh icon */
  .spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Responsive */
  @media (max-width: 768px) {
    .zone-manager {
      padding: 16px;
    }

    .zm-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .zones-grid {
      grid-template-columns: 1fr;
    }

    .devices-grid {
      grid-template-columns: 1fr;
    }

    .create-zone-fields {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>

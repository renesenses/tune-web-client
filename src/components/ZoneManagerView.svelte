<script lang="ts">
  import * as api from '../lib/api';
  import { t } from '../lib/i18n';

  interface ZoneInfo {
    id: number;
    name: string;
    output_type: string;
    output_device_id: string | null;
    host: string | null;
    volume: number;
    muted: boolean;
    online: boolean;
    group_id: string | null;
    sync_delay_ms: number;
  }

  interface GroupInfo {
    id: string;
    name: string;
    leader_zone_id: number;
    master_volume: number;
    members: { zone_id: number; volume_offset: number; muted: boolean }[];
  }

  interface ProfileInfo {
    id: number;
    name: string;
    description?: string;
    icon?: string;
  }

  let zones = $state<ZoneInfo[]>([]);
  let groups = $state<GroupInfo[]>([]);
  let profiles = $state<ProfileInfo[]>([]);
  let syncStats = $state<Record<string, any>>({});
  let loading = $state(true);
  let message = $state('');
  let messageType = $state<'success' | 'error'>('success');

  // Group creation
  let showCreateGroup = $state(false);
  let newGroupName = $state('');
  let selectedLeader = $state<number | null>(null);
  let selectedMembers = $state<Set<number>>(new Set());

  // Profile creation
  let showCreateProfile = $state(false);
  let newProfileName = $state('');
  let newProfileDesc = $state('');

  // Rename group
  let editingGroupId = $state<string | null>(null);
  let editingGroupName = $state('');

  // Latency
  let measuringLatency = $state<number | null>(null);
  let latencyResults = $state<Record<number, number>>({});

  async function loadOverview() {
    try {
      loading = true;
      const data = await api.getZoneOverview();
      zones = data.zones || [];
      groups = data.groups || [];
      profiles = data.profiles || [];
      syncStats = data.sync_stats || {};
    } catch (e: any) {
      showMessage('Erreur: ' + e.message, 'error');
    } finally {
      loading = false;
    }
  }

  function showMessage(msg: string, type: 'success' | 'error' = 'success') {
    message = msg;
    messageType = type;
    setTimeout(() => { message = ''; }, 5000);
  }

  // --- Mute ---
  async function toggleMute(zone: ZoneInfo) {
    try {
      await api.muteZone(zone.id, !zone.muted);
      zone.muted = !zone.muted;
      showMessage(`${zone.name}: ${zone.muted ? 'Mute' : 'Unmute'}`);
    } catch (e: any) {
      showMessage('Erreur mute: ' + e.message, 'error');
    }
  }

  // --- Volume ---
  async function onVolumeChange(zone: ZoneInfo, value: number) {
    zone.volume = value;
    try {
      await api.setVolume(zone.id, value);
    } catch { /* debounced */ }
  }

  // --- Groups ---
  async function doCreateGroup() {
    if (!selectedLeader || selectedMembers.size === 0) return;
    try {
      const allIds = [selectedLeader, ...selectedMembers];
      await api.createGroup(selectedLeader, allIds, newGroupName || undefined);
      showMessage('Groupe cree');
      showCreateGroup = false;
      newGroupName = '';
      selectedMembers = new Set();
      await loadOverview();
    } catch (e: any) {
      showMessage('Erreur: ' + e.message, 'error');
    }
  }

  async function doRenameGroup(groupId: string) {
    if (!editingGroupName.trim()) return;
    try {
      await api.renameGroup(groupId, editingGroupName.trim());
      showMessage('Groupe renomme');
      editingGroupId = null;
      await loadOverview();
    } catch (e: any) {
      showMessage('Erreur: ' + e.message, 'error');
    }
  }

  async function doDeleteGroup(groupId: string) {
    try {
      await api.deleteGroup(groupId);
      showMessage('Groupe dissous');
      await loadOverview();
    } catch (e: any) {
      showMessage('Erreur: ' + e.message, 'error');
    }
  }

  async function doSetGroupVolume(groupId: string, vol: number) {
    try {
      await api.setGroupVolume(groupId, vol);
    } catch { /* ignore */ }
  }

  async function doCalibrateGroup(groupId: string) {
    try {
      const result = await api.calibrateGroup(groupId);
      showMessage('Calibration terminee');
    } catch (e: any) {
      showMessage('Erreur calibration: ' + e.message, 'error');
    }
  }

  // --- Profiles ---
  async function doCreateProfile() {
    if (!newProfileName) return;
    try {
      await api.createZoneProfile(newProfileName, newProfileDesc || undefined);
      showMessage(`Profil "${newProfileName}" sauvegarde`);
      showCreateProfile = false;
      newProfileName = '';
      newProfileDesc = '';
      await loadOverview();
    } catch (e: any) {
      showMessage('Erreur: ' + e.message, 'error');
    }
  }

  async function doActivateProfile(p: ProfileInfo) {
    try {
      await api.activateZoneProfile(p.id);
      showMessage(`Profil "${p.name}" active`);
      await loadOverview();
    } catch (e: any) {
      showMessage('Erreur: ' + e.message, 'error');
    }
  }

  async function doDeleteProfile(p: ProfileInfo) {
    try {
      await api.deleteZoneProfile(p.id);
      showMessage(`Profil "${p.name}" supprime`);
      await loadOverview();
    } catch (e: any) {
      showMessage('Erreur: ' + e.message, 'error');
    }
  }

  // --- Latency ---
  async function doMeasureLatency(zoneId: number) {
    measuringLatency = zoneId;
    try {
      const result = await api.measureLatency(zoneId);
      latencyResults[zoneId] = result.latency_ms;
      showMessage(`Latence zone ${zoneId}: ${result.latency_ms}ms`);
    } catch (e: any) {
      showMessage('Erreur mesure: ' + e.message, 'error');
    } finally {
      measuringLatency = null;
    }
  }

  // --- Hot-swap ---
  async function doHotSwap(zoneId: number, outputType: string, deviceId?: string) {
    try {
      await api.hotSwapDevice(zoneId, outputType, deviceId);
      showMessage('Hot-swap effectue');
      await loadOverview();
    } catch (e: any) {
      showMessage('Erreur hot-swap: ' + e.message, 'error');
    }
  }

  function getZoneName(id: number): string {
    return zones.find(z => z.id === id)?.name || `Zone ${id}`;
  }

  function outputBadge(type: string): string {
    const map: Record<string, string> = { dlna: 'DLNA', airplay: 'AirPlay', local: 'Local' };
    return map[type] || type;
  }

  $effect(() => {
    loadOverview();
  });
</script>

<div class="zone-manager">
  <header class="zm-header">
    <h1>Gestionnaire de Zones</h1>
    <button class="btn-refresh" onclick={loadOverview} disabled={loading}>
      {loading ? '...' : 'Actualiser'}
    </button>
  </header>

  {#if message}
    <div class="toast {messageType}">{message}</div>
  {/if}

  <!-- Zones -->
  <section class="zm-section">
    <h2>Zones ({zones.length})</h2>
    <div class="zones-grid">
      {#each zones as zone (zone.id)}
        <div class="zone-card" class:offline={!zone.online} class:muted={zone.muted}>
          <div class="zone-header">
            <span class="zone-name">{zone.name}</span>
            <span class="badge {zone.output_type}">{outputBadge(zone.output_type)}</span>
            {#if zone.host}
              <span class="zone-ip">{zone.host}</span>
            {/if}
            <span class="status-dot" class:online={zone.online}></span>
          </div>

          <div class="zone-controls">
            <button class="btn-icon" onclick={() => toggleMute(zone)} title={zone.muted ? 'Unmute' : 'Mute'}>
              {#if zone.muted}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
              {/if}
            </button>

            <input
              type="range" min="0" max="1" step="0.01"
              value={zone.volume}
              oninput={(e) => onVolumeChange(zone, parseFloat(e.currentTarget.value))}
              class="volume-slider"
            />
            <span class="volume-label">{Math.round(zone.volume * 100)}%</span>

            <button class="btn-small" onclick={() => doMeasureLatency(zone.id)} disabled={measuringLatency === zone.id}>
              {measuringLatency === zone.id ? '...' : 'Latence'}
            </button>
            {#if latencyResults[zone.id] !== undefined}
              <span class="latency-badge">{latencyResults[zone.id]}ms</span>
            {/if}
          </div>

          {#if zone.group_id}
            <div class="zone-group-tag">Groupe: {zone.group_id}</div>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <!-- Groups -->
  <section class="zm-section">
    <div class="section-header">
      <h2>Groupes ({groups.length})</h2>
      <button class="btn-accent" onclick={() => { showCreateGroup = !showCreateGroup; }}>
        {showCreateGroup ? 'Annuler' : '+ Creer un groupe'}
      </button>
    </div>

    {#if showCreateGroup}
      <div class="create-form">
        <input type="text" placeholder="Nom du groupe" bind:value={newGroupName} class="input" />
        <div class="zone-picker">
          <span class="picker-label">Leader:</span>
          {#each zones as z (z.id)}
            <label class="radio-label">
              <input type="radio" name="leader" value={z.id} bind:group={selectedLeader} />
              {z.name}
            </label>
          {/each}
        </div>
        <div class="zone-picker">
          <span class="picker-label">Membres:</span>
          {#each zones as z (z.id)}
            {#if z.id !== selectedLeader}
              <label class="check-label">
                <input type="checkbox" checked={selectedMembers.has(z.id)}
                  onchange={() => {
                    const s = new Set(selectedMembers);
                    if (s.has(z.id)) s.delete(z.id); else s.add(z.id);
                    selectedMembers = s;
                  }}
                />
                {z.name}
              </label>
            {/if}
          {/each}
        </div>
        <button class="btn-accent" onclick={doCreateGroup} disabled={!selectedLeader || selectedMembers.size === 0}>
          Creer
        </button>
      </div>
    {/if}

    {#each groups as group (group.id)}
      <div class="group-card">
        <div class="group-header">
          {#if editingGroupId === group.id}
            <input type="text" class="input group-name-input" bind:value={editingGroupName}
              onkeydown={(e) => { if (e.key === 'Enter') doRenameGroup(group.id); if (e.key === 'Escape') editingGroupId = null; }}
            />
            <button class="btn-small" onclick={() => doRenameGroup(group.id)}>OK</button>
            <button class="btn-small" onclick={() => editingGroupId = null}>Annuler</button>
          {:else}
            <span class="group-name" onclick={() => { editingGroupId = group.id; editingGroupName = group.name || ''; }} title="Cliquer pour renommer">{group.name || group.id}</span>
          {/if}
          <span class="group-leader">Leader: {getZoneName(group.leader_zone_id)}</span>
          <div class="group-actions">
            <button class="btn-small" onclick={() => doCalibrateGroup(group.id)}>Calibrer</button>
            <button class="btn-small danger" onclick={() => doDeleteGroup(group.id)}>Dissoudre</button>
          </div>
        </div>
        <div class="group-volume">
          <span>Volume master:</span>
          <input type="range" min="0" max="1" step="0.01" value={group.master_volume}
            oninput={(e) => doSetGroupVolume(group.id, parseFloat(e.currentTarget.value))} />
          <span>{Math.round(group.master_volume * 100)}%</span>
        </div>
        {#if group.members?.length}
          <div class="group-members">
            {#each group.members as member}
              <span class="member-chip" class:muted={member.muted}>
                {getZoneName(member.zone_id)}
                {#if member.volume_offset !== 0}
                  <span class="offset">({member.volume_offset > 0 ? '+' : ''}{Math.round(member.volume_offset * 100)}%)</span>
                {/if}
              </span>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <p class="empty">Aucun groupe actif</p>
    {/each}
  </section>

  <!-- Profiles -->
  <section class="zm-section">
    <div class="section-header">
      <h2>Profils ({profiles.length})</h2>
      <button class="btn-accent" onclick={() => { showCreateProfile = !showCreateProfile; }}>
        {showCreateProfile ? 'Annuler' : '+ Sauvegarder la config actuelle'}
      </button>
    </div>

    {#if showCreateProfile}
      <div class="create-form">
        <input type="text" placeholder="Nom du profil" bind:value={newProfileName} class="input" />
        <input type="text" placeholder="Description (optionnel)" bind:value={newProfileDesc} class="input" />
        <button class="btn-accent" onclick={doCreateProfile} disabled={!newProfileName}>Sauvegarder</button>
      </div>
    {/if}

    {#each profiles as profile (profile.id)}
      <div class="profile-card">
        <div class="profile-info">
          <span class="profile-name">{profile.icon || '🎵'} {profile.name}</span>
          {#if profile.description}
            <span class="profile-desc">{profile.description}</span>
          {/if}
        </div>
        <div class="profile-actions">
          <button class="btn-accent" onclick={() => doActivateProfile(profile)}>Activer</button>
          <button class="btn-small danger" onclick={() => doDeleteProfile(profile)}>Supprimer</button>
        </div>
      </div>
    {:else}
      <p class="empty">Aucun profil sauvegarde</p>
    {/each}
  </section>

  <!-- Sync Stats -->
  {#if Object.keys(syncStats).length > 0}
    <section class="zm-section">
      <h2>Synchronisation</h2>
      <div class="sync-stats">
        {#each Object.entries(syncStats) as [key, val]}
          <div class="stat-row">
            <span class="stat-label">{key}</span>
            <span class="stat-value">{JSON.stringify(val)}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .zone-manager {
    padding: 1.5rem;
    max-width: 1000px;
  }

  .zm-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .zm-header h1 {
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--tune-text);
  }

  .toast {
    padding: 0.6rem 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    font-size: 0.85rem;
    animation: fadeIn 0.2s ease;
  }
  .toast.success { background: rgba(74, 222, 128, 0.15); color: #4ade80; }
  .toast.error { background: rgba(248, 113, 113, 0.15); color: #f87171; }

  .zm-section {
    margin-bottom: 2rem;
  }
  .zm-section h2 {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--tune-text);
    margin-bottom: 0.8rem;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.8rem;
  }

  .zones-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 0.8rem;
  }

  .zone-card {
    background: var(--tune-surface, #1a1a2e);
    border: 1px solid var(--tune-border, #2a2a3e);
    border-radius: 12px;
    padding: 1rem;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    min-height: 100px;
  }
  .zone-card.offline { opacity: 0.5; }
  .zone-card.muted { border-color: #f87171; }

  .zone-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }
  .zone-name { font-weight: 600; flex: 1; color: var(--tune-text); }

  .badge {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
  }
  .badge.dlna { background: #3b82f6; color: white; }
  .badge.airplay { background: #a855f7; color: white; }
  .badge.local { background: #22c55e; color: white; }

  .zone-ip {
    font-size: 0.7rem;
    color: var(--tune-text-secondary, #999);
    font-family: monospace;
  }

  .status-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #6b7280;
  }
  .status-dot.online { background: #22c55e; }

  .zone-header {
    min-height: 28px;
  }

  .zone-controls {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: auto;
  }

  .btn-icon {
    background: none; border: none; cursor: pointer;
    color: var(--tune-text-secondary, #999);
    padding: 4px;
    border-radius: 4px;
    display: flex; align-items: center;
  }
  .btn-icon:hover { color: var(--tune-accent, #7c3aed); }

  .volume-slider {
    flex: 1;
    accent-color: var(--tune-accent, #7c3aed);
    height: 4px;
  }
  .volume-label {
    font-size: 0.75rem;
    color: var(--tune-text-secondary, #999);
    min-width: 32px;
    text-align: right;
  }

  .btn-small {
    font-size: 0.7rem;
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid var(--tune-border, #2a2a3e);
    background: var(--tune-surface, #1a1a2e);
    color: var(--tune-text-secondary, #999);
    cursor: pointer;
  }
  .btn-small:hover { border-color: var(--tune-accent, #7c3aed); color: var(--tune-accent); }
  .btn-small.danger:hover { border-color: #f87171; color: #f87171; }

  .btn-accent {
    font-size: 0.8rem;
    padding: 6px 14px;
    border-radius: 8px;
    border: none;
    background: var(--tune-accent, #7c3aed);
    color: white;
    cursor: pointer;
    font-weight: 600;
  }
  .btn-accent:hover { opacity: 0.9; }
  .btn-accent:disabled { opacity: 0.5; cursor: default; }

  .btn-refresh {
    font-size: 0.8rem;
    padding: 6px 14px;
    border-radius: 8px;
    border: 1px solid var(--tune-border, #2a2a3e);
    background: transparent;
    color: var(--tune-text-secondary);
    cursor: pointer;
  }

  .latency-badge {
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
  }

  .zone-group-tag {
    font-size: 0.7rem;
    color: var(--tune-accent);
    margin-top: 0.4rem;
  }

  .group-card, .profile-card {
    background: var(--tune-surface, #1a1a2e);
    border: 1px solid var(--tune-border, #2a2a3e);
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 0.6rem;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    flex-wrap: wrap;
  }
  .group-name { font-weight: 600; color: var(--tune-text); cursor: pointer; }
  .group-name:hover { color: var(--tune-accent); }
  .group-name-input { width: 150px; font-size: 0.85rem; }
  .group-leader { font-size: 0.8rem; color: var(--tune-text-secondary); }
  .group-actions { margin-left: auto; display: flex; gap: 0.4rem; }

  .group-volume {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.6rem;
    font-size: 0.85rem;
    color: var(--tune-text-secondary);
  }
  .group-volume input { flex: 1; accent-color: var(--tune-accent); }

  .group-members {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }
  .member-chip {
    font-size: 0.75rem;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(124, 58, 237, 0.15);
    color: var(--tune-accent);
  }
  .member-chip.muted { opacity: 0.5; text-decoration: line-through; }
  .offset { font-size: 0.65rem; opacity: 0.7; }

  .profile-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .profile-name { font-weight: 600; color: var(--tune-text); }
  .profile-desc { font-size: 0.8rem; color: var(--tune-text-secondary); display: block; }
  .profile-actions { display: flex; gap: 0.4rem; }

  .create-form {
    background: var(--tune-surface, #1a1a2e);
    border: 1px solid var(--tune-accent, #7c3aed);
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .input {
    background: var(--tune-bg, #0d0d1a);
    border: 1px solid var(--tune-border, #2a2a3e);
    border-radius: 8px;
    padding: 8px 12px;
    color: var(--tune-text);
    font-size: 0.85rem;
  }

  .zone-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .picker-label { font-size: 0.8rem; color: var(--tune-text-secondary); min-width: 60px; }
  .radio-label, .check-label {
    font-size: 0.8rem;
    color: var(--tune-text);
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }

  .sync-stats {
    background: var(--tune-surface);
    border-radius: 12px;
    padding: 1rem;
  }
  .stat-row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    font-size: 0.8rem;
  }
  .stat-label { color: var(--tune-text-secondary); }
  .stat-value { color: var(--tune-text); font-family: monospace; }

  .empty {
    font-size: 0.85rem;
    color: var(--tune-text-secondary);
    font-style: italic;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>

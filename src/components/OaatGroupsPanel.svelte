<script lang="ts">
  import { notifications } from '../lib/stores/notifications';
  import { t } from '../lib/i18n';
  import * as api from '../lib/api';

  interface OaatEndpoint {
    endpoint_id: string;
    name: string;
    addr: string;
    state: string;
    volume_offset: number;
    effective_volume: number;
  }

  interface OaatGroup {
    id: string;
    name: string;
    endpoints: { host: string; port: number }[];
    created_at?: string;
  }

  interface OaatGroupStatus {
    zone_id: string;
    name: string;
    streaming: boolean;
    multiroom: boolean;
    master_volume: number;
    endpoints: OaatEndpoint[];
  }

  let groups = $state<OaatGroup[]>([]);
  let groupStatuses = $state<Record<string, OaatGroupStatus>>({});
  let loading = $state(true);
  let showCreateForm = $state(false);
  let newGroupName = $state('');
  let newEndpointHost = $state('');
  let newEndpointPort = $state(9740);
  let pendingEndpoints = $state<{ host: string; port: number }[]>([]);
  let addEndpointGroupId = $state<string | null>(null);
  let addHost = $state('');
  let addPort = $state(9740);
  let expandedGroup = $state<string | null>(null);

  async function loadGroups() {
    loading = true;
    try {
      const res = await api.getOaatGroups();
      groups = res.oaat_groups || [];
      for (const g of groups) {
        try {
          const status = await api.getOaatGroupStatus(g.id);
          if (status && !status.error) {
            groupStatuses[g.id] = status;
          }
        } catch {}
      }
    } catch (e: any) {
      notifications.error('Failed to load OAAT groups');
    }
    loading = false;
  }

  $effect(() => { loadGroups(); });

  function addPendingEndpoint() {
    if (!newEndpointHost.trim()) return;
    pendingEndpoints = [...pendingEndpoints, { host: newEndpointHost.trim(), port: newEndpointPort }];
    newEndpointHost = '';
    newEndpointPort = 9740;
  }

  function removePendingEndpoint(index: number) {
    pendingEndpoints = pendingEndpoints.filter((_, i) => i !== index);
  }

  async function createGroup() {
    if (!newGroupName.trim() || pendingEndpoints.length === 0) return;
    try {
      await api.createOaatGroup(newGroupName.trim(), pendingEndpoints);
      notifications.success(`Group "${newGroupName}" created`);
      newGroupName = '';
      pendingEndpoints = [];
      showCreateForm = false;
      await loadGroups();
    } catch (e: any) {
      notifications.error('Failed to create group');
    }
  }

  async function deleteGroup(id: string) {
    try {
      await api.deleteOaatGroup(id);
      notifications.success('Group deleted');
      await loadGroups();
    } catch {
      notifications.error('Failed to delete group');
    }
  }

  async function addEndpoint(groupId: string) {
    if (!addHost.trim()) return;
    try {
      const res = await api.addOaatEndpoint(groupId, addHost.trim(), addPort);
      if (res.error) {
        notifications.error(res.error);
      } else {
        notifications.success(`Endpoint ${res.endpoint_id} added`);
        addEndpointGroupId = null;
        addHost = '';
        addPort = 9740;
        await refreshGroupStatus(groupId);
      }
    } catch {
      notifications.error('Failed to add endpoint');
    }
  }

  async function removeEndpoint(groupId: string, endpointId: string) {
    try {
      await api.removeOaatEndpoint(groupId, endpointId);
      notifications.success('Endpoint removed');
      await refreshGroupStatus(groupId);
    } catch {
      notifications.error('Failed to remove endpoint');
    }
  }

  let volumeTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  function handleMasterVolume(groupId: string, level: number) {
    clearTimeout(volumeTimers[groupId]);
    volumeTimers[groupId] = setTimeout(async () => {
      await api.setOaatGroupVolume(groupId, level);
      await refreshGroupStatus(groupId);
    }, 200);
  }

  function handleEndpointVolume(groupId: string, endpointId: string, level: number) {
    const key = `${groupId}:${endpointId}`;
    clearTimeout(volumeTimers[key]);
    volumeTimers[key] = setTimeout(async () => {
      await api.setOaatEndpointVolume(groupId, endpointId, level);
      await refreshGroupStatus(groupId);
    }, 200);
  }

  async function refreshGroupStatus(groupId: string) {
    try {
      const status = await api.getOaatGroupStatus(groupId);
      if (status && !status.error) {
        groupStatuses[groupId] = status;
      }
    } catch {}
  }

  function stateColor(state: string): string {
    switch (state) {
      case 'streaming': return 'var(--tune-success, #22c55e)';
      case 'ready': return 'var(--tune-accent, #3b82f6)';
      case 'degraded': return 'var(--tune-warning, #eab308)';
      case 'disconnected': return 'var(--tune-error, #ef4444)';
      default: return 'var(--tune-text-secondary, #888)';
    }
  }
</script>

<div class="oaat-panel">
  <div class="panel-header">
    <h3>OAAT Multi-Room Groups</h3>
    <button class="btn-primary" onclick={() => showCreateForm = !showCreateForm}>
      {showCreateForm ? 'Cancel' : '+ New Group'}
    </button>
  </div>

  {#if showCreateForm}
    <div class="create-form">
      <input
        type="text"
        bind:value={newGroupName}
        placeholder="Group name (e.g., Living Room + Kitchen)"
        class="input"
      />
      <div class="endpoint-list">
        {#each pendingEndpoints as ep, i}
          <div class="endpoint-row">
            <span class="endpoint-addr">{ep.host}:{ep.port}</span>
            <button class="btn-sm btn-danger" onclick={() => removePendingEndpoint(i)}>x</button>
          </div>
        {/each}
      </div>
      <div class="add-endpoint-row">
        <input type="text" bind:value={newEndpointHost} placeholder="Host (e.g., 192.168.1.50)" class="input input-sm" />
        <input type="number" bind:value={newEndpointPort} min="1" max="65535" class="input input-sm input-port" />
        <button class="btn-sm" onclick={addPendingEndpoint}>Add</button>
      </div>
      <button
        class="btn-primary"
        onclick={createGroup}
        disabled={!newGroupName.trim() || pendingEndpoints.length === 0}
      >
        Create Group ({pendingEndpoints.length} endpoint{pendingEndpoints.length !== 1 ? 's' : ''})
      </button>
    </div>
  {/if}

  {#if loading}
    <div class="loading">Loading...</div>
  {:else if groups.length === 0}
    <div class="empty">
      <p>No OAAT groups configured.</p>
      <p class="hint">Create a group to synchronize audio across multiple Tune Bridge endpoints.</p>
    </div>
  {:else}
    {#each groups as group}
      {@const status = groupStatuses[group.id]}
      <div class="group-card" class:streaming={status?.streaming}>
        <div class="group-header" onclick={() => expandedGroup = expandedGroup === group.id ? null : group.id}>
          <div class="group-info">
            <span class="group-name">{group.name}</span>
            {#if status?.streaming}
              <span class="badge streaming">Streaming</span>
            {/if}
            {#if status?.multiroom}
              <span class="badge multiroom">Multi-Room</span>
            {/if}
            <span class="endpoint-count">{status?.endpoints?.length ?? group.endpoints?.length ?? 0} endpoint(s)</span>
          </div>
          <div class="group-actions">
            <button class="btn-sm btn-danger" onclick={(e) => { e.stopPropagation(); deleteGroup(group.id); }}>Delete</button>
          </div>
        </div>

        {#if expandedGroup === group.id && status}
          <div class="group-details">
            <div class="volume-control">
              <label>Master Volume</label>
              <input
                type="range"
                min="0"
                max="100"
                value={status.master_volume}
                oninput={(e) => handleMasterVolume(group.id, parseInt(e.currentTarget.value))}
              />
              <span class="volume-label">{status.master_volume}%</span>
            </div>

            <div class="endpoints-list">
              {#each status.endpoints as ep}
                <div class="endpoint-card">
                  <div class="ep-header">
                    <span class="ep-dot" style="background: {stateColor(ep.state)}"></span>
                    <span class="ep-name">{ep.name}</span>
                    <span class="ep-state">{ep.state}</span>
                    <button class="btn-xs btn-danger" onclick={() => removeEndpoint(group.id, ep.endpoint_id)}>Remove</button>
                  </div>
                  <div class="ep-volume">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={ep.effective_volume}
                      oninput={(e) => handleEndpointVolume(group.id, ep.endpoint_id, parseInt(e.currentTarget.value))}
                    />
                    <span class="volume-label">{ep.effective_volume}%</span>
                    {#if ep.volume_offset !== 0}
                      <span class="offset-label">({ep.volume_offset > 0 ? '+' : ''}{ep.volume_offset})</span>
                    {/if}
                  </div>
                  <div class="ep-addr">{ep.addr}</div>
                </div>
              {/each}
            </div>

            {#if addEndpointGroupId === group.id}
              <div class="add-endpoint-row">
                <input type="text" bind:value={addHost} placeholder="Host" class="input input-sm" />
                <input type="number" bind:value={addPort} min="1" max="65535" class="input input-sm input-port" />
                <button class="btn-sm" onclick={() => addEndpoint(group.id)}>Add</button>
                <button class="btn-sm" onclick={() => addEndpointGroupId = null}>Cancel</button>
              </div>
            {:else}
              <button class="btn-sm" onclick={() => addEndpointGroupId = group.id}>+ Add Endpoint</button>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .oaat-panel {
    padding: 1rem;
  }
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  .panel-header h3 {
    margin: 0;
    font-size: 1.1rem;
  }
  .create-form {
    background: var(--tune-bg-secondary, #1a1a2e);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .endpoint-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .endpoint-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.25rem 0.5rem;
    background: var(--tune-bg-tertiary, #16213e);
    border-radius: 4px;
  }
  .endpoint-addr {
    font-family: monospace;
    font-size: 0.85rem;
  }
  .add-endpoint-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .input {
    background: var(--tune-bg-tertiary, #16213e);
    border: 1px solid var(--tune-border, #333);
    color: var(--tune-text, #eee);
    padding: 0.5rem;
    border-radius: 4px;
    flex: 1;
  }
  .input-sm {
    padding: 0.35rem;
    font-size: 0.85rem;
  }
  .input-port {
    width: 80px;
    flex: none;
  }
  .group-card {
    background: var(--tune-bg-secondary, #1a1a2e);
    border-radius: 8px;
    margin-bottom: 0.75rem;
    overflow: hidden;
    border: 1px solid var(--tune-border, #333);
    transition: border-color 0.2s;
  }
  .group-card.streaming {
    border-color: var(--tune-success, #22c55e);
  }
  .group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    cursor: pointer;
  }
  .group-header:hover {
    background: var(--tune-bg-hover, rgba(255,255,255,0.03));
  }
  .group-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .group-name {
    font-weight: 600;
  }
  .badge {
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    border-radius: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .badge.streaming {
    background: var(--tune-success, #22c55e);
    color: #000;
  }
  .badge.multiroom {
    background: var(--tune-accent, #3b82f6);
    color: #fff;
  }
  .endpoint-count {
    color: var(--tune-text-secondary, #888);
    font-size: 0.85rem;
  }
  .group-details {
    padding: 0 1rem 1rem;
    border-top: 1px solid var(--tune-border, #333);
  }
  .volume-control {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0;
  }
  .volume-control label {
    font-size: 0.85rem;
    color: var(--tune-text-secondary, #888);
    white-space: nowrap;
  }
  .volume-control input[type="range"] {
    flex: 1;
  }
  .volume-label {
    font-size: 0.85rem;
    font-family: monospace;
    min-width: 3ch;
  }
  .offset-label {
    font-size: 0.75rem;
    color: var(--tune-text-secondary, #888);
  }
  .endpoints-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .endpoint-card {
    background: var(--tune-bg-tertiary, #16213e);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
  }
  .ep-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .ep-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .ep-name {
    font-weight: 500;
    flex: 1;
  }
  .ep-state {
    font-size: 0.75rem;
    color: var(--tune-text-secondary, #888);
    text-transform: capitalize;
  }
  .ep-volume {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
  }
  .ep-volume input[type="range"] {
    flex: 1;
  }
  .ep-addr {
    font-family: monospace;
    font-size: 0.75rem;
    color: var(--tune-text-secondary, #888);
  }
  .loading, .empty {
    text-align: center;
    padding: 2rem;
    color: var(--tune-text-secondary, #888);
  }
  .hint {
    font-size: 0.85rem;
    margin-top: 0.5rem;
  }
  .btn-primary {
    background: var(--tune-accent, #3b82f6);
    color: #fff;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-sm {
    background: var(--tune-bg-tertiary, #16213e);
    color: var(--tune-text, #eee);
    border: 1px solid var(--tune-border, #333);
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
  }
  .btn-xs {
    background: transparent;
    color: var(--tune-text-secondary, #888);
    border: none;
    padding: 0.15rem 0.4rem;
    cursor: pointer;
    font-size: 0.75rem;
  }
  .btn-danger {
    color: var(--tune-error, #ef4444);
  }
  .btn-danger:hover {
    background: rgba(239, 68, 68, 0.1);
  }
  .group-actions {
    display: flex;
    gap: 0.5rem;
  }
</style>

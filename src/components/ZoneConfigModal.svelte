<script lang="ts">
  import type { Zone, ZoneGroupResponse } from '../lib/types';
  import * as api from '../lib/api';
  import { t } from '../lib/i18n';
  import { get } from 'svelte/store';

  interface Props {
    zone: Zone;
    allZones: Zone[];
    groups: ZoneGroupResponse[];
    onClose: () => void;
    onDelete: (id: number) => void;
    onGroupChanged: () => void;
    onRenamed: (id: number, name: string) => void;
  }

  let { zone, allZones, groups, onClose, onDelete, onGroupChanged, onRenamed }: Props = $props();

  // Find the group this zone belongs to (if any)
  let currentGroup = $derived(groups.find(g => zone.id !== null && g.zone_ids.includes(zone.id)));

  // Other zones (exclude this one)
  let otherZones = $derived(allZones.filter(z => z.id !== zone.id && z.id !== null));

  // Track which zones are checked for grouping
  let selectedZoneIds = $state<Set<number>>(new Set());

  // Initialize selections from current group
  $effect(() => {
    const ids = new Set<number>();
    if (currentGroup) {
      for (const id of currentGroup.zone_ids) {
        if (id !== zone.id) ids.add(id);
      }
    }
    selectedZoneIds = ids;
  });

  let editName = $state(zone.name);
  let renaming = $state(false);

  let editSyncDelay = $state(zone.sync_delay_ms ?? 0);
  let savingSync = $state(false);

  let confirmDelete = $state(false);
  let loading = $state(false);
  let error = $state('');

  async function handleRename() {
    if (zone.id === null || !editName.trim() || editName.trim() === zone.name) return;
    renaming = true;
    error = '';
    try {
      await api.renameZone(zone.id, editName.trim());
      onRenamed(zone.id, editName.trim());
    } catch (e: any) {
      error = e.message || get(t)('zone.renameError');
    } finally {
      renaming = false;
    }
  }

  function handleNameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleRename();
  }

  function toggleZone(zoneId: number) {
    const next = new Set(selectedZoneIds);
    if (next.has(zoneId)) {
      next.delete(zoneId);
    } else {
      next.add(zoneId);
    }
    selectedZoneIds = next;
  }

  // Check if selection differs from current group
  let hasGroupChanges = $derived.by(() => {
    const currentIds = new Set<number>();
    if (currentGroup) {
      for (const id of currentGroup.zone_ids) {
        if (id !== zone.id) currentIds.add(id);
      }
    }
    if (selectedZoneIds.size !== currentIds.size) return true;
    for (const id of selectedZoneIds) {
      if (!currentIds.has(id)) return true;
    }
    return false;
  });

  async function applyGroup() {
    if (zone.id === null) return;
    loading = true;
    error = '';
    try {
      // Ungroup first if already in a group
      if (currentGroup) {
        await api.ungroupZones(currentGroup.group_id);
      }
      // Create new group if zones are selected
      if (selectedZoneIds.size > 0) {
        const allIds = [zone.id, ...selectedZoneIds];
        await api.groupZones(zone.id, allIds);
      }
      onGroupChanged();
    } catch (e: any) {
      error = e.message || get(t)('zone.groupError');
    } finally {
      loading = false;
    }
  }

  async function handleUngroup() {
    if (!currentGroup) return;
    loading = true;
    error = '';
    try {
      await api.ungroupZones(currentGroup.group_id);
      onGroupChanged();
    } catch (e: any) {
      error = e.message || get(t)('zone.ungroupError');
    } finally {
      loading = false;
    }
  }

  async function handleDelete() {
    if (zone.id === null) return;
    onDelete(zone.id);
  }

  async function handleSyncSave() {
    if (zone.id === null) return;
    savingSync = true;
    error = '';
    try {
      await api.updateZoneSyncDelay(zone.id, editSyncDelay);
      zone.sync_delay_ms = editSyncDelay;
    } catch (e: any) {
      error = e.message || 'Failed to update sync offset';
    } finally {
      savingSync = false;
    }
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function deviceTypeLabel(zone: Zone): string {
    switch (zone.output_type) {
      case 'dlna': return 'DLNA';
      case 'airplay': return 'AirPlay';
      default: return 'Local';
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="modal-overlay" onclick={handleOverlayClick}>
  <div class="modal-panel">
    <div class="modal-header">
      <div class="modal-title-row">
        <input
          class="rename-input"
          type="text"
          bind:value={editName}
          onkeydown={handleNameKeydown}
          onblur={handleRename}
          disabled={renaming}
        />
        {#if editName.trim() && editName.trim() !== zone.name}
          <button class="btn btn-primary btn-sm" onclick={handleRename} disabled={renaming}>
            {renaming ? '...' : $t('zone.rename')}
          </button>
        {/if}
        {#if zone.output_type && zone.output_type !== 'local'}
          <span class="type-badge">{deviceTypeLabel(zone)}</span>
        {/if}
      </div>
      <button class="close-btn" onclick={onClose} title={$t('common.close')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>

    {#if error}
      <div class="error-msg">{error}</div>
    {/if}

    <div class="modal-section">
      <h3 class="section-title">{$t('zone.groupedPlayback')}</h3>
      <p class="section-desc">{$t('zone.selectZonesToSync').replace('{name}', zone.name)}</p>

      {#if otherZones.length === 0}
        <p class="empty-hint">{$t('zone.noOtherZone')}</p>
      {:else}
        <div class="zone-checklist">
          {#each otherZones as otherZone}
            <label class="zone-check-item">
              <input
                type="checkbox"
                checked={otherZone.id !== null && selectedZoneIds.has(otherZone.id)}
                onchange={() => otherZone.id !== null && toggleZone(otherZone.id)}
                disabled={loading}
              />
              <span class="check-zone-name">{otherZone.name}</span>
              {#if otherZone.output_type && otherZone.output_type !== 'local'}
                <span class="check-zone-badge">{deviceTypeLabel(otherZone)}</span>
              {/if}
              {#if otherZone.group_id && (!currentGroup || otherZone.group_id !== currentGroup.group_id)}
                <span class="check-zone-grouped" title={$t('zone.alreadyInGroup')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                </span>
              {/if}
            </label>
          {/each}
        </div>

        <div class="group-actions">
          <button
            class="btn btn-primary"
            onclick={applyGroup}
            disabled={!hasGroupChanges || loading}
          >
            {loading ? $t('common.applying') : $t('common.apply')}
          </button>
          {#if currentGroup}
            <button
              class="btn btn-secondary"
              onclick={handleUngroup}
              disabled={loading}
            >
              {$t('zone.ungroupAll')}
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <div class="modal-section">
      <h3 class="section-title">{$t('zone.syncOffset')}</h3>
      <p class="section-desc">{$t('zone.syncOffsetDesc')}</p>
      <div class="sync-offset-row">
        <input
          class="sync-input"
          type="number"
          bind:value={editSyncDelay}
          min="-10000"
          max="10000"
          step="10"
          disabled={savingSync}
        />
        <span class="sync-unit">ms</span>
        {#if editSyncDelay !== (zone.sync_delay_ms ?? 0)}
          <button class="btn btn-primary btn-sm" onclick={handleSyncSave} disabled={savingSync}>
            {savingSync ? '...' : $t('common.apply')}
          </button>
        {/if}
      </div>
    </div>

    <div class="modal-section danger-section">
      <h3 class="section-title">{$t('zone.actions')}</h3>
      {#if !confirmDelete}
        <button class="btn btn-danger" onclick={() => confirmDelete = true}>
          {$t('zone.deleteZone')}
        </button>
      {:else}
        <div class="confirm-delete">
          <span class="confirm-text">{$t('zone.confirmDelete')}</span>
          <button class="btn btn-danger" onclick={handleDelete}>{$t('common.delete')}</button>
          <button class="btn btn-secondary" onclick={() => confirmDelete = false}>{$t('common.cancel')}</button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .modal-panel {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg, 12px);
    width: 380px;
    max-width: 90vw;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 20px 20px 0;
  }

  .modal-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .rename-input {
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
    color: var(--tune-text);
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 2px 8px;
    min-width: 0;
    flex: 1;
    outline: none;
  }

  .rename-input:focus {
    border-color: var(--tune-accent);
  }

  .btn-sm {
    padding: 3px 10px;
    font-size: 11px;
    flex-shrink: 0;
  }

  .type-badge {
    font-family: var(--font-label);
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tune-text-muted);
    background: var(--tune-bg);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: color 0.12s;
  }

  .close-btn:hover {
    color: var(--tune-text);
  }

  .error-msg {
    margin: 12px 20px 0;
    padding: 8px 12px;
    background: rgba(220, 38, 38, 0.1);
    border: 1px solid rgba(220, 38, 38, 0.3);
    border-radius: var(--radius-sm);
    color: #ef4444;
    font-family: var(--font-body);
    font-size: 12px;
  }

  .modal-section {
    padding: 16px 20px;
  }

  .section-title {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--tune-text-muted);
    margin: 0 0 6px;
  }

  .section-desc {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    margin: 0 0 12px;
  }

  .empty-hint {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    margin: 0;
  }

  .zone-checklist {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 12px;
  }

  .zone-check-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background 0.12s;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
  }

  .zone-check-item:hover {
    background: var(--tune-surface-hover);
  }

  .zone-check-item input[type="checkbox"] {
    accent-color: var(--tune-accent);
    flex-shrink: 0;
  }

  .check-zone-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .check-zone-badge {
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

  .check-zone-grouped {
    color: var(--tune-text-muted);
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .group-actions {
    display: flex;
    gap: 8px;
  }

  .btn {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 500;
    padding: 6px 14px;
    border-radius: var(--radius-sm);
    border: none;
    cursor: pointer;
    transition: all 0.12s ease-out;
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
    background: var(--tune-surface-hover);
    color: var(--tune-text);
  }

  .sync-offset-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sync-input {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text);
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    width: 100px;
    outline: none;
  }

  .sync-input:focus {
    border-color: var(--tune-accent);
  }

  .sync-unit {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .danger-section {
    border-top: 1px solid var(--tune-border);
  }

  .btn-danger {
    background: rgba(220, 38, 38, 0.1);
    color: #ef4444;
    border: 1px solid rgba(220, 38, 38, 0.25);
  }

  .btn-danger:hover:not(:disabled) {
    background: rgba(220, 38, 38, 0.2);
  }

  .confirm-delete {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .confirm-text {
    font-family: var(--font-body);
    font-size: 12px;
    color: #ef4444;
    flex: 1;
  }
</style>

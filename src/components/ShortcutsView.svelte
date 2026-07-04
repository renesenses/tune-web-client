<script lang="ts">
  import { shortcuts, removeShortcut, renameShortcut, togglePin, navigateToShortcut, type Shortcut } from '../lib/stores/shortcuts';
  import { notifications } from '../lib/stores/notifications';
  import { t } from '../lib/i18n';
  import AddShortcutButton from './AddShortcutButton.svelte';

  let editingId = $state<string | null>(null);
  let editName = $state('');
  let editIcon = $state('');

  const icons = ['⭐','📚','🎵','🎧','📻','💎','🎸','🎹','🎷','🎺','🎻','🎤','💿','🔊','❤️','🏠','🎶','🌍','🇫🇷','🎬','🎻','🕺','🆕','🔥','💯'];

  let pinnedShortcuts = $derived($shortcuts.filter(s => s.pinned !== false));
  let unpinnedShortcuts = $derived($shortcuts.filter(s => s.pinned === false));

  function viewLabel(view: string): string {
    const labels: Record<string, string> = {
      home: $t('shortcuts.viewHome'), library: $t('shortcuts.viewLibrary'), streaming: $t('shortcuts.viewStreaming'),
      radios: $t('shortcuts.viewRadios'), favorites: $t('shortcuts.viewFavorites'), history: $t('shortcuts.viewHistory'),
      search: $t('shortcuts.viewSearch'), mediaservers: $t('shortcuts.viewMediaservers'),
      playlists: $t('shortcuts.viewPlaylists'), collections: $t('shortcuts.viewCollections'), queue: $t('shortcuts.viewQueue'),
      nowplaying: $t('shortcuts.viewNowplaying'), dashboard: $t('shortcuts.viewDashboard'),
      settings: $t('shortcuts.viewSettings'), equalizer: $t('shortcuts.viewEqualizer'),
    };
    return labels[view] || view;
  }

  function stateLabel(sc: Shortcut): string {
    const parts: string[] = [];
    if (sc.state?.streamingService) parts.push(sc.state.streamingService);
    if (sc.state?.tab) parts.push(sc.state.tab);
    if (sc.state?.genreBreadcrumb?.length > 1) {
      parts.push(sc.state.genreBreadcrumb.map((g: any) => g.name).join(' > '));
    }
    if (sc.state?.mediaServer?.serverName) {
      parts.push(sc.state.mediaServer.serverName);
      if (sc.state.mediaServer.navigationStack?.length) {
        parts.push(sc.state.mediaServer.navigationStack.map((n: any) => n.title).join(' > '));
      }
    }
    return parts.join(' / ') || viewLabel(sc.view);
  }

  function startEdit(sc: Shortcut) {
    editingId = sc.id;
    editName = sc.name;
    editIcon = sc.icon;
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    await renameShortcut(editingId, editName.trim());
    editingId = null;
  }

  async function handleDelete(id: string, name: string) {
    await removeShortcut(id);
    notifications.success($t('shortcuts.deleted').replace('{name}', name));
  }
</script>

<div class="shortcuts-view">
  <div class="shortcuts-page-header">
    <h2>{$t('shortcuts.title')}</h2>
    <AddShortcutButton />
  </div>

  {#if $shortcuts.length === 0}
    <div class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      </div>
      <p>{$t('shortcuts.empty')}</p>
      <p class="empty-hint">{$t('shortcuts.emptyHintBefore')}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="vertical-align: middle;"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        {$t('shortcuts.emptyHintAfter')}
      </p>
    </div>
  {:else}
    {#if pinnedShortcuts.length > 0}
      <h3 class="section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/></svg>
        {$t('shortcuts.inSidebar')}
      </h3>
      <div class="shortcuts-grid">
        {#each pinnedShortcuts as sc}
          <div class="shortcut-card" class:editing={editingId === sc.id}>
            {#if editingId === sc.id}
              <div class="card-edit">
                <select bind:value={editIcon} class="edit-icon-pick">
                  {#each icons as e}
                    <option value={e}>{e}</option>
                  {/each}
                </select>
                <input type="text" bind:value={editName} class="edit-name"
                  onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') editingId = null; }} />
                <button class="edit-save" onclick={saveEdit}>OK</button>
                <button class="edit-cancel" onclick={() => editingId = null}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            {:else}
              <button class="card-main" onclick={() => navigateToShortcut(sc)}>
                <span class="card-icon">{sc.icon}</span>
                <div class="card-text">
                  <span class="card-name">{sc.name}</span>
                  <span class="card-detail">{stateLabel(sc)}</span>
                </div>
              </button>
              <div class="card-actions">
                <button class="action-btn pin-btn pinned" onclick={() => togglePin(sc.id)} title={$t('shortcuts.unpinFromSidebar')}>
                  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="14" height="14"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/></svg>
                </button>
                <button class="action-btn" onclick={() => startEdit(sc)} title={$t('shortcuts.edit')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="action-btn danger" onclick={() => handleDelete(sc.id, sc.name)} title={$t('common.delete')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#if unpinnedShortcuts.length > 0}
      <h3 class="section-title unpinned-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        {$t('shortcuts.others')}
      </h3>
      <div class="shortcuts-grid">
        {#each unpinnedShortcuts as sc}
          <div class="shortcut-card unpinned">
            <button class="card-main" onclick={() => navigateToShortcut(sc)}>
              <span class="card-icon">{sc.icon}</span>
              <div class="card-text">
                <span class="card-name">{sc.name}</span>
                <span class="card-detail">{stateLabel(sc)}</span>
              </div>
            </button>
            <div class="card-actions">
              <button class="action-btn" onclick={() => togglePin(sc.id)} title={$t('shortcuts.pinToSidebar')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/></svg>
              </button>
              <button class="action-btn" onclick={() => startEdit(sc)} title={$t('shortcuts.edit')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="action-btn danger" onclick={() => handleDelete(sc.id, sc.name)} title={$t('common.delete')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .shortcuts-view {
    padding: 24px 32px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .shortcuts-page-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;
  }

  .shortcuts-page-header h2 {
    font-family: var(--font-label);
    font-size: 22px;
    font-weight: 600;
    color: var(--tune-text);
    margin: 0;
  }

  .section-title {
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--tune-text-muted);
    margin: 0 0 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .unpinned-title {
    margin-top: 32px;
  }

  .shortcuts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
  }

  .shortcut-card {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    overflow: hidden;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .shortcut-card:hover {
    border-color: var(--tune-accent);
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }

  .shortcut-card.unpinned {
    opacity: 0.7;
  }

  .shortcut-card.unpinned:hover {
    opacity: 1;
  }

  .card-main {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    flex: 1;
    min-width: 0;
    text-align: left;
  }

  .card-icon {
    font-size: 24px;
    flex-shrink: 0;
    width: 32px;
    text-align: center;
  }

  .card-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .card-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-detail {
    font-size: 11px;
    color: var(--tune-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 8px;
  }

  .action-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 6px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    transition: color 0.12s, background 0.12s;
  }

  .action-btn:hover {
    color: var(--tune-text);
    background: var(--tune-surface-hover);
  }

  .action-btn.danger:hover {
    color: var(--tune-error, #ef4444);
  }

  .pin-btn.pinned {
    color: var(--tune-accent);
  }

  .card-edit {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    width: 100%;
  }

  .edit-icon-pick {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 4px;
    font-size: 16px;
    width: 36px;
    cursor: pointer;
  }

  .edit-name {
    flex: 1;
    background: var(--tune-bg);
    border: 1px solid var(--tune-accent);
    border-radius: var(--radius-sm);
    padding: 6px 10px;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    outline: none;
  }

  .edit-save {
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    padding: 6px 14px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
  }

  .edit-cancel {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    display: flex;
  }

  .edit-cancel:hover {
    color: var(--tune-error, #ef4444);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 20px;
    color: var(--tune-text-muted);
    text-align: center;
  }

  .empty-icon {
    opacity: 0.3;
    margin-bottom: 16px;
  }

  .empty-state p {
    margin: 4px 0;
    font-size: 14px;
  }

  .empty-hint {
    font-size: 12px !important;
    opacity: 0.7;
    max-width: 300px;
  }

  .shortcut-see-all {
    font-size: 12px !important;
    color: var(--tune-text-muted) !important;
    margin-top: 2px;
  }

  @media (max-width: 600px) {
    .shortcuts-view { padding: 16px; }
    .shortcuts-grid { grid-template-columns: 1fr; }
  }
</style>

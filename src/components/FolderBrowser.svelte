<script lang="ts">
  import { t } from '../lib/i18n';

  let { onSelect, onClose }: { onSelect: (path: string) => void; onClose: () => void } = $props();

  let currentPath = $state('/');
  let dirs = $state<{ name: string; path: string; has_children: boolean }[]>([]);
  let parentPath = $state<string | null>(null);
  let loading = $state(false);
  let error = $state('');

  async function browse(path: string) {
    loading = true;
    error = '';
    try {
      const resp = await fetch(`/api/v1/system/browse-dirs?path=${encodeURIComponent(path)}`);
      const data = await resp.json();
      dirs = data.dirs || [];
      parentPath = data.parent || null;
      currentPath = data.current || path;
      if (data.error) error = data.error;
    } catch (e) {
      error = 'Failed to browse directory';
    }
    loading = false;
  }

  // Browse root on mount
  $effect(() => { browse('/'); });

  function select() {
    onSelect(currentPath);
  }
</script>

<div class="folder-overlay" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="button" tabindex="-1">
  <div class="folder-modal" onclick={(e) => e.stopPropagation()} role="dialog">
    <header>
      <h3>Select Music Folder</h3>
      <button class="close-btn" onclick={onClose}>&times;</button>
    </header>

    <div class="breadcrumb">
      <span class="current-path">{currentPath}</span>
    </div>

    {#if error}
      <div class="error">{error}</div>
    {/if}

    <div class="dir-list">
      {#if parentPath !== null}
        <button class="dir-item parent" onclick={() => browse(parentPath!)}>
          <span class="icon">⬆</span>
          <span class="name">..</span>
        </button>
      {/if}

      {#if loading}
        <div class="loading">Loading...</div>
      {:else}
        {#each dirs as dir}
          <button
            class="dir-item"
            ondblclick={() => browse(dir.path)}
            onclick={() => { currentPath = dir.path; }}
          >
            <span class="icon">{dir.has_children ? '📁' : '📂'}</span>
            <span class="name">{dir.name}</span>
          </button>
        {/each}
        {#if dirs.length === 0 && !error}
          <div class="empty">No subdirectories</div>
        {/if}
      {/if}
    </div>

    <footer>
      <span class="selected-path">{currentPath}</span>
      <div class="actions">
        <button class="cancel-btn" onclick={onClose}>Cancel</button>
        <button class="select-btn" onclick={select}>Select this folder</button>
      </div>
    </footer>
  </div>
</div>

<style>
  .folder-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .folder-modal {
    background: var(--tune-bg-secondary, #1e1e1e);
    border-radius: 12px;
    width: min(600px, 90vw);
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--tune-border, #333);
  }
  header h3 { margin: 0; font-size: 1.1rem; }
  .close-btn {
    background: none;
    border: none;
    color: var(--tune-text, #fff);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0 4px;
  }
  .breadcrumb {
    padding: 8px 20px;
    font-size: 0.85rem;
    color: var(--tune-text-muted, #888);
    border-bottom: 1px solid var(--tune-border, #333);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dir-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    min-height: 200px;
  }
  .dir-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--tune-text, #fff);
    font-size: 0.95rem;
    cursor: pointer;
    text-align: left;
  }
  .dir-item:hover { background: var(--tune-bg-hover, #2a2a2a); }
  .dir-item.parent { color: var(--tune-accent, #f59e0b); }
  .icon { font-size: 1.1rem; flex-shrink: 0; }
  .loading, .empty, .error {
    padding: 20px;
    text-align: center;
    color: var(--tune-text-muted, #888);
  }
  .error { color: var(--tune-error, #ef4444); }
  footer {
    padding: 12px 20px;
    border-top: 1px solid var(--tune-border, #333);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .selected-path {
    font-size: 0.8rem;
    color: var(--tune-text-muted, #888);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .actions { display: flex; gap: 8px; flex-shrink: 0; }
  .cancel-btn {
    padding: 8px 16px;
    border-radius: 6px;
    border: 1px solid var(--tune-border, #555);
    background: transparent;
    color: var(--tune-text, #fff);
    cursor: pointer;
  }
  .select-btn {
    padding: 8px 16px;
    border-radius: 6px;
    border: none;
    background: var(--tune-accent, #f59e0b);
    color: #000;
    font-weight: 600;
    cursor: pointer;
  }
  .select-btn:hover { opacity: 0.9; }
</style>

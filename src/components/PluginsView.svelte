<script lang="ts">
  import { t } from '../lib/i18n';
  import * as api from '../lib/api';
  import type { InstalledPlugin, StorePlugin } from '../lib/api';
  import { notifications } from '../lib/stores/notifications';

  let installedPlugins = $state<InstalledPlugin[]>([]);
  let storePlugins = $state<StorePlugin[]>([]);
  let loadingInstalled = $state(true);
  let loadingStore = $state(true);
  let searchQuery = $state('');
  let selectedCategory = $state('');
  let guideOpen = $state(false);
  let copiedName = $state<string | null>(null);
  let togglingPlugin = $state<string | null>(null);

  // Fetch installed plugins
  async function fetchInstalled() {
    loadingInstalled = true;
    try {
      installedPlugins = await api.getInstalledPlugins();
    } catch (e) {
      console.error('Failed to load installed plugins:', e);
      installedPlugins = [];
    }
    loadingInstalled = false;
  }

  // Fetch store plugins
  async function fetchStore() {
    loadingStore = true;
    try {
      storePlugins = await api.getStorePlugins(
        searchQuery || undefined,
        selectedCategory || undefined
      );
    } catch (e) {
      console.error('Failed to load store plugins:', e);
      storePlugins = [];
    }
    loadingStore = false;
  }

  // Initial load
  fetchInstalled();
  fetchStore();

  // Derived: categories from store plugins
  let categories = $derived(
    [...new Set(storePlugins.map(p => p.category))].filter(Boolean).sort()
  );

  // Filtered store plugins (client-side filter as fallback)
  let filteredStore = $derived(
    storePlugins.filter(p => {
      if (selectedCategory && p.category !== selectedCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          p.display_name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q)
        );
      }
      return true;
    })
  );

  async function togglePlugin(plugin: InstalledPlugin) {
    togglingPlugin = plugin.name;
    try {
      if (plugin.status === 'active') {
        await api.disablePlugin(plugin.name);
        plugin.status = 'disabled';
      } else {
        await api.enablePlugin(plugin.name);
        plugin.status = 'active';
        plugin.error_message = undefined;
      }
      // Refresh the list
      await fetchInstalled();
    } catch (e: any) {
      notifications.error(e?.message || 'Error toggling plugin');
    }
    togglingPlugin = null;
  }

  function copyInstallCommand(name: string) {
    const cmd = `pip install tune-plugin-${name}`;
    navigator.clipboard.writeText(cmd).then(() => {
      copiedName = name;
      setTimeout(() => { copiedName = null; }, 2000);
    });
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      fetchStore();
    }
  }

  function selectCategory(cat: string) {
    selectedCategory = cat === selectedCategory ? '' : cat;
  }

  function categoryColor(category: string): string {
    const colors: Record<string, string> = {
      'audio': '#6366f1',
      'streaming': '#10b981',
      'metadata': '#f59e0b',
      'output': '#ec4899',
      'integration': '#8b5cf6',
      'analytics': '#14b8a6',
      'library': '#3b82f6',
    };
    return colors[category.toLowerCase()] ?? '#6b7280';
  }
</script>

<div class="plugins-view">
  <header class="plugins-header">
    <h1>{$t('plugins.title')}</h1>
  </header>

  <!-- Section 1: Installed Plugins -->
  <section class="plugins-section">
    <h2 class="section-title">{$t('plugins.installed')}</h2>
    {#if loadingInstalled}
      <div class="loading">{$t('common.loading')}</div>
    {:else if installedPlugins.length === 0}
      <div class="empty-state">{$t('plugins.noInstalled')}</div>
    {:else}
      <div class="installed-list">
        {#each installedPlugins as plugin}
          <div class="installed-card" class:has-error={plugin.status === 'error'}>
            <div class="installed-info">
              <div class="installed-header">
                <span class="plugin-name">{plugin.name}</span>
                <span class="plugin-version">v{plugin.version}</span>
                <span class="plugin-status" class:status-active={plugin.status === 'active'} class:status-disabled={plugin.status === 'disabled'} class:status-error={plugin.status === 'error'}>
                  {#if plugin.status === 'active'}
                    {$t('plugins.active')}
                  {:else if plugin.status === 'disabled'}
                    {$t('plugins.disabled')}
                  {:else}
                    {$t('plugins.error')}
                  {/if}
                </span>
              </div>
              <p class="plugin-description">{plugin.description}</p>
              {#if plugin.status === 'error' && plugin.error_message}
                <p class="plugin-error">{plugin.error_message}</p>
              {/if}
            </div>
            <button
              class="toggle-btn"
              class:toggle-active={plugin.status === 'active'}
              disabled={togglingPlugin === plugin.name}
              onclick={() => togglePlugin(plugin)}
            >
              {#if togglingPlugin === plugin.name}
                ...
              {:else if plugin.status === 'active'}
                {$t('plugins.disable')}
              {:else}
                {$t('plugins.enable')}
              {/if}
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Section 2: Store -->
  <section class="plugins-section">
    <h2 class="section-title">{$t('plugins.store')}</h2>

    <div class="store-controls">
      <input
        type="text"
        class="store-search"
        placeholder={$t('plugins.searchPlaceholder')}
        bind:value={searchQuery}
        onkeydown={handleSearchKeydown}
      />
      <div class="category-chips">
        <button
          class="chip"
          class:chip-active={selectedCategory === ''}
          onclick={() => selectCategory('')}
        >
          {$t('plugins.allCategories')}
        </button>
        {#each categories as cat}
          <button
            class="chip"
            class:chip-active={selectedCategory === cat}
            style="--chip-color: {categoryColor(cat)}"
            onclick={() => selectCategory(cat)}
          >
            {cat}
          </button>
        {/each}
      </div>
    </div>

    {#if loadingStore}
      <div class="loading">{$t('common.loading')}</div>
    {:else if filteredStore.length === 0}
      <div class="empty-state">{$t('plugins.noStoreResults')}</div>
    {:else}
      <div class="store-grid">
        {#each filteredStore as plugin}
          <div class="store-card">
            <div class="store-card-header">
              <span class="store-card-name">{plugin.display_name}</span>
              <span class="category-badge" style="background: {categoryColor(plugin.category)}">{plugin.category}</span>
            </div>
            <p class="store-card-desc">{plugin.description}</p>
            <div class="store-card-footer">
              <span class="store-card-meta">
                {$t('plugins.by')} {plugin.author} &middot; {$t('plugins.installCount').replace('{count}', String(plugin.install_count))}
              </span>
              <button
                class="install-btn"
                onclick={() => copyInstallCommand(plugin.name)}
              >
                {#if copiedName === plugin.name}
                  {$t('plugins.copied')}
                {:else}
                  {$t('plugins.install')}
                {/if}
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Section 3: Installation Guide -->
  <section class="plugins-section">
    <button class="guide-toggle" onclick={() => guideOpen = !guideOpen}>
      <h2 class="section-title">{$t('plugins.guide')}</h2>
      <svg class="guide-chevron" class:open={guideOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="6 9 12 15 18 9"></polyline></svg>
    </button>
    {#if guideOpen}
      <div class="guide-content">
        <ol class="guide-steps">
          <li>{$t('plugins.guideStep1')}</li>
          <li>
            {$t('plugins.guideStep2')}
            <code class="guide-code">pip install tune-plugin-xxx</code>
            <span class="guide-or">ou</span>
            <code class="guide-code">pip install git+https://...</code>
          </li>
          <li>{$t('plugins.guideStep3')}</li>
          <li>{$t('plugins.guideStep4')}</li>
        </ol>
      </div>
    {/if}
  </section>
</div>

<style>
  .plugins-view {
    padding: var(--space-xl) var(--space-xl);
    max-width: 960px;
    margin: 0 auto;
  }

  .plugins-header h1 {
    font-family: var(--font-heading, var(--font-body));
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--tune-text);
    margin-bottom: var(--space-lg);
  }

  .plugins-section {
    margin-bottom: var(--space-xl);
  }

  .section-title {
    font-family: var(--font-label, var(--font-body));
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--tune-text-secondary);
    margin-bottom: var(--space-md);
  }

  .loading {
    color: var(--tune-text-muted);
    font-size: 0.9rem;
    padding: var(--space-md) 0;
  }

  .empty-state {
    color: var(--tune-text-muted);
    font-size: 0.9rem;
    padding: var(--space-md) 0;
    font-style: italic;
  }

  /* --- Installed Plugins --- */
  .installed-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .installed-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: var(--space-md) var(--space-lg);
    transition: border-color 0.15s;
  }

  .installed-card.has-error {
    border-color: #ef4444;
  }

  .installed-info {
    flex: 1;
    min-width: 0;
  }

  .installed-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: 4px;
  }

  .plugin-name {
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--tune-text);
  }

  .plugin-version {
    font-size: 0.75rem;
    color: var(--tune-text-muted);
    font-family: var(--font-mono, monospace);
  }

  .plugin-status {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 8px;
    border-radius: 999px;
  }

  .status-active {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }

  .status-disabled {
    background: rgba(107, 114, 128, 0.15);
    color: #9ca3af;
  }

  .status-error {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  .plugin-description {
    font-size: 0.85rem;
    color: var(--tune-text-secondary);
    margin: 0;
    line-height: 1.4;
  }

  .plugin-error {
    font-size: 0.8rem;
    color: #ef4444;
    margin: 4px 0 0;
    font-family: var(--font-mono, monospace);
  }

  .toggle-btn {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    padding: 6px 14px;
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .toggle-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .toggle-btn.toggle-active {
    border-color: #ef4444;
    color: #ef4444;
  }

  .toggle-btn.toggle-active:hover {
    background: rgba(239, 68, 68, 0.1);
  }

  .toggle-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* --- Store --- */
  .store-controls {
    margin-bottom: var(--space-md);
  }

  .store-search {
    width: 100%;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: 10px 14px;
    color: var(--tune-text);
    font-size: 0.9rem;
    font-family: var(--font-body);
    outline: none;
    margin-bottom: var(--space-sm);
    transition: border-color 0.15s;
  }

  .store-search:focus {
    border-color: var(--tune-accent);
  }

  .store-search::placeholder {
    color: var(--tune-text-muted);
  }

  .category-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--tune-text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .chip:hover {
    border-color: var(--chip-color, var(--tune-accent));
    color: var(--chip-color, var(--tune-accent));
  }

  .chip.chip-active {
    background: var(--chip-color, var(--tune-accent));
    border-color: var(--chip-color, var(--tune-accent));
    color: white;
  }

  .store-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-md);
  }

  .store-card {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: var(--space-md) var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .store-card:hover {
    border-color: var(--tune-accent);
    box-shadow: 0 2px 12px rgba(99, 102, 241, 0.1);
  }

  .store-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .store-card-name {
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--tune-text);
  }

  .category-badge {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 8px;
    border-radius: 999px;
    color: white;
  }

  .store-card-desc {
    font-size: 0.85rem;
    color: var(--tune-text-secondary);
    margin: 0;
    line-height: 1.4;
    flex: 1;
  }

  .store-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    margin-top: auto;
  }

  .store-card-meta {
    font-size: 0.75rem;
    color: var(--tune-text-muted);
  }

  .install-btn {
    background: var(--tune-accent);
    border: none;
    color: white;
    padding: 6px 14px;
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
    white-space: nowrap;
  }

  .install-btn:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .install-btn:active {
    transform: translateY(0);
  }

  /* --- Guide --- */
  .guide-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    width: 100%;
    text-align: left;
  }

  .guide-toggle .section-title {
    margin-bottom: 0;
  }

  .guide-chevron {
    color: var(--tune-text-muted);
    transition: transform 0.15s;
    transform: rotate(-90deg);
  }

  .guide-chevron.open {
    transform: rotate(0deg);
  }

  .guide-content {
    margin-top: var(--space-md);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: var(--space-lg);
  }

  .guide-steps {
    margin: 0;
    padding-left: 1.2rem;
    list-style: decimal;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    color: var(--tune-text-secondary);
    font-size: 0.9rem;
    line-height: 1.6;
  }

  .guide-code {
    display: inline-block;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 2px 8px;
    font-family: var(--font-mono, monospace);
    font-size: 0.82rem;
    color: var(--tune-accent);
    margin: 4px 4px 4px 0;
  }

  .guide-or {
    font-size: 0.8rem;
    color: var(--tune-text-muted);
    margin: 0 4px;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .plugins-view {
      padding: var(--space-md);
    }

    .store-grid {
      grid-template-columns: 1fr;
    }

    .installed-card {
      flex-direction: column;
      align-items: flex-start;
    }

    .toggle-btn {
      align-self: flex-end;
    }
  }
</style>

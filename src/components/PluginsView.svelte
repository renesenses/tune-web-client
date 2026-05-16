<script lang="ts">
  import { t } from '../lib/i18n';
  import { marked } from 'marked';
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
  let activeTab = $state<'installed' | 'store' | 'docs'>('installed');
  let docsHtml = $state('');
  let docsLoading = $state(false);

  async function fetchDocs() {
    if (docsHtml) return;
    docsLoading = true;
    try {
      const res = await fetch('/api/v1/store/docs');
      if (res.ok) {
        const md = await res.text();
        docsHtml = marked(md) as string;
      }
    } catch (e) {
      console.error('Failed to load plugin docs:', e);
      docsHtml = '<p>Documentation unavailable.</p>';
    }
    docsLoading = false;
  }

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
    <nav class="plugins-tabs">
      <button class="tab" class:active={activeTab === 'installed'} onclick={() => activeTab = 'installed'}>
        {$t('plugins.installed')}
      </button>
      <button class="tab" class:active={activeTab === 'store'} onclick={() => activeTab = 'store'}>
        {$t('plugins.store')}
      </button>
      <button class="tab" class:active={activeTab === 'docs'} onclick={() => { activeTab = 'docs'; fetchDocs(); }}>
        Documentation
      </button>
    </nav>
  </header>

  {#if activeTab === 'installed'}
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
  {/if}

  {#if activeTab === 'store'}
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
            {#if plugin.platforms}
            <div class="platform-badges">
              {#each plugin.platforms.split(',') as platform}
                <span class="platform-badge" class:python={platform === 'python'} class:swift={platform === 'swift'} class:flutter={platform === 'flutter'}>{platform === 'python' ? '🐍' : platform === 'swift' ? '🍎' : '📱'} {platform}</span>
              {/each}
            </div>
            {/if}
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
  {/if}

  {#if activeTab === 'docs'}
  <!-- Section 3: Developer Documentation -->
  <section class="plugins-section docs-section">
    {#if docsLoading}
      <div class="loading">{$t('common.loading')}</div>
    {:else}
      <div class="docs-content">{@html docsHtml}</div>
    {/if}
  </section>
  {/if}
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
    margin-bottom: var(--space-md);
  }

  .plugins-tabs {
    display: flex;
    gap: 2px;
    margin-bottom: var(--space-lg);
    border-bottom: 1px solid var(--tune-border);
  }

  .tab {
    padding: 8px 16px;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--tune-text-secondary);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }

  .tab:hover { color: var(--tune-text); }
  .tab.active {
    color: var(--tune-accent);
    border-bottom-color: var(--tune-accent);
  }

  .docs-content {
    font-size: 0.9rem;
    line-height: 1.7;
    color: var(--tune-text);
  }

  .docs-content :global(h1) { font-size: 1.4rem; font-weight: 700; margin: 2rem 0 1rem; color: var(--tune-text); }
  .docs-content :global(h2) { font-size: 1.15rem; font-weight: 600; margin: 1.8rem 0 0.8rem; color: var(--tune-text); }
  .docs-content :global(h3) { font-size: 1rem; font-weight: 600; margin: 1.4rem 0 0.6rem; color: var(--tune-text); }
  .docs-content :global(pre) {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 8px;
    padding: 12px 16px;
    overflow-x: auto;
    font-size: 0.82rem;
    line-height: 1.5;
  }
  .docs-content :global(code) {
    font-family: var(--font-mono, monospace);
    font-size: 0.85em;
    background: var(--tune-surface);
    padding: 2px 5px;
    border-radius: 4px;
  }
  .docs-content :global(pre code) { background: none; padding: 0; }
  .docs-content :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
    font-size: 0.83rem;
  }
  .docs-content :global(th), .docs-content :global(td) {
    border: 1px solid var(--tune-border);
    padding: 8px 12px;
    text-align: left;
  }
  .docs-content :global(th) { background: var(--tune-surface); font-weight: 600; }
  .docs-content :global(hr) { border: none; border-top: 1px solid var(--tune-border); margin: 2rem 0; }
  .docs-content :global(ul), .docs-content :global(ol) { padding-left: 1.5rem; margin: 0.5rem 0; }
  .docs-content :global(li) { margin-bottom: 0.3rem; }

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

  .platform-badges {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }

  .platform-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 6px;
    text-transform: uppercase;
  }

  .platform-badge.python { background: rgba(55, 118, 171, 0.2); color: #3776ab; }
  .platform-badge.swift { background: rgba(240, 81, 56, 0.2); color: #f05138; }
  .platform-badge.flutter { background: rgba(66, 165, 245, 0.2); color: #42a5f5; }
</style>

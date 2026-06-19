<script lang="ts">
  import { t } from '../lib/i18n';
  import { marked } from 'marked';
  import * as api from '../lib/api';
  import type { MergedPlugin } from '../lib/api';
  import { notifications } from '../lib/stores/notifications';

  let allPlugins = $state<MergedPlugin[]>([]);
  let loading = $state(true);
  let searchQuery = $state('');
  let selectedCategory = $state('');
  let activeTab = $state<'store' | 'installed' | 'docs'>('store');
  let docsHtml = $state('');
  let docsLoading = $state(false);

  // Track ongoing operations per plugin
  let installing = $state<Set<string>>(new Set());
  let uninstalling = $state<Set<string>>(new Set());
  let updating = $state<Set<string>>(new Set());

  // Restart banner
  let showRestartBanner = $state(false);

  async function fetchPlugins() {
    loading = true;
    try {
      allPlugins = await api.getMergedPlugins();
    } catch (e) {
      console.error('Failed to load plugins:', e);
      allPlugins = [];
    }
    loading = false;
  }

  async function fetchDocs() {
    if (docsHtml) return;
    docsLoading = true;
    try {
      const res = await fetch('/api/v1/plugins/docs');
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

  // Initial load
  fetchPlugins();

  // Derived: unique categories
  let categories = $derived(
    [...new Set(allPlugins.map(p => p.category).filter(Boolean))].sort()
  );

  // Derived: installed plugins
  let installedPlugins = $derived(
    allPlugins.filter(p => p.installed)
  );

  // Derived: filtered plugins for store view
  let filteredPlugins = $derived(
    allPlugins.filter(p => {
      if (selectedCategory && p.category !== selectedCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          (p.display_name || p.name).toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q) ||
          (p.category || '').toLowerCase().includes(q) ||
          (p.author || '').toLowerCase().includes(q)
        );
      }
      return true;
    })
  );

  function categoryIcon(category: string): string {
    const icons: Record<string, string> = {
      'streaming': 'M12 3v10.55A4 4 0 1014 17V7h4V3h-6z',
      'audio': 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.49 4.49 0 002.5-3.5zM14 3.23v2.06a6.51 6.51 0 010 13.42v2.06A8.51 8.51 0 0014 3.23z',
      'playback': 'M8 5v14l11-7z',
      'library': 'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z',
      'integration': 'M11 14.17L8.83 12 11 9.83 9.59 8.41 6 12l3.59 3.59L11 14.17zm2-4.34L15.17 12 13 14.17l1.41 1.42L18 12l-3.59-3.59L13 9.83zM19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z',
      'hardware': 'M20 8h-3V6c0-1.1-.9-2-2-2H9c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v10h20V10c0-1.1-.9-2-2-2zM9 6h6v2H9V6zm11 12H4v-8h3v1h2v-1h6v1h2v-1h3v8z',
      'system': 'M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.04 7.04 0 00-1.63-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84a.48.48 0 00-.48.41l-.36 2.54a7.04 7.04 0 00-1.63.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87a.48.48 0 00.12.61l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.24.26.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54a7.04 7.04 0 001.63-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z',
      'metadata': 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zm-3-7H9v-2h6v2zm0 4H9v-2h6v2z',
      'output': 'M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM5 15h14v2H5v-2z',
      'analytics': 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z',
      'tools': 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z',
    };
    return icons[category.toLowerCase()] ?? icons['system'];
  }

  function categoryColor(category: string): string {
    const colors: Record<string, string> = {
      'streaming': '#10b981',
      'audio': '#6366f1',
      'playback': '#f59e0b',
      'library': '#3b82f6',
      'integration': '#8b5cf6',
      'hardware': '#ec4899',
      'system': '#6b7280',
      'metadata': '#f59e0b',
      'output': '#ec4899',
      'analytics': '#14b8a6',
      'tools': '#78716c',
    };
    return colors[category.toLowerCase()] ?? '#6b7280';
  }

  function pluginIcon(plugin: MergedPlugin): string {
    if (plugin.icon) return plugin.icon;
    return categoryIcon(plugin.category || 'system');
  }

  async function handleInstall(plugin: MergedPlugin) {
    const s = new Set(installing);
    s.add(plugin.name);
    installing = s;
    try {
      const result = await api.installPlugin(plugin.name);
      notifications.success(`${plugin.display_name || plugin.name} installed`);
      if (result.restart_required) showRestartBanner = true;
      await fetchPlugins();
    } catch (e: any) {
      notifications.error(e?.message || `Failed to install ${plugin.name}`);
    }
    const s2 = new Set(installing);
    s2.delete(plugin.name);
    installing = s2;
  }

  async function handleUninstall(plugin: MergedPlugin) {
    const s = new Set(uninstalling);
    s.add(plugin.name);
    uninstalling = s;
    try {
      const result = await api.uninstallPlugin(plugin.name);
      notifications.success(`${plugin.display_name || plugin.name} uninstalled`);
      if (result.restart_required) showRestartBanner = true;
      await fetchPlugins();
    } catch (e: any) {
      notifications.error(e?.message || `Failed to uninstall ${plugin.name}`);
    }
    const s2 = new Set(uninstalling);
    s2.delete(plugin.name);
    uninstalling = s2;
  }

  async function handleUpdate(plugin: MergedPlugin) {
    const s = new Set(updating);
    s.add(plugin.name);
    updating = s;
    try {
      const result = await api.updatePlugin(plugin.name);
      notifications.success(`${plugin.display_name || plugin.name} updated`);
      if (result.restart_required) showRestartBanner = true;
      await fetchPlugins();
    } catch (e: any) {
      notifications.error(e?.message || `Failed to update ${plugin.name}`);
    }
    const s2 = new Set(updating);
    s2.delete(plugin.name);
    updating = s2;
  }

  async function handleToggle(plugin: MergedPlugin) {
    try {
      if (plugin.status === 'active') {
        await api.disablePlugin(plugin.name);
        notifications.success(`${plugin.display_name || plugin.name} disabled`);
      } else {
        await api.enablePlugin(plugin.name);
        notifications.success(`${plugin.display_name || plugin.name} enabled`);
      }
      showRestartBanner = true;
      await fetchPlugins();
    } catch (e: any) {
      notifications.error(e?.message || 'Error toggling plugin');
    }
  }

  function selectCategory(cat: string) {
    selectedCategory = cat === selectedCategory ? '' : cat;
  }

  function isBusy(name: string): boolean {
    return installing.has(name) || uninstalling.has(name) || updating.has(name);
  }
</script>

<div class="plugins-page">
  <!-- Restart banner -->
  {#if showRestartBanner}
    <div class="restart-banner">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{$t('plugins.restartRequired')}</span>
      <button class="banner-dismiss" onclick={() => showRestartBanner = false}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  {/if}

  <header class="plugins-header">
    <h1>{$t('plugins.title')}</h1>
    <p class="plugins-subtitle">Extend Tune with community plugins</p>
    <nav class="plugins-tabs">
      <button class="tab" class:active={activeTab === 'store'} onclick={() => activeTab = 'store'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        {$t('plugins.store')}
      </button>
      <button class="tab" class:active={activeTab === 'installed'} onclick={() => activeTab = 'installed'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {$t('plugins.installed')}
        {#if installedPlugins.length > 0}
          <span class="tab-badge">{installedPlugins.length}</span>
        {/if}
      </button>
      <button class="tab" class:active={activeTab === 'docs'} onclick={() => { activeTab = 'docs'; fetchDocs(); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        Documentation
      </button>
    </nav>
  </header>

  {#if activeTab === 'store'}
  <div class="store-layout">
    <!-- Categories sidebar -->
    <aside class="categories-sidebar">
      <h3 class="sidebar-title">Categories</h3>
      <button
        class="category-item"
        class:category-active={selectedCategory === ''}
        onclick={() => selectCategory('')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
        </svg>
        <span>{$t('plugins.allPlugins')}</span>
        <span class="category-count">{allPlugins.length}</span>
      </button>
      {#each categories as cat}
        {@const count = allPlugins.filter(p => p.category === cat).length}
        <button
          class="category-item"
          class:category-active={selectedCategory === cat}
          onclick={() => selectCategory(cat)}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" style="color: {categoryColor(cat)}">
            <path d={categoryIcon(cat)} />
          </svg>
          <span>{$t(`plugins.categories.${cat.toLowerCase()}` as any) || cat}</span>
          <span class="category-count">{count}</span>
        </button>
      {/each}
    </aside>

    <!-- Main content -->
    <div class="store-main">
      <!-- Search bar -->
      <div class="search-bar">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          class="search-input"
          placeholder={$t('plugins.searchPlaceholder')}
          bind:value={searchQuery}
        />
        {#if searchQuery}
          <button class="search-clear" onclick={() => searchQuery = ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        {/if}
      </div>

      <!-- Mobile category chips -->
      <div class="category-chips-mobile">
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

      {#if loading}
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <span>{$t('common.loading')}</span>
        </div>
      {:else if filteredPlugins.length === 0}
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p>{$t('plugins.noStoreResults')}</p>
        </div>
      {:else}
        <div class="plugin-grid">
          {#each filteredPlugins as plugin (plugin.name)}
            <div class="plugin-card" class:plugin-installed={plugin.installed} class:plugin-incompatible={!plugin.compatible}>
              <!-- Card header with icon -->
              <div class="card-top">
                <div class="card-icon" style="background: {categoryColor(plugin.category || 'system')}20; color: {categoryColor(plugin.category || 'system')}">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                    <path d={pluginIcon(plugin)} />
                  </svg>
                </div>
                <div class="card-badges">
                  {#if plugin.is_featured}
                    <span class="badge badge-featured">{$t('plugins.featured')}</span>
                  {/if}
                  {#if plugin.installed && plugin.update_available}
                    <span class="badge badge-update">{$t('plugins.updateAvailable')}</span>
                  {/if}
                  {#if !plugin.compatible}
                    <span class="badge badge-incompatible">{$t('plugins.incompatible')}</span>
                  {/if}
                </div>
              </div>

              <!-- Name + category -->
              <div class="card-title-row">
                <h3 class="card-name">{plugin.display_name || plugin.name}</h3>
                {#if plugin.category}
                  <span class="card-category" style="background: {categoryColor(plugin.category)}; color: white">
                    {plugin.category}
                  </span>
                {/if}
              </div>

              <!-- Version -->
              <span class="card-version">v{plugin.version}</span>

              <!-- Description -->
              <p class="card-desc">{plugin.description || ''}</p>

              <!-- Platforms -->
              {#if plugin.platforms}
                <div class="card-platforms">
                  {#each plugin.platforms.split(',') as platform}
                    <span class="platform-tag" class:python={platform === 'python'} class:swift={platform === 'swift'} class:flutter={platform === 'flutter'}>
                      {platform}
                    </span>
                  {/each}
                </div>
              {/if}

              <!-- Footer: author/installs + action buttons -->
              <div class="card-footer">
                <div class="card-meta">
                  {#if plugin.author}
                    <span>{$t('plugins.by')} {plugin.author}</span>
                  {/if}
                  {#if plugin.install_count != null}
                    <span>{$t('plugins.installCount').replace('{count}', String(plugin.install_count))}</span>
                  {/if}
                </div>
                <div class="card-actions">
                  {#if plugin.installed}
                    {#if plugin.update_available}
                      <button
                        class="btn btn-update"
                        disabled={isBusy(plugin.name)}
                        onclick={() => handleUpdate(plugin)}
                      >
                        {#if updating.has(plugin.name)}
                          <span class="btn-spinner"></span>
                          {$t('plugins.updating')}
                        {:else}
                          {$t('plugins.update')}
                        {/if}
                      </button>
                    {/if}
                    <button
                      class="btn btn-toggle"
                      class:toggle-active={plugin.status === 'active'}
                      disabled={isBusy(plugin.name)}
                      onclick={() => handleToggle(plugin)}
                    >
                      {#if plugin.status === 'active'}
                        {$t('plugins.disable')}
                      {:else}
                        {$t('plugins.enable')}
                      {/if}
                    </button>
                    <button
                      class="btn btn-uninstall"
                      disabled={isBusy(plugin.name)}
                      onclick={() => handleUninstall(plugin)}
                    >
                      {#if uninstalling.has(plugin.name)}
                        <span class="btn-spinner"></span>
                      {:else}
                        {$t('plugins.uninstall')}
                      {/if}
                    </button>
                  {:else}
                    <button
                      class="btn btn-install"
                      disabled={!plugin.compatible || isBusy(plugin.name)}
                      onclick={() => handleInstall(plugin)}
                    >
                      {#if installing.has(plugin.name)}
                        <span class="btn-spinner"></span>
                        {$t('plugins.installing')}
                      {:else}
                        {$t('plugins.install')}
                      {/if}
                    </button>
                  {/if}
                </div>
              </div>

              <!-- Installed indicator stripe -->
              {#if plugin.installed}
                <div class="installed-stripe" class:stripe-active={plugin.status === 'active'} class:stripe-error={plugin.status === 'error'} class:stripe-disabled={plugin.status === 'disabled'}></div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
  {/if}

  {#if activeTab === 'installed'}
  <section class="installed-section">
    {#if loading}
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <span>{$t('common.loading')}</span>
      </div>
    {:else if installedPlugins.length === 0}
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
          <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        <p>{$t('plugins.noInstalled')}</p>
        <button class="btn btn-install" onclick={() => activeTab = 'store'}>Browse Store</button>
      </div>
    {:else}
      <div class="installed-list">
        {#each installedPlugins as plugin (plugin.name)}
          <div class="installed-card" class:has-error={plugin.status === 'error'}>
            <div class="installed-icon" style="background: {categoryColor(plugin.category || 'system')}20; color: {categoryColor(plugin.category || 'system')}">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d={pluginIcon(plugin)} />
              </svg>
            </div>
            <div class="installed-info">
              <div class="installed-header">
                <span class="installed-name">{plugin.display_name || plugin.name}</span>
                <span class="installed-version">v{plugin.installed_version || plugin.version}</span>
                <span class="status-badge" class:status-active={plugin.status === 'active'} class:status-disabled={plugin.status === 'disabled'} class:status-error={plugin.status === 'error'}>
                  {#if plugin.status === 'active'}
                    {$t('plugins.active')}
                  {:else if plugin.status === 'disabled'}
                    {$t('plugins.disabled')}
                  {:else}
                    {$t('plugins.error')}
                  {/if}
                </span>
                {#if plugin.update_available}
                  <span class="badge badge-update">{$t('plugins.updateAvailable')}</span>
                {/if}
              </div>
              <p class="installed-desc">{plugin.description || ''}</p>
              {#if plugin.status === 'error' && plugin.error_message}
                <p class="installed-error">{plugin.error_message}</p>
              {/if}
            </div>
            <div class="installed-actions">
              {#if plugin.update_available}
                <button
                  class="btn btn-update btn-sm"
                  disabled={isBusy(plugin.name)}
                  onclick={() => handleUpdate(plugin)}
                >
                  {#if updating.has(plugin.name)}
                    <span class="btn-spinner"></span>
                  {:else}
                    {$t('plugins.update')}
                  {/if}
                </button>
              {/if}
              <button
                class="btn btn-toggle btn-sm"
                class:toggle-active={plugin.status === 'active'}
                disabled={isBusy(plugin.name)}
                onclick={() => handleToggle(plugin)}
              >
                {plugin.status === 'active' ? $t('plugins.disable') : $t('plugins.enable')}
              </button>
              <button
                class="btn btn-uninstall btn-sm"
                disabled={isBusy(plugin.name)}
                onclick={() => handleUninstall(plugin)}
              >
                {#if uninstalling.has(plugin.name)}
                  <span class="btn-spinner"></span>
                {:else}
                  {$t('plugins.uninstall')}
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
  <section class="docs-section">
    {#if docsLoading}
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <span>{$t('common.loading')}</span>
      </div>
    {:else}
      <div class="docs-content">{@html docsHtml}</div>
    {/if}
  </section>
  {/if}
</div>

<style>
  .plugins-page {
    padding: var(--space-xl);
    max-width: 1200px;
    margin: 0 auto;
  }

  /* ── Restart Banner ── */
  .restart-banner {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 10px 16px;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: var(--radius-md);
    color: #f59e0b;
    font-size: 0.85rem;
    font-weight: 500;
    margin-bottom: var(--space-lg);
  }

  .restart-banner span { flex: 1; }

  .banner-dismiss {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 2px;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .banner-dismiss:hover { opacity: 1; }

  /* ── Header ── */
  .plugins-header h1 {
    font-family: var(--font-heading, var(--font-body));
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--tune-text);
    margin: 0 0 4px;
  }

  .plugins-subtitle {
    font-size: 0.85rem;
    color: var(--tune-text-muted);
    margin: 0 0 var(--space-lg);
  }

  .plugins-tabs {
    display: flex;
    gap: 2px;
    margin-bottom: var(--space-lg);
    border-bottom: 1px solid var(--tune-border);
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
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

  .tab-badge {
    font-size: 0.7rem;
    font-weight: 700;
    background: var(--tune-accent);
    color: white;
    padding: 1px 6px;
    border-radius: 999px;
    min-width: 18px;
    text-align: center;
  }

  /* ── Store Layout ── */
  .store-layout {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: var(--space-lg);
    align-items: start;
  }

  /* ── Categories Sidebar ── */
  .categories-sidebar {
    position: sticky;
    top: var(--space-lg);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: var(--space-md);
  }

  .sidebar-title {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--tune-text-muted);
    margin: 0 0 var(--space-sm);
    padding: 0 8px;
  }

  .category-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--tune-text-secondary);
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
  }

  .category-item:hover {
    background: var(--tune-bg);
    color: var(--tune-text);
  }

  .category-item.category-active {
    background: var(--tune-accent);
    color: white;
  }

  .category-item.category-active .category-count {
    background: rgba(255,255,255,0.2);
    color: white;
  }

  .category-count {
    margin-left: auto;
    font-size: 0.7rem;
    font-weight: 600;
    background: var(--tune-bg);
    color: var(--tune-text-muted);
    padding: 1px 6px;
    border-radius: 999px;
    min-width: 20px;
    text-align: center;
  }

  /* Mobile: hide sidebar, show chips */
  .category-chips-mobile {
    display: none;
  }

  /* ── Search Bar ── */
  .search-bar {
    position: relative;
    margin-bottom: var(--space-md);
  }

  .search-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--tune-text-muted);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: 12px 40px 12px 44px;
    color: var(--tune-text);
    font-size: 0.9rem;
    font-family: var(--font-body);
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .search-input:focus {
    border-color: var(--tune-accent);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  .search-input::placeholder { color: var(--tune-text-muted); }

  .search-clear {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 2px;
  }

  .search-clear:hover { color: var(--tune-text); }

  /* ── Plugin Grid ── */
  .plugin-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-md);
  }

  .plugin-card {
    position: relative;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg, 12px);
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
    overflow: hidden;
  }

  .plugin-card:hover {
    border-color: var(--tune-accent);
    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.08);
    transform: translateY(-2px);
  }

  .plugin-card.plugin-incompatible {
    opacity: 0.6;
  }

  .card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  .card-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .card-badges {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .badge {
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 8px;
    border-radius: 999px;
  }

  .badge-featured {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }

  .badge-update {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }

  .badge-incompatible {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  .card-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .card-name {
    font-weight: 600;
    font-size: 1rem;
    color: var(--tune-text);
    margin: 0;
  }

  .card-category {
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 8px;
    border-radius: 999px;
    flex-shrink: 0;
  }

  .card-version {
    font-size: 0.75rem;
    color: var(--tune-text-muted);
    font-family: var(--font-mono, monospace);
  }

  .card-desc {
    font-size: 0.85rem;
    color: var(--tune-text-secondary);
    margin: 0;
    line-height: 1.5;
    flex: 1;
  }

  .card-platforms {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .platform-tag {
    font-size: 0.65rem;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 6px;
    text-transform: uppercase;
    background: var(--tune-bg);
    color: var(--tune-text-muted);
  }

  .platform-tag.python { background: rgba(55, 118, 171, 0.15); color: #3776ab; }
  .platform-tag.swift { background: rgba(240, 81, 56, 0.15); color: #f05138; }
  .platform-tag.flutter { background: rgba(66, 165, 245, 0.15); color: #42a5f5; }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    margin-top: auto;
    padding-top: var(--space-sm);
    border-top: 1px solid var(--tune-border);
  }

  .card-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.72rem;
    color: var(--tune-text-muted);
  }

  .card-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  /* Installed status stripe at bottom */
  .installed-stripe {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
  }

  .stripe-active { background: #10b981; }
  .stripe-disabled { background: #6b7280; }
  .stripe-error { background: #ef4444; }

  /* ── Buttons ── */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
    border: 1px solid transparent;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-sm {
    padding: 5px 10px;
    font-size: 0.75rem;
  }

  .btn-install {
    background: var(--tune-accent);
    color: white;
    border-color: var(--tune-accent);
  }

  .btn-install:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .btn-uninstall {
    background: none;
    color: #ef4444;
    border-color: #ef4444;
  }

  .btn-uninstall:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.1);
  }

  .btn-update {
    background: #10b981;
    color: white;
    border-color: #10b981;
  }

  .btn-update:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-toggle {
    background: var(--tune-bg);
    color: var(--tune-text-secondary);
    border-color: var(--tune-border);
  }

  .btn-toggle:hover:not(:disabled) {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .btn-toggle.toggle-active {
    border-color: #ef4444;
    color: #ef4444;
  }

  .btn-toggle.toggle-active:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.1);
  }

  .btn-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  /* ── Installed Tab ── */
  .installed-section {
    margin-top: var(--space-md);
  }

  .installed-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .installed-card {
    display: flex;
    align-items: center;
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

  .installed-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
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
    flex-wrap: wrap;
  }

  .installed-name {
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--tune-text);
  }

  .installed-version {
    font-size: 0.75rem;
    color: var(--tune-text-muted);
    font-family: var(--font-mono, monospace);
  }

  .status-badge {
    font-size: 0.65rem;
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

  .installed-desc {
    font-size: 0.85rem;
    color: var(--tune-text-secondary);
    margin: 0;
    line-height: 1.4;
  }

  .installed-error {
    font-size: 0.8rem;
    color: #ef4444;
    margin: 4px 0 0;
    font-family: var(--font-mono, monospace);
  }

  .installed-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  /* ── Loading / Empty States ── */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-xl) 0;
    color: var(--tune-text-muted);
    font-size: 0.9rem;
  }

  .loading-spinner {
    width: 28px;
    height: 28px;
    border: 3px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-xl) 0;
    color: var(--tune-text-muted);
    font-size: 0.9rem;
  }

  .empty-state p {
    margin: 0;
    font-style: italic;
  }

  /* ── Docs ── */
  .docs-section {
    max-width: 800px;
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

  /* ── Mobile chips (visible only on small screens) ── */
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

  /* ── Responsive ── */
  @media (max-width: 900px) {
    .store-layout {
      grid-template-columns: 1fr;
    }

    .categories-sidebar {
      display: none;
    }

    .category-chips-mobile {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: var(--space-md);
    }
  }

  @media (max-width: 768px) {
    .plugins-page {
      padding: var(--space-md);
    }

    .plugin-grid {
      grid-template-columns: 1fr;
    }

    .installed-card {
      flex-direction: column;
      align-items: flex-start;
    }

    .installed-actions {
      align-self: flex-end;
      flex-wrap: wrap;
    }

    .card-footer {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-sm);
    }

    .card-actions {
      width: 100%;
      justify-content: flex-end;
    }
  }
</style>

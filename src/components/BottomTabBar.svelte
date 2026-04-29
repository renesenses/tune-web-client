<script lang="ts">
  import { activeView, type View } from '../lib/stores/navigation';
  import { currentZone, zones, currentZoneId } from '../lib/stores/zones';
  import { t } from '../lib/i18n';
  import { updateAvailable } from '../lib/stores/updates';

  const tabs: { view: View; label: string; path: string }[] = [
    { view: 'home', label: 'nav.home', path: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
    { view: 'library', label: 'nav.library', path: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z' },
    { view: 'search', label: 'nav.search', path: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
    { view: 'streaming', label: 'nav.services', path: 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z' },
  ];

  const moreItems: { view: View; label: string; path: string }[] = [
    { view: 'favorites', label: 'nav.favorites', path: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' },
    { view: 'queue', label: 'nav.queue', path: 'M4 6h16M4 12h16M4 18h7' },
    { view: 'playlists', label: 'nav.playlists', path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { view: 'radios', label: 'nav.radios', path: 'M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M9.172 15.828a5 5 0 010-7.656m5.656 0a5 5 0 010 7.656M12 12h.01' },
    { view: 'history', label: 'nav.history', path: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { view: 'genres', label: 'nav.genres', path: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
    { view: 'browse', label: 'nav.browse', path: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
    { view: 'settings', label: 'nav.settings', path: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    { view: 'metadata', label: 'nav.maintenance', path: 'M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7zm8 1v4m0 4h.01' },
  ];

  let drawerOpen = $state(false);
  let zonePickerOpen = $state(false);

  function navigate(view: View) {
    activeView.set(view);
    drawerOpen = false;
  }

  function selectZone(id: number) {
    currentZoneId.set(id);
    zonePickerOpen = false;
  }
</script>

<!-- Zone picker sheet -->
{#if zonePickerOpen}
  <div class="overlay" role="dialog" onclick={() => zonePickerOpen = false}>
    <div class="sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
      <div class="sheet-handle"></div>
      <h3 class="sheet-title">Zones</h3>
      {#each $zones as z}
        <button class="sheet-item" class:active={z.id === $currentZoneId} onclick={() => selectZone(z.id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><path d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M9 12a1 1 0 11-2 0 1 1 0 012 0z" /></svg>
          <span class="sheet-item-label">{z.name}</span>
          {#if z.id === $currentZoneId}
            <svg class="check" viewBox="0 0 24 24" fill="none" stroke="var(--tune-accent)" stroke-width="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12" /></svg>
          {/if}
        </button>
      {/each}
    </div>
  </div>
{/if}

<!-- More drawer sheet -->
{#if drawerOpen}
  <div class="overlay" role="dialog" onclick={() => drawerOpen = false}>
    <div class="sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
      <div class="sheet-handle"></div>
      {#each moreItems as item}
        <button class="sheet-item" class:active={$activeView === item.view} onclick={() => navigate(item.view)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d={item.path} /></svg>
          <span class="sheet-item-label">{$t(item.label)}</span>
          {#if item.view === 'settings' && $updateAvailable}
            <span class="sheet-badge-update">MAJ</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
{/if}

<nav class="bottom-tab-bar">
  <!-- Zone selector -->
  <button class="tab zone-tab" onclick={() => zonePickerOpen = true}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M9 12a1 1 0 11-2 0 1 1 0 012 0z" />
    </svg>
    <span class="truncate">{$currentZone?.name ?? 'Zone'}</span>
  </button>

  <!-- Main tabs -->
  {#each tabs as tab}
    <button class="tab" class:active={$activeView === tab.view} onclick={() => navigate(tab.view)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d={tab.path} /></svg>
      <span>{$t(tab.label)}</span>
    </button>
  {/each}

  <!-- More -->
  <button class="tab" class:active={drawerOpen} onclick={() => drawerOpen = !drawerOpen}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
    <span>Plus</span>
  </button>
</nav>

<style>
  .bottom-tab-bar { display: none; }
  .overlay { display: none; }
  .sheet { display: none; }

  @media (max-width: 768px) {
    .bottom-tab-bar {
      display: flex;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: var(--tab-bar-height);
      background: var(--tune-footer);
      border-top: 1px solid var(--tune-border);
      z-index: 90;
      padding-bottom: env(safe-area-inset-bottom, 0);
    }

    .tab {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      background: none;
      border: none;
      color: var(--tune-text-muted);
      font-family: var(--font-label);
      font-size: 10px;
      cursor: pointer;
      padding: 4px 0;
      min-width: 0;
      -webkit-tap-highlight-color: transparent;
    }

    .tab svg { width: 22px; height: 22px; flex-shrink: 0; }
    .tab.active { color: var(--tune-accent); }
    .tab span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }

    .zone-tab { color: var(--tune-accent); max-width: 72px; }
    .zone-tab span { font-size: 9px; }

    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Overlay & sheets */
    .overlay {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 200;
      background: rgba(0, 0, 0, 0.5);
      animation: fadeIn 0.15s ease-out;
    }

    .sheet {
      display: block;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 201;
      background: var(--tune-surface);
      border-radius: 16px 16px 0 0;
      padding: 8px 0 calc(var(--tab-bar-height) + env(safe-area-inset-bottom, 0));
      max-height: 70vh;
      overflow-y: auto;
      animation: slideUp 0.2s ease-out;
    }

    .sheet-handle {
      width: 36px;
      height: 4px;
      background: var(--tune-text-muted);
      border-radius: 2px;
      margin: 4px auto 12px;
    }

    .sheet-title {
      font-family: var(--font-body);
      font-size: 16px;
      font-weight: 600;
      color: var(--tune-text);
      padding: 0 16px 12px;
    }

    .sheet-item {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 12px 20px;
      background: none;
      border: none;
      color: var(--tune-text-secondary);
      font-family: var(--font-body);
      font-size: 15px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .sheet-item.active { color: var(--tune-accent); }
    .sheet-item-label { flex: 1; text-align: left; }
    .check { margin-left: auto; }

    .sheet-badge-update {
      background: #dc2626;
      color: white;
      border-radius: 999px;
      padding: 0.1rem 0.5rem;
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.03em;
    }

    @keyframes slideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  }

  /* Tablet: zone selector dans la sidebar collapsée — tab bar caché */
  @media (min-width: 769px) and (max-width: 1024px) {
    .overlay {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 200;
      background: rgba(0, 0, 0, 0.5);
    }

    .sheet {
      display: block;
      position: fixed;
      bottom: 50%;
      left: 50%;
      transform: translate(-50%, 50%);
      z-index: 201;
      background: var(--tune-surface);
      border-radius: 12px;
      padding: 16px 0;
      min-width: 300px;
      max-height: 60vh;
      overflow-y: auto;
    }

    .sheet-handle { display: none; }
    .sheet-title {
      font-family: var(--font-body);
      font-size: 16px;
      font-weight: 600;
      color: var(--tune-text);
      padding: 0 16px 12px;
    }
    .sheet-item {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 10px 20px;
      background: none;
      border: none;
      color: var(--tune-text-secondary);
      font-family: var(--font-body);
      font-size: 14px;
      cursor: pointer;
    }
    .sheet-item.active { color: var(--tune-accent); }
    .sheet-item-label { flex: 1; text-align: left; }
    .check { margin-left: auto; }
  }
</style>

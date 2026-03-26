<script lang="ts">
  import { activeView, type View } from '../lib/stores/navigation';
  import { t } from '../lib/i18n';

  const tabs: { view: View; label: string; path: string }[] = [
    { view: 'home', label: 'nav.home', path: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
    { view: 'library', label: 'nav.library', path: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z' },
    { view: 'search', label: 'nav.search', path: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
    { view: 'streaming', label: 'nav.services', path: 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z' },
    { view: 'settings', label: 'nav.settings', path: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  ];

  function navigate(view: View) {
    activeView.set(view);
  }
</script>

<nav class="bottom-tab-bar">
  {#each tabs as tab}
    <button
      class="tab"
      class:active={$activeView === tab.view}
      onclick={() => navigate(tab.view)}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d={tab.path} />
      </svg>
      <span>{$t(tab.label)}</span>
    </button>
  {/each}
</nav>

<style>
  .bottom-tab-bar {
    display: none;
  }

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
      padding: 6px 0;
      -webkit-tap-highlight-color: transparent;
    }

    .tab svg {
      width: 22px;
      height: 22px;
    }

    .tab.active {
      color: var(--tune-accent);
    }
  }
</style>

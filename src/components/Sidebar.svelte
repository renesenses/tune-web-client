<script lang="ts">
  import { zones, currentZoneId } from '../lib/stores/zones';
  import { connectionState } from '../lib/stores/connection';
  import { activeView, type View } from '../lib/stores/navigation';

  function handleSelectZone(zoneId: number) {
    currentZoneId.set(zoneId);
  }

  function navigate(view: View) {
    activeView.set(view);
  }

  function stateIcon(state: string): string {
    switch (state) {
      case 'connected': return '\u25CF';
      case 'connecting': return '\u25D0';
      default: return '\u25CB';
    }
  }

  function stateColor(state: string): string {
    switch (state) {
      case 'connected': return 'var(--tune-success)';
      case 'connecting': return 'var(--tune-warning)';
      default: return 'var(--tune-text-muted)';
    }
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <h1 class="logo">Tune</h1>
    <div class="connection-status">
      <span class="state-dot" style="color: {stateColor($connectionState)}">
        {stateIcon($connectionState)}
      </span>
      <span class="state-text truncate">{$connectionState}</span>
    </div>
  </div>

  <nav class="nav-section">
    <span class="section-label">NAVIGATION</span>
    <button class="nav-item" class:active={$activeView === 'nowplaying'} onclick={() => navigate('nowplaying')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
      Lecture en cours
    </button>
    <button class="nav-item" class:active={$activeView === 'library'} onclick={() => navigate('library')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
      Bibliotheque
    </button>
    <button class="nav-item" class:active={$activeView === 'queue'} onclick={() => navigate('queue')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
      File d'attente
    </button>
    <button class="nav-item" class:active={$activeView === 'playlists'} onclick={() => navigate('playlists')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
      Playlists
    </button>
    <button class="nav-item" class:active={$activeView === 'search'} onclick={() => navigate('search')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      Recherche
    </button>
    <button class="nav-item" class:active={$activeView === 'settings'} onclick={() => navigate('settings')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
      Parametres
    </button>
  </nav>

  <div class="zones-section">
    <span class="section-label">ZONES</span>
    <div class="zones-list">
      {#each $zones as zone}
        <button
          class="zone-item"
          class:active={zone.id === $currentZoneId}
          onclick={() => zone.id !== null && handleSelectZone(zone.id)}
        >
          <span class="zone-name truncate">{zone.name}</span>
          {#if zone.state === 'playing'}
            <span class="zone-playing">
              <svg viewBox="0 0 10 12" fill="currentColor" width="10" height="12"><polygon points="0,0 10,6 0,12" /></svg>
            </span>
          {/if}
        </button>
      {/each}
      {#if $zones.length === 0}
        <div class="empty-state">Aucune zone</div>
      {/if}
    </div>
  </div>
</aside>

<style>
  .sidebar {
    grid-column: 1;
    grid-row: 1 / 3;
    background: var(--tune-surface);
    border-right: 1px solid var(--tune-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    padding: var(--space-lg) 18px;
    border-bottom: 1px solid var(--tune-border);
  }

  .logo {
    font-family: var(--font-label);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.5px;
    color: var(--tune-text);
    margin-bottom: var(--space-xs);
  }

  .connection-status {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }

  .state-dot {
    font-size: 10px;
  }

  .state-text {
    max-width: 180px;
  }

  .section-label {
    display: block;
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--tune-text-muted);
    padding: 0 18px;
    margin-bottom: 6px;
  }

  .nav-section {
    padding: var(--space-md) 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 7px 18px;
    background: none;
    border: none;
    border-radius: 0;
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: all 0.12s ease-out;
  }

  .nav-item:hover {
    background: var(--tune-surface-hover);
    color: var(--tune-text);
  }

  .nav-item.active {
    background: var(--tune-surface-selected);
    color: var(--tune-text);
  }

  .nav-item svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    opacity: 0.8;
  }

  .zones-section {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md) 0;
  }

  .zones-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .zone-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 18px;
    background: none;
    border: none;
    border-radius: 0;
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: all 0.12s ease-out;
  }

  .zone-item:hover {
    background: var(--tune-surface-hover);
    color: var(--tune-text);
  }

  .zone-item.active {
    background: var(--tune-surface-selected);
    color: var(--tune-text);
  }

  .zone-name {
    flex: 1;
  }

  .zone-playing {
    color: var(--tune-success);
    font-size: 10px;
    display: flex;
    align-items: center;
  }

  .zone-playing svg {
    width: 10px;
    height: 10px;
  }

  .empty-state {
    padding: var(--space-md) 18px;
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 13px;
  }

  @media (max-width: 768px) {
    .sidebar {
      display: none;
    }
  }
</style>

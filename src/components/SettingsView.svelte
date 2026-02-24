<script lang="ts">
  import * as api from '../lib/api';
  import type { SystemHealth, SystemStats, StreamingServiceStatus } from '../lib/types';

  let health: SystemHealth | null = $state(null);
  let stats: SystemStats | null = $state(null);
  let streamingServices: Record<string, StreamingServiceStatus> = $state({});
  let scanning = $state(false);
  let loading = $state(true);

  async function loadAll() {
    loading = true;
    try {
      const [h, s, ss, sc] = await Promise.all([
        api.getHealth(),
        api.getStats(),
        api.getStreamingServices().catch(() => ({})),
        api.getScanStatus().catch(() => ({ scanning: false })),
      ]);
      health = h;
      stats = s;
      streamingServices = ss as Record<string, StreamingServiceStatus>;
      scanning = sc.scanning;
    } catch (e) {
      console.error('Settings load error:', e);
    }
    loading = false;
  }

  async function handleScan() {
    scanning = true;
    try {
      await api.triggerScan();
    } catch (e) {
      console.error('Scan error:', e);
      scanning = false;
    }
  }

  $effect(() => {
    loadAll();
  });
</script>

<div class="settings-view">
  <h2>Parametres</h2>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      Chargement...
    </div>
  {:else}
    <!-- Server health -->
    <section class="settings-section">
      <h3>Sante du serveur</h3>
      {#if health}
        <div class="health-status" class:ok={health.status === 'ok'} class:degraded={health.status === 'degraded'}>
          <span class="health-dot"></span>
          {health.status === 'ok' ? 'Operationnel' : 'Degrade'}
        </div>
        <div class="component-list">
          {#each Object.entries(health.components) as [name, ok]}
            <div class="component-item">
              <span class="component-name">{name}</span>
              <span class="component-status" class:ok={ok} class:error={!ok}>{ok ? 'OK' : 'Erreur'}</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Library stats -->
    <section class="settings-section">
      <h3>Bibliotheque</h3>
      {#if stats}
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-value">{stats.tracks}</span>
            <span class="stat-label">Pistes</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{stats.albums}</span>
            <span class="stat-label">Albums</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{stats.artists}</span>
            <span class="stat-label">Artistes</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{stats.zones}</span>
            <span class="stat-label">Zones</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{stats.devices}</span>
            <span class="stat-label">Appareils</span>
          </div>
        </div>
      {/if}

      <button class="scan-btn" onclick={handleScan} disabled={scanning}>
        {#if scanning}
          <div class="spinner small"></div>
          Scan en cours...
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Scanner la bibliotheque
        {/if}
      </button>
    </section>

    <!-- Streaming services -->
    <section class="settings-section">
      <h3>Services de streaming</h3>
      {#if Object.keys(streamingServices).length === 0}
        <p class="muted">Aucun service configure</p>
      {:else}
        <div class="service-list">
          {#each Object.entries(streamingServices) as [name, status]}
            <div class="service-item">
              <span class="service-name">{name.charAt(0).toUpperCase() + name.slice(1)}</span>
              <div class="service-badges">
                <span class="badge" class:enabled={status.enabled} class:disabled={!status.enabled}>
                  {status.enabled ? 'Active' : 'Desactive'}
                </span>
                {#if status.enabled}
                  <span class="badge" class:auth={status.authenticated} class:noauth={!status.authenticated}>
                    {status.authenticated ? 'Connecte' : 'Non connecte'}
                  </span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .settings-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
    gap: var(--space-lg);
  }

  .settings-view > h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  .settings-section {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
  }

  .settings-section h3 {
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
    margin-bottom: var(--space-md);
  }

  .health-status {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-body);
    font-size: 14px;
    margin-bottom: var(--space-md);
  }

  .health-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .health-status.ok .health-dot {
    background: var(--tune-success);
  }

  .health-status.degraded .health-dot {
    background: var(--tune-warning);
  }

  .component-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .component-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-xs) 0;
    font-family: var(--font-body);
    font-size: 13px;
  }

  .component-name {
    color: var(--tune-text-secondary);
    text-transform: capitalize;
  }

  .component-status.ok {
    color: var(--tune-success);
  }

  .component-status.error {
    color: var(--tune-warning);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
  }

  .stat-value {
    font-family: var(--font-label);
    font-size: 24px;
    font-weight: 600;
    color: var(--tune-text);
  }

  .stat-label {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }

  .scan-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-lg);
    background: var(--tune-grey2);
    color: var(--tune-text);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 14px;
    transition: all 0.12s ease-out;
  }

  .scan-btn:hover:not(:disabled) {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .scan-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .service-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .service-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-sm) 0;
  }

  .service-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
  }

  .service-badges {
    display: flex;
    gap: var(--space-sm);
  }

  .badge {
    font-family: var(--font-label);
    font-size: 11px;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
  }

  .badge.enabled {
    background: rgba(87, 198, 185, 0.15);
    color: var(--tune-success);
  }

  .badge.disabled {
    background: rgba(102, 102, 102, 0.15);
    color: var(--tune-text-muted);
  }

  .badge.auth {
    background: rgba(87, 198, 185, 0.15);
    color: var(--tune-success);
  }

  .badge.noauth {
    background: rgba(201, 84, 75, 0.15);
    color: var(--tune-warning);
  }

  .muted {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
  }

  .loading {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    padding: var(--space-xl);
    justify-content: center;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner.small {
    width: 14px;
    height: 14px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>

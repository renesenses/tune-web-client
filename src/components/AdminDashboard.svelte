<script lang="ts">
  import { onDestroy } from 'svelte';
  import * as api from '../lib/api';
  import type { AdminHealth, AdminZone, AdminError, AdminConnections, AdminDiscovery } from '../lib/api';

  let health = $state<AdminHealth | null>(null);
  let zones = $state<AdminZone[]>([]);
  let errors = $state<AdminError[]>([]);
  let connections = $state<AdminConnections | null>(null);
  let discovery = $state<AdminDiscovery | null>(null);
  let loading = $state(true);
  let lastRefresh = $state<string>('');

  async function fetchAll() {
    try {
      const [h, z, e, c, d] = await Promise.all([
        api.getAdminHealth(),
        api.getAdminZones(),
        api.getAdminErrors(),
        api.getAdminConnections(),
        api.getAdminDiscovery(),
      ]);
      health = h;
      zones = z;
      errors = e;
      connections = c;
      discovery = d;
      lastRefresh = new Date().toLocaleTimeString();
    } catch (err) {
      console.error('Admin dashboard fetch error:', err);
    } finally {
      loading = false;
    }
  }

  fetchAll();
  const interval = setInterval(fetchAll, 5000);
  onDestroy(() => clearInterval(interval));

  function stateColor(state: string): string {
    switch (state) {
      case 'playing': return 'var(--tune-success, #22c55e)';
      case 'paused': return 'var(--tune-warning, #f59e0b)';
      case 'stopped': return 'var(--tune-text-secondary, #888)';
      default: return 'var(--tune-text-secondary, #888)';
    }
  }

  function levelColor(level: string): string {
    switch (level) {
      case 'critical':
      case 'error':
      case 'exception': return '#ef4444';
      case 'warning': return '#f59e0b';
      default: return 'var(--tune-text-secondary, #888)';
    }
  }

  function formatTs(ts: string): string {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString() + ' ' + d.toLocaleDateString();
    } catch {
      return ts;
    }
  }

  function cpuBarColor(pct: number): string {
    if (pct > 80) return '#ef4444';
    if (pct > 50) return '#f59e0b';
    return 'var(--tune-accent, #6366f1)';
  }

  function ramPercent(h: AdminHealth): number {
    if (!h.ram_total_mb) return 0;
    return Math.round((h.ram_mb / h.ram_total_mb) * 100);
  }

  function diskPercent(h: AdminHealth): number {
    if (!h.disk_total_gb) return 0;
    return Math.round(((h.disk_total_gb - h.disk_free_gb) / h.disk_total_gb) * 100);
  }
</script>

<div class="admin-dashboard">
  <div class="admin-header">
    <h2>Admin Dashboard</h2>
    <span class="last-refresh">
      {#if loading}Loading...{:else}Updated {lastRefresh}{/if}
    </span>
  </div>

  {#if health}
    <!-- System Health Card -->
    <div class="card-grid">
      <div class="card system-card">
        <h3>System</h3>
        <div class="stat-grid">
          <div class="stat-item">
            <span class="stat-label">CPU</span>
            <div class="bar-wrapper">
              <div class="bar" style="width: {Math.min(health.cpu_percent, 100)}%; background: {cpuBarColor(health.cpu_percent)}"></div>
            </div>
            <span class="stat-value">{health.cpu_percent}%</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">RAM</span>
            <div class="bar-wrapper">
              <div class="bar" style="width: {ramPercent(health)}%; background: var(--tune-accent, #6366f1)"></div>
            </div>
            <span class="stat-value">{health.ram_mb} / {health.ram_total_mb} MB</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">Disk</span>
            <div class="bar-wrapper">
              <div class="bar" style="width: {diskPercent(health)}%; background: {diskPercent(health) > 90 ? '#ef4444' : 'var(--tune-accent, #6366f1)'}"></div>
            </div>
            <span class="stat-value">{health.disk_free_gb} GB free / {health.disk_total_gb} GB</span>
          </div>

          <div class="stat-row">
            <div class="stat-pill">
              <span class="pill-label">Uptime</span>
              <span class="pill-value">{health.uptime_formatted}</span>
            </div>
            <div class="stat-pill">
              <span class="pill-label">Open FDs</span>
              <span class="pill-value">{health.open_fds}</span>
            </div>
            <div class="stat-pill">
              <span class="pill-label">PID</span>
              <span class="pill-value">{health.pid}</span>
            </div>
            <div class="stat-pill">
              <span class="pill-label">Threads</span>
              <span class="pill-value">{health.python_threads}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Connections Card -->
      {#if connections}
        <div class="card connections-card">
          <h3>Connections</h3>
          <div class="conn-grid">
            <div class="conn-item">
              <span class="conn-value">{connections.websocket_connections}</span>
              <span class="conn-label">WebSocket</span>
            </div>
            <div class="conn-item">
              <span class="conn-value">{connections.http_streamer_sessions}</span>
              <span class="conn-label">HTTP Streams</span>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Zones Card -->
    <div class="card zones-card">
      <h3>Zones ({zones.length})</h3>
      {#if zones.length === 0}
        <p class="empty">No zones configured</p>
      {:else}
        <div class="zones-table">
          <div class="zone-header-row">
            <span>Name</span>
            <span>State</span>
            <span>Output</span>
            <span>Device</span>
            <span>Track</span>
            <span>Volume</span>
          </div>
          {#each zones as zone}
            <div class="zone-row" class:offline={!zone.online}>
              <span class="zone-name">{zone.name}</span>
              <span class="zone-state">
                <span class="state-dot" style="background: {stateColor(zone.state)}"></span>
                {zone.state}
              </span>
              <span class="zone-output">{zone.output_type}</span>
              <span class="zone-device truncate">{zone.device_name}</span>
              <span class="zone-track truncate">
                {#if zone.current_track}
                  {zone.current_track.title} - {zone.current_track.artist_name}
                {:else}
                  <span class="muted">--</span>
                {/if}
              </span>
              <span class="zone-volume">{Math.round(zone.volume * 100)}%</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Discovery Card -->
    {#if discovery}
      <div class="card discovery-card">
        <h3>Discovery ({discovery.device_count} devices)</h3>
        <div class="protocol-tags">
          {#each Object.entries(discovery.protocols) as [proto, active]}
            <span class="proto-tag" class:active={active} class:inactive={!active}>
              {proto.toUpperCase()}
            </span>
          {/each}
        </div>
        {#if discovery.devices.length > 0}
          <div class="discovery-table">
            <div class="disc-header-row">
              <span>Name</span>
              <span>Type</span>
              <span>Host</span>
              <span>Port</span>
              <span>Status</span>
            </div>
            {#each discovery.devices as dev}
              <div class="disc-row">
                <span class="truncate">{dev.name}</span>
                <span class="disc-type">{dev.type}</span>
                <span class="disc-host">{dev.host}</span>
                <span>{dev.port}</span>
                <span>
                  <span class="state-dot" style="background: {dev.available ? 'var(--tune-success, #22c55e)' : '#ef4444'}"></span>
                  {dev.available ? 'Online' : 'Offline'}
                </span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="empty">No devices discovered</p>
        {/if}
      </div>
    {/if}

    <!-- Errors Card -->
    <div class="card errors-card">
      <h3>Recent Errors ({errors.length})</h3>
      {#if errors.length === 0}
        <p class="empty">No recent errors</p>
      {:else}
        <div class="errors-log">
          {#each errors as err}
            <div class="error-row">
              <span class="error-time">{formatTs(err.ts)}</span>
              <span class="error-level" style="color: {levelColor(err.level)}">{err.level.toUpperCase()}</span>
              <span class="error-event">{err.event}</span>
              <span class="error-details truncate">
                {#each Object.entries(err).filter(([k]) => !['ts', 'level', 'event'].includes(k)) as [key, val]}
                  <span class="detail-chip">{key}={val}</span>
                {/each}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else if !loading}
    <p class="empty">Unable to load dashboard data</p>
  {/if}
</div>

<style>
  .admin-dashboard {
    padding: 1.5rem;
    max-width: 1400px;
    margin: 0 auto;
    color: var(--tune-text, #e0e0e0);
  }

  .admin-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
  }

  .admin-header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .last-refresh {
    font-size: 0.8rem;
    color: var(--tune-text-secondary, #888);
  }

  .card-grid {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .card {
    background: var(--tune-card-bg, #1e1e2e);
    border-radius: 12px;
    padding: 1.25rem;
    border: 1px solid var(--tune-border, #333);
  }

  .card h3 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--tune-text, #e0e0e0);
  }

  /* System stats */
  .stat-grid {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .stat-item {
    display: grid;
    grid-template-columns: 50px 1fr 140px;
    align-items: center;
    gap: 0.75rem;
  }

  .stat-label {
    font-size: 0.8rem;
    color: var(--tune-text-secondary, #888);
    font-weight: 500;
  }

  .stat-value {
    font-size: 0.8rem;
    text-align: right;
    color: var(--tune-text-secondary, #aaa);
  }

  .bar-wrapper {
    height: 8px;
    background: var(--tune-bg-secondary, #2a2a3e);
    border-radius: 4px;
    overflow: hidden;
  }

  .bar {
    height: 100%;
    border-radius: 4px;
    transition: width 0.5s ease;
  }

  .stat-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .stat-pill {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: var(--tune-bg-secondary, #2a2a3e);
    padding: 0.3rem 0.6rem;
    border-radius: 6px;
    font-size: 0.75rem;
  }

  .pill-label {
    color: var(--tune-text-secondary, #888);
  }

  .pill-value {
    font-weight: 600;
    color: var(--tune-text, #e0e0e0);
  }

  /* Connections */
  .conn-grid {
    display: flex;
    gap: 2rem;
    justify-content: center;
    padding: 1rem 0;
  }

  .conn-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
  }

  .conn-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--tune-accent, #6366f1);
  }

  .conn-label {
    font-size: 0.8rem;
    color: var(--tune-text-secondary, #888);
  }

  /* Zones table */
  .zones-table {
    overflow-x: auto;
  }

  .zone-header-row, .zone-row {
    display: grid;
    grid-template-columns: 150px 90px 80px 150px 1fr 60px;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    align-items: center;
    font-size: 0.85rem;
  }

  .zone-header-row {
    font-weight: 600;
    color: var(--tune-text-secondary, #888);
    font-size: 0.75rem;
    text-transform: uppercase;
    border-bottom: 1px solid var(--tune-border, #333);
  }

  .zone-row {
    border-bottom: 1px solid var(--tune-border, rgba(255,255,255,0.05));
  }

  .zone-row.offline {
    opacity: 0.5;
  }

  .zone-row:last-child {
    border-bottom: none;
  }

  .zone-name {
    font-weight: 500;
  }

  .zone-state {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .state-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .muted {
    color: var(--tune-text-secondary, #666);
  }

  /* Discovery */
  .protocol-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 1rem;
  }

  .proto-tag {
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
  }

  .proto-tag.active {
    background: var(--tune-accent, #6366f1);
    color: white;
  }

  .proto-tag.inactive {
    background: var(--tune-bg-secondary, #2a2a3e);
    color: var(--tune-text-secondary, #666);
  }

  .discovery-table {
    overflow-x: auto;
  }

  .disc-header-row, .disc-row {
    display: grid;
    grid-template-columns: 1fr 80px 140px 60px 100px;
    gap: 0.5rem;
    padding: 0.4rem 0.75rem;
    align-items: center;
    font-size: 0.85rem;
  }

  .disc-header-row {
    font-weight: 600;
    color: var(--tune-text-secondary, #888);
    font-size: 0.75rem;
    text-transform: uppercase;
    border-bottom: 1px solid var(--tune-border, #333);
  }

  .disc-row {
    border-bottom: 1px solid var(--tune-border, rgba(255,255,255,0.05));
  }

  .disc-row:last-child {
    border-bottom: none;
  }

  .disc-type {
    text-transform: uppercase;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--tune-accent, #6366f1);
  }

  .disc-host {
    font-family: monospace;
    font-size: 0.8rem;
  }

  /* Errors log */
  .errors-log {
    max-height: 400px;
    overflow-y: auto;
  }

  .error-row {
    display: grid;
    grid-template-columns: 160px 70px 200px 1fr;
    gap: 0.5rem;
    padding: 0.4rem 0.75rem;
    align-items: center;
    font-size: 0.8rem;
    border-bottom: 1px solid var(--tune-border, rgba(255,255,255,0.05));
  }

  .error-row:last-child {
    border-bottom: none;
  }

  .error-time {
    font-family: monospace;
    font-size: 0.75rem;
    color: var(--tune-text-secondary, #888);
  }

  .error-level {
    font-weight: 700;
    font-size: 0.7rem;
    text-transform: uppercase;
  }

  .error-event {
    font-weight: 500;
  }

  .error-details {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .detail-chip {
    background: var(--tune-bg-secondary, #2a2a3e);
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    font-size: 0.7rem;
    color: var(--tune-text-secondary, #aaa);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty {
    color: var(--tune-text-secondary, #666);
    font-style: italic;
    text-align: center;
    padding: 2rem 0;
  }

  /* Responsive */
  @media (max-width: 900px) {
    .card-grid {
      grid-template-columns: 1fr;
    }

    .zone-header-row, .zone-row {
      grid-template-columns: 120px 80px 70px 1fr;
    }

    .zone-header-row span:nth-child(4),
    .zone-row span:nth-child(4),
    .zone-header-row span:nth-child(6),
    .zone-row span:nth-child(6) {
      display: none;
    }

    .error-row {
      grid-template-columns: 120px 60px 1fr;
    }

    .error-details {
      display: none;
    }

    .disc-header-row, .disc-row {
      grid-template-columns: 1fr 70px 110px 80px;
    }

    .disc-header-row span:nth-child(4),
    .disc-row span:nth-child(4) {
      display: none;
    }
  }

  @media (max-width: 600px) {
    .admin-dashboard {
      padding: 1rem;
    }

    .stat-item {
      grid-template-columns: 40px 1fr;
    }

    .stat-value {
      display: none;
    }
  }
</style>

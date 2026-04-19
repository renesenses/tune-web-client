<script lang="ts">
  import { untrack } from 'svelte';
  import * as api from '../lib/api';
  import { zones } from '../lib/stores/zones';
  import { devices } from '../lib/stores/devices';
  import { connectionState } from '../lib/stores/connection';
  import { streamingServices as streamingServicesStore } from '../lib/stores/streaming';
  import { t } from '../lib/i18n';
  import type { SystemHealth, SystemStats, SystemConfig, StreamingServiceStatus } from '../lib/types';

  const CLIENT_VERSION = __APP_VERSION__;

  let loading = $state(true);
  let refreshing = $state(false);
  let copied = $state(false);

  let serverVersion = $state<string | null>(null);
  let health = $state<SystemHealth | null>(null);
  let stats = $state<SystemStats | null>(null);
  let config = $state<SystemConfig | null>(null);
  let dbStatus = $state<any>(null);

  async function fetchServerVersion() {
    try {
      const res = await fetch('/');
      const data = await res.json();
      serverVersion = data.version ?? null;
    } catch {
      serverVersion = null;
    }
  }

  async function loadAll() {
    try {
      const [h, s, cfg, db, ss] = await Promise.all([
        api.getHealth().catch(() => null),
        api.getStats().catch(() => null),
        api.getConfig().catch(() => null),
        api.getDatabaseStatus().catch(() => null),
        api.getStreamingServices().catch(() => ({})),
      ]);
      health = h;
      stats = s;
      config = cfg;
      dbStatus = db;
      streamingServicesStore.set(ss as Record<string, StreamingServiceStatus>);
    } catch (e) {
      console.error('Diagnostics load error:', e);
    }
  }

  async function refresh() {
    refreshing = true;
    await Promise.all([fetchServerVersion(), loadAll()]);
    refreshing = false;
  }

  $effect(() => {
    untrack(() => {
      loading = true;
      Promise.all([fetchServerVersion(), loadAll()]).then(() => {
        loading = false;
      });
    });
  });

  function formatUptime(db: any): string | null {
    // No uptime endpoint exists; return null
    return null;
  }

  function buildDiagnosticsText(): string {
    const lines: string[] = [];
    const now = new Date().toISOString();
    lines.push(`Tune Diagnostics Report — ${now}`);
    lines.push('='.repeat(50));

    // Versions
    lines.push('');
    lines.push('## Versions');
    lines.push(`Client: ${CLIENT_VERSION}`);
    lines.push(`Server: ${serverVersion ?? 'unknown'}`);

    // Connection
    lines.push('');
    lines.push('## Connection');
    lines.push(`WebSocket: ${$connectionState}`);

    // System Health
    if (health) {
      lines.push('');
      lines.push('## System Health');
      lines.push(`Status: ${health.status}`);
      for (const [name, ok] of Object.entries(health.components)) {
        lines.push(`  ${name}: ${ok ? 'OK' : 'ERROR'}`);
      }
    }

    // Database
    if (dbStatus) {
      lines.push('');
      lines.push('## Database');
      lines.push(`Engine: ${dbStatus.engine}`);
      lines.push(`Connected: ${dbStatus.connected ? 'Yes' : 'No'}`);
      if (dbStatus.size_mb !== undefined) lines.push(`Size: ${dbStatus.size_mb} MB`);
      if (dbStatus.path) lines.push(`Path: ${dbStatus.path}`);
      if (dbStatus.stats) {
        for (const [table, count] of Object.entries(dbStatus.stats)) {
          lines.push(`  ${table}: ${count}`);
        }
      }
    }

    // Library Stats
    if (stats) {
      lines.push('');
      lines.push('## Library');
      lines.push(`Tracks: ${stats.tracks}`);
      lines.push(`Albums: ${stats.albums}`);
      lines.push(`Artists: ${stats.artists}`);
    }

    // Streaming Services
    const services = $streamingServicesStore;
    if (services && Object.keys(services).length > 0) {
      lines.push('');
      lines.push('## Streaming Services');
      for (const [name, svc] of Object.entries(services)) {
        const status = !svc.enabled ? 'disabled' : svc.authenticated ? 'connected' : 'enabled (not authenticated)';
        lines.push(`  ${name}: ${status}`);
      }
    }

    // Zones
    const zoneList = $zones;
    if (zoneList.length > 0) {
      lines.push('');
      lines.push('## Zones');
      for (const z of zoneList) {
        const track = z.current_track ? `${z.current_track.artist_name ?? '?'} - ${z.current_track.title}` : 'none';
        lines.push(`  ${z.name} [${z.output_type ?? 'local'}] — ${z.state} — vol: ${Math.round((z.volume ?? 0) * 100)}% — track: ${track}`);
      }
    }

    // Devices
    const deviceList = $devices;
    if (deviceList.length > 0) {
      lines.push('');
      lines.push('## Devices');
      for (const d of deviceList) {
        lines.push(`  ${d.name} [${d.type}] — ${d.available ? 'online' : 'offline'}${d.host ? ` — ${d.host}` : ''}`);
      }
    }

    lines.push('');
    lines.push('='.repeat(50));
    return lines.join('\n');
  }

  async function copyDiagnostics() {
    const text = buildDiagnosticsText();
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  }

  function streamingLabel(name: string): string {
    const labels: Record<string, string> = {
      tidal: 'TIDAL',
      qobuz: 'Qobuz',
      youtube: 'YouTube',
      amazon: 'Amazon',
      spotify: 'Spotify',
      deezer: 'Deezer',
    };
    return labels[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
  }
</script>

<div class="diagnostics-view">
  <div class="diagnostics-header">
    <h2>{$t('diagnostics.title')}</h2>
    <div class="header-actions">
      <button class="action-btn" onclick={refresh} disabled={refreshing}>
        {#if refreshing}
          <div class="spinner small"></div>
          {$t('diagnostics.refreshing')}
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          {$t('diagnostics.refresh')}
        {/if}
      </button>
      <button class="action-btn copy-btn" onclick={copyDiagnostics}>
        {#if copied}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {$t('diagnostics.copied')}
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {$t('diagnostics.copyDiagnostics')}
        {/if}
      </button>
    </div>
  </div>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      {$t('common.loading')}
    </div>
  {:else}
    <!-- Versions & Connection -->
    <section class="diag-section">
      <h3>{$t('diagnostics.serverInfo')}</h3>
      <div class="info-grid">
        <div class="info-row">
          <span class="info-label">{$t('diagnostics.clientVersion')}</span>
          <span class="info-value mono">{CLIENT_VERSION}</span>
        </div>
        <div class="info-row">
          <span class="info-label">{$t('diagnostics.serverVersion')}</span>
          <span class="info-value mono">{serverVersion ?? '...'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">{$t('diagnostics.connection')}</span>
          <span class="info-value">
            <span class="status-badge" class:ok={$connectionState === 'connected'} class:warn={$connectionState === 'connecting'} class:error={$connectionState === 'disconnected'}>
              {$connectionState}
            </span>
          </span>
        </div>
      </div>
    </section>

    <!-- System Health -->
    {#if health}
      <section class="diag-section">
        <h3>{$t('diagnostics.systemHealth')}</h3>
        <div class="health-banner" class:ok={health.status === 'ok'} class:degraded={health.status === 'degraded'}>
          <span class="health-dot"></span>
          {health.status === 'ok' ? $t('settings.operational') : $t('settings.degraded')}
        </div>
        <div class="component-grid">
          {#each Object.entries(health.components) as [name, ok]}
            <div class="component-row">
              <span class="component-name">{name}</span>
              <span class="status-badge" class:ok={ok} class:error={!ok}>
                {ok ? $t('common.ok') : $t('common.error')}
              </span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Database -->
    {#if dbStatus}
      <section class="diag-section">
        <h3>{$t('diagnostics.database')}</h3>
        <div class="info-grid">
          <div class="info-row">
            <span class="info-label">{$t('diagnostics.dbEngine')}</span>
            <span class="info-value">
              <span class="engine-badge" class:sqlite={dbStatus.engine === 'sqlite'} class:postgres={dbStatus.engine === 'postgres'}>
                {dbStatus.engine === 'sqlite' ? 'SQLite' : dbStatus.engine === 'postgres' ? 'PostgreSQL' : dbStatus.engine}
              </span>
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">{$t('diagnostics.dbConnected')}</span>
            <span class="info-value">
              <span class="status-badge" class:ok={dbStatus.connected} class:error={!dbStatus.connected}>
                {dbStatus.connected ? $t('diagnostics.yes') : $t('diagnostics.no')}
              </span>
            </span>
          </div>
          {#if dbStatus.size_mb !== undefined}
            <div class="info-row">
              <span class="info-label">{$t('diagnostics.dbSize')}</span>
              <span class="info-value mono">{dbStatus.size_mb} MB</span>
            </div>
          {/if}
          {#if dbStatus.path}
            <div class="info-row">
              <span class="info-label">Path</span>
              <span class="info-value mono path">{dbStatus.path}</span>
            </div>
          {/if}
        </div>
        {#if dbStatus.stats}
          <div class="db-stats-grid">
            {#each Object.entries(dbStatus.stats) as [table, count]}
              <div class="db-stat-item">
                <span class="db-stat-value">{count}</span>
                <span class="db-stat-label">{table}</span>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <!-- Library Stats -->
    {#if stats}
      <section class="diag-section">
        <h3>{$t('diagnostics.libraryStats')}</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-value">{stats.tracks.toLocaleString()}</span>
            <span class="stat-label">{$t('diagnostics.tracks')}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{stats.albums.toLocaleString()}</span>
            <span class="stat-label">{$t('diagnostics.albums')}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{stats.artists.toLocaleString()}</span>
            <span class="stat-label">{$t('diagnostics.artists')}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{stats.zones}</span>
            <span class="stat-label">Zones</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{stats.devices}</span>
            <span class="stat-label">{$t('diagnostics.connectedDevices')}</span>
          </div>
        </div>
      </section>
    {/if}

    <!-- Streaming Services -->
    {#if Object.keys($streamingServicesStore).length > 0}
      <section class="diag-section">
        <h3>{$t('diagnostics.streamingServices')}</h3>
        <div class="services-grid">
          {#each Object.entries($streamingServicesStore) as [name, svc]}
            <div class="service-row">
              <span class="service-name">{streamingLabel(name)}</span>
              <div class="service-badges">
                {#if !svc.enabled}
                  <span class="status-badge muted">{$t('diagnostics.disabled')}</span>
                {:else if svc.authenticated}
                  <span class="status-badge ok">{$t('settings.connected')}</span>
                {:else}
                  <span class="status-badge warn">{$t('diagnostics.enabled')}</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Active Zones -->
    <section class="diag-section">
      <h3>{$t('diagnostics.activeZones')}</h3>
      {#if $zones.length === 0}
        <p class="empty">{$t('diagnostics.noZones')}</p>
      {:else}
        <div class="zones-table">
          <div class="table-header">
            <span class="col-name">{$t('diagnostics.zoneName')}</span>
            <span class="col-output">{$t('diagnostics.zoneOutput')}</span>
            <span class="col-state">{$t('diagnostics.zoneState')}</span>
            <span class="col-volume">{$t('diagnostics.zoneVolume')}</span>
            <span class="col-track">{$t('diagnostics.zoneTrack')}</span>
          </div>
          {#each $zones as zone}
            <div class="table-row">
              <span class="col-name">{zone.name}</span>
              <span class="col-output">
                <span class="output-badge">{zone.output_type ?? 'local'}</span>
              </span>
              <span class="col-state">
                <span class="state-indicator" class:playing={zone.state === 'playing'} class:paused={zone.state === 'paused'} class:stopped={zone.state === 'stopped'}>
                  {zone.state}
                </span>
              </span>
              <span class="col-volume mono">{Math.round((zone.volume ?? 0) * 100)}%</span>
              <span class="col-track truncate">
                {#if zone.current_track}
                  {zone.current_track.artist_name ?? '?'} — {zone.current_track.title}
                {:else}
                  —
                {/if}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Connected Devices -->
    <section class="diag-section">
      <h3>{$t('diagnostics.connectedDevices')}</h3>
      {#if $devices.length === 0}
        <p class="empty">{$t('diagnostics.noDevices')}</p>
      {:else}
        <div class="devices-grid">
          {#each $devices as device}
            <div class="device-row">
              <span class="device-name">{device.name}</span>
              <span class="output-badge">{device.type}</span>
              <span class="status-badge" class:ok={device.available} class:error={!device.available}>
                {device.available ? 'online' : 'offline'}
              </span>
              {#if device.host}
                <span class="device-host mono">{device.host}</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .diagnostics-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
    gap: var(--space-lg);
  }

  .diagnostics-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-md);
  }

  .diagnostics-header h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
    margin: 0;
  }

  .header-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .action-btn {
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
    font-size: 13px;
    transition: all 0.12s ease-out;
  }

  .action-btn:hover:not(:disabled) {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .action-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .copy-btn {
    background: var(--tune-accent);
    color: white;
    border-color: var(--tune-accent);
  }

  .copy-btn:hover:not(:disabled) {
    opacity: 0.9;
    color: white;
    border-color: var(--tune-accent);
  }

  .diag-section {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
  }

  .diag-section h3 {
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 var(--space-md) 0;
  }

  /* Info grid */
  .info-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-xs) 0;
    font-family: var(--font-body);
    font-size: 13px;
  }

  .info-label {
    color: var(--tune-text-secondary);
  }

  .info-value {
    color: var(--tune-text);
    font-weight: 500;
  }

  .info-value.mono,
  .mono {
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 12px;
  }

  .info-value.path {
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
    color: var(--tune-text-muted);
  }

  /* Status badges */
  .status-badge {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    text-transform: capitalize;
  }

  .status-badge.ok {
    background: rgba(87, 198, 185, 0.15);
    color: var(--tune-success);
  }

  .status-badge.warn {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }

  .status-badge.error {
    background: rgba(201, 84, 75, 0.15);
    color: var(--tune-warning);
  }

  .status-badge.muted {
    background: rgba(102, 102, 102, 0.15);
    color: var(--tune-text-muted);
  }

  /* Engine badge */
  .engine-badge {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
  }

  .engine-badge.sqlite {
    background: rgba(87, 198, 185, 0.15);
    color: var(--tune-success);
  }

  .engine-badge.postgres {
    background: rgba(117, 116, 243, 0.15);
    color: var(--tune-accent);
  }

  /* Health */
  .health-banner {
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

  .health-banner.ok .health-dot {
    background: var(--tune-success);
  }

  .health-banner.degraded .health-dot {
    background: var(--tune-warning);
  }

  .component-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .component-row {
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

  /* DB stats */
  .db-stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: var(--space-md);
    margin-top: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--tune-border);
  }

  .db-stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .db-stat-value {
    font-family: var(--font-label);
    font-size: 18px;
    font-weight: 600;
    color: var(--tune-text);
  }

  .db-stat-label {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
    text-transform: capitalize;
  }

  /* Library stats */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: var(--space-md);
  }

  .stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-md);
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
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

  /* Services */
  .services-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .service-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-sm) 0;
    font-family: var(--font-body);
    font-size: 13px;
    border-bottom: 1px solid var(--tune-border);
  }

  .service-row:last-child {
    border-bottom: none;
  }

  .service-name {
    font-weight: 600;
    color: var(--tune-text);
  }

  .service-badges {
    display: flex;
    gap: var(--space-sm);
  }

  /* Zones table */
  .zones-table {
    display: flex;
    flex-direction: column;
    font-family: var(--font-body);
    font-size: 13px;
  }

  .table-header {
    display: grid;
    grid-template-columns: 1.5fr 0.8fr 0.8fr 0.6fr 2fr;
    gap: var(--space-sm);
    padding: var(--space-sm) 0;
    border-bottom: 1px solid var(--tune-border);
    color: var(--tune-text-muted);
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .table-row {
    display: grid;
    grid-template-columns: 1.5fr 0.8fr 0.8fr 0.6fr 2fr;
    gap: var(--space-sm);
    padding: var(--space-sm) 0;
    border-bottom: 1px solid var(--tune-border);
    align-items: center;
  }

  .table-row:last-child {
    border-bottom: none;
  }

  .col-name {
    font-weight: 500;
    color: var(--tune-text);
  }

  .col-track {
    color: var(--tune-text-secondary);
    font-size: 12px;
  }

  .output-badge {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tune-text-muted);
    background: var(--tune-bg);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
  }

  .state-indicator {
    font-size: 12px;
    font-weight: 500;
  }

  .state-indicator.playing {
    color: var(--tune-success);
  }

  .state-indicator.paused {
    color: #f59e0b;
  }

  .state-indicator.stopped {
    color: var(--tune-text-muted);
  }

  /* Devices */
  .devices-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .device-row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) 0;
    font-family: var(--font-body);
    font-size: 13px;
    border-bottom: 1px solid var(--tune-border);
  }

  .device-row:last-child {
    border-bottom: none;
  }

  .device-name {
    flex: 1;
    font-weight: 500;
    color: var(--tune-text);
  }

  .device-host {
    color: var(--tune-text-muted);
    font-size: 11px;
  }

  .empty {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-muted);
    margin: 0;
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
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

  /* Responsive */
  @media (max-width: 768px) {
    .diagnostics-view {
      padding: var(--space-md) var(--space-md);
    }

    .diagnostics-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .table-header,
    .table-row {
      grid-template-columns: 1fr 0.6fr 0.6fr;
    }

    .col-volume,
    .col-track {
      display: none;
    }

    .stats-grid {
      grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    }
  }
</style>

<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import * as api from '../lib/api';
  import { zones } from '../lib/stores/zones';
  import { devices } from '../lib/stores/devices';
  import { connectionState } from '../lib/stores/connection';
  import { streamingServices as streamingServicesStore } from '../lib/stores/streaming';
  import { t } from '../lib/i18n';
  import type { SystemHealth, SystemStats, SystemConfig, StreamingServiceStatus } from '../lib/types';

  // Guard: prevent $state writes after component teardown (async callbacks
  // that resolve after navigation away could otherwise trigger Svelte
  // reactivity on a destroyed component, blocking the render loop).
  let destroyed = false;
  onDestroy(() => { destroyed = true; });

  const CLIENT_VERSION = __APP_VERSION__;

  let loading = $state(true);
  let refreshing = $state(false);
  let copied = $state(false);

  let serverVersion = $state<string | null>(null);
  let health = $state<SystemHealth | null>(null);
  let stats = $state<SystemStats | null>(null);
  let config = $state<SystemConfig | null>(null);
  let dbStatus = $state<any>(null);

  // Server diagnostics dashboard
  // Field names match the actual server JSON response from /system/diagnostics.
  let serverDiag = $state<{
    server_version: string;
    uptime_seconds: number;
    active_zones: number;
    tracks_count: number;
    albums_count: number | null;
    artists_count: number | null;
    connectors: string[];
    memory_rss_mb: number | null;
    scan_status: {
      status: string;
      tracks: number;
      albums: number;
      last_result: Record<string, unknown> | null;
    } | null;
  } | null>(null);

  async function fetchServerVersion() {
    try {
      const data = await api.withTimeout(api.getHealth(), 8_000, 'health-version');
      if (destroyed) return;
      serverVersion = data?.version ?? null;
    } catch {
      if (!destroyed) serverVersion = null;
    }
  }

  async function loadAll() {
    const T = 8_000; // 8s timeout per call — prevents indefinite loading spinner
    try {
      // Load critical data first (health + server dashboard), then the rest
      const [h, sd] = await Promise.all([
        api.withTimeout(api.getHealth(), T, 'health').catch(() => null),
        api.withTimeout(api.getServerDiagnostics(), T, 'diagnostics').catch(() => null),
      ]);
      if (destroyed) return;
      health = h;
      serverDiag = sd;

      // Load remaining data in parallel
      const [s, cfg, db, ss] = await Promise.all([
        api.withTimeout(api.getStats(), T, 'stats').catch(() => null),
        api.withTimeout(api.getConfig(), T, 'config').catch(() => null),
        api.withTimeout(api.getDatabaseStatus(), T, 'db-status').catch(() => null),
        api.withTimeout(api.getStreamingServices(), T, 'streaming').catch(() => ({})),
      ]);
      if (destroyed) return;
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
    if (!destroyed) refreshing = false;
  }

  // Use onMount (not $effect) to load data exactly once on component
  // creation.  The previous $effect(() => { untrack(() => { ... }) })
  // could re-trigger on batch flushes in certain Svelte 5 runtime
  // versions, flooding the server with API calls and starving the main
  // thread so sidebar clicks were never processed (same class of bug as
  // the update-check loop fixed in v0.8.72).
  onMount(() => {
    loading = true;
    Promise.all([fetchServerVersion(), loadAll()]).then(() => {
      if (!destroyed) loading = false;
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
      setTimeout(() => { if (!destroyed) copied = false; }, 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  }

  // Bug report
  let bugReportLoading = $state(false);
  let bugReportText = $state('');
  let showBugReport = $state(false);
  let bugReportCopied = $state(false);

  async function fetchBugReport() {
    bugReportLoading = true;
    bugReportText = '';
    showBugReport = true;
    try {
      const resp = await fetch(`/api/v1/system/bug-report?format=markdown`);
      if (destroyed) return;
      if (!resp.ok) throw new Error(`${resp.status}`);
      bugReportText = await resp.text();
    } catch (e) {
      if (destroyed) return;
      bugReportText = 'Erreur lors de la generation du rapport de bug.';
      console.error('Bug report error:', e);
    }
    bugReportLoading = false;
  }

  async function copyBugReport() {
    try {
      await navigator.clipboard.writeText(bugReportText);
      bugReportCopied = true;
      setTimeout(() => { if (!destroyed) bugReportCopied = false; }, 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  }

  function closeBugReport() {
    showBugReport = false;
    bugReportText = '';
    bugReportCopied = false;
  }

  // Server actions
  let restarting = $state(false);
  let scanning = $state(false);
  let clearing = $state(false);
  let cleaning = $state(false);
  let cleanupResults = $state<Record<string, any> | null>(null);
  let showLogs = $state(false);
  let logs = $state('');
  let logsLoading = $state(false);

  async function restartServer() {
    if (!confirm('Redemarrer le serveur Tune ?')) return;
    restarting = true;
    try {
      await api.apiPost('/system/restart');
    } catch { /* expected — server stops */ }
    restarting = false;
  }

  async function rescanLibrary() {
    scanning = true;
    try {
      await api.apiPost('/system/scan');
    } catch (e) { console.error(e); }
    scanning = false;
  }

  async function cleanupServer() {
    if (!confirm('Lancer le nettoyage complet ? (albums/artistes orphelins, artwork inutilisé, historique > 90j, vacuum DB)')) return;
    cleaning = true;
    cleanupResults = null;
    try {
      const res = await api.apiPost('/system/cleanup');
      cleanupResults = res;
    } catch (e) { console.error(e); }
    cleaning = false;
  }

  async function clearCache() {
    clearing = true;
    try {
      const r = await api.apiPost('/system/clear-cache');
      alert(`${r.cleared} fichiers supprimés`);
    } catch (e) { console.error(e); }
    clearing = false;
  }

  async function fetchLogs() {
    showLogs = !showLogs;
    if (!showLogs) return;
    logsLoading = true;
    try {
      const r = await api.apiFetch('/system/logs?lines=1000');
      logs = r.logs || 'Aucun log disponible';
      logsSource = r.source || 'unknown';
    } catch { logs = 'Erreur chargement logs'; logsSource = 'error'; }
    logsLoading = false;
  }

  let logsSource = $state('');
  let downloadingLogs = $state(false);

  async function downloadLogs() {
    downloadingLogs = true;
    try {
      const r = await api.apiFetch('/system/logs?lines=1000');
      const logText = r.logs || 'Aucun log disponible';
      const source = r.source || 'unknown';
      const diag = await api.apiFetch('/system/diagnostics').catch(() => null);
      const version = diag?.server_version || 'inconnue';
      const os = diag?.os || 'inconnu';
      const header = `Tune Server ${version} | ${os} | source: ${source}\n${'='.repeat(60)}\n\n`;
      const blob = new Blob([header + logText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `tune-logs-${date}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Erreur : ' + (e?.message || e));
    }
    downloadingLogs = false;
  }

  // --- Network Diagnostics ---
  let networkDiag = $state<{
    multicast_ssdp: boolean;
    port_8888: boolean;
    internet: boolean;
    dns_resolution: Record<string, boolean>;
    renderers: Array<{ name: string; host: string; available: boolean }>;
  } | null>(null);
  let networkLoading = $state(false);
  let networkTimer: ReturnType<typeof setInterval> | null = null;

  async function fetchNetworkDiag() {
    if (destroyed) return;
    networkLoading = true;
    try {
      const result = await api.getNetworkDiagnostics();
      if (destroyed) return;
      networkDiag = result;
    } catch {
      if (destroyed) return;
      networkDiag = null;
    }
    networkLoading = false;
  }

  function clearNetworkTimer() {
    if (networkTimer) { clearInterval(networkTimer); networkTimer = null; }
  }

  // Network diagnostics: load on demand, auto-refresh every 60s.
  // Cleanup guaranteed by both the $effect return AND onDestroy
  // (belt-and-suspenders against stale timers that could fire after
  // navigation, setting $state on a dead component).
  let networkExpanded = $state(false);
  $effect(() => {
    // Read the single reactive dependency — everything else must be
    // untracked to prevent $state writes from creating a feedback loop.
    const expanded = networkExpanded;
    if (!expanded) {
      clearNetworkTimer();
      return;
    }
    // Start polling — untracked so that $state writes inside
    // fetchNetworkDiag (networkLoading, networkDiag) don't create
    // implicit dependencies that would re-trigger this effect.
    untrack(() => {
      fetchNetworkDiag();
      networkTimer = setInterval(fetchNetworkDiag, 60000);
    });
    return () => { clearNetworkTimer(); };
  });

  // Belt-and-suspenders: clear any stale network timer on component
  // destroy, in case the $effect cleanup doesn't fire (e.g. rapid
  // navigation before the effect schedules its teardown).
  onDestroy(() => { clearNetworkTimer(); });

  function formatUptimeStr(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}j ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function formatRelativeDate(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);
    if (diffH < 1) return 'Il y a quelques minutes';
    if (diffH < 24) return `Il y a ${diffH}h`;
    return `Il y a ${diffD}j`;
  }

  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
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

    <!-- Server Stats Dashboard -->
    {#if serverDiag}
    <section class="diag-section">
      <h3>{$t('diagnostics.serverDashboard' as any)}</h3>
      <div class="stats-grid server-dashboard-grid">
        <div class="stat-card">
          <span class="stat-value mono">{serverDiag.server_version ?? '...'}</span>
          <span class="stat-label">{$t('diagnostics.serverVersion')}</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{serverDiag.uptime_seconds != null ? formatUptimeStr(serverDiag.uptime_seconds) : '...'}</span>
          <span class="stat-label">{$t('diagnostics.uptime' as any)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{serverDiag.active_zones ?? 0}</span>
          <span class="stat-label">Zones</span>
        </div>
        {#if serverDiag.tracks_count != null}
        <div class="stat-card">
          <span class="stat-value">{serverDiag.tracks_count.toLocaleString()}</span>
          <span class="stat-label">{$t('diagnostics.tracks')}</span>
        </div>
        {/if}
        {#if serverDiag.albums_count != null}
        <div class="stat-card">
          <span class="stat-value">{serverDiag.albums_count.toLocaleString()}</span>
          <span class="stat-label">Albums</span>
        </div>
        {/if}
        {#if serverDiag.artists_count != null}
        <div class="stat-card">
          <span class="stat-value">{serverDiag.artists_count.toLocaleString()}</span>
          <span class="stat-label">Artistes</span>
        </div>
        {/if}
        {#if serverDiag.connectors != null}
        <div class="stat-card">
          <span class="stat-value">{serverDiag.connectors.length}</span>
          <span class="stat-label">{$t('diagnostics.activeServices' as any)}</span>
        </div>
        {/if}
        {#if serverDiag.memory_rss_mb != null}
        <div class="stat-card">
          <span class="stat-value">{serverDiag.memory_rss_mb} MB</span>
          <span class="stat-label">{$t('diagnostics.memoryUsage' as any)}</span>
        </div>
        {/if}
      </div>
      {#if serverDiag.connectors != null && serverDiag.connectors.length > 0}
        <div class="dashboard-services">
          <span class="dashboard-services-label">{$t('diagnostics.activeServices' as any)} :</span>
          {#each serverDiag.connectors as svc}
            <span class="dashboard-service-badge">{streamingLabel(svc)}</span>
          {/each}
        </div>
      {/if}
    </section>
    {/if}

    <!-- Server Actions -->
    <section class="diag-section actions-section">
      <h3>Actions serveur</h3>
      <div class="actions-grid">
        <button class="server-action-btn" onclick={restartServer} disabled={restarting}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
          <span>{restarting ? 'Redemarrage...' : 'Redemarrer le serveur'}</span>
        </button>
        <button class="server-action-btn" onclick={rescanLibrary} disabled={scanning}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <span>{scanning ? 'Scan en cours...' : 'Rescanner la bibliotheque'}</span>
        </button>
        <button class="server-action-btn" onclick={clearCache} disabled={clearing}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          <span>{clearing ? 'Nettoyage...' : 'Vider le cache artwork'}</span>
        </button>
        <button class="server-action-btn" onclick={fetchLogs}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
          <span>{showLogs ? 'Masquer les logs' : 'Voir les logs serveur'}</span>
        </button>
        <button class="server-action-btn" onclick={downloadLogs} disabled={downloadingLogs}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          <span>{downloadingLogs ? 'Export...' : 'Exporter les logs'}</span>
        </button>
        <button class="server-action-btn cleanup-btn" onclick={cleanupServer} disabled={cleaning}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
          <span>{cleaning ? 'Nettoyage...' : 'Nettoyage du serveur'}</span>
        </button>
        <button class="server-action-btn bug-report-btn" onclick={fetchBugReport} disabled={bugReportLoading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          <span>{bugReportLoading ? $t('diagnostics.bugReportLoading' as any) : $t('diagnostics.bugReportBtn' as any)}</span>
        </button>
      </div>
      {#if cleanupResults}
        <div class="cleanup-results">
          <h4>Résultats du nettoyage</h4>
          <ul>
            {#if cleanupResults.orphan_albums_deleted != null}<li>Albums orphelins supprimés : <strong>{cleanupResults.orphan_albums_deleted}</strong></li>{/if}
            {#if cleanupResults.orphan_artists_deleted != null}<li>Artistes orphelins supprimés : <strong>{cleanupResults.orphan_artists_deleted}</strong></li>{/if}
            {#if cleanupResults.stale_artwork_deleted != null}<li>Fichiers artwork inutilisés supprimés : <strong>{cleanupResults.stale_artwork_deleted}</strong></li>{/if}
            {#if cleanupResults.old_history_deleted != null}<li>Entrées historique > 90j supprimées : <strong>{cleanupResults.old_history_deleted}</strong></li>{/if}
            {#if cleanupResults.db_vacuumed}<li>Base de données compactée (VACUUM)</li>{/if}
          </ul>
        </div>
      {/if}
      {#if showLogs}
        <div class="logs-panel">
          {#if logsLoading}
            <div class="spinner small"></div>
          {:else}
            <pre class="logs-text">{logs}</pre>
          {/if}
        </div>
      {/if}
    </section>

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
            <span class="status-badge" class:ok={$connectionState === 'connected'} class:warn={$connectionState === 'connecting' || $connectionState === 'reconnecting'} class:error={$connectionState === 'disconnected'}>
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

    <!-- Network Diagnostics (lazy loaded on expand) -->
    <section class="diag-section">
      <div class="network-diag-header">
        <button class="section-expand-btn" onclick={() => networkExpanded = !networkExpanded}>
          <svg class="expand-chevron" class:expanded={networkExpanded} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9" /></svg>
          <h3>{$t('diagnostics.network' as any)}</h3>
        </button>
        {#if networkExpanded}
          <span class="network-auto-hint">{$t('diagnostics.networkRefresh' as any)}</span>
          {#if networkLoading}
            <div class="spinner small"></div>
          {/if}
        {/if}
      </div>
      {#if networkExpanded && networkDiag}
        <div class="network-checks">
          <div class="network-check-row">
            <span class="network-check-icon">{networkDiag.multicast_ssdp ? '✅' : '❌'}</span>
            <span>{$t('diagnostics.multicastSsdp' as any)}</span>
          </div>
          <div class="network-check-row">
            <span class="network-check-icon">{networkDiag.port_8888 ? '✅' : '❌'}</span>
            <span>{$t('diagnostics.port8888' as any)}</span>
          </div>
          <div class="network-check-row">
            <span class="network-check-icon">{networkDiag.internet ? '✅' : '❌'}</span>
            <span>{$t('diagnostics.internet' as any)}</span>
          </div>
          {#if networkDiag.dns_resolution}
            <div class="network-dns-section">
              <span class="network-sub-label">{$t('diagnostics.dnsResolution' as any)}</span>
              {#each Object.entries(networkDiag.dns_resolution) as [domain, ok]}
                <div class="network-check-row indent">
                  <span class="network-check-icon">{ok ? '✅' : '❌'}</span>
                  <span class="mono">{domain}</span>
                </div>
              {/each}
            </div>
          {/if}
          {#if networkDiag.renderers && networkDiag.renderers.length > 0}
            <div class="network-renderers-section">
              <span class="network-sub-label">{$t('diagnostics.discoveredRenderers' as any)}</span>
              {#each networkDiag.renderers as renderer}
                <div class="network-check-row indent">
                  <span class="network-check-icon">{renderer.available ? '✅' : '❌'}</span>
                  <span>{renderer.name}</span>
                  <span class="mono device-host">{renderer.host}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {:else if networkExpanded && !networkLoading}
        <p class="empty">Diagnostic reseau indisponible</p>
      {/if}
    </section>
  {/if}
</div>

{#if showBugReport}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="bug-report-overlay" onclick={closeBugReport}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="bug-report-modal" onclick={(e) => e.stopPropagation()}>
      <div class="bug-report-header">
        <h3>{$t('diagnostics.bugReportTitle' as any)}</h3>
        <button class="bug-report-close" onclick={closeBugReport}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <p class="bug-report-hint">{$t('diagnostics.bugReportHint' as any)}</p>
      {#if bugReportLoading}
        <div class="bug-report-loading">
          <div class="spinner"></div>
          {$t('diagnostics.bugReportLoading' as any)}
        </div>
      {:else}
        <pre class="bug-report-content">{bugReportText}</pre>
      {/if}
      <div class="bug-report-actions">
        <button class="action-btn" onclick={closeBugReport}>{$t('common.close' as any)}</button>
        <button class="action-btn copy-btn" onclick={copyBugReport} disabled={bugReportLoading || !bugReportText}>
          {#if bugReportCopied}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {$t('diagnostics.copied')}
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {$t('diagnostics.bugReportCopy' as any)}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

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

  /* Server Actions */
  .actions-section { background: var(--tune-surface); }
  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--space-sm);
  }

  .server-action-btn {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .server-action-btn:hover:not(:disabled) {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .server-action-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .server-action-btn svg {
    flex-shrink: 0;
    opacity: 0.7;
  }

  .logs-panel {
    margin-top: var(--space-md);
    padding: var(--space-md);
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    max-height: 400px;
    overflow-y: auto;
  }

  .logs-text {
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11px;
    line-height: 1.5;
    color: var(--tune-text-secondary);
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
  }

  .cleanup-btn {
    border-color: var(--tune-warning, #f59e0b) !important;
    color: var(--tune-warning, #f59e0b) !important;
  }

  .cleanup-btn:hover:not(:disabled) {
    background: rgba(245, 158, 11, 0.1) !important;
  }

  .cleanup-results {
    margin-top: var(--space-md);
    padding: var(--space-md);
    border-radius: 8px;
    background: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(34, 197, 94, 0.2);
  }

  .cleanup-results h4 {
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text);
    margin: 0 0 var(--space-sm) 0;
  }

  .cleanup-results ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .cleanup-results li {
    font-size: 12px;
    color: var(--tune-text-secondary);
    padding: 2px 0;
  }

  .cleanup-results strong {
    color: var(--tune-text);
  }

  /* Network Diagnostics */
  .network-diag-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }

  .network-diag-header h3 {
    margin-bottom: 0;
  }

  .section-expand-btn {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    color: inherit;
  }

  .section-expand-btn:hover h3 {
    color: var(--tune-accent);
  }

  .expand-chevron {
    transition: transform 0.15s ease-out;
    transform: rotate(-90deg);
    flex-shrink: 0;
    color: var(--tune-text-muted);
  }

  .expand-chevron.expanded {
    transform: rotate(0deg);
  }

  .network-auto-hint {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
    margin-left: auto;
  }

  .network-checks {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .network-check-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-body);
    font-size: 13px;
    padding: var(--space-xs) 0;
  }

  .network-check-row.indent {
    padding-left: var(--space-lg);
  }

  .network-check-icon {
    width: 20px;
    text-align: center;
    flex-shrink: 0;
  }

  .network-sub-label {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    margin-top: var(--space-sm);
    display: block;
    padding-bottom: var(--space-xs);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .network-dns-section,
  .network-renderers-section {
    margin-top: var(--space-xs);
  }

  /* Server Dashboard */
  .server-dashboard-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  }

  .dashboard-services {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin-top: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--tune-border);
  }

  .dashboard-services-label {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    color: var(--tune-text-secondary);
  }

  .dashboard-service-badge {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    padding: 2px 10px;
    border-radius: var(--radius-sm);
    background: rgba(87, 198, 185, 0.15);
    color: var(--tune-success);
    text-transform: capitalize;
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

    .bug-report-modal {
      width: 95vw;
      max-width: 95vw;
    }
  }

  /* Bug Report Button */
  .bug-report-btn {
    border-color: var(--tune-accent) !important;
    color: var(--tune-accent) !important;
  }

  .bug-report-btn:hover:not(:disabled) {
    background: rgba(117, 116, 243, 0.1) !important;
  }

  /* Bug Report Modal */
  .bug-report-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
  }

  .bug-report-modal {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 16px;
    padding: 24px;
    width: 720px;
    max-width: 90vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
  }

  .bug-report-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-sm);
  }

  .bug-report-header h3 {
    font-family: var(--font-label);
    font-size: 18px;
    font-weight: 600;
    margin: 0;
    color: var(--tune-text);
  }

  .bug-report-close {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bug-report-close:hover {
    color: var(--tune-text);
    background: var(--tune-bg);
  }

  .bug-report-hint {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    margin: 0 0 var(--space-md) 0;
  }

  .bug-report-loading {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    padding: var(--space-xl);
    justify-content: center;
  }

  .bug-report-content {
    flex: 1;
    overflow-y: auto;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11px;
    line-height: 1.5;
    color: var(--tune-text-secondary);
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    max-height: 50vh;
  }

  .bug-report-actions {
    display: flex;
    gap: var(--space-sm);
    justify-content: flex-end;
    margin-top: var(--space-md);
  }
</style>

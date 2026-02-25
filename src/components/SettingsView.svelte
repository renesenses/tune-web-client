<script lang="ts">
  import * as api from '../lib/api';
  import { tuneWS } from '../lib/websocket';
  import { zones } from '../lib/stores/zones';
  import { devices } from '../lib/stores/devices';
  import { preferences, applyTheme, type ThemeMode, type VolumeDisplay, type StartupView } from '../lib/stores/preferences';
  import { streamingServices as streamingServicesStore } from '../lib/stores/streaming';
  import type { SystemHealth, SystemStats, StreamingServiceStatus, StreamingAuthResponse, LocalAudioDevice } from '../lib/types';

  let health: SystemHealth | null = $state(null);
  let stats: SystemStats | null = $state(null);
  let scanning = $state(false);
  let loading = $state(true);
  let artworkScanning = $state(false);
  let audioDevices = $state<LocalAudioDevice[]>([]);
  let artworkProgress: { current: number; total: number; found: number } | null = $state(null);

  // Streaming auth state
  let qobuzUsername = $state('');
  let qobuzPassword = $state('');
  let qobuzAuthLoading = $state(false);
  let qobuzAuthError: string | null = $state(null);

  let tidalAuthLoading = $state(false);
  let tidalVerificationUrl: string | null = $state(null);
  let tidalPollingInterval: ReturnType<typeof setInterval> | null = $state(null);
  let tidalAuthError: string | null = $state(null);

  async function handleQobuzAuth() {
    qobuzAuthLoading = true;
    qobuzAuthError = null;
    try {
      const res = await api.authenticateStreaming('qobuz', {
        username: qobuzUsername,
        password: qobuzPassword,
      });
      if (res.authenticated) {
        $streamingServicesStore = {
          ...$streamingServicesStore,
          qobuz: { ...$streamingServicesStore['qobuz'], authenticated: true },
        };
        qobuzPassword = '';
      } else {
        qobuzAuthError = 'Identifiants incorrects';
      }
    } catch (e) {
      qobuzAuthError = 'Erreur de connexion';
    }
    qobuzAuthLoading = false;
  }

  async function handleTidalAuth() {
    tidalAuthLoading = true;
    tidalAuthError = null;
    tidalVerificationUrl = null;
    try {
      const res = await api.authenticateStreaming('tidal');
      if (res.authenticated) {
        $streamingServicesStore = {
          ...$streamingServicesStore,
          tidal: { ...$streamingServicesStore['tidal'], authenticated: true },
        };
        tidalAuthLoading = false;
        return;
      }
      if (res.verification_url) {
        tidalVerificationUrl = res.verification_url;
        startTidalPolling();
      } else {
        tidalAuthError = 'Erreur: pas de lien de verification';
        tidalAuthLoading = false;
      }
    } catch (e) {
      tidalAuthError = 'Erreur de connexion';
      tidalAuthLoading = false;
    }
  }

  function startTidalPolling() {
    stopTidalPolling();
    tidalPollingInterval = setInterval(async () => {
      try {
        const status = await api.getStreamingServiceStatus('tidal');
        if (status.authenticated) {
          stopTidalPolling();
          tidalVerificationUrl = null;
          tidalAuthLoading = false;
          $streamingServicesStore = {
            ...$streamingServicesStore,
            tidal: { ...$streamingServicesStore['tidal'], authenticated: true },
          };
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
  }

  function stopTidalPolling() {
    if (tidalPollingInterval) {
      clearInterval(tidalPollingInterval);
      tidalPollingInterval = null;
    }
  }

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
      $streamingServicesStore = ss as Record<string, StreamingServiceStatus>;
      scanning = sc.scanning;
    } catch (e) {
      console.error('Settings load error:', e);
    }
    loading = false;
  }

  async function fetchAudioDevices() {
    try {
      audioDevices = await api.getAudioDevices();
    } catch (e) {
      console.error('Fetch audio devices error:', e);
    }
  }

  function toggleDevice(prefixedId: string) {
    preferences.update((p) => {
      const ids = p.hiddenDeviceIds;
      const hidden = ids.includes(prefixedId);
      return { ...p, hiddenDeviceIds: hidden ? ids.filter(id => id !== prefixedId) : [...ids, prefixedId] };
    });
  }

  function showAllDevices() {
    preferences.update((p) => ({ ...p, hiddenDeviceIds: [] }));
  }

  function hideAllDevices() {
    const allIds = [
      ...audioDevices.map(d => `audio:${d.id}`),
      ...$devices.map(d => `net:${d.id}`),
    ];
    preferences.update((p) => ({ ...p, hiddenDeviceIds: allIds }));
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

  async function handleArtworkRescan() {
    artworkScanning = true;
    artworkProgress = null;
    try {
      const res = await api.rescanArtwork();
      if (res.status === 'already_running') {
        // already in progress, keep indicator
      }
    } catch (e) {
      console.error('Artwork rescan error:', e);
      artworkScanning = false;
    }
  }

  $effect(() => {
    loadAll();
    fetchAudioDevices();
    const unsub = tuneWS.onEvent((event) => {
      if (event.type === 'library.artwork.progress') {
        artworkProgress = event.data;
      } else if (event.type === 'library.artwork.completed') {
        artworkScanning = false;
        artworkProgress = null;
      }
    });
    return () => {
      unsub();
      stopTidalPolling();
    };
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

      <div class="action-buttons">
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

        <button class="scan-btn" onclick={handleArtworkRescan} disabled={artworkScanning}>
          {#if artworkScanning}
            <div class="spinner small"></div>
            {#if artworkProgress}
              Covers {artworkProgress.current}/{artworkProgress.total} ({artworkProgress.found} trouvees)
            {:else}
              Recherche de covers...
            {/if}
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
            </svg>
            Rechercher les covers manquantes
          {/if}
        </button>
      </div>
    </section>

    <!-- Device visibility -->
    <section class="settings-section">
      <h3>Appareils</h3>
      <div class="devices-actions">
        <button class="scan-btn small" onclick={showAllDevices}>Tout afficher</button>
        <button class="scan-btn small" onclick={hideAllDevices}>Tout masquer</button>
      </div>
      <div class="device-toggle-list">
        {#each audioDevices as device}
          {@const prefId = `audio:${device.id}`}
          <label class="device-toggle-item">
            <input
              type="checkbox"
              checked={!$preferences.hiddenDeviceIds.includes(prefId)}
              onchange={() => toggleDevice(prefId)}
            />
            <span class="device-toggle-name">{device.name}</span>
            <span class="device-toggle-tag">USB</span>
          </label>
        {/each}
        {#each $devices as device}
          {@const prefId = `net:${device.id}`}
          <label class="device-toggle-item">
            <input
              type="checkbox"
              checked={!$preferences.hiddenDeviceIds.includes(prefId)}
              onchange={() => toggleDevice(prefId)}
            />
            <span class="device-toggle-name">{device.name}</span>
            <span class="device-toggle-tag">{device.type === 'airplay' ? 'AirPlay' : device.type === 'dlna' ? 'DLNA' : device.type}</span>
          </label>
        {/each}
        {#if audioDevices.length === 0 && $devices.length === 0}
          <p class="muted">Aucun appareil detecte</p>
        {/if}
      </div>
    </section>

    <!-- Preferences -->
    <section class="settings-section">
      <h3>Interface</h3>
      <div class="pref-grid">
        <label class="pref-label" for="pref-theme">Theme</label>
        <select id="pref-theme" class="pref-select" value={$preferences.theme}
          onchange={(e) => {
            const theme = (e.target as HTMLSelectElement).value as ThemeMode;
            preferences.update((p) => ({ ...p, theme }));
            applyTheme(theme);
          }}>
          <option value="dark">Sombre</option>
          <option value="light">Clair</option>
        </select>

        <label class="pref-label" for="pref-startup">Vue de demarrage</label>
        <select id="pref-startup" class="pref-select" value={$preferences.startupView}
          onchange={(e) => {
            const startupView = (e.target as HTMLSelectElement).value as StartupView;
            preferences.update((p) => ({ ...p, startupView }));
          }}>
          <option value="home">Accueil</option>
          <option value="nowplaying">Lecture en cours</option>
          <option value="library">Bibliotheque</option>
          <option value="queue">File d'attente</option>
          <option value="playlists">Playlists</option>
          <option value="search">Recherche</option>
          <option value="settings">Parametres</option>
        </select>

        <label class="pref-label" for="pref-zone">Zone par defaut</label>
        <select id="pref-zone" class="pref-select" value={$preferences.defaultZoneId ?? ''}
          onchange={(e) => {
            const val = (e.target as HTMLSelectElement).value;
            const defaultZoneId = val ? Number(val) : null;
            preferences.update((p) => ({ ...p, defaultZoneId }));
          }}>
          <option value="">Automatique (premiere zone)</option>
          {#each $zones as z}
            <option value={z.id}>{z.name}</option>
          {/each}
        </select>

        <label class="pref-label" for="pref-volume">Affichage volume</label>
        <select id="pref-volume" class="pref-select" value={$preferences.volumeDisplay}
          onchange={(e) => {
            const volumeDisplay = (e.target as HTMLSelectElement).value as VolumeDisplay;
            preferences.update((p) => ({ ...p, volumeDisplay }));
          }}>
          <option value="percent">Pourcentage (0-100)</option>
          <option value="dB">Decibels (dB)</option>
        </select>
      </div>
    </section>

    <!-- Streaming services -->
    <section class="settings-section">
      <h3>Services de streaming</h3>
      {#if Object.keys($streamingServicesStore).length === 0}
        <p class="muted">Aucun service configure</p>
      {:else}
        <div class="service-list">
          {#each Object.entries($streamingServicesStore) as [name, status]}
            <div class="service-card">
              <div class="service-header">
                <span class="service-name">{name.charAt(0).toUpperCase() + name.slice(1)}</span>
                {#if status.authenticated}
                  <span class="badge auth">Connecte</span>
                {:else}
                  <span class="badge noauth">Non connecte</span>
                {/if}
              </div>

              {#if status.enabled && !status.authenticated}
                {#if name === 'qobuz'}
                  <div class="service-auth-form">
                    <input
                      type="email"
                      class="auth-input"
                      placeholder="Email"
                      bind:value={qobuzUsername}
                      disabled={qobuzAuthLoading}
                    />
                    <input
                      type="password"
                      class="auth-input"
                      placeholder="Mot de passe"
                      bind:value={qobuzPassword}
                      disabled={qobuzAuthLoading}
                      onkeydown={(e) => { if (e.key === 'Enter') handleQobuzAuth(); }}
                    />
                    {#if qobuzAuthError}
                      <p class="auth-error">{qobuzAuthError}</p>
                    {/if}
                    <button
                      class="scan-btn"
                      onclick={handleQobuzAuth}
                      disabled={qobuzAuthLoading || !qobuzUsername || !qobuzPassword}
                    >
                      {#if qobuzAuthLoading}
                        <div class="spinner small"></div>
                        Connexion...
                      {:else}
                        Connexion
                      {/if}
                    </button>
                  </div>
                {:else if name === 'tidal'}
                  <div class="service-auth-form">
                    {#if tidalVerificationUrl}
                      <p class="auth-hint">Ouvrez ce lien pour vous connecter :</p>
                      <a href={tidalVerificationUrl} target="_blank" rel="noopener noreferrer" class="auth-link">
                        {tidalVerificationUrl}
                      </a>
                      <div class="auth-waiting">
                        <div class="spinner small"></div>
                        En attente de confirmation...
                      </div>
                    {:else}
                      {#if tidalAuthError}
                        <p class="auth-error">{tidalAuthError}</p>
                      {/if}
                      <button
                        class="scan-btn"
                        onclick={handleTidalAuth}
                        disabled={tidalAuthLoading}
                      >
                        {#if tidalAuthLoading}
                          <div class="spinner small"></div>
                          Connexion...
                        {:else}
                          Connecter a Tidal
                        {/if}
                      </button>
                    {/if}
                  </div>
                {/if}
              {/if}
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

  .action-buttons {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
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
    gap: var(--space-md);
  }

  .service-card {
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: var(--space-md);
  }

  .service-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .service-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
  }

  .service-auth-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-top: var(--space-md);
  }

  .auth-input {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
    outline: none;
    transition: border-color 0.12s ease-out;
  }

  .auth-input:focus {
    border-color: var(--tune-accent);
  }

  .auth-input:disabled {
    opacity: 0.6;
  }

  .auth-error {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-warning);
    margin: 0;
  }

  .auth-hint {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
    margin: 0;
  }

  .auth-link {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-accent);
    word-break: break-all;
  }

  .auth-waiting {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
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

  .pref-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md) var(--space-lg);
    align-items: center;
  }

  .pref-label {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
  }

  .pref-select {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
    outline: none;
    cursor: pointer;
    transition: border-color 0.12s ease-out;
  }

  .pref-select:focus {
    border-color: var(--tune-accent);
  }

  .devices-actions {
    display: flex;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }

  .scan-btn.small {
    padding: var(--space-xs) var(--space-md);
    font-size: 12px;
  }

  .device-toggle-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .device-toggle-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) 0;
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text);
    cursor: pointer;
  }

  .device-toggle-item:hover {
    color: var(--tune-accent);
  }

  .device-toggle-item input[type="checkbox"] {
    accent-color: var(--tune-accent);
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .device-toggle-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .device-toggle-tag {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tune-text-muted);
    background: var(--tune-bg);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>

<script lang="ts">
  import { get } from 'svelte/store';
  import * as api from '../lib/api';
  import { t } from '../lib/i18n';
  import { streamingServices as streamingServicesStore } from '../lib/stores/streaming';
  import { activeView } from '../lib/stores/navigation';
  import { zones, currentZoneId } from '../lib/stores/zones';
  import { devices } from '../lib/stores/devices';
  import { tuneWS } from '../lib/websocket';
  import { notifications } from '../lib/stores/notifications';
  import type { BrowseRootEntry, DiscoveredDevice } from '../lib/types';

  let step = $state(1);
  const totalSteps = 6;

  // Step 2: Music library
  let musicRoots = $state<BrowseRootEntry[]>([]);
  let newMusicDirPath = $state('');
  let addingMusicDir = $state(false);
  let musicDirError = $state<string | null>(null);
  let removingDir = $state<string | null>(null);

  // Step 3: Streaming
  let qobuzUsername = $state('');
  let qobuzPassword = $state('');
  let qobuzAuthLoading = $state(false);
  let qobuzAuthError = $state<string | null>(null);

  let tidalAuthLoading = $state(false);
  let tidalVerificationUrl = $state<string | null>(null);
  let tidalPollingInterval = $state<ReturnType<typeof setInterval> | null>(null);
  let tidalAuthError = $state<string | null>(null);

  // Step 4: Zones
  let discoveredDevices = $state<DiscoveredDevice[]>([]);
  let discoveringDevices = $state(false);

  // Step 5: Profile
  let profileName = $state('');
  let profileColor = $state('#6366f1');
  const colorPalette = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
    '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  ];

  // Step 6: Summary
  let enabledServices = $derived(
    Object.entries($streamingServicesStore).filter(([, s]) => s.enabled && s.authenticated).map(([name]) => name)
  );

  // Load data on mount
  $effect(() => {
    loadMusicRoots();
    loadStreamingServices();
    const unsub = tuneWS.onEvent((event) => {
      if (event.type === 'device.discovered' || event.type === 'device.updated') {
        loadDiscoveredDevices();
      }
    });
    return () => {
      unsub();
      stopAllPolling();
    };
  });

  async function loadMusicRoots() {
    try {
      const br = await api.getBrowseRoots();
      musicRoots = br.roots;
    } catch { /* ignore */ }
  }

  async function loadStreamingServices() {
    try {
      $streamingServicesStore = await api.getStreamingServices();
    } catch { /* ignore */ }
  }

  async function loadDiscoveredDevices() {
    try {
      const deviceList = await api.getDevices();
      discoveredDevices = deviceList.filter(d => d.available);
      devices.set(deviceList);
    } catch { /* ignore */ }
  }

  // Music dir management
  let scanStatus = $state<string>('idle');
  let scanProgress = $state<{total?: number; inserted?: number; scanned?: number}>({});

  async function handleAddMusicDir() {
    const path = newMusicDirPath.trim();
    if (!path) return;
    addingMusicDir = true;
    musicDirError = null;
    try {
      await api.addMusicDir(path);
      newMusicDirPath = '';
      await loadMusicRoots();
      // Trigger scan automatically
      scanStatus = 'scanning';
      await api.triggerScan();
      // Poll scan status until done
      const pollInterval = setInterval(async () => {
        try {
          const status = await api.getScanStatus();
          scanProgress = status.result || {};
          if (!status.scanning) {
            scanStatus = 'idle';
            clearInterval(pollInterval);
            await loadMusicRoots();
          }
        } catch { /* ignore */ }
      }, 2000);
    } catch (e: any) {
      musicDirError = e.message || String(e);
      scanStatus = 'idle';
    }
    addingMusicDir = false;
  }

  async function handleRemoveMusicDir(path: string) {
    removingDir = path;
    try {
      await api.removeMusicDir(path);
      await loadMusicRoots();
    } catch (e: any) {
      notifications.error(e?.message || String(e));
    }
    removingDir = null;
  }

  // Streaming auth
  async function handleQobuzAuth() {
    qobuzAuthLoading = true;
    qobuzAuthError = null;
    try {
      const res = await api.authenticateStreaming('qobuz', { username: qobuzUsername, password: qobuzPassword });
      if (res.authenticated) {
        $streamingServicesStore = { ...$streamingServicesStore, qobuz: { ...$streamingServicesStore['qobuz'], authenticated: true } };
        qobuzPassword = '';
        await api.onboardingStep('streaming', { service: 'qobuz' });
      } else {
        qobuzAuthError = get(t)('settings.wrongCredentials');
      }
    } catch {
      qobuzAuthError = get(t)('settings.connectionError');
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
        $streamingServicesStore = { ...$streamingServicesStore, tidal: { ...$streamingServicesStore['tidal'], authenticated: true } };
        tidalAuthLoading = false;
        await api.onboardingStep('streaming', { service: 'tidal' });
        return;
      }
      if (res.verification_url) {
        const url = res.verification_url;
        tidalVerificationUrl = url.startsWith('http') ? url : `https://${url}`;
        startTidalPolling();
      } else {
        tidalAuthError = get(t)('settings.tidalNoLink');
        tidalAuthLoading = false;
      }
    } catch {
      tidalAuthError = get(t)('settings.connectionError');
      tidalAuthLoading = false;
    }
  }

  function startTidalPolling() {
    const interval = setInterval(async () => {
      try {
        const status = await api.getStreamingServiceStatus('tidal');
        if (status.authenticated) {
          clearInterval(interval);
          tidalPollingInterval = null;
          tidalVerificationUrl = null;
          tidalAuthLoading = false;
          $streamingServicesStore = { ...$streamingServicesStore, tidal: { ...$streamingServicesStore['tidal'], authenticated: true } };
          await api.onboardingStep('streaming', { service: 'tidal' });
        }
      } catch { /* ignore */ }
    }, 3000);
    tidalPollingInterval = interval;
  }

  function stopAllPolling() {
    if (tidalPollingInterval) clearInterval(tidalPollingInterval);
  }

  // Step 4: Discover devices
  async function discoverDevices() {
    discoveringDevices = true;
    await loadDiscoveredDevices();
    await api.onboardingStep('zones');
    // Keep loading for a few seconds to catch SSDP responses
    setTimeout(() => {
      loadDiscoveredDevices();
      discoveringDevices = false;
    }, 5000);
  }

  async function createZoneFromDevice(device: DiscoveredDevice) {
    try {
      const zone = await api.createZone(device.name, device.type, device.id);
      zones.update((zs) => [...zs, zone]);
      if (zone.id !== null) currentZoneId.set(zone.id);
      notifications.success(`Zone "${device.name}" creee`);
    } catch (e: any) {
      notifications.error(e?.message || String(e));
    }
  }

  // Step 5: Save profile
  async function saveProfile() {
    if (profileName.trim()) {
      try {
        await api.onboardingStep('profile', { name: profileName.trim(), color: profileColor });
      } catch { /* ignore */ }
    }
    step = 6;
  }

  // Finish
  async function finishOnboarding() {
    try {
      await api.onboardingStep('complete');
    } catch { /* ignore */ }
    localStorage.setItem('tune_onboarding_completed', 'true');
    api.updateConfig({ onboarding_completed: 'true' }).catch(() => {});
    activeView.set('home');
  }

  async function skipAll() {
    try {
      await api.skipOnboarding();
    } catch { /* ignore */ }
    localStorage.setItem('tune_onboarding_completed', 'true');
    api.updateConfig({ onboarding_completed: 'true' }).catch(() => {});
    activeView.set('home');
  }

  function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
</script>

<div class="onboarding-overlay">
  <div class="onboarding-container">
    <!-- Progress bar -->
    <div class="progress-bar">
      {#each Array(totalSteps) as _, i}
        <div class="progress-dot" class:active={i + 1 <= step}></div>
      {/each}
    </div>

    <!-- Step 1: Welcome -->
    {#if step === 1}
      <div class="wizard-step welcome-step">
        <div class="welcome-icon">
          <svg viewBox="0 0 80 80" fill="none" width="80" height="80">
            <circle cx="40" cy="40" r="38" stroke="var(--tune-accent)" stroke-width="2" fill="none" />
            <circle cx="40" cy="40" r="28" stroke="var(--tune-accent)" stroke-width="1.5" fill="none" opacity="0.4" />
            <path d="M34 24v32l22-16z" fill="var(--tune-accent)" />
          </svg>
        </div>
        <h1>Bienvenue dans Tune !</h1>
        <p class="welcome-desc">Votre serveur musical personnel. Configurez-le en quelques etapes.</p>

        <div class="welcome-features">
          <div class="feature-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--tune-accent)" stroke-width="2" width="20" height="20">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
            <span>Musique locale, FLAC, DSD, Hi-Res</span>
          </div>
          <div class="feature-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--tune-accent)" stroke-width="2" width="20" height="20">
              <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
              <line x1="2" y1="20" x2="2.01" y2="20" />
            </svg>
            <span>Tidal, Qobuz, Spotify, Deezer, YouTube</span>
          </div>
          <div class="feature-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--tune-accent)" stroke-width="2" width="20" height="20">
              <rect x="4" y="2" width="16" height="20" rx="2" /><circle cx="12" cy="14" r="4" /><line x1="12" y1="6" x2="12.01" y2="6" />
            </svg>
            <span>Multi-room DLNA, AirPlay, Chromecast</span>
          </div>
        </div>

        <button class="btn-primary" onclick={() => step = 2}>Commencer</button>
        <button class="btn-skip" onclick={skipAll}>Passer la configuration</button>
      </div>

    <!-- Step 2: Music Directories -->
    {:else if step === 2}
      <div class="wizard-step">
        <h2>Bibliotheque musicale</h2>
        <p class="step-desc">Ajoutez les dossiers contenant votre musique.</p>

        {#if musicRoots.length > 0}
          <div class="music-dirs-list">
            {#each musicRoots as root}
              <div class="music-dir-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--tune-accent)" stroke-width="2" width="16" height="16">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <div class="music-dir-info">
                  <span class="music-dir-name">{root.name}</span>
                  <span class="music-dir-path">{root.path}</span>
                </div>
                {#if root.track_count > 0}
                  <span class="music-dir-count">{root.track_count} pistes</span>
                {/if}
                <button class="btn-remove" onclick={() => handleRemoveMusicDir(root.path)} disabled={removingDir === root.path}>
                  {#if removingDir === root.path}
                    <div class="spinner spinner-sm"></div>
                  {:else}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  {/if}
                </button>
              </div>
            {/each}
          </div>
        {/if}

        <div class="add-dir-form">
          <input type="text" class="input-field" placeholder="/chemin/vers/musique" bind:value={newMusicDirPath} disabled={addingMusicDir}
            onkeydown={(e) => { if (e.key === 'Enter') handleAddMusicDir(); }} />
          <button class="btn-secondary" onclick={handleAddMusicDir} disabled={addingMusicDir || !newMusicDirPath.trim()}>
            {#if addingMusicDir}
              <div class="spinner"></div>
            {:else}
              Scanner
            {/if}
          </button>
        </div>
        {#if musicDirError}
          <p class="error-msg">{musicDirError}</p>
        {/if}

        {#if scanStatus === 'scanning'}
          <div class="scan-progress">
            <div class="spinner"></div>
            <p>Scan en cours...</p>
          </div>
        {:else if scanProgress.total}
          <p class="scan-done">✓ Scan terminé : {scanProgress.total} fichiers analysés, {scanProgress.metadata_ok || scanProgress.total} pistes en bibliothèque{scanProgress.inserted ? ` (${scanProgress.inserted} nouvelles)` : ''}</p>
        {/if}

        <div class="step-actions">
          <button class="btn-back" onclick={() => step = 1}>Retour</button>
          <div class="step-actions-right">
            <button class="btn-skip" onclick={() => step = 3}>Passer</button>
            <button class="btn-primary" onclick={() => step = 3} disabled={scanStatus === 'scanning'}>Suivant</button>
          </div>
        </div>
      </div>

    <!-- Step 3: Streaming Services -->
    {:else if step === 3}
      <div class="wizard-step">
        <h2>Services de streaming</h2>
        <p class="step-desc">Connectez vos comptes pour acceder a votre musique en ligne.</p>

        <div class="service-list">
          <!-- Tidal -->
          <div class="service-card">
            <div class="service-header">
              <span class="service-name">TIDAL</span>
              {#if $streamingServicesStore['tidal']?.authenticated}
                <span class="badge auth">Connecte</span>
              {:else}
                {#if tidalVerificationUrl}
                  <a href={tidalVerificationUrl} target="_blank" rel="noopener noreferrer" class="auth-link">Ouvrir TIDAL</a>
                  <div class="auth-waiting"><div class="spinner"></div>En attente...</div>
                {:else}
                  {#if tidalAuthError}<p class="error-msg">{tidalAuthError}</p>{/if}
                  <button class="btn-secondary" onclick={handleTidalAuth} disabled={tidalAuthLoading}>
                    {#if tidalAuthLoading}<div class="spinner"></div>Connexion...{:else}Connecter{/if}
                  </button>
                {/if}
              {/if}
            </div>
          </div>

          <!-- Qobuz -->
          <div class="service-card">
            <div class="service-header">
              <span class="service-name">Qobuz</span>
              {#if $streamingServicesStore['qobuz']?.authenticated}
                <span class="badge auth">Connecte</span>
              {:else}
                <div class="service-auth-inline">
                  <input type="email" class="input-field input-sm" placeholder="Email" bind:value={qobuzUsername} disabled={qobuzAuthLoading} />
                  <input type="password" class="input-field input-sm" placeholder="Mot de passe" bind:value={qobuzPassword} disabled={qobuzAuthLoading}
                    onkeydown={(e) => { if (e.key === 'Enter') handleQobuzAuth(); }} />
                  {#if qobuzAuthError}<p class="error-msg">{qobuzAuthError}</p>{/if}
                  <button class="btn-secondary" onclick={handleQobuzAuth} disabled={qobuzAuthLoading || !qobuzUsername || !qobuzPassword}>
                    {#if qobuzAuthLoading}<div class="spinner"></div>{:else}Connecter{/if}
                  </button>
                </div>
              {/if}
            </div>
          </div>
        </div>

        <div class="step-actions">
          <button class="btn-back" onclick={() => step = 2}>Retour</button>
          <div class="step-actions-right">
            <button class="btn-skip" onclick={() => step = 4}>Passer</button>
            <button class="btn-primary" onclick={() => step = 4}>Suivant</button>
          </div>
        </div>
      </div>

    <!-- Step 4: Zones / Devices -->
    {:else if step === 4}
      <div class="wizard-step">
        <h2>Decouvrir les appareils</h2>
        <p class="step-desc">Tune detecte les enceintes et appareils sur votre reseau.</p>

        <button class="btn-primary" onclick={discoverDevices} disabled={discoveringDevices}>
          {#if discoveringDevices}
            <div class="spinner"></div>
            Recherche en cours...
          {:else}
            Decouvrir les appareils
          {/if}
        </button>

        {#if discoveredDevices.length > 0}
          <div class="devices-found">
            {#each discoveredDevices as device}
              <div class="device-found-item">
                <div class="device-found-info">
                  <span class="device-found-name">{device.name}</span>
                  <span class="device-found-type">{device.type.toUpperCase()}</span>
                </div>
                {#if !$zones.some(z => z.output_device_id === device.id)}
                  <button class="btn-secondary btn-sm" onclick={() => createZoneFromDevice(device)}>
                    Creer zone
                  </button>
                {:else}
                  <span class="badge auth">Zone creee</span>
                {/if}
              </div>
            {/each}
          </div>
        {:else if !discoveringDevices}
          <p class="hint-text">Aucun appareil detecte pour l'instant. Vous pourrez en ajouter plus tard dans les reglages.</p>
        {/if}

        <div class="step-actions">
          <button class="btn-back" onclick={() => step = 3}>Retour</button>
          <div class="step-actions-right">
            <button class="btn-skip" onclick={() => step = 5}>Passer</button>
            <button class="btn-primary" onclick={() => step = 5}>Suivant</button>
          </div>
        </div>
      </div>

    <!-- Step 5: Profile -->
    {:else if step === 5}
      <div class="wizard-step">
        <h2>Votre profil</h2>
        <p class="step-desc">Personnalisez votre experience.</p>

        <div class="profile-form">
          <label class="profile-label">Nom</label>
          <input type="text" class="input-field" placeholder="Votre prenom" bind:value={profileName} />

          <label class="profile-label">Couleur</label>
          <div class="color-picker">
            {#each colorPalette as color}
              <button
                class="color-swatch"
                class:selected={profileColor === color}
                style="background: {color}"
                onclick={() => profileColor = color}
              ></button>
            {/each}
          </div>

          {#if profileName.trim()}
            <div class="profile-preview" style="border-color: {profileColor}">
              <div class="profile-avatar" style="background: {profileColor}">{profileName.trim().charAt(0).toUpperCase()}</div>
              <span class="profile-preview-name">{profileName.trim()}</span>
            </div>
          {/if}
        </div>

        <div class="step-actions">
          <button class="btn-back" onclick={() => step = 4}>Retour</button>
          <div class="step-actions-right">
            <button class="btn-skip" onclick={() => step = 6}>Passer</button>
            <button class="btn-primary" onclick={saveProfile}>Suivant</button>
          </div>
        </div>
      </div>

    <!-- Step 6: Complete -->
    {:else if step === 6}
      <div class="wizard-step welcome-step">
        <div class="done-icon">
          <svg viewBox="0 0 64 64" fill="none" width="72" height="72">
            <circle cx="32" cy="32" r="28" stroke="var(--tune-success)" stroke-width="2.5" fill="none" />
            <path d="M20 32l8 8 16-16" stroke="var(--tune-success)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          </svg>
        </div>
        <h1>C'est parti !</h1>
        <p class="welcome-desc">Votre configuration est terminee.</p>

        <div class="summary-list">
          {#if musicRoots.length > 0}
            <div class="summary-item">
              <span class="summary-label">Dossiers</span>
              <span class="summary-value">{musicRoots.length}</span>
            </div>
          {/if}
          {#if enabledServices.length > 0}
            <div class="summary-item">
              <span class="summary-label">Streaming</span>
              <span class="summary-value">{enabledServices.map(capitalize).join(', ')}</span>
            </div>
          {/if}
          {#if $zones.length > 0}
            <div class="summary-item">
              <span class="summary-label">Zones</span>
              <span class="summary-value">{$zones.length}</span>
            </div>
          {/if}
          {#if profileName.trim()}
            <div class="summary-item">
              <span class="summary-label">Profil</span>
              <span class="summary-value">{profileName.trim()}</span>
            </div>
          {/if}
        </div>

        <button class="btn-primary btn-go" onclick={finishOnboarding}>Decouvrir Tune</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .onboarding-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: var(--tune-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow-y: auto;
    padding: var(--space-lg);
  }

  .onboarding-container {
    width: 100%;
    max-width: 600px;
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .progress-bar {
    display: flex;
    justify-content: center;
    gap: var(--space-sm);
  }

  .progress-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--tune-border);
    transition: background 0.2s;
  }

  .progress-dot.active {
    background: var(--tune-accent);
  }

  .wizard-step {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .welcome-step {
    align-items: center;
    text-align: center;
  }

  .welcome-icon {
    margin-bottom: var(--space-md);
    animation: fadeIn 0.5s ease-out;
  }

  .done-icon {
    animation: popIn 0.4s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.9); }
    to { opacity: 1; transform: scale(1); }
  }

  @keyframes popIn {
    0% { transform: scale(0.5); opacity: 0; }
    70% { transform: scale(1.1); }
    100% { transform: scale(1); opacity: 1; }
  }

  h1 {
    font-family: var(--font-display);
    font-size: 36px;
    font-weight: 600;
    color: var(--tune-text);
    line-height: 1.2;
  }

  h2 {
    font-family: var(--font-label);
    font-size: 22px;
    font-weight: 600;
    color: var(--tune-text);
  }

  .welcome-desc, .step-desc {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--tune-text-secondary);
    line-height: 1.5;
    max-width: 480px;
  }

  .welcome-step .welcome-desc {
    margin: 0 auto;
  }

  .welcome-features {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    width: 100%;
    max-width: 360px;
    margin: var(--space-md) auto;
  }

  .feature-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
    text-align: left;
  }

  .feature-item svg {
    flex-shrink: 0;
  }

  /* Buttons */
  .btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-xl);
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    min-height: 40px;
  }

  .btn-primary:hover:not(:disabled) { opacity: 0.9; }
  .btn-primary:disabled { opacity: 0.5; cursor: default; }

  .btn-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-lg);
    background: var(--tune-grey2);
    color: var(--tune-text);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.12s;
    min-height: 36px;
  }

  .btn-secondary:hover:not(:disabled) {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .btn-secondary:disabled { opacity: 0.5; cursor: default; }

  .btn-sm { padding: var(--space-xs) var(--space-md); font-size: 13px; min-height: 32px; }

  .btn-skip {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    padding: var(--space-xs) var(--space-md);
    transition: color 0.12s;
  }

  .btn-skip:hover { color: var(--tune-text-secondary); }

  .btn-back {
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary);
    font-family: var(--font-body);
    font-size: 14px;
    cursor: pointer;
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-md);
    transition: all 0.12s;
  }

  .btn-back:hover {
    border-color: var(--tune-text-secondary);
    color: var(--tune-text);
  }

  .btn-go {
    padding: var(--space-md) 40px;
    font-size: 16px;
    margin-top: var(--space-md);
  }

  .btn-remove {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: color 0.12s;
  }

  .btn-remove:hover:not(:disabled) { color: var(--tune-warning); }

  .step-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: var(--space-md);
    border-top: 1px solid var(--tune-border);
  }

  .step-actions-right {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  /* Input */
  .input-field {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
    outline: none;
    transition: border-color 0.12s;
    width: 100%;
  }

  .input-field:focus { border-color: var(--tune-accent); }
  .input-field:disabled { opacity: 0.6; }

  .input-sm { padding: var(--space-xs) var(--space-sm); font-size: 13px; }

  /* Music dirs */
  .add-dir-form {
    display: flex;
    gap: var(--space-sm);
  }

  .add-dir-form .input-field { flex: 1; }

  .music-dirs-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .music-dir-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
  }

  .music-dir-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .music-dir-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 500;
    color: var(--tune-text);
  }

  .music-dir-path {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .music-dir-count {
    font-family: var(--font-label);
    font-size: 12px;
    color: var(--tune-text-secondary);
    flex-shrink: 0;
  }

  .hint-text {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    margin: 0;
    line-height: 1.4;
  }

  /* Service list */
  .service-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .service-card {
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    background: var(--tune-surface);
  }

  .service-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .service-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    color: var(--tune-text);
  }

  .service-auth-inline {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    flex: 1;
    max-width: 300px;
  }

  .badge {
    font-family: var(--font-label);
    font-size: 11px;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
  }

  .badge.auth {
    background: rgba(87, 198, 185, 0.15);
    color: var(--tune-success);
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

  /* Devices */
  .devices-found {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .device-found-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
  }

  .device-found-info {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .device-found-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 500;
    color: var(--tune-text);
  }

  .device-found-type {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 600;
    color: var(--tune-text-muted);
    background: var(--tune-bg);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
  }

  /* Profile */
  .profile-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .profile-label {
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .color-picker {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .color-swatch {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.12s;
  }

  .color-swatch.selected {
    border-color: white;
    transform: scale(1.15);
    box-shadow: 0 0 0 2px var(--tune-accent);
  }

  .color-swatch:hover:not(.selected) {
    transform: scale(1.1);
  }

  .profile-preview {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--tune-surface);
    border: 2px solid;
    border-radius: var(--radius-lg);
    margin-top: var(--space-sm);
  }

  .profile-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 700;
    color: white;
    flex-shrink: 0;
  }

  .profile-preview-name {
    font-family: var(--font-body);
    font-size: 18px;
    font-weight: 600;
    color: var(--tune-text);
  }

  /* Summary */
  .summary-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    width: 100%;
    max-width: 300px;
  }

  .summary-item {
    display: flex;
    justify-content: space-between;
    padding: var(--space-xs) 0;
    font-family: var(--font-body);
    font-size: 14px;
  }

  .summary-label {
    color: var(--tune-text-secondary);
  }

  .summary-value {
    color: var(--tune-text);
    font-weight: 600;
  }

  /* Error */
  .error-msg {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-warning);
    margin: 0;
  }

  /* Spinner */
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  .spinner-sm { width: 12px; height: 12px; }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 768px) {
    .onboarding-overlay { padding: var(--space-md); }
    h1 { font-size: 28px; }
    h2 { font-size: 20px; }
    .add-dir-form { flex-direction: column; }
    .welcome-features { max-width: 100%; }
  }
</style>

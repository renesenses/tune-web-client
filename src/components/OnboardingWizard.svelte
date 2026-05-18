<script lang="ts">
  import { get } from 'svelte/store';
  import * as api from '../lib/api';
  import { t } from '../lib/i18n';
  import { streamingServices as streamingServicesStore } from '../lib/stores/streaming';
  import { activeView } from '../lib/stores/navigation';
  import { tuneWS } from '../lib/websocket';
  import { notifications } from '../lib/stores/notifications';
  import type { BrowseRootEntry } from '../lib/types';

  let { onComplete }: { onComplete: () => void } = $props();

  let step = $state(1);
  const totalSteps = 4;

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

  let spotifyAuthLoading = $state(false);
  let spotifyVerificationUrl = $state<string | null>(null);
  let spotifyPollingInterval = $state<ReturnType<typeof setInterval> | null>(null);
  let spotifyAuthError = $state<string | null>(null);

  let deezerAuthLoading = $state(false);
  let deezerVerificationUrl = $state<string | null>(null);
  let deezerPollingInterval = $state<ReturnType<typeof setInterval> | null>(null);
  let deezerAuthError = $state<string | null>(null);

  let youtubeAuthLoading = $state(false);
  let youtubeVerificationUrl = $state<string | null>(null);
  let youtubeUserCode = $state<string | null>(null);
  let youtubePollingInterval = $state<ReturnType<typeof setInterval> | null>(null);
  let youtubeAuthError = $state<string | null>(null);

  // Step 4: Scan
  let scanning = $state(false);
  let scanComplete = $state(false);
  let scanStats = $state<{ scanned: number; added: number; updated: number; removed: number; errors: number }>({ scanned: 0, added: 0, updated: 0, removed: 0, errors: 0 });
  let tracksCount = $state(0);
  let scanError = $state<string | null>(null);

  // Derived
  let hasMusic = $derived(musicRoots.length > 0);
  let enabledServices = $derived(
    Object.entries($streamingServicesStore).filter(([, s]) => s.enabled).map(([name]) => name)
  );
  let hasContent = $derived(hasMusic || enabledServices.length > 0);

  // Load data on mount
  $effect(() => {
    loadMusicRoots();
    loadStreamingServices();
    const unsub = tuneWS.onEvent((event) => {
      if (event.type === 'library.scan.progress' && event.data) {
        scanStats = { ...scanStats, ...event.data };
      }
      if (event.type === 'library.scan.completed') {
        scanning = false;
        scanComplete = true;
        if (event.data) {
          scanStats = { ...scanStats, ...event.data };
        }
        loadTracksCount();
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

  async function loadTracksCount() {
    try {
      const stats = await api.getLibraryStats();
      tracksCount = stats.tracks;
    } catch { /* ignore */ }
  }

  // Music dir management
  async function handleAddMusicDir() {
    const path = newMusicDirPath.trim();
    if (!path) return;
    addingMusicDir = true;
    musicDirError = null;
    try {
      await api.addMusicDir(path);
      newMusicDirPath = '';
      await loadMusicRoots();
    } catch (e: any) {
      musicDirError = e.message || String(e);
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

  // Step 4: Launch scan
  async function handleScan() {
    scanning = true;
    scanComplete = false;
    scanStats = { scanned: 0, added: 0, updated: 0, removed: 0, errors: 0 };
    scanError = null;
    try {
      await api.triggerScan();
    } catch (e: any) {
      if (e?.message?.includes('already') || e?.message?.includes('409')) {
        // Scan already running, just watch progress
      } else {
        scanError = e?.message || String(e);
        scanning = false;
      }
    }
  }

  // Streaming service toggle
  async function handleToggleService(serviceName: string, enable: boolean) {
    try {
      if (enable) {
        await api.enableStreamingService(serviceName);
      } else {
        await api.disableStreamingService(serviceName);
      }
      $streamingServicesStore = await api.getStreamingServices();
    } catch (e: any) {
      console.error('Toggle service error:', e);
      notifications.error(e?.message || String(e));
    }
  }

  // Auth handlers
  async function handleQobuzAuth() {
    qobuzAuthLoading = true;
    qobuzAuthError = null;
    try {
      const res = await api.authenticateStreaming('qobuz', { username: qobuzUsername, password: qobuzPassword });
      if (res.authenticated) {
        $streamingServicesStore = { ...$streamingServicesStore, qobuz: { ...$streamingServicesStore['qobuz'], authenticated: true } };
        qobuzPassword = '';
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
        return;
      }
      if (res.verification_url) {
        const url = res.verification_url;
        tidalVerificationUrl = url.startsWith('http') ? url : `https://${url}`;
        startPolling('tidal');
      } else {
        tidalAuthError = get(t)('settings.tidalNoLink');
        tidalAuthLoading = false;
      }
    } catch {
      tidalAuthError = get(t)('settings.connectionError');
      tidalAuthLoading = false;
    }
  }

  async function handleSpotifyAuth() {
    spotifyAuthLoading = true;
    spotifyAuthError = null;
    spotifyVerificationUrl = null;
    try {
      const res = await api.authenticateStreaming('spotify');
      if (res.authenticated) {
        $streamingServicesStore = { ...$streamingServicesStore, spotify: { ...$streamingServicesStore['spotify'], authenticated: true } };
        spotifyAuthLoading = false;
        return;
      }
      if (res.verification_url) {
        spotifyVerificationUrl = res.verification_url;
        startPolling('spotify');
      } else {
        spotifyAuthError = get(t)('settings.connectionError');
        spotifyAuthLoading = false;
      }
    } catch {
      spotifyAuthError = get(t)('settings.connectionError');
      spotifyAuthLoading = false;
    }
  }

  async function handleDeezerAuth() {
    deezerAuthLoading = true;
    deezerAuthError = null;
    deezerVerificationUrl = null;
    try {
      const res = await api.authenticateStreaming('deezer');
      if (res.authenticated) {
        $streamingServicesStore = { ...$streamingServicesStore, deezer: { ...$streamingServicesStore['deezer'], authenticated: true } };
        deezerAuthLoading = false;
        return;
      }
      if (res.verification_url) {
        deezerVerificationUrl = res.verification_url;
        startPolling('deezer');
      } else {
        deezerAuthError = get(t)('settings.connectionError');
        deezerAuthLoading = false;
      }
    } catch {
      deezerAuthError = get(t)('settings.connectionError');
      deezerAuthLoading = false;
    }
  }

  async function handleYoutubeAuth() {
    youtubeAuthLoading = true;
    youtubeAuthError = null;
    youtubeVerificationUrl = null;
    youtubeUserCode = null;
    try {
      const res = await api.authenticateStreaming('youtube');
      if (res.authenticated) {
        $streamingServicesStore = { ...$streamingServicesStore, youtube: { ...$streamingServicesStore['youtube'], authenticated: true } };
        youtubeAuthLoading = false;
        return;
      }
      if (res.verification_url) {
        youtubeVerificationUrl = res.verification_url;
        youtubeUserCode = res.user_code ?? null;
        startPolling('youtube');
      } else {
        youtubeAuthError = res.error === 'missing_credentials'
          ? get(t)('settings.youtubeMissingCredentials')
          : get(t)('settings.connectionError');
        youtubeAuthLoading = false;
      }
    } catch {
      youtubeAuthError = get(t)('settings.connectionError');
      youtubeAuthLoading = false;
    }
  }

  function startPolling(service: string) {
    const interval = setInterval(async () => {
      try {
        const status = await api.getStreamingServiceStatus(service);
        if (status.authenticated) {
          clearInterval(interval);
          if (service === 'tidal') { tidalPollingInterval = null; tidalVerificationUrl = null; tidalAuthLoading = false; }
          if (service === 'spotify') { spotifyPollingInterval = null; spotifyVerificationUrl = null; spotifyAuthLoading = false; }
          if (service === 'deezer') { deezerPollingInterval = null; deezerVerificationUrl = null; deezerAuthLoading = false; }
          if (service === 'youtube') { youtubePollingInterval = null; youtubeVerificationUrl = null; youtubeUserCode = null; youtubeAuthLoading = false; }
          $streamingServicesStore = { ...$streamingServicesStore, [service]: { ...$streamingServicesStore[service], authenticated: true } };
        }
      } catch { /* ignore */ }
    }, service === 'youtube' ? 5000 : 3000);
    if (service === 'tidal') tidalPollingInterval = interval;
    if (service === 'spotify') spotifyPollingInterval = interval;
    if (service === 'deezer') deezerPollingInterval = interval;
    if (service === 'youtube') youtubePollingInterval = interval;
  }

  function stopAllPolling() {
    if (tidalPollingInterval) clearInterval(tidalPollingInterval);
    if (spotifyPollingInterval) clearInterval(spotifyPollingInterval);
    if (deezerPollingInterval) clearInterval(deezerPollingInterval);
    if (youtubePollingInterval) clearInterval(youtubePollingInterval);
  }

  function finishOnboarding() {
    localStorage.setItem('tune_onboarding_completed', 'true');
    activeView.set('library');
    onComplete();
  }

  function skipOnboarding() {
    localStorage.setItem('tune_onboarding_completed', 'true');
    onComplete();
  }

  function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function serviceLogo(name: string): string {
    const colors: Record<string, string> = {
      tidal: '#000',
      qobuz: '#e91e63',
      spotify: '#1db954',
      deezer: '#a238ff',
      youtube: '#ff0000',
      amazon: '#ff9900',
    };
    const c = colors[name] ?? 'var(--tune-accent)';
    return `<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="9" fill="${c}" opacity="0.15"/><circle cx="10" cy="10" r="5" fill="${c}"/></svg>`;
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
        <h1>{$t('onboarding.welcomeTitle')}</h1>
        <p class="welcome-desc">{$t('onboarding.welcomeDesc')}</p>

        <div class="welcome-features">
          <div class="feature-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--tune-accent)" stroke-width="2" width="20" height="20">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
            <span>{$t('onboarding.featureLocal')}</span>
          </div>
          <div class="feature-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--tune-accent)" stroke-width="2" width="20" height="20">
              <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
              <line x1="2" y1="20" x2="2.01" y2="20" />
            </svg>
            <span>{$t('onboarding.featureStreaming')}</span>
          </div>
          <div class="feature-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--tune-accent)" stroke-width="2" width="20" height="20">
              <rect x="4" y="2" width="16" height="20" rx="2" /><circle cx="12" cy="14" r="4" /><line x1="12" y1="6" x2="12.01" y2="6" />
            </svg>
            <span>{$t('onboarding.featureMultiroom')}</span>
          </div>
        </div>

        <button class="btn-primary" onclick={() => step = 2}>
          {$t('onboarding.getStarted')}
        </button>
        <button class="btn-skip" onclick={skipOnboarding}>
          {$t('onboarding.skipAll')}
        </button>
      </div>

    <!-- Step 2: Music Library -->
    {:else if step === 2}
      <div class="wizard-step">
        <h2>{$t('onboarding.libraryTitle')}</h2>
        <p class="step-desc">{$t('onboarding.libraryDesc')}</p>

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
                  <span class="music-dir-count">{root.track_count} {$t('common.tracks')}</span>
                {/if}
                <button
                  class="btn-remove"
                  onclick={() => handleRemoveMusicDir(root.path)}
                  disabled={removingDir === root.path}
                  title={$t('common.delete')}
                >
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
          <input
            type="text"
            class="input-field"
            placeholder={$t('onboarding.addDirPlaceholder')}
            bind:value={newMusicDirPath}
            disabled={addingMusicDir}
            onkeydown={(e) => { if (e.key === 'Enter') handleAddMusicDir(); }}
          />
          <button
            class="btn-secondary"
            onclick={handleAddMusicDir}
            disabled={addingMusicDir || !newMusicDirPath.trim()}
          >
            {#if addingMusicDir}
              <div class="spinner"></div>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {$t('onboarding.addDir')}
            {/if}
          </button>
        </div>
        {#if musicDirError}
          <p class="error-msg">{musicDirError}</p>
        {/if}

        <p class="hint-text">{$t('onboarding.libraryHint')}</p>

        <div class="step-actions">
          <button class="btn-back" onclick={() => step = 1}>{$t('common.back')}</button>
          <div class="step-actions-right">
            <button class="btn-skip" onclick={() => step = 3}>{$t('onboarding.skip')}</button>
            <button class="btn-primary" onclick={() => step = 3}>{$t('onboarding.next')}</button>
          </div>
        </div>
      </div>

    <!-- Step 3: Streaming Services -->
    {:else if step === 3}
      <div class="wizard-step">
        <h2>{$t('onboarding.streamingTitle')}</h2>
        <p class="step-desc">{$t('onboarding.streamingDesc')}</p>

        <div class="service-list">
          {#each Object.entries($streamingServicesStore) as [name, status]}
            <div class="service-card">
              <div class="service-header">
                <div class="service-name-row">
                  <span class="service-logo">{@html serviceLogo(name)}</span>
                  <span class="service-name">{capitalize(name)}</span>
                </div>
                <div class="service-actions">
                  {#if status.enabled}
                    {#if status.authenticated}
                      <span class="badge auth">{$t('settings.connected')}</span>
                    {:else}
                      <span class="badge noauth">{$t('settings.notConnected')}</span>
                    {/if}
                    <button class="btn-toggle" onclick={() => handleToggleService(name, false)}>{$t('settings.disable')}</button>
                  {:else}
                    <button class="btn-toggle enable" onclick={() => handleToggleService(name, true)}>{$t('settings.enable')}</button>
                  {/if}
                </div>
              </div>

              {#if status.enabled && !status.authenticated}
                <div class="service-auth-form">
                  {#if name === 'qobuz'}
                    <input type="email" class="input-field" placeholder={$t('settings.email')} bind:value={qobuzUsername} disabled={qobuzAuthLoading} />
                    <input type="password" class="input-field" placeholder={$t('settings.password')} bind:value={qobuzPassword} disabled={qobuzAuthLoading}
                      onkeydown={(e) => { if (e.key === 'Enter') handleQobuzAuth(); }} />
                    {#if qobuzAuthError}<p class="error-msg">{qobuzAuthError}</p>{/if}
                    <button class="btn-secondary" onclick={handleQobuzAuth} disabled={qobuzAuthLoading || !qobuzUsername || !qobuzPassword}>
                      {#if qobuzAuthLoading}<div class="spinner"></div>{$t('settings.connecting')}{:else}{$t('settings.connect')}{/if}
                    </button>
                  {:else if name === 'tidal'}
                    {#if tidalVerificationUrl}
                      <p class="auth-hint">{$t('settings.tidalLink')}</p>
                      <a href={tidalVerificationUrl} target="_blank" rel="noopener noreferrer" class="auth-link">{tidalVerificationUrl}</a>
                      <div class="auth-waiting"><div class="spinner"></div>{$t('settings.tidalWaiting')}</div>
                    {:else}
                      {#if tidalAuthError}<p class="error-msg">{tidalAuthError}</p>{/if}
                      <button class="btn-secondary" onclick={handleTidalAuth} disabled={tidalAuthLoading}>
                        {#if tidalAuthLoading}<div class="spinner"></div>{$t('settings.connecting')}{:else}{$t('settings.tidalConnect')}{/if}
                      </button>
                    {/if}
                  {:else if name === 'spotify'}
                    {#if spotifyVerificationUrl}
                      <p class="auth-hint">{$t('settings.spotifyLink')}</p>
                      <a href={spotifyVerificationUrl} target="_blank" rel="noopener noreferrer" class="auth-link">{$t('settings.spotifyOpenAuth')}</a>
                      <div class="auth-waiting"><div class="spinner"></div>{$t('settings.spotifyWaiting')}</div>
                    {:else}
                      {#if spotifyAuthError}<p class="error-msg">{spotifyAuthError}</p>{/if}
                      <button class="btn-secondary" onclick={handleSpotifyAuth} disabled={spotifyAuthLoading}>
                        {#if spotifyAuthLoading}<div class="spinner"></div>{$t('settings.connecting')}{:else}{$t('settings.spotifyConnect')}{/if}
                      </button>
                    {/if}
                  {:else if name === 'deezer'}
                    {#if deezerVerificationUrl}
                      <p class="auth-hint">{$t('settings.deezerLink')}</p>
                      <a href={deezerVerificationUrl} target="_blank" rel="noopener noreferrer" class="auth-link">{$t('settings.deezerOpenAuth')}</a>
                      <div class="auth-waiting"><div class="spinner"></div>{$t('settings.deezerWaiting')}</div>
                    {:else}
                      {#if deezerAuthError}<p class="error-msg">{deezerAuthError}</p>{/if}
                      <button class="btn-secondary" onclick={handleDeezerAuth} disabled={deezerAuthLoading}>
                        {#if deezerAuthLoading}<div class="spinner"></div>{$t('settings.connecting')}{:else}{$t('settings.deezerConnect')}{/if}
                      </button>
                    {/if}
                  {:else if name === 'youtube'}
                    {#if youtubeVerificationUrl}
                      <p class="auth-hint">{$t('settings.youtubeLink')}</p>
                      {#if youtubeUserCode}<p class="auth-code">{youtubeUserCode}</p>{/if}
                      <a href={youtubeVerificationUrl} target="_blank" rel="noopener noreferrer" class="auth-link">{$t('settings.youtubeOpenAuth')}</a>
                      <div class="auth-waiting"><div class="spinner"></div>{$t('settings.youtubeWaiting')}</div>
                    {:else}
                      {#if youtubeAuthError}<p class="error-msg">{youtubeAuthError}</p>{/if}
                      <button class="btn-secondary" onclick={handleYoutubeAuth} disabled={youtubeAuthLoading}>
                        {#if youtubeAuthLoading}<div class="spinner"></div>{$t('settings.connecting')}{:else}{$t('settings.youtubeConnect')}{/if}
                      </button>
                    {/if}
                  {:else if name === 'amazon'}
                    <p class="auth-hint">{$t('onboarding.amazonHint')}</p>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>

        <div class="step-actions">
          <button class="btn-back" onclick={() => step = 2}>{$t('common.back')}</button>
          <div class="step-actions-right">
            <button class="btn-skip" onclick={() => step = 4}>{$t('onboarding.skip')}</button>
            <button class="btn-primary" onclick={() => step = 4}>{$t('onboarding.next')}</button>
          </div>
        </div>
      </div>

    <!-- Step 4: Scan & Finish -->
    {:else if step === 4}
      <div class="wizard-step scan-step">
        {#if !scanning && !scanComplete}
          <!-- Pre-scan state -->
          <div class="scan-intro">
            <div class="scan-icon">
              <svg viewBox="0 0 64 64" fill="none" width="64" height="64">
                <circle cx="32" cy="32" r="28" stroke="var(--tune-accent)" stroke-width="2" fill="none" stroke-dasharray="4 4" />
                <path d="M26 20v24l18-12z" fill="var(--tune-accent)" opacity="0.8" />
              </svg>
            </div>
            <h2>{$t('onboarding.scanTitle')}</h2>
            <p class="step-desc">{$t('onboarding.scanDesc')}</p>

            {#if hasMusic}
              <div class="scan-summary">
                <span class="scan-summary-label">{$t('onboarding.summaryDirs')}</span>
                <span class="scan-summary-value">{musicRoots.length}</span>
              </div>
            {/if}
            {#if enabledServices.length > 0}
              <div class="scan-summary">
                <span class="scan-summary-label">{$t('onboarding.summaryServices')}</span>
                <span class="scan-summary-value">{enabledServices.map(capitalize).join(', ')}</span>
              </div>
            {/if}

            {#if hasMusic}
              <button class="btn-primary btn-scan-launch" onclick={handleScan}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                {$t('onboarding.scanLaunch')}
              </button>
            {/if}

            <button class="btn-finish-skip" onclick={finishOnboarding}>
              {hasMusic ? $t('onboarding.skipScan') : $t('onboarding.finishNoScan')}
            </button>
          </div>

        {:else if scanning}
          <!-- Scanning in progress -->
          <div class="scan-progress-section">
            <h2>{$t('onboarding.scanInProgress')}</h2>

            <div class="progress-bar-track">
              <div class="progress-bar-fill progress-bar-indeterminate"></div>
            </div>

            <div class="scan-stats">
              <div class="scan-stat">
                <span class="scan-stat-number">{scanStats.scanned}</span>
                <span class="scan-stat-label">{$t('onboarding.statScanned')}</span>
              </div>
              <div class="scan-stat">
                <span class="scan-stat-number">{scanStats.added}</span>
                <span class="scan-stat-label">{$t('onboarding.statAdded')}</span>
              </div>
              {#if scanStats.updated > 0}
                <div class="scan-stat">
                  <span class="scan-stat-number">{scanStats.updated}</span>
                  <span class="scan-stat-label">{$t('onboarding.statUpdated')}</span>
                </div>
              {/if}
            </div>

            <p class="scan-hint">{$t('onboarding.scanWait')}</p>
          </div>

        {:else if scanComplete}
          <!-- Scan complete -->
          <div class="scan-done-section">
            <div class="done-icon">
              <svg viewBox="0 0 64 64" fill="none" width="72" height="72">
                <circle cx="32" cy="32" r="28" stroke="var(--tune-success)" stroke-width="2.5" fill="none" />
                <path d="M20 32l8 8 16-16" stroke="var(--tune-success)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </svg>
            </div>
            <h1>{$t('onboarding.scanDoneTitle')}</h1>
            <p class="scan-done-count">
              {tracksCount > 0
                ? $t('onboarding.scanDoneCount').replace('{count}', String(tracksCount))
                : $t('onboarding.scanDoneNoTracks')
              }
            </p>

            <div class="scan-final-stats">
              <div class="scan-final-stat">
                <span class="scan-final-number">{scanStats.added}</span>
                <span class="scan-final-label">{$t('onboarding.statAdded')}</span>
              </div>
              {#if scanStats.updated > 0}
                <div class="scan-final-stat">
                  <span class="scan-final-number">{scanStats.updated}</span>
                  <span class="scan-final-label">{$t('onboarding.statUpdated')}</span>
                </div>
              {/if}
              {#if scanStats.removed > 0}
                <div class="scan-final-stat">
                  <span class="scan-final-number">{scanStats.removed}</span>
                  <span class="scan-final-label">{$t('onboarding.statRemoved')}</span>
                </div>
              {/if}
            </div>

            <button class="btn-primary btn-go" onclick={finishOnboarding}>
              {$t('onboarding.goToLibrary')}
            </button>
          </div>
        {/if}

        {#if !scanning && !scanComplete}
          <div class="step-actions">
            <button class="btn-back" onclick={() => step = 3}>{$t('common.back')}</button>
            <div class="step-actions-right"></div>
          </div>
        {/if}

        {#if scanError}
          <p class="error-msg">{scanError}</p>
        {/if}
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

  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.9); }
    to { opacity: 1; transform: scale(1); }
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

  .welcome-desc,
  .step-desc {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--tune-text-secondary);
    line-height: 1.5;
    max-width: 480px;
  }

  .welcome-step .welcome-desc {
    margin: 0 auto;
  }

  /* Welcome feature list */
  .welcome-features {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    width: 100%;
    max-width: 320px;
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

  .btn-primary:hover {
    opacity: 0.9;
  }

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

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: default;
  }

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

  .btn-skip:hover {
    color: var(--tune-text-secondary);
  }

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

  .btn-toggle {
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 12px;
    padding: 2px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.12s;
  }

  .btn-toggle:hover {
    border-color: var(--tune-warning);
    color: var(--tune-warning);
  }

  .btn-toggle.enable {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .btn-toggle.enable:hover {
    background: rgba(107, 110, 217, 0.1);
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

  .btn-remove:hover:not(:disabled) {
    color: var(--tune-warning);
  }

  .btn-finish-skip {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    padding: var(--space-xs) var(--space-md);
    transition: color 0.12s;
  }

  .btn-finish-skip:hover {
    color: var(--tune-text-secondary);
  }

  .btn-scan-launch {
    padding: var(--space-md) var(--space-xxl, 40px);
    font-size: 16px;
  }

  .btn-go {
    padding: var(--space-md) var(--space-xxl, 40px);
    font-size: 16px;
    margin-top: var(--space-md);
  }

  /* Step actions */
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

  .input-field:focus {
    border-color: var(--tune-accent);
  }

  .input-field:disabled {
    opacity: 0.6;
  }

  /* Music dirs */
  .add-dir-form {
    display: flex;
    gap: var(--space-sm);
  }

  .add-dir-form .input-field {
    flex: 1;
  }

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

  /* Streaming */
  .service-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    max-height: 400px;
    overflow-y: auto;
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
  }

  .service-name-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .service-logo {
    display: flex;
    align-items: center;
  }

  .service-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .service-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    color: var(--tune-text);
  }

  .service-auth-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-top: var(--space-md);
  }

  .service-auth-form .btn-secondary {
    align-self: flex-start;
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

  .badge.noauth {
    background: rgba(201, 84, 75, 0.15);
    color: var(--tune-warning);
  }

  .auth-hint {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
    margin: 0;
  }

  .auth-code {
    font-family: var(--font-label);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 3px;
    color: var(--tune-accent);
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

  /* Step 4: Scan */
  .scan-step {
    min-height: 300px;
  }

  .scan-intro {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-lg);
  }

  .scan-icon {
    animation: rotate 20s linear infinite;
  }

  @keyframes rotate {
    to { transform: rotate(360deg); }
  }

  .scan-summary {
    display: flex;
    justify-content: space-between;
    width: 100%;
    max-width: 300px;
    padding: var(--space-xs) 0;
    font-family: var(--font-body);
    font-size: 14px;
  }

  .scan-summary-label {
    color: var(--tune-text-secondary);
  }

  .scan-summary-value {
    color: var(--tune-text);
    font-weight: 600;
  }

  /* Scan progress */
  .scan-progress-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-lg);
    padding: var(--space-xl) 0;
  }

  .progress-bar-track {
    width: 100%;
    height: 6px;
    background: var(--tune-border);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: var(--tune-accent);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .progress-bar-indeterminate {
    width: 40%;
    animation: indeterminate 1.5s ease-in-out infinite;
  }

  @keyframes indeterminate {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }

  .scan-stats {
    display: flex;
    gap: var(--space-xl);
  }

  .scan-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .scan-stat-number {
    font-family: var(--font-display);
    font-size: 28px;
    font-weight: 700;
    color: var(--tune-accent);
    line-height: 1;
  }

  .scan-stat-label {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .scan-hint {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    margin: 0;
  }

  /* Scan done */
  .scan-done-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-lg);
    padding: var(--space-lg) 0;
    animation: fadeIn 0.4s ease-out;
  }

  .done-icon {
    animation: popIn 0.4s ease-out;
  }

  @keyframes popIn {
    0% { transform: scale(0.5); opacity: 0; }
    70% { transform: scale(1.1); }
    100% { transform: scale(1); opacity: 1; }
  }

  .scan-done-count {
    font-family: var(--font-body);
    font-size: 17px;
    color: var(--tune-text-secondary);
    line-height: 1.4;
  }

  .scan-final-stats {
    display: flex;
    gap: var(--space-xl);
    padding: var(--space-md) var(--space-xl);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
  }

  .scan-final-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: var(--space-sm) var(--space-md);
  }

  .scan-final-number {
    font-family: var(--font-display);
    font-size: 24px;
    font-weight: 700;
    color: var(--tune-success);
    line-height: 1;
  }

  .scan-final-label {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Error and scan messages */
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

  .spinner-sm {
    width: 12px;
    height: 12px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Mobile */
  @media (max-width: 768px) {
    .onboarding-overlay {
      padding: var(--space-md);
    }

    h1 {
      font-size: 28px;
    }

    h2 {
      font-size: 20px;
    }

    .service-list {
      max-height: 300px;
    }

    .scan-stats {
      gap: var(--space-lg);
    }

    .scan-stat-number {
      font-size: 24px;
    }

    .scan-final-stats {
      flex-direction: column;
      gap: var(--space-sm);
    }

    .welcome-features {
      max-width: 100%;
    }

    .add-dir-form {
      flex-direction: column;
    }
  }
</style>

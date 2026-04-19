<script lang="ts">
  import { get } from 'svelte/store';
  import * as api from '../lib/api';
  import { t } from '../lib/i18n';
  import { streamingServices as streamingServicesStore } from '../lib/stores/streaming';
  import { tuneWS } from '../lib/websocket';
  import { notifications } from '../lib/stores/notifications';
  import type { StreamingServiceStatus, BrowseRootEntry } from '../lib/types';

  let { onComplete }: { onComplete: () => void } = $props();

  let step = $state(1);
  const totalSteps = 4;

  // Step 2: Music library
  let musicRoots = $state<BrowseRootEntry[]>([]);
  let newMusicDirPath = $state('');
  let addingMusicDir = $state(false);
  let musicDirError = $state<string | null>(null);
  let scanning = $state(false);
  let scanMessage = $state('');

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

  // Step 4: Summary
  let configuredDirs = $derived(musicRoots.length);
  let enabledServices = $derived(
    Object.entries($streamingServicesStore).filter(([, s]) => s.enabled).map(([name]) => name)
  );
  let authenticatedServices = $derived(
    Object.entries($streamingServicesStore).filter(([, s]) => s.authenticated).map(([name]) => name)
  );

  // Load data on mount
  $effect(() => {
    loadMusicRoots();
    loadStreamingServices();
    const unsub = tuneWS.onEvent((event) => {
      if (event.type === 'library.scan.completed') {
        scanning = false;
        scanMessage = get(t)('onboarding.scanComplete');
        loadMusicRoots();
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

  async function handleScan() {
    scanning = true;
    scanMessage = '';
    try {
      await api.triggerScan();
      scanMessage = get(t)('onboarding.scanStarted');
    } catch (e: any) {
      if (e?.message?.includes('already') || e?.message?.includes('409')) {
        scanMessage = get(t)('onboarding.scanAlready');
      } else {
        scanMessage = `Error: ${e?.message || e}`;
      }
      scanning = false;
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

  // Auth handlers (reuse pattern from SettingsView)
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
    onComplete();
  }

  function skipOnboarding() {
    localStorage.setItem('tune_onboarding_completed', 'true');
    onComplete();
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
          <svg viewBox="0 0 48 48" fill="none" width="64" height="64">
            <circle cx="24" cy="24" r="22" stroke="var(--tune-accent)" stroke-width="2" fill="none" />
            <path d="M18 14v20l16-10z" fill="var(--tune-accent)" />
          </svg>
        </div>
        <h1>{$t('onboarding.welcomeTitle')}</h1>
        <p class="welcome-desc">{$t('onboarding.welcomeDesc')}</p>
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
                <span class="music-dir-count">{root.track_count} {$t('common.tracks')}</span>
              </div>
            {/each}
          </div>
        {/if}

        <div class="add-dir-form">
          <input
            type="text"
            class="input-field"
            placeholder={$t('settings.addMusicDirPlaceholder')}
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
              {$t('settings.addMusicDir')}
            {/if}
          </button>
        </div>
        {#if musicDirError}
          <p class="error-msg">{musicDirError}</p>
        {/if}

        {#if musicRoots.length > 0}
          <button class="btn-scan" onclick={handleScan} disabled={scanning}>
            {#if scanning}
              <div class="spinner"></div>
              {$t('settings.scanning')}
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {$t('settings.scanLibrary')}
            {/if}
          </button>
          {#if scanMessage}
            <p class="scan-msg">{scanMessage}</p>
          {/if}
        {/if}

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
                <span class="service-name">{capitalize(name)}</span>
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

    <!-- Step 4: Done -->
    {:else if step === 4}
      <div class="wizard-step done-step">
        <div class="done-icon">
          <svg viewBox="0 0 48 48" fill="none" width="64" height="64">
            <circle cx="24" cy="24" r="22" stroke="var(--tune-success)" stroke-width="2" fill="none" />
            <path d="M14 24l7 7 13-13" stroke="var(--tune-success)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          </svg>
        </div>
        <h1>{$t('onboarding.doneTitle')}</h1>
        <p class="welcome-desc">{$t('onboarding.doneDesc')}</p>

        <div class="summary">
          <div class="summary-item">
            <span class="summary-label">{$t('onboarding.summaryDirs')}</span>
            <span class="summary-value">{configuredDirs}</span>
          </div>
          {#if enabledServices.length > 0}
            <div class="summary-item">
              <span class="summary-label">{$t('onboarding.summaryServices')}</span>
              <span class="summary-value">{enabledServices.map(capitalize).join(', ')}</span>
            </div>
          {/if}
          {#if authenticatedServices.length > 0}
            <div class="summary-item">
              <span class="summary-label">{$t('onboarding.summaryConnected')}</span>
              <span class="summary-value">{authenticatedServices.map(capitalize).join(', ')}</span>
            </div>
          {/if}
        </div>

        <button class="btn-primary" onclick={finishOnboarding}>
          {$t('onboarding.goToDashboard')}
        </button>
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

  .welcome-step,
  .done-step {
    align-items: center;
    text-align: center;
  }

  .welcome-icon,
  .done-icon {
    margin-bottom: var(--space-md);
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

  .btn-scan {
    display: inline-flex;
    align-items: center;
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
    align-self: flex-start;
  }

  .btn-scan:hover:not(:disabled) {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .btn-scan:disabled {
    opacity: 0.5;
    cursor: default;
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

  /* Summary */
  .summary {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    width: 100%;
    max-width: 400px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
  }

  .summary-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
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

  /* Error and scan messages */
  .error-msg {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-warning);
    margin: 0;
  }

  .scan-msg {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-accent);
    font-weight: 600;
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
  }
</style>

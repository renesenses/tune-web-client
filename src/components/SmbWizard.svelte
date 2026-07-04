<script lang="ts">
  import * as api from '../lib/api';
  import { t } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import type { BrowseRootEntry } from '../lib/types';

  interface Props {
    onClose: () => void;
    onMusicDirsChanged: () => void;
  }
  let { onClose, onMusicDirsChanged }: Props = $props();

  let step = $state(1);
  const totalSteps = 4;

  // Step 1: Network scan
  interface NetworkShareInfo {
    id: string;
    name: string;
    host: string;
    protocol: string;
    shares: string[];
    available: boolean;
  }
  let networkShares = $state<NetworkShareInfo[]>([]);
  let scanning = $state(false);
  let scanError = $state<string | null>(null);
  let manualHost = $state('');
  let showScanCredentials = $state(false);
  let selectedHost = $state<NetworkShareInfo | null>(null);
  let hostShares = $state<string[]>([]);
  let loadingShares = $state(false);
  let selectedShare = $state<string | null>(null);

  // Step 2: Credentials
  let username = $state('guest');
  let password = $state('');
  let domain = $state('');
  let testingConnection = $state(false);
  let testResult = $state<'success' | 'error' | null>(null);
  let testMessage = $state('');

  // Step 3: Mount
  let mounting = $state(false);
  let mountResult = $state<{ mount_path: string; id: number } | null>(null);
  let mountError = $state<string | null>(null);
  let addingToLibrary = $state(false);
  let addedToLibrary = $state(false);
  let scanningLibrary = $state(false);
  let scanStarted = $state(false);

  // Step 4: Summary
  let summaryPath = $derived(mountResult?.mount_path ?? '');

  async function scanNetwork() {
    scanning = true;
    scanError = null;
    networkShares = [];
    try {
      const shares = await api.discoverSmbShares();
      networkShares = shares;
      if (shares.length === 0) {
        scanError = $t('smb.noSharesFound');
      }
    } catch (e: any) {
      scanError = e?.message || $t('smb.scanNetworkError');
    }
    scanning = false;
  }

  async function scanManualHost() {
    if (!manualHost.trim()) return;
    scanning = true;
    scanError = null;
    try {
      const scanUser = showScanCredentials && username !== 'guest' ? username : undefined;
      const scanPass = showScanCredentials && password ? password : undefined;
      const result = await api.scanHost(manualHost.trim(), 'smb', scanUser, scanPass);
      const shares = result.shares ?? (Array.isArray(result) ? result : []);
      if (shares.length > 0) {
        const share: NetworkShareInfo = {
          id: `smb://${manualHost.trim()}`,
          name: manualHost.trim(),
          host: manualHost.trim(),
          protocol: 'smb',
          shares: shares,
          available: true,
        };
        if (!networkShares.find(s => s.host === share.host)) {
          networkShares = [...networkShares, share];
        }
        selectHost(share);
      } else {
        const errMsg = result.error || $t('smb.noSharesOnHost').replace('{host}', manualHost.trim());
        scanError = errMsg;
        if (errMsg.includes('refusé') || errMsg.includes('auth') || errMsg.includes('Authentication') || errMsg.includes('ACCESS_DENIED')) {
          showScanCredentials = true;
        }
      }
    } catch (e: any) {
      scanError = e?.message || $t('smb.cannotScanHost');
      if (scanError!.includes('500') || scanError!.includes('auth')) {
        showScanCredentials = true;
      }
    }
    scanning = false;
  }

  async function selectHost(share: NetworkShareInfo) {
    selectedHost = share;
    selectedShare = null;
    if (share.shares.length > 0) {
      hostShares = share.shares;
    } else {
      loadingShares = true;
      try {
        const result = await api.listHostShares(share.id);
        hostShares = result.shares || [];
      } catch {
        hostShares = [];
      }
      loadingShares = false;
    }
  }

  function selectShare(shareName: string) {
    selectedShare = shareName;
  }

  function canGoToStep2() {
    return selectedHost !== null && selectedShare !== null;
  }

  async function testConnection() {
    if (!selectedHost || !selectedShare) return;
    testingConnection = true;
    testResult = null;
    testMessage = '';
    try {
      const result = await api.testSmbConnection(
        selectedHost.host,
        selectedShare,
        username || undefined,
        password || undefined,
        domain || undefined,
      );
      if (result.ok) {
        testResult = 'success';
        testMessage = result.message || $t('smb.connectionSuccess');
      } else {
        testResult = 'error';
        testMessage = result.error || $t('smb.connectionFailed');
      }
    } catch (e: any) {
      testResult = 'error';
      testMessage = e?.message || $t('smb.connectionError');
    }
    testingConnection = false;
  }

  async function mountShare() {
    if (!selectedHost || !selectedShare) return;
    mounting = true;
    mountError = null;
    try {
      const result = await api.mountSmbShare(
        selectedHost.host,
        selectedShare,
        username || undefined,
        password || undefined,
      );
      mountResult = { mount_path: result.mount_path, id: result.id };
    } catch (e: any) {
      mountError = e?.message || $t('smb.mountError');
    }
    mounting = false;
  }

  async function addToLibrary() {
    if (!mountResult) return;
    addingToLibrary = true;
    try {
      await api.addMusicDir(mountResult.mount_path);
      addedToLibrary = true;
      onMusicDirsChanged();
    } catch (e: any) {
      notifications.error(e?.message || $t('smb.addDirError'));
    }
    addingToLibrary = false;
  }

  async function startScan() {
    scanningLibrary = true;
    try {
      await api.triggerScan(mountResult?.mount_path);
      scanStarted = true;
    } catch (e: any) {
      if (e?.message?.includes('409') || e?.message?.includes('already')) {
        scanStarted = true;
      } else {
        notifications.error(e?.message || $t('smb.scanError'));
      }
    }
    scanningLibrary = false;
  }

  function goToStep(s: number) {
    step = s;
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="modal-overlay" onclick={handleOverlayClick}>
  <div class="modal-panel">
    <!-- Header -->
    <div class="wizard-header">
      <div class="wizard-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
        </svg>
        <h3>{$t('smb.title')}</h3>
      </div>
      <button class="close-btn" onclick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- Progress -->
    <div class="wizard-progress">
      {#each Array(totalSteps) as _, i}
        <div class="progress-step" class:active={step === i + 1} class:done={step > i + 1}>
          <span class="step-number">{i + 1}</span>
        </div>
        {#if i < totalSteps - 1}
          <div class="progress-line" class:done={step > i + 1}></div>
        {/if}
      {/each}
    </div>

    <!-- Step 1: Scan Network -->
    {#if step === 1}
      <div class="wizard-body">
        <p class="wizard-desc">{$t('smb.step1Desc')}</p>

        <div class="scan-actions">
          <button class="scan-btn" onclick={scanNetwork} disabled={scanning}>
            {#if scanning}
              <div class="spinner small"></div>
              {$t('smb.scanning')}
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              {$t('smb.scanNetwork')}
            {/if}
          </button>
        </div>

        <div class="manual-input">
          <span class="manual-label">{$t('smb.orEnterAddress')}</span>
          <div class="manual-row">
            <input
              type="text"
              class="auth-input"
              placeholder={$t('smb.hostPlaceholder')}
              bind:value={manualHost}
              onkeydown={(e) => { if (e.key === 'Enter') scanManualHost(); }}
            />
            <button class="scan-btn small" onclick={scanManualHost} disabled={scanning || !manualHost.trim()}>
              {$t('smb.scan')}
            </button>
          </div>
        </div>

        {#if scanError}
          <div class="wizard-error">{scanError}</div>
        {/if}

        {#if !showScanCredentials}
          <button class="link-btn" onclick={() => showScanCredentials = true}>
            {$t('smb.credentialsIfProtected')}
          </button>
        {/if}

        {#if showScanCredentials}
          <div class="scan-credentials">
            <span class="list-label">{$t('smb.credentials')}</span>
            <div class="cred-row">
              <input
                type="text"
                class="auth-input"
                placeholder={$t('smb.username')}
                bind:value={username}
              />
              <input
                type="password"
                class="auth-input"
                placeholder={$t('smb.password')}
                bind:value={password}
              />
            </div>
            <button class="scan-btn small" onclick={scanManualHost} disabled={scanning || !manualHost.trim()}>
              {$t('smb.retryWithCredentials')}
            </button>
          </div>
        {/if}

        {#if networkShares.length > 0}
          <div class="shares-list">
            <span class="list-label">{$t('smb.serversFound')}</span>
            {#each networkShares as share}
              <button
                class="share-item"
                class:selected={selectedHost?.id === share.id}
                onclick={() => selectHost(share)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" />
                </svg>
                <div class="share-info">
                  <span class="share-name">{share.name}</span>
                  <span class="share-host">{share.host}</span>
                </div>
                {#if share.shares.length > 0}
                  <span class="share-count">{$t('smb.shareCount').replace('{count}', String(share.shares.length))}</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}

        {#if selectedHost}
          <div class="sub-shares">
            <span class="list-label">{$t('smb.sharesOnHost').replace('{host}', selectedHost.name)}</span>
            {#if loadingShares}
              <div class="loading-inline"><div class="spinner small"></div> {$t('common.loading')}</div>
            {:else if hostShares.length === 0}
              <p class="muted">{$t('smb.noSharesAvailable')}</p>
            {:else}
              {#each hostShares as shareName}
                <button
                  class="share-item sub"
                  class:selected={selectedShare === shareName}
                  onclick={() => selectShare(shareName)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>{shareName}</span>
                </button>
              {/each}
            {/if}
          </div>
        {/if}
      </div>

      <div class="wizard-footer">
        <button class="btn-secondary" onclick={onClose}>{$t('common.cancel')}</button>
        <button class="btn-primary" onclick={() => goToStep(2)} disabled={!canGoToStep2()}>
          {$t('smb.next')}
        </button>
      </div>

    <!-- Step 2: Credentials -->
    {:else if step === 2}
      <div class="wizard-body">
        <p class="wizard-desc">
          {$t('smb.step2Desc')}
          <strong>{selectedHost?.name}</strong> / <strong>{selectedShare}</strong>
        </p>

        <div class="form-group">
          <label class="form-label">{$t('smb.username')}</label>
          <input type="text" class="auth-input" bind:value={username} placeholder="guest" />
        </div>

        <div class="form-group">
          <label class="form-label">{$t('smb.password')}</label>
          <input type="password" class="auth-input" bind:value={password} placeholder={$t('smb.optional')} />
        </div>

        <div class="form-group">
          <label class="form-label">{$t('smb.domain')}</label>
          <input type="text" class="auth-input" bind:value={domain} placeholder="WORKGROUP" />
        </div>

        <button class="scan-btn" onclick={testConnection} disabled={testingConnection}>
          {#if testingConnection}
            <div class="spinner small"></div>
            {$t('smb.testing')}
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            {$t('smb.testConnection')}
          {/if}
        </button>

        {#if testResult === 'success'}
          <div class="wizard-success">{testMessage}</div>
        {:else if testResult === 'error'}
          <div class="wizard-error">{testMessage}</div>
        {/if}
      </div>

      <div class="wizard-footer">
        <button class="btn-secondary" onclick={() => goToStep(1)}>{$t('common.back')}</button>
        <button class="btn-primary" onclick={() => goToStep(3)} disabled={testResult !== 'success'}>
          {$t('smb.next')}
        </button>
      </div>

    <!-- Step 3: Mount & Add -->
    {:else if step === 3}
      <div class="wizard-body">
        <p class="wizard-desc">{$t('smb.step3Desc')}</p>

        {#if !mountResult}
          <div class="mount-info">
            <div class="mount-detail">
              <span class="mount-label">{$t('smb.server')}</span>
              <span class="mount-value">{selectedHost?.host}</span>
            </div>
            <div class="mount-detail">
              <span class="mount-label">{$t('smb.share')}</span>
              <span class="mount-value">{selectedShare}</span>
            </div>
            <div class="mount-detail">
              <span class="mount-label">{$t('smb.user')}</span>
              <span class="mount-value">{username || 'guest'}</span>
            </div>
          </div>

          <button class="scan-btn" onclick={mountShare} disabled={mounting}>
            {#if mounting}
              <div class="spinner small"></div>
              {$t('smb.mounting')}
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {$t('smb.mountShare')}
            {/if}
          </button>

          {#if mountError}
            <div class="wizard-error">{mountError}</div>
          {/if}
        {:else}
          <div class="wizard-success">
            {$t('smb.mountSuccess')}
            <span class="mount-path">{mountResult.mount_path}</span>
          </div>

          {#if !addedToLibrary}
            <button class="scan-btn" onclick={addToLibrary} disabled={addingToLibrary}>
              {#if addingToLibrary}
                <div class="spinner small"></div>
                {$t('smb.adding')}
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {$t('smb.addToLibrary')}
              {/if}
            </button>
          {:else}
            <div class="wizard-success">{$t('smb.folderAdded')}</div>

            {#if !scanStarted}
              <button class="scan-btn" onclick={startScan} disabled={scanningLibrary}>
                {#if scanningLibrary}
                  <div class="spinner small"></div>
                  {$t('smb.scanStarting')}
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  {$t('smb.scanLibrary')}
                {/if}
              </button>
            {:else}
              <div class="wizard-success">{$t('smb.scanLaunched')}</div>
            {/if}
          {/if}
        {/if}
      </div>

      <div class="wizard-footer">
        <button class="btn-secondary" onclick={() => goToStep(2)}>{$t('common.back')}</button>
        <button class="btn-primary" onclick={() => goToStep(4)} disabled={!mountResult}>
          {addedToLibrary ? $t('smb.next') : $t('smb.skip')}
        </button>
      </div>

    <!-- Step 4: Done -->
    {:else if step === 4}
      <div class="wizard-body">
        <div class="done-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h4 class="done-title">{$t('smb.configDone')}</h4>
        <div class="summary">
          <div class="summary-row">
            <span class="summary-label">{$t('smb.server')}</span>
            <span class="summary-value">{selectedHost?.host}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">{$t('smb.share')}</span>
            <span class="summary-value">{selectedShare}</span>
          </div>
          {#if summaryPath}
            <div class="summary-row">
              <span class="summary-label">{$t('smb.mountPoint')}</span>
              <span class="summary-value mono">{summaryPath}</span>
            </div>
          {/if}
          <div class="summary-row">
            <span class="summary-label">{$t('smb.library')}</span>
            <span class="summary-value">{addedToLibrary ? $t('smb.added') : $t('smb.notAdded')}</span>
          </div>
          {#if scanStarted}
            <div class="summary-row">
              <span class="summary-label">{$t('smb.scanLabel')}</span>
              <span class="summary-value">{$t('smb.inProgress')}</span>
            </div>
          {/if}
        </div>
      </div>

      <div class="wizard-footer">
        <button class="btn-primary" onclick={onClose}>{$t('common.close')}</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .modal-panel {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg, 12px);
    width: 520px;
    max-width: 90vw;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
  }

  .wizard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 20px 0;
  }

  .wizard-title {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--tune-text);
  }

  .wizard-title h3 {
    font-family: var(--font-label);
    font-size: 16px;
    font-weight: 600;
    margin: 0;
  }

  .wizard-title svg {
    color: var(--tune-accent);
    flex-shrink: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.12s;
  }

  .close-btn:hover {
    color: var(--tune-text);
  }

  /* Progress */
  .wizard-progress {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 16px 20px 8px;
  }

  .progress-step {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid var(--tune-border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    color: var(--tune-text-muted);
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .progress-step.active {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
    background: rgba(117, 116, 243, 0.1);
  }

  .progress-step.done {
    border-color: var(--tune-accent);
    background: var(--tune-accent);
    color: white;
  }

  .progress-line {
    width: 40px;
    height: 2px;
    background: var(--tune-border);
    transition: background 0.2s;
  }

  .progress-line.done {
    background: var(--tune-accent);
  }

  /* Body */
  .wizard-body {
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    overflow-y: auto;
  }

  .wizard-desc {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  /* Footer */
  .wizard-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px 20px;
    border-top: 1px solid var(--tune-border);
  }

  /* Buttons */
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
    font-size: 13px;
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

  .scan-btn.small {
    padding: var(--space-xs) var(--space-md);
    font-size: 12px;
  }

  .btn-primary {
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    padding: 8px 20px;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.12s;
  }

  .btn-primary:hover:not(:disabled) { opacity: 0.9; }
  .btn-primary:disabled { opacity: 0.5; cursor: default; }

  .btn-secondary {
    background: var(--tune-grey2);
    color: var(--tune-text);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: 8px 20px;
    font-family: var(--font-body);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .btn-secondary:hover { border-color: var(--tune-accent); color: var(--tune-accent); }

  /* Form */
  .auth-input {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.12s;
  }

  .auth-input:focus { border-color: var(--tune-accent); }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-label {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    font-weight: 500;
  }

  /* Scan actions */
  .scan-actions {
    display: flex;
    gap: 8px;
  }

  .manual-input {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .manual-label {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
  }

  .manual-row {
    display: flex;
    gap: 8px;
  }

  .manual-row .auth-input {
    flex: 1;
  }

  /* Shares list */
  .shares-list, .sub-shares {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .list-label {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--tune-text-muted);
    margin-top: 4px;
  }

  .share-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.12s;
    text-align: left;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
  }

  .share-item:hover {
    border-color: var(--tune-accent);
  }

  .share-item.selected {
    border-color: var(--tune-accent);
    background: rgba(117, 116, 243, 0.08);
  }

  .share-item.sub {
    padding: 6px 12px;
    font-size: 13px;
  }

  .share-item svg {
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  .share-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .share-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .share-host {
    font-size: 11px;
    color: var(--tune-text-muted);
  }

  .share-count {
    font-size: 11px;
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  /* Mount info */
  .mount-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    background: var(--tune-bg);
    border-radius: var(--radius-md);
    border: 1px solid var(--tune-border);
  }

  .mount-detail {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-body);
    font-size: 13px;
  }

  .mount-label {
    color: var(--tune-text-secondary);
  }

  .mount-value {
    color: var(--tune-text);
    font-weight: 500;
  }

  .mount-path {
    display: block;
    font-family: monospace;
    font-size: 11px;
    color: var(--tune-text-muted);
    margin-top: 4px;
  }

  /* Status messages */
  .wizard-error {
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-sm);
    color: #ef4444;
    font-family: var(--font-body);
    font-size: 12px;
  }

  .wizard-success {
    padding: 8px 12px;
    background: rgba(74, 222, 128, 0.1);
    border: 1px solid rgba(74, 222, 128, 0.3);
    border-radius: var(--radius-sm);
    color: #4ade80;
    font-family: var(--font-body);
    font-size: 12px;
  }

  .loading-inline {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    padding: 4px 0;
  }

  .muted {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    margin: 0;
  }

  /* Done */
  .done-icon {
    display: flex;
    justify-content: center;
    color: var(--tune-accent);
    margin-bottom: 4px;
  }

  .done-title {
    font-family: var(--font-label);
    font-size: 18px;
    font-weight: 600;
    text-align: center;
    margin: 0;
    color: var(--tune-text);
  }

  .summary {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    background: var(--tune-bg);
    border-radius: var(--radius-md);
    border: 1px solid var(--tune-border);
    margin-top: 4px;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-body);
    font-size: 13px;
  }

  .summary-label {
    color: var(--tune-text-secondary);
  }

  .summary-value {
    color: var(--tune-text);
    font-weight: 500;
  }

  .summary-value.mono {
    font-family: monospace;
    font-size: 11px;
    color: var(--tune-text-muted);
    max-width: 250px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
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

  .link-btn {
    background: none; border: none; color: var(--tune-accent, #6366f1);
    font-size: 12px; cursor: pointer; padding: 4px 0; text-decoration: underline;
  }
  .link-btn:hover { opacity: 0.8; }
  .scan-credentials {
    margin-top: 10px; padding: 12px; background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.06);
    border-radius: var(--radius-md, 8px); display: flex; flex-direction: column; gap: 8px;
  }
  .cred-row {
    display: flex; gap: 8px;
  }
  .cred-row .auth-input { flex: 1; }
</style>

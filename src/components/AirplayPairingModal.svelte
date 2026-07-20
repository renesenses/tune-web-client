<script lang="ts">
  import * as api from '../lib/api';
  import { t } from '../lib/i18n';

  // The AirPlay output device id (e.g. "airplay2:AA:BB:..") and its friendly name.
  let { deviceId, deviceName = '', onClose }: {
    deviceId: string;
    deviceName?: string;
    onClose: () => void;
  } = $props();

  type Phase = 'idle' | 'starting' | 'waiting_pin' | 'pin_entry' | 'submitting' | 'connected' | 'failed';

  let phase = $state<Phase>('idle');
  let pin = $state('');
  let errorMsg = $state('');
  let polling = false;

  function stopPolling() {
    polling = false;
  }

  // Poll the server pairing status until it leaves the transient states.
  async function pollStatus() {
    if (polling) return;
    polling = true;
    while (polling) {
      let status: string;
      try {
        const res = await api.getAirplayPairStatus(deviceId);
        status = res.status || 'idle';
      } catch (e: any) {
        errorMsg = e?.message || 'status error';
        phase = 'failed';
        stopPolling();
        return;
      }
      if (status === 'pin_requested') {
        // Receiver is showing its 4-digit code; let the user type it in.
        if (phase !== 'pin_entry' && phase !== 'submitting') phase = 'pin_entry';
      } else if (status === 'connected') {
        phase = 'connected';
        stopPolling();
        // Auto-close shortly after success.
        setTimeout(() => onClose(), 1200);
        return;
      } else if (status.startsWith('failed:')) {
        errorMsg = status.slice('failed:'.length) || 'pairing failed';
        phase = 'failed';
        stopPolling();
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  async function startPairing() {
    errorMsg = '';
    pin = '';
    phase = 'starting';
    try {
      await api.startAirplayPairing(deviceId);
      phase = 'waiting_pin';
      pollStatus();
    } catch (e: any) {
      errorMsg = e?.message || 'could not start pairing';
      phase = 'failed';
    }
  }

  async function submitPin() {
    const code = pin.trim();
    if (!code) return;
    phase = 'submitting';
    errorMsg = '';
    try {
      await api.submitAirplayPairPin(deviceId, code);
      // Keep polling — the daemon reports connected/failed via pair-status.
      pollStatus();
    } catch (e: any) {
      errorMsg = e?.message || 'could not submit PIN';
      phase = 'failed';
    }
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      stopPolling();
      onClose();
    }
  }

  function handleClose() {
    stopPolling();
    onClose();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="modal-overlay" onclick={handleOverlayClick}>
  <div class="modal-panel">
    <div class="modal-header">
      <h2 class="modal-title">{$t('airplay.pairTitle')}</h2>
      <button class="close-btn" onclick={handleClose} title={$t('common.close')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>

    {#if deviceName}
      <p class="device-name">{deviceName}</p>
    {/if}

    {#if errorMsg}
      <div class="error-msg">{errorMsg}</div>
    {/if}

    <div class="modal-body">
      {#if phase === 'idle'}
        <p class="hint">{$t('airplay.pairIntro')}</p>
        <button class="btn btn-primary btn-block" onclick={startPairing}>
          {$t('airplay.pairStart')}
        </button>
      {:else if phase === 'starting' || phase === 'waiting_pin'}
        <div class="spinner-row">
          <span class="spinner"></span>
          <span>{$t('airplay.pairWaiting')}</span>
        </div>
      {:else if phase === 'pin_entry' || phase === 'submitting'}
        <p class="hint">{$t('airplay.pairEnterCode')}</p>
        <input
          class="pin-input"
          type="text"
          inputmode="numeric"
          maxlength="8"
          bind:value={pin}
          placeholder="————"
          disabled={phase === 'submitting'}
          onkeydown={(e) => e.key === 'Enter' && submitPin()}
        />
        <button
          class="btn btn-primary btn-block"
          onclick={submitPin}
          disabled={phase === 'submitting' || !pin.trim()}
        >
          {phase === 'submitting' ? '…' : $t('airplay.pairSubmit')}
        </button>
      {:else if phase === 'connected'}
        <div class="success-row">✓ {$t('airplay.pairConnected')}</div>
      {:else if phase === 'failed'}
        <button class="btn btn-primary btn-block" onclick={startPairing}>
          {$t('airplay.pairRetry')}
        </button>
      {/if}
    </div>
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
    z-index: 1100;
    backdrop-filter: blur(2px);
  }
  .modal-panel {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg, 12px);
    width: 360px;
    max-width: 90vw;
    padding: 0 0 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 8px;
  }
  .modal-title {
    font-size: 1.05rem;
    font-weight: 600;
    margin: 0;
  }
  .close-btn {
    background: none;
    border: none;
    color: var(--tune-text-secondary, #999);
    cursor: pointer;
    padding: 4px;
    display: flex;
  }
  .close-btn:hover { color: var(--tune-text, #fff); }
  .device-name {
    padding: 0 20px;
    margin: 0 0 8px;
    color: var(--tune-text-secondary, #999);
    font-size: 0.9rem;
  }
  .modal-body { padding: 8px 20px 0; }
  .hint {
    color: var(--tune-text-secondary, #aaa);
    font-size: 0.9rem;
    margin: 0 0 14px;
    line-height: 1.4;
  }
  .error-msg {
    margin: 8px 20px 0;
    padding: 8px 12px;
    background: rgba(220, 50, 50, 0.15);
    border: 1px solid rgba(220, 50, 50, 0.4);
    border-radius: 8px;
    color: #ff6b6b;
    font-size: 0.85rem;
  }
  .btn-block { width: 100%; }
  .pin-input {
    width: 100%;
    box-sizing: border-box;
    font-size: 1.6rem;
    letter-spacing: 0.4em;
    text-align: center;
    padding: 10px;
    margin-bottom: 14px;
    background: var(--tune-bg, #1a1a1a);
    border: 1px solid var(--tune-border);
    border-radius: 8px;
    color: var(--tune-text, #fff);
  }
  .spinner-row {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--tune-text-secondary, #aaa);
    font-size: 0.9rem;
    padding: 8px 0 4px;
  }
  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent, #4a9eff);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .success-row {
    color: #4ade80;
    font-size: 1rem;
    font-weight: 600;
    padding: 8px 0;
    text-align: center;
  }
</style>

<script lang="ts">
  import * as api from '../lib/api';
  import type { DiscoveredDevice } from '../lib/types';
  import { t } from '../lib/i18n';

  let bridges = $state<DiscoveredDevice[]>([]);
  let loading = $state(true);
  let error = $state('');

  async function loadBridges() {
    loading = true;
    error = '';
    try {
      const allDevices = await api.getDevices();
      bridges = allDevices.filter((d) => d.id.startsWith('bridge:'));
    } catch (e: any) {
      error = e?.message || 'Impossible de charger les bridges.';
    }
    loading = false;
  }

  // Load on mount
  loadBridges();
</script>

<div class="bridge-view">
  <h2>Tune Bridge</h2>
  <p class="bridge-subtitle">Ponts audio cloud-to-home pour l'ecoute a distance.</p>

  {#if loading}
    <div class="bridge-loading">
      <div class="spinner"></div>
      Chargement...
    </div>
  {:else if error}
    <div class="bridge-error">{error}</div>
  {:else if bridges.length === 0}
    <div class="bridge-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" class="bridge-empty-icon">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      <p class="bridge-empty-text">Aucun bridge connecte</p>
      <p class="bridge-empty-hint">
        Les bridges Tune permettent de streamer votre musique locale
        vers des appareils distants via le cloud.
      </p>
    </div>
  {:else}
    <div class="bridge-list">
      {#each bridges as bridge}
        <div class="bridge-card">
          <div class="bridge-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </div>
          <div class="bridge-info">
            <span class="bridge-name">{bridge.name}</span>
            <span class="bridge-id">{bridge.id}</span>
            {#if bridge.host}
              <span class="bridge-host">{bridge.host}:{bridge.port}</span>
            {/if}
          </div>
          <span class="bridge-status" class:available={bridge.available} class:offline={!bridge.available}>
            {bridge.available ? 'Connecte' : 'Hors ligne'}
          </span>
        </div>
      {/each}
    </div>
  {/if}

  <button class="bridge-refresh" onclick={loadBridges} disabled={loading}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
    Rafraichir
  </button>
</div>

<style>
  .bridge-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-lg) 28px;
    overflow-y: auto;
    gap: var(--space-lg);
  }

  .bridge-view h2 {
    font-family: var(--font-label);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.8px;
  }

  .bridge-subtitle {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
    margin-top: calc(-1 * var(--space-md));
  }

  .bridge-loading {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .bridge-error {
    color: #ef4444;
    font-family: var(--font-body);
    font-size: 14px;
    padding: var(--space-md);
    background: rgba(239, 68, 68, 0.1);
    border-radius: var(--radius-md);
  }

  .bridge-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-2xl) var(--space-lg);
    gap: var(--space-md);
    text-align: center;
  }

  .bridge-empty-icon {
    color: var(--tune-text-muted);
    opacity: 0.5;
  }

  .bridge-empty-text {
    font-family: var(--font-label);
    font-size: 18px;
    font-weight: 600;
    color: var(--tune-text-secondary);
  }

  .bridge-empty-hint {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    max-width: 320px;
    line-height: 1.5;
  }

  .bridge-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .bridge-card {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
  }

  .bridge-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    background: var(--tune-grey2);
    color: var(--tune-accent);
    flex-shrink: 0;
  }

  .bridge-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .bridge-name {
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text);
  }

  .bridge-id {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
    font-family: monospace;
  }

  .bridge-host {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
  }

  .bridge-status {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 9999px;
    flex-shrink: 0;
  }

  .bridge-status.available {
    background: rgba(87, 198, 185, 0.15);
    color: var(--tune-success);
  }

  .bridge-status.offline {
    background: rgba(201, 84, 75, 0.12);
    color: var(--tune-warning);
  }

  .bridge-refresh {
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
    transition: border-color 0.12s;
    align-self: flex-start;
  }

  .bridge-refresh:hover:not(:disabled) {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .bridge-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>

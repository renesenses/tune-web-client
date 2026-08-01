<script lang="ts">
  import * as api from '../lib/api';
  import { t } from '../lib/i18n';
  import { activeView, settingsInitialTab } from '../lib/stores/navigation';
  import {
    expiredStreamingSession,
    streamingServices as streamingServicesStore,
  } from '../lib/stores/streaming';

  // Services that sign in with a username and a password, and can therefore be
  // recovered right here. The others (TIDAL, Spotify and YouTube use a device
  // or OAuth flow, Deezer wants an ARL) need their own screen, so for those the
  // prompt only carries the user to Settings.
  const PASSWORD_SERVICES = ['qobuz'];

  const LABELS: Record<string, string> = {
    qobuz: 'Qobuz',
    tidal: 'TIDAL',
    spotify: 'Spotify',
    deezer: 'Deezer',
    youtube: 'YouTube',
    amazon: 'Amazon Music',
  };

  let password = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  let session = $derived($expiredStreamingSession);
  let service = $derived(session?.service ?? '');
  let label = $derived(LABELS[service] ?? service);
  let canReconnectHere = $derived(PASSWORD_SERVICES.includes(service));
  // Without a known account there is nothing to sign in with, so even a
  // password service has to fall back to the full form in Settings.
  let username = $derived(session?.username ?? '');

  function dismiss() {
    password = '';
    error = null;
    expiredStreamingSession.set(null);
  }

  function goToSettings() {
    dismiss();
    settingsInitialTab.set('services');
    activeView.set('settings');
  }

  async function reconnect(e: Event) {
    e.preventDefault();
    if (busy || !password) return;
    busy = true;
    error = null;
    try {
      const res = await api.authenticateStreaming(service, { username, password });
      if (res.authenticated) {
        // Clears the prompt through the store's own transition handling.
        streamingServicesStore.update((all) => ({
          ...all,
          [service]: { ...all[service], authenticated: true },
        }));
        password = '';
      } else {
        error = $t('settings.wrongCredentials');
      }
    } catch {
      error = $t('settings.connectionError');
    }
    busy = false;
  }
</script>

{#if session}
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="session-prompt-title"
  >
    <div class="panel">
      <h2 class="title" id="session-prompt-title">
        {$t('streaming.sessionExpiredTitle').replace('{service}', label)}
      </h2>

      <p class="body">
        {#if username}
          {$t('streaming.sessionExpiredForAccount')
            .replace('{service}', label)
            .replace('{account}', username)}
        {:else}
          {$t('streaming.sessionExpired').replace('{service}', label)}
        {/if}
      </p>

      {#if canReconnectHere && username}
        <form onsubmit={reconnect}>
          <label class="field">
            <span class="field-label">{$t('settings.password')}</span>
            <!-- svelte-ignore a11y_autofocus -->
            <input
              type="password"
              bind:value={password}
              autocomplete="current-password"
              autofocus
              disabled={busy}
            />
          </label>

          {#if error}
            <p class="error" role="alert">{error}</p>
          {/if}

          <div class="actions">
            <button type="button" class="ghost" onclick={dismiss} disabled={busy}>
              {$t('common.later')}
            </button>
            <button type="submit" class="primary" disabled={busy || !password}>
              {busy ? $t('common.loading') : $t('streaming.reconnect')}
            </button>
          </div>
        </form>
      {:else}
        <div class="actions">
          <button type="button" class="ghost" onclick={dismiss}>
            {$t('common.later')}
          </button>
          <button type="button" class="primary" onclick={goToSettings}>
            {$t('streaming.openSettings')}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1100;
    backdrop-filter: blur(2px);
  }
  .panel {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg, 12px);
    width: 380px;
    max-width: 90vw;
    padding: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  }
  .title {
    font-size: 1.05rem;
    font-weight: 600;
    margin: 0 0 8px;
  }
  .body {
    margin: 0 0 16px;
    color: var(--tune-text-secondary, #999);
    font-size: 0.9rem;
    line-height: 1.45;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }
  .field-label {
    font-size: 0.8rem;
    color: var(--tune-text-secondary, #999);
  }
  input {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm, 6px);
    color: var(--tune-text);
    font: inherit;
    padding: 8px 10px;
    width: 100%;
    box-sizing: border-box;
  }
  input:focus-visible {
    outline: 2px solid var(--tune-accent);
    outline-offset: 1px;
  }
  .error {
    color: var(--tune-error, #e5534b);
    font-size: 0.85rem;
    margin: 0 0 12px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  button {
    border-radius: var(--radius-sm, 6px);
    cursor: pointer;
    font: inherit;
    padding: 8px 14px;
  }
  button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  button:focus-visible {
    outline: 2px solid var(--tune-accent);
    outline-offset: 2px;
  }
  .ghost {
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-secondary, #999);
  }
  .ghost:hover:not(:disabled) {
    color: var(--tune-text);
  }
  .primary {
    background: var(--tune-accent);
    border: 1px solid var(--tune-accent);
    color: #fff;
  }
</style>

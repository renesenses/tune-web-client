<script lang="ts">
  import { dialogs } from '../lib/stores/dialogs';
  import { t } from '../lib/i18n';

  // Head of the queue — the store serializes concurrent requests.
  let current = $derived($dialogs[0] ?? null);
  let value = $state('');
  let currentId = -1;

  // Seed the input when a new request becomes visible (and only then —
  // typing must not be overwritten by the $effect re-running).
  $effect(() => {
    if (current && current.id !== currentId) {
      currentId = current.id;
      value = current.initial;
    }
  });

  function validate() {
    if (!current) return;
    dialogs.settle(current.id, current.kind === 'prompt' ? value : true);
  }
  function cancel() {
    if (!current) return;
    dialogs.settle(current.id, current.kind === 'prompt' ? null : false);
  }
  function onWindowKeydown(e: KeyboardEvent) {
    if (!current) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      validate();
    }
  }
  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) cancel();
  }
  // Focus the input (prompt) or the validate button (confirm) so Enter/Escape
  // work without a click and screen readers land inside the dialog.
  function autofocus(node: HTMLElement) {
    node.focus();
    if (node instanceof HTMLInputElement) node.select();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if current}
  <div class="modal-backdrop" onclick={handleBackdropClick} role="presentation">
    <div class="modal" role={current.kind === 'confirm' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-label={current.message}>
      <p class="dialog-message">{current.message}</p>
      {#if current.kind === 'prompt'}
        <input class="dialog-input" type="text" bind:value use:autofocus />
      {/if}
      <div class="dialog-actions">
        <button class="dialog-btn" onclick={cancel}>{$t('common.cancel')}</button>
        {#if current.kind === 'prompt'}
          <button class="dialog-btn primary" onclick={validate}>{$t('common.ok')}</button>
        {:else}
          <button class="dialog-btn primary" class:danger={current.danger} onclick={validate} use:autofocus>{$t('common.ok')}</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    /* Above the other modals (200): a confirmation can be asked from one. */
    z-index: 300;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    width: min(400px, calc(100vw - 32px));
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    animation: slideUp 0.2s ease-out;
  }

  @keyframes slideUp {
    from { transform: translateY(16px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .dialog-message {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--tune-text);
    white-space: pre-line;
    word-break: break-word;
  }

  .dialog-input {
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-sm);
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text);
    font-size: 14px;
  }

  .dialog-input:focus {
    outline: none;
    border-color: var(--tune-accent);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
  }

  .dialog-btn {
    padding: 6px 16px;
    border-radius: var(--radius-md);
    border: 1px solid var(--tune-border);
    background: transparent;
    color: var(--tune-text);
    font-size: 13px;
    cursor: pointer;
    transition: background 0.12s ease-out;
  }

  .dialog-btn:hover {
    background: var(--tune-surface-hover, rgba(255, 255, 255, 0.06));
  }

  .dialog-btn.primary {
    background: var(--tune-accent);
    border-color: var(--tune-accent);
    color: var(--tune-bg);
  }

  .dialog-btn.primary:hover {
    filter: brightness(1.1);
  }

  .dialog-btn.primary.danger {
    background: #c9544b;
    border-color: #c9544b;
    color: #fff;
  }
</style>

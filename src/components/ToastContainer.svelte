<script lang="ts">
  import { notifications } from '../lib/stores/notifications';
</script>

{#each $notifications as n (n.id)}
  <div
    class="toast"
    class:toast-error={n.level === 'error'}
    class:toast-success={n.level === 'success'}
    class:toast-info={n.level === 'info'}
  >
    <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
      {#if n.level === 'error'}
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      {:else if n.level === 'success'}
        <circle cx="12" cy="12" r="10" /><polyline points="9 12 11.5 14.5 16 9.5" />
      {:else}
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
      {/if}
    </svg>
    <span class="toast-msg">{n.message}</span>
    <button class="toast-dismiss" onclick={() => notifications.dismiss(n.id)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
    </button>
  </div>
{/each}

<style>
  .toast {
    position: fixed;
    bottom: calc(var(--transport-height) + 16px);
    left: calc(var(--sidebar-width) + (100vw - var(--sidebar-width)) / 2);
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: 13px;
    z-index: 200;
    max-width: 500px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    animation: toastSlideIn 0.25s ease-out;
  }

  /* Stack toasts vertically */
  .toast:nth-child(2) { bottom: calc(var(--transport-height) + 68px); }
  .toast:nth-child(3) { bottom: calc(var(--transport-height) + 120px); }

  .toast-error {
    background: #2A1A1A;
    border: 1px solid #6B2D2D;
    color: #E8A0A0;
  }

  .toast-error .toast-icon {
    color: #C9544B;
  }

  .toast-success {
    background: #1A2A1A;
    border: 1px solid #2D6B3D;
    color: #A0E8B0;
  }

  .toast-success .toast-icon {
    color: #4BC96A;
  }

  .toast-info {
    background: #1A2A2A;
    border: 1px solid #2D5B6B;
    color: #A0D8E8;
  }

  .toast-info .toast-icon {
    color: #4B9FC9;
  }

  .toast-icon {
    flex-shrink: 0;
  }

  .toast-msg {
    flex: 1;
    min-width: 0;
  }

  .toast-dismiss {
    flex-shrink: 0;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 2px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.7;
    transition: opacity 0.12s ease-out;
  }

  .toast-dismiss:hover {
    opacity: 1;
  }

  @keyframes toastSlideIn {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  /* Tablet: sidebar icones */
  @media (min-width: 769px) and (max-width: 1024px) {
    .toast {
      left: calc(var(--sidebar-collapsed-width) + (100vw - var(--sidebar-collapsed-width)) / 2);
    }
  }

  /* Mobile: pas de sidebar */
  @media (max-width: 768px) {
    .toast {
      left: 50%;
      bottom: calc(var(--mini-player-height) + var(--tab-bar-height) + 16px);
    }
    .toast:nth-child(2) { bottom: calc(var(--mini-player-height) + var(--tab-bar-height) + 68px); }
    .toast:nth-child(3) { bottom: calc(var(--mini-player-height) + var(--tab-bar-height) + 120px); }
  }
</style>

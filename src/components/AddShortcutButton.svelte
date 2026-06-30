<script lang="ts">
  import { addShortcut } from '../lib/stores/shortcuts';
  import { notifications } from '../lib/stores/notifications';

  let showInput = $state(false);
  let name = $state('');
  let icon = $state('⭐');

  const icons = ['⭐','📚','🎵','🎧','📻','💎','🎸','🎹','🎷','🎺','🎻','🎤','💿','🔊','❤️','🏠'];

  async function save() {
    if (!name.trim()) return;
    await addShortcut(name.trim(), icon);
    notifications.success(`Raccourci "${name.trim()}" ajouté`);
    name = '';
    icon = '⭐';
    showInput = false;
  }
</script>

<div class="shortcut-add-wrapper">
  {#if showInput}
    <div class="shortcut-add-popover">
      <select bind:value={icon} class="sc-icon-pick">
        {#each icons as e}
          <option value={e}>{e}</option>
        {/each}
      </select>
      <input
        type="text"
        class="sc-name-input"
        placeholder="Nom du raccourci"
        bind:value={name}
        onkeydown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') showInput = false; }}
      />
      <button class="sc-ok" onclick={save}>OK</button>
      <button class="sc-cancel" onclick={() => showInput = false}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  {:else}
    <button class="shortcut-add-btn" onclick={() => showInput = true} title="Ajouter aux raccourcis">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
    </button>
  {/if}
</div>

<style>
  .shortcut-add-wrapper {
    display: inline-flex;
    align-items: center;
  }

  .shortcut-add-btn {
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-muted);
    border-radius: var(--radius-sm);
    cursor: pointer;
    padding: 4px 6px;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    transition: all 0.12s;
  }

  .shortcut-add-btn:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  .shortcut-add-popover {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 4px 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  }

  .sc-icon-pick {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 2px;
    font-size: 14px;
    width: 32px;
    cursor: pointer;
    outline: none;
  }

  .sc-name-input {
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 12px;
    outline: none;
    width: 140px;
  }

  .sc-name-input:focus {
    border-color: var(--tune-accent);
  }

  .sc-ok {
    background: var(--tune-accent);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
  }

  .sc-cancel {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
  }

  .sc-cancel:hover {
    color: var(--tune-error, #ef4444);
  }
</style>

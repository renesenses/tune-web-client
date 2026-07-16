<script lang="ts">
  import { profiles, currentProfileId, selectProfile } from '../lib/stores/profile';
  import { t } from '../lib/i18n';

  // Shown once per app load. "Picker only if >1 profile": single-profile setups
  // never see it and go straight in.
  let dismissed = $state(false);
  const show = $derived($profiles.length > 1 && !dismissed);

  async function pick(id: number) {
    await selectProfile(id);
    dismissed = true;
  }
</script>

{#if show}
  <div class="profile-picker-overlay">
    <div class="profile-picker">
      <h1>{$t('profiles.whoIsListening' as any)}</h1>
      <div class="picker-grid">
        {#each $profiles as p (p.id)}
          <button class="picker-item" class:current={p.id === $currentProfileId} onclick={() => pick(p.id)}>
            <span class="picker-avatar" style="background: {p.avatar_color}">{p.name.charAt(0).toUpperCase()}</span>
            <span class="picker-name">{p.name}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .profile-picker-overlay {
    position: fixed; inset: 0; z-index: 9999;
    display: flex; align-items: center; justify-content: center;
    background: var(--tune-bg, #0d0d0f);
  }
  .profile-picker { text-align: center; padding: 2rem; }
  .profile-picker h1 {
    font-size: 2rem; font-weight: 600; margin: 0 0 2.5rem;
    color: var(--tune-text, #eee);
  }
  .picker-grid {
    display: flex; flex-wrap: wrap; gap: 1.5rem; justify-content: center;
    max-width: 640px;
  }
  .picker-item {
    display: flex; flex-direction: column; align-items: center; gap: 0.7rem;
    background: none; border: none; cursor: pointer; padding: 0.5rem;
    border-radius: 12px; transition: transform 0.12s ease;
  }
  .picker-item:hover { transform: scale(1.06); }
  .picker-avatar {
    width: 96px; height: 96px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 600; font-size: 2.4rem;
    border: 3px solid transparent;
  }
  .picker-item.current .picker-avatar { border-color: var(--tune-accent, #6366f1); }
  .picker-item:hover .picker-avatar { border-color: var(--tune-text, #fff); }
  .picker-name { color: var(--tune-text-dim, #aaa); font-size: 1rem; }
  .picker-item:hover .picker-name { color: var(--tune-text, #fff); }
</style>

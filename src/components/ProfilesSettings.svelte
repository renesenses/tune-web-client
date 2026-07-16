<script lang="ts">
  import { profiles, currentProfileId, createProfile, deleteProfile, updateProfile, selectProfile, type Profile } from '../lib/stores/profile';
  import { isPremium } from '../lib/stores/license';
  import { t } from '../lib/i18n';

  const avatarColors = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444', '#3b82f6'];

  let newName = $state('');
  let newColor = $state(avatarColors[0]);
  let creating = $state(false);
  let createError = $state('');

  let editingId = $state<number | null>(null);
  let editName = $state('');
  let editColor = $state('');

  async function handleCreate() {
    const name = newName.trim();
    if (!name || creating) return;
    creating = true;
    createError = '';
    const created = await createProfile(name, newColor);
    creating = false;
    if (created) {
      newName = '';
      newColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];
    } else {
      // createProfile returns null on failure; the common case is the premium
      // gate (server replies 403 premium_required).
      createError = $t('profiles.createFailed' as any);
    }
  }

  function startEdit(p: Profile) {
    editingId = p.id;
    editName = p.name;
    editColor = p.avatar_color;
  }

  async function saveEdit() {
    if (editingId === null) return;
    const name = editName.trim();
    if (name) await updateProfile(editingId, name, editColor);
    editingId = null;
  }

  async function handleDelete(p: Profile) {
    if (!confirm($t('profiles.confirmDelete' as any).replace('{name}', p.name))) return;
    await deleteProfile(p.id);
  }
</script>

<section class="settings-section">
  <h3>{$t('settings.tabProfiles')}</h3>
  <p class="section-hint">{$t('profiles.hint' as any)}</p>

  <div class="profiles-list">
    {#each $profiles as p (p.id)}
      <div class="profile-row" class:active={p.id === $currentProfileId}>
        {#if editingId === p.id}
          <span class="avatar-circle" style="background: {editColor}">{editName.charAt(0).toUpperCase()}</span>
          <input class="profile-edit-name" bind:value={editName} onkeydown={(e) => e.key === 'Enter' && saveEdit()} />
          <div class="color-picker">
            {#each avatarColors as color}
              <button class="color-dot" class:selected={editColor === color} style="background: {color}" onclick={() => editColor = color} aria-label={color}></button>
            {/each}
          </div>
          <button class="btn-small" onclick={saveEdit}>{$t('common.save')}</button>
          <button class="btn-small ghost" onclick={() => editingId = null}>{$t('common.cancel')}</button>
        {:else}
          <button class="profile-main" onclick={() => selectProfile(p.id)}>
            <span class="avatar-circle" style="background: {p.avatar_color}">{p.name.charAt(0).toUpperCase()}</span>
            <span class="profile-name">{p.name}</span>
            {#if p.id === $currentProfileId}<span class="badge-active">{$t('profiles.active' as any)}</span>{/if}
          </button>
          <button class="btn-small ghost" onclick={() => startEdit(p)}>{$t('common.edit')}</button>
          {#if $profiles.length > 1}
            <button class="btn-small danger" onclick={() => handleDelete(p)}>{$t('common.delete')}</button>
          {/if}
        {/if}
      </div>
    {/each}
  </div>

  <div class="create-profile">
    <h4>{$t('profiles.createTitle' as any)}</h4>
    {#if $isPremium}
      <div class="create-row">
        <span class="avatar-circle" style="background: {newColor}">{(newName.trim().charAt(0) || '?').toUpperCase()}</span>
        <input
          class="profile-edit-name"
          placeholder={$t('profiles.namePlaceholder' as any)}
          bind:value={newName}
          onkeydown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <div class="color-picker">
          {#each avatarColors as color}
            <button class="color-dot" class:selected={newColor === color} style="background: {color}" onclick={() => newColor = color} aria-label={color}></button>
          {/each}
        </div>
        <button class="btn-small primary" disabled={!newName.trim() || creating} onclick={handleCreate}>
          {creating ? $t('common.loading') : $t('profiles.createButton' as any)}
        </button>
      </div>
      {#if createError}<p class="create-error">{createError}</p>{/if}
    {:else}
      <div class="premium-upsell">
        <p>{$t('profiles.premiumRequired' as any)}</p>
      </div>
    {/if}
  </div>
</section>

<style>
  .section-hint { color: var(--tune-text-dim, #888); font-size: 0.85rem; margin: 0 0 1rem; }
  .profiles-list { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem; }
  .profile-row {
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.5rem 0.7rem; border-radius: 8px;
    background: var(--tune-bg-elevated, rgba(255,255,255,0.04));
    border: 1px solid transparent;
  }
  .profile-row.active { border-color: var(--tune-accent, #6366f1); }
  .profile-main {
    display: flex; align-items: center; gap: 0.6rem; flex: 1;
    background: none; border: none; color: inherit; cursor: pointer; text-align: left; padding: 0;
  }
  .avatar-circle {
    width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 600; font-size: 0.9rem;
  }
  .profile-name { font-weight: 500; }
  .badge-active {
    font-size: 0.7rem; padding: 0.1rem 0.45rem; border-radius: 10px;
    background: var(--tune-accent, #6366f1); color: #fff;
  }
  .profile-edit-name {
    flex: 1; min-width: 120px; padding: 0.4rem 0.6rem; border-radius: 6px;
    border: 1px solid var(--tune-border, rgba(255,255,255,0.15));
    background: var(--tune-bg, #1a1a1a); color: var(--tune-text, #eee);
  }
  .color-picker { display: flex; gap: 0.25rem; }
  .color-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
  .color-dot.selected { border-color: var(--tune-text, #fff); }
  .btn-small {
    padding: 0.35rem 0.7rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer;
    border: 1px solid var(--tune-border, rgba(255,255,255,0.15));
    background: var(--tune-bg-elevated, rgba(255,255,255,0.06)); color: var(--tune-text, #eee);
  }
  .btn-small.primary { background: var(--tune-accent, #6366f1); border-color: transparent; color: #fff; }
  .btn-small.danger { color: #ef4444; }
  .btn-small.ghost { opacity: 0.75; }
  .btn-small:disabled { opacity: 0.4; cursor: default; }
  .create-profile { border-top: 1px solid var(--tune-border, rgba(255,255,255,0.1)); padding-top: 1rem; }
  .create-profile h4 { margin: 0 0 0.7rem; font-size: 0.95rem; }
  .create-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .create-error { color: #ef4444; font-size: 0.8rem; margin: 0.5rem 0 0; }
  .premium-upsell {
    padding: 0.8rem 1rem; border-radius: 8px;
    background: var(--tune-bg-elevated, rgba(245,158,11,0.08));
    border: 1px solid rgba(245,158,11,0.3);
  }
  .premium-upsell p { margin: 0; font-size: 0.85rem; }
</style>

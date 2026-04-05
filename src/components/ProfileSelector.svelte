<script lang="ts">
  import { profiles, currentProfileId, createProfile, selectProfile, deleteProfile, type Profile } from '../lib/stores/profile';
  import { t } from '../lib/i18n';

  let dropdownOpen = $state(false);
  let showCreateDialog = $state(false);
  let newName = $state('');
  let newColor = $state('#6366f1');

  const avatarColors = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444', '#3b82f6'];

  let currentProfile = $derived($profiles.find(p => p.id === $currentProfileId) ?? null);

  function toggleDropdown() {
    dropdownOpen = !dropdownOpen;
  }

  function handleSelect(profile: Profile) {
    selectProfile(profile.id);
    dropdownOpen = false;
  }

  function openCreateDialog() {
    newName = '';
    newColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];
    showCreateDialog = true;
    dropdownOpen = false;
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    await createProfile(newName.trim(), newColor);
    showCreateDialog = false;
  }

  async function handleDelete(e: MouseEvent, profile: Profile) {
    e.stopPropagation();
    if ($profiles.length <= 1) return;
    await deleteProfile(profile.id);
  }

  function closeDropdown() {
    dropdownOpen = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="profile-selector">
  <button class="profile-current" onclick={toggleDropdown} title={$t('profile.select')}>
    <span class="avatar-circle" style="background: {currentProfile?.avatar_color ?? '#6366f1'}">
      {currentProfile ? currentProfile.name.charAt(0).toUpperCase() : '?'}
    </span>
    <span class="profile-name truncate">{currentProfile?.name ?? '...'}</span>
    <svg class="chevron" class:open={dropdownOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="6 9 12 15 18 9" /></svg>
  </button>

  {#if dropdownOpen}
    <div class="dropdown-backdrop" onclick={closeDropdown}></div>
    <div class="dropdown">
      {#each $profiles as profile}
        <div class="dropdown-row">
          <button class="dropdown-item" class:active={profile.id === $currentProfileId} onclick={() => handleSelect(profile)}>
            <span class="avatar-circle small" style="background: {profile.avatar_color}">
              {profile.name.charAt(0).toUpperCase()}
            </span>
            <span class="dropdown-item-name truncate">{profile.name}</span>
            {#if profile.id === $currentProfileId}
              <svg class="check" viewBox="0 0 24 24" fill="none" stroke="var(--tune-accent)" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
            {/if}
          </button>
          {#if $profiles.length > 1}
            <button class="delete-btn" onclick={(e) => handleDelete(e, profile)} title={$t('profile.delete')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          {/if}
        </div>
      {/each}
      <button class="dropdown-item create-item" onclick={openCreateDialog}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        <span>{$t('profile.create')}</span>
      </button>
    </div>
  {/if}
</div>

{#if showCreateDialog}
  <div class="modal-backdrop" onclick={() => showCreateDialog = false}>
    <div class="modal" role="presentation" onclick={(e) => e.stopPropagation()}>
      <h3>{$t('profile.create')}</h3>
      <div class="form-field">
        <label>{$t('profile.name')}</label>
        <input type="text" bind:value={newName} placeholder={$t('profile.name')} onkeydown={(e) => e.key === 'Enter' && handleCreate()} />
      </div>
      <div class="color-picker">
        {#each avatarColors as color}
          <button class="color-swatch" class:selected={newColor === color} style="background: {color}" onclick={() => newColor = color}></button>
        {/each}
      </div>
      <div class="preview">
        <span class="avatar-circle preview-avatar" style="background: {newColor}">
          {newName ? newName.charAt(0).toUpperCase() : '?'}
        </span>
        <span class="preview-name">{newName || '...'}</span>
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick={() => showCreateDialog = false}>{$t('common.cancel')}</button>
        <button class="btn-create" onclick={handleCreate}>{$t('common.create')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .profile-selector {
    position: relative;
    padding: 0 18px;
    margin-bottom: var(--space-sm);
  }

  .profile-current {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    background: var(--tune-grey2);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s ease-out;
  }

  .profile-current:hover {
    border-color: var(--tune-text-muted);
  }

  .avatar-circle {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-label);
    font-size: 12px;
    font-weight: 600;
    color: white;
    flex-shrink: 0;
  }

  .avatar-circle.small {
    width: 20px;
    height: 20px;
    font-size: 10px;
  }

  .profile-name {
    flex: 1;
    text-align: left;
    min-width: 0;
  }

  .chevron {
    flex-shrink: 0;
    opacity: 0.5;
    transition: transform 0.15s ease-out;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dropdown-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 18px;
    right: 18px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    z-index: 100;
    padding: 4px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    max-height: 300px;
    overflow-y: auto;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--tune-text-secondary);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all 0.12s ease-out;
  }

  .dropdown-item:hover {
    background: var(--tune-surface-hover);
    color: var(--tune-text);
  }

  .dropdown-item.active {
    color: var(--tune-text);
  }

  .dropdown-item-name {
    flex: 1;
    text-align: left;
    min-width: 0;
  }

  .check {
    flex-shrink: 0;
  }

  .dropdown-row {
    display: flex;
    align-items: center;
    gap: 0;
  }

  .dropdown-row .dropdown-item {
    flex: 1;
    min-width: 0;
  }

  .delete-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.12s, color 0.12s;
    flex-shrink: 0;
  }

  .dropdown-row:hover .delete-btn {
    opacity: 0.7;
  }

  .delete-btn:hover {
    color: #ef4444;
    opacity: 1 !important;
  }

  .create-item {
    border-top: 1px solid var(--tune-border);
    margin-top: 4px;
    padding-top: 8px;
    color: var(--tune-accent);
  }

  .create-item:hover {
    color: var(--tune-accent);
  }

  /* Create dialog modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 300;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.15s ease-out;
  }

  .modal {
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg, 12px);
    padding: 24px;
    min-width: 320px;
    max-width: 400px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
  }

  .modal h3 {
    font-family: var(--font-label);
    font-size: 18px;
    font-weight: 600;
    color: var(--tune-text);
    margin-bottom: 16px;
  }

  .form-field {
    margin-bottom: 16px;
  }

  .form-field label {
    display: block;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-muted);
    margin-bottom: 6px;
  }

  .form-field input {
    width: 100%;
    padding: 8px 12px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
  }

  .form-field input:focus {
    border-color: var(--tune-accent);
  }

  .color-picker {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .color-swatch {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.12s;
  }

  .color-swatch.selected {
    border-color: white;
    box-shadow: 0 0 0 2px var(--tune-accent);
  }

  .preview {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    background: var(--tune-bg);
    border-radius: var(--radius-md);
    margin-bottom: 16px;
  }

  .preview-avatar {
    width: 32px;
    height: 32px;
    font-size: 14px;
  }

  .preview-name {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn-cancel {
    padding: 8px 16px;
    background: none;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text-secondary);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
  }

  .btn-cancel:hover {
    border-color: var(--tune-text-muted);
    color: var(--tune-text);
  }

  .btn-create {
    padding: 8px 16px;
    background: var(--tune-accent);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 500;
  }

  .btn-create:hover {
    filter: brightness(1.1);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* Tablet: hide text */
  @media (min-width: 769px) and (max-width: 1024px) {
    .profile-selector {
      padding: 0 8px;
    }
    .profile-name, .chevron {
      display: none;
    }
    .profile-current {
      justify-content: center;
      padding: 6px;
    }
    .dropdown {
      left: 8px;
      right: auto;
      min-width: 200px;
    }
  }

  /* Mobile: hidden (profile is in settings or bottom bar) */
  @media (max-width: 768px) {
    .profile-selector {
      display: none;
    }
  }
</style>

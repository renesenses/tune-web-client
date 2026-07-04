<script lang="ts">
  import { get } from 'svelte/store';
  import { activeView, pendingSearchQuery } from '../lib/stores/navigation';
  import { currentZone, playAndSync } from '../lib/stores/zones';
  import { notifications } from '../lib/stores/notifications';
  import * as api from '../lib/api';
  import { t } from '../lib/i18n';
  import AlbumArt from './AlbumArt.svelte';
  import type { Track, Album, FederatedSearchResult } from '../lib/types';

  let expanded = $state(false);
  let query = $state('');
  let loading = $state(false);
  let quickResults: FederatedSearchResult | null = $state(null);
  let showOverlay = $state(false);

  let inputEl: HTMLInputElement | undefined = $state();

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 300;

  function openSearch() {
    expanded = true;
    // Wait for DOM update before focusing
    setTimeout(() => inputEl?.focus(), 50);
  }

  function closeSearch() {
    expanded = false;
    showOverlay = false;
    query = '';
    quickResults = null;
    loading = false;
    if (debounceTimer) clearTimeout(debounceTimer);
  }

  function handleInput() {
    if (!query.trim()) {
      quickResults = null;
      showOverlay = false;
      loading = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      return;
    }
    showOverlay = true;
    loading = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runQuickSearch, DEBOUNCE_MS);
  }

  async function runQuickSearch() {
    if (!query.trim()) return;
    try {
      const results = await api.federatedSearch(query.trim());
      quickResults = results;
    } catch (e) {
      console.error('Global search error:', e);
    }
    loading = false;
  }

  function goToFullSearch() {
    if (!query.trim()) return;
    pendingSearchQuery.set(query.trim());
    activeView.set('search');
    closeSearch();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      goToFullSearch();
    } else if (e.key === 'Escape') {
      closeSearch();
    }
  }

  function handleOverlayClick() {
    closeSearch();
  }

  // Quick-play a track directly from the dropdown
  async function playTrack(track: Track) {
    const zone = $currentZone;
    if (!zone?.id) {
      notifications.error(get(t)('search.noZone'));
      return;
    }
    try {
      if (track.id) {
        await playAndSync(zone.id, { track_id: track.id });
      } else if (track.source && track.source_id) {
        await playAndSync(zone.id, { source: track.source, source_id: track.source_id });
      }
    } catch (e) {
      console.error('Quick play error:', e);
    }
    closeSearch();
  }

  // Collect quick result items to show (max 3 tracks, 3 albums, 3 artists across all sources)
  let quickTracks = $derived.by(() => {
    if (!quickResults) return [] as Track[];
    const tracks: Track[] = [];
    if (quickResults.local?.tracks) tracks.push(...quickResults.local.tracks);
    for (const data of Object.values(quickResults.services ?? {})) {
      tracks.push(...data.tracks);
    }
    return tracks.slice(0, 5);
  });

  let quickAlbums = $derived.by(() => {
    if (!quickResults) return [] as Album[];
    const albums: Album[] = [];
    if (quickResults.local?.albums) albums.push(...quickResults.local.albums);
    for (const data of Object.values(quickResults.services ?? {})) {
      albums.push(...data.albums);
    }
    return albums.slice(0, 4);
  });

  let hasResults = $derived(
    quickTracks.length > 0 || quickAlbums.length > 0
  );
</script>

<!-- Dark overlay behind dropdown (covers main content) -->
{#if showOverlay}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="search-overlay" onclick={handleOverlayClick}></div>
{/if}

<div class="global-search-bar">
  {#if !expanded}
    <!-- Collapsed: just the magnifying glass icon button -->
    <button
      class="search-icon-btn"
      onclick={openSearch}
      title={$t('nav.search')}
      aria-label={$t('nav.search')}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    </button>
  {:else}
    <!-- Expanded: search input field -->
    <div class="search-input-wrapper" class:has-results={showOverlay && hasResults}>
      <svg class="search-icon-inner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        bind:this={inputEl}
        bind:value={query}
        type="text"
        class="search-input"
        placeholder={$t('search.placeholder')}
        oninput={handleInput}
        onkeydown={handleKeydown}
        autocomplete="off"
        spellcheck={false}
      />
      {#if loading}
        <span class="search-spinner"></span>
      {/if}
      <button class="close-btn" onclick={closeSearch} title={$t('common.close')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- Quick results dropdown -->
    {#if showOverlay && !loading && (hasResults || (query.trim().length > 0 && quickResults !== null))}
      <div class="search-dropdown">
        {#if quickTracks.length > 0}
          <div class="dropdown-section-label">{$t('home.tracks')}</div>
          {#each quickTracks as track}
            <button class="dropdown-item" onclick={() => playTrack(track)}>
              <AlbumArt coverPath={track.cover_path} albumId={track.album_id} size={32} alt={track.title} />
              <div class="dropdown-item-info">
                <span class="dropdown-item-title">{track.title}</span>
                <span class="dropdown-item-sub">{track.artist_name ?? ''}</span>
              </div>
            </button>
          {/each}
        {/if}

        {#if quickAlbums.length > 0}
          <div class="dropdown-section-label">{$t('common.albums')}</div>
          {#each quickAlbums as album}
            <button class="dropdown-item" onclick={() => { pendingSearchQuery.set(query.trim()); activeView.set('search'); closeSearch(); }}>
              <AlbumArt coverPath={album.cover_path} size={32} alt={album.title} />
              <div class="dropdown-item-info">
                <span class="dropdown-item-title">{album.title}</span>
                <span class="dropdown-item-sub">{album.artist_name ?? ''}</span>
              </div>
            </button>
          {/each}
        {/if}

        {#if !hasResults && query.trim().length > 0}
          <div class="dropdown-empty">{$t('search.noResults').replace('{query}', query.trim())}</div>
        {/if}

        <!-- Footer: go to full search results -->
        {#if query.trim().length > 0}
          <button class="dropdown-full-search" onclick={goToFullSearch}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {$t('search.viewAllResults').replace('{query}', query.trim())}
          </button>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .search-overlay {
    position: fixed;
    top: 0;
    left: var(--sidebar-width, 280px);
    right: 0;
    bottom: var(--transport-height, 90px);
    background: rgba(0, 0, 0, 0.5);
    z-index: 80;
    animation: fadeIn 0.15s ease-out;
  }

  /* Tablet: narrower sidebar */
  @media (min-width: 769px) and (max-width: 1024px) {
    .search-overlay {
      left: var(--sidebar-collapsed-width, 64px);
    }
  }

  /* Mobile: no sidebar, but don't cover tab bar */
  @media (max-width: 768px) {
    .search-overlay {
      left: 0;
      bottom: var(--tab-bar-height, 56px);
    }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .global-search-bar {
    position: relative;
    z-index: 90;
    display: flex;
    align-items: center;
  }

  /* Collapsed state: icon button */
  .search-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: transparent;
    border: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
    flex-shrink: 0;
  }

  .search-icon-btn:hover {
    background: var(--tune-surface-hover);
    color: var(--tune-text);
  }

  /* Expanded state: input wrapper */
  .search-input-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 20px;
    padding: 0 12px;
    width: 320px;
    max-width: calc(100vw - 120px);
    height: 36px;
    transition: border-color 0.12s, box-shadow 0.12s;
  }

  .search-input-wrapper:focus-within {
    border-color: var(--tune-accent);
    box-shadow: 0 0 0 2px rgba(var(--tune-accent-rgb, 99, 102, 241), 0.15);
  }

  .search-input-wrapper.has-results {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border-bottom-color: var(--tune-border);
  }

  .search-icon-inner {
    color: var(--tune-text-muted);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 14px;
    min-width: 0;
  }

  .search-input::placeholder {
    color: var(--tune-text-muted);
  }

  .search-spinner {
    display: block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--tune-border);
    border-top-color: var(--tune-accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 2px;
    border-radius: 50%;
    flex-shrink: 0;
    transition: color 0.12s;
  }

  .close-btn:hover {
    color: var(--tune-text);
  }

  /* Dropdown */
  .search-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    width: 320px;
    max-width: calc(100vw - 40px);
    background: var(--tune-surface);
    border: 1px solid var(--tune-accent);
    border-top: none;
    border-bottom-left-radius: 12px;
    border-bottom-right-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    max-height: 480px;
    overflow-y: auto;
    z-index: 90;
  }

  .dropdown-section-label {
    font-family: var(--font-label);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--tune-text-muted);
    padding: 8px 12px 4px;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 6px 12px;
    background: none;
    border: none;
    color: var(--tune-text);
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .dropdown-item:hover {
    background: var(--tune-surface-hover);
  }

  .dropdown-item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .dropdown-item-title {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dropdown-item-sub {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dropdown-empty {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-muted);
    padding: 12px;
    text-align: center;
  }

  .dropdown-full-search {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    background: none;
    border: none;
    border-top: 1px solid var(--tune-border);
    color: var(--tune-accent);
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .dropdown-full-search:hover {
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.08);
  }

  /* Mobile: make input narrower */
  @media (max-width: 768px) {
    .search-input-wrapper {
      width: 220px;
    }

    .search-dropdown {
      width: 280px;
      right: 0;
    }
  }
</style>

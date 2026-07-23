<script lang="ts">
  import { t as tr } from '../lib/i18n';

  interface Props {
    /** Dismiss the menu (also invoked before every action). */
    onClose: () => void;
    onPlay: () => void;
    onAddToQueue: () => void;
    /** Omit to hide the "add to playlist" item. */
    onAddToPlaylist?: () => void;
    /** Omit to hide the "go to artist" item. Caller resolves the artist. */
    onGoToArtist?: () => void;
    /** Omit to hide the "go to album" item. */
    onGoToAlbum?: () => void;
  }

  let { onClose, onPlay, onAddToQueue, onAddToPlaylist, onGoToArtist, onGoToAlbum }: Props =
    $props();

  // Every item stops propagation, closes the menu, then runs its action.
  function run(fn: () => void, e: MouseEvent) {
    e.stopPropagation();
    onClose();
    fn();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="track-menu-backdrop" onclick={onClose}></div>
<div class="track-menu">
  <button class="track-menu-item" onclick={(e) => run(onPlay, e)}>
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z"/></svg>
    {$tr('common.play')}
  </button>
  <button class="track-menu-item" onclick={(e) => run(onAddToQueue, e)}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
    {$tr('queue.addToQueue')}
  </button>
  {#if onAddToPlaylist}
    <button class="track-menu-item" onclick={(e) => run(onAddToPlaylist, e)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5"/><line x1="16" y1="3" x2="16" y2="11"/><line x1="12" y1="7" x2="20" y2="7"/></svg>
      {$tr('nowplaying.addToPlaylist')}
    </button>
  {/if}
  {#if onGoToArtist}
    <button class="track-menu-item" onclick={(e) => run(onGoToArtist, e)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      {$tr('library.goToArtist')}
    </button>
  {/if}
  {#if onGoToAlbum}
    <button class="track-menu-item" onclick={(e) => run(onGoToAlbum, e)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 13h4"/></svg>
      {$tr('library.goToAlbum')}
    </button>
  {/if}
</div>

<style>
  .track-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .track-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 10px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 1px;
    z-index: 100;
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.4));
    min-width: 190px;
    white-space: nowrap;
  }

  .track-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    padding: 7px 12px;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text-secondary);
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.1s;
    text-align: left;
    width: 100%;
  }

  .track-menu-item:hover {
    background: var(--tune-surface-hover);
    color: var(--tune-text);
  }
</style>

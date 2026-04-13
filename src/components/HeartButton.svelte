<script lang="ts">
  import { currentProfileId } from '../lib/stores/profile';
  import * as api from '../lib/api';

  interface Props {
    trackId?: number | null;
    albumId?: number | null;
    artistId?: number | null;
    size?: number;
  }
  let { trackId = null, albumId = null, artistId = null, size = 16 }: Props = $props();

  let isFavorite = $state(false);
  let checking = $state(false);
  let toggling = $state(false);

  // Track the last checked key to prevent stale state
  let lastKey = $state('');

  function getKey(pid: number | null, tid: number | null, aid: number | null, arid: number | null): string {
    return `${pid}-t${tid}-a${aid}-ar${arid}`;
  }

  $effect(() => {
    const pid = $currentProfileId;
    const key = getKey(pid, trackId, albumId, artistId);
    if (key === lastKey) return;
    lastKey = key;
    if (!pid) { isFavorite = false; return; }
    const params: { track_id?: number; album_id?: number; artist_id?: number } = {};
    if (trackId) params.track_id = trackId;
    else if (albumId) params.album_id = albumId;
    else if (artistId) params.artist_id = artistId;
    else { isFavorite = false; return; }
    checking = true;
    api.checkFavorite(pid, params)
      .then(r => { if (getKey($currentProfileId, trackId, albumId, artistId) === key) isFavorite = r.is_favorite; })
      .catch(() => { /* ignore */ })
      .finally(() => { checking = false; });
  });

  async function toggle(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const pid = $currentProfileId;
    if (!pid || toggling) return;
    toggling = true;

    // Optimistic toggle
    const wasFav = isFavorite;
    isFavorite = !wasFav;

    try {
      if (wasFav) {
        const params: { track_id?: number; album_id?: number; artist_id?: number } = {};
        if (trackId) params.track_id = trackId;
        else if (albumId) params.album_id = albumId;
        else if (artistId) params.artist_id = artistId;
        await api.removeFavorite(pid, params);
      } else {
        const body: { track_id?: number; album_id?: number; artist_id?: number } = {};
        if (trackId) body.track_id = trackId;
        else if (albumId) body.album_id = albumId;
        else if (artistId) body.artist_id = artistId;
        await api.addFavorite(pid, body);
      }
    } catch (e) {
      // Revert on error
      isFavorite = wasFav;
      console.error('Toggle favorite error:', e);
    }
    toggling = false;
  }
</script>

<button class="heart-btn" class:active={isFavorite} class:checking onclick={toggle} style="width:{size}px;height:{size}px;" aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
  {#if isFavorite}
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width={size} height={size}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
  {:else}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width={size} height={size}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
  {/if}
</button>

<style>
  .heart-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--tune-text-muted);
    opacity: 0.4;
    transition: opacity 0.12s, color 0.12s, transform 0.15s;
    flex-shrink: 0;
  }

  .heart-btn.active {
    color: #ef4444;
    opacity: 1;
  }

  .heart-btn.checking {
    opacity: 0.3;
  }

  /* Show on parent hover */
  :global(.album-card:hover) .heart-btn,
  :global(.track-item:hover) .heart-btn,
  :global(.artist-card:hover) .heart-btn {
    opacity: 0.6;
  }

  .heart-btn:hover {
    opacity: 1 !important;
    transform: scale(1.15);
  }

  .heart-btn.active:hover {
    color: #ef4444;
  }
</style>

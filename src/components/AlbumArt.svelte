<script lang="ts">
  import { artworkUrl, getAlbumCoverPath } from '../lib/api';

  interface Props {
    coverPath?: string | null;
    albumId?: number | null;
    size?: number;
    alt?: string;
    round?: boolean;
  }

  let { coverPath = null, albumId = null, size = 300, alt = 'Album art', round = false }: Props = $props();

  let hasError = $state(false);
  let resolvedCoverPath = $state<string | null>(null);
  let prevCoverPath = $state<string | null | undefined>(undefined);
  let prevAlbumId = $state<number | null | undefined>(undefined);

  function handleError(e: Event) {
    console.warn('AlbumArt load error:', coverPath, 'src:', src);
    hasError = true;
  }

  // Fetch cover from album if no direct coverPath provided
  $effect(() => {
    // Skip if props haven't changed (avoids flash on re-mount with same data)
    if (coverPath === prevCoverPath && albumId === prevAlbumId) return;
    prevCoverPath = coverPath;
    prevAlbumId = albumId;
    hasError = false;
    if (coverPath) {
      resolvedCoverPath = coverPath;
    } else if (albumId) {
      // Don't clear resolvedCoverPath to null — keep previous image visible
      // while fetching to avoid flash on re-mount
      const fetchId = albumId;
      getAlbumCoverPath(fetchId).then((path) => {
        // Only update if albumId hasn't changed during fetch
        if (prevAlbumId === fetchId) {
          resolvedCoverPath = path;
        }
      });
    } else {
      resolvedCoverPath = null;
    }
  });

  let src = $derived(artworkUrl(resolvedCoverPath));
</script>

<div class="album-art" class:round class:fill={!size} style={size ? `width: ${size}px; height: ${size}px;` : ''}>
  {#if src && !hasError}
    <img
      {src}
      {alt}
      width={size || undefined}
      height={size || undefined}
      loading="lazy"
      onerror={handleError}
    />
  {:else}
    <div class="placeholder">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    </div>
  {/if}
</div>

<style>
  .album-art {
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--tune-grey2);
    flex-shrink: 0;
  }

  .album-art.fill {
    width: 100%;
    aspect-ratio: 1;
  }

  .album-art.round {
    border-radius: 50%;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--tune-text-muted);
  }

  .placeholder svg {
    width: 40%;
    height: 40%;
  }
</style>

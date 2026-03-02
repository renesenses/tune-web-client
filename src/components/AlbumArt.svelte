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

  function handleError() {
    hasError = true;
  }

  // Fetch cover from album if no direct coverPath provided
  $effect(() => {
    hasError = false;
    if (coverPath) {
      resolvedCoverPath = coverPath;
    } else if (albumId) {
      resolvedCoverPath = null;
      getAlbumCoverPath(albumId).then((path) => {
        resolvedCoverPath = path;
      });
    } else {
      resolvedCoverPath = null;
    }
  });

  let src = $derived(artworkUrl(resolvedCoverPath));
</script>

<div class="album-art" class:round style="width: {size}px; height: {size}px;">
  {#if src && !hasError}
    <img
      {src}
      {alt}
      width={size}
      height={size}
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

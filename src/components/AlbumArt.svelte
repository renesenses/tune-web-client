<script lang="ts">
  import { artworkUrl, getAlbumCoverPath } from '../lib/api';
  import ServiceBadge from './ServiceBadge.svelte';

  interface Props {
    coverPath?: string | null;
    albumId?: number | null;
    size?: number;
    alt?: string;
    round?: boolean;
    source?: string | null;
    /* When set, show these initials (e.g. an artist's) instead of the generic
       music-note icon whenever there is no image OR the image fails to load
       (a broken/phantom URL). Lets artist avatars fall back to a proper
       initials placeholder in every case, not just when image_path is null. */
    fallbackInitials?: string | null;
  }

  let { coverPath = null, albumId = null, size = 300, alt = 'Album art', round = false, source = null, fallbackInitials = null }: Props = $props();

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
  {:else if fallbackInitials}
    <div class="placeholder placeholder-initials" style={size ? `font-size: ${Math.round(size * 0.32)}px;` : ''}>{fallbackInitials}</div>
  {:else}
    <div class="placeholder">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    </div>
  {/if}
  {#if source && source !== 'local' && source !== 'radio'}
    <div class="cover-badge"><ServiceBadge {source} compact /></div>
  {/if}
</div>

<style>
  .album-art {
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--tune-grey2);
    flex-shrink: 0;
    position: relative;
  }

  .cover-badge {
    position: absolute;
    bottom: 4px;
    left: 4px;
    z-index: 1;
  }

  /* Mode « remplissage » (`size={0}`) : la pochette adopte la boite definie
     par le parent au lieu d'imposer la sienne.

     C'est le seul mode correct quand le parent porte deja une taille CSS et
     `overflow:hidden` — cas de TOUS les habillages du client v2. Avec une
     taille fixe (`size={280}` dans une tuile de 158 px), l'image etait dessinee
     a 280 px puis TRONQUEE par le parent : les pochettes n'etaient pas mises a
     l'echelle, elles etaient rognees, et chaque rangee au coefficient de son
     choix. `size` ne sert d'ailleurs a rien d'autre : l'URL d'artwork est
     demandee sans parametre de taille, la source est la meme dans tous les cas.

     La requete de conteneur donne au repli en initiale la meme proportion que
     le calcul `size * 0.32` du mode a taille fixe, mais rapportee a la boite
     reellement occupee. */
  .album-art.fill {
    width: 100%;
    aspect-ratio: 1;
    container-type: inline-size;
  }

  .album-art.fill .placeholder-initials {
    font-size: 32cqw;
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

  .placeholder-initials {
    font-family: var(--font-label);
    font-weight: 600;
    color: var(--tune-text-secondary);
    line-height: 1;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    background: var(--tune-grey2);
  }
</style>

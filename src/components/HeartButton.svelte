<script lang="ts">
  import { get } from 'svelte/store';
  import {
    currentProfileId,
    favoriteTrackIds,
    favoriteAlbumIds,
    favoriteArtistIds,
    favoriteStreamingKeys,
    streamingFavKey,
    loadProfiles,
  } from '../lib/stores/profile';
  import * as api from '../lib/api';

  /** A streaming item (Qobuz/Tidal/…) to favorite, instead of a local id. */
  interface StreamingItem {
    itemType: 'track' | 'album' | 'artist';
    service: string;
    serviceId: string;
    title?: string;
    artist?: string;
    album?: string;
    coverUrl?: string;
  }

  interface Props {
    trackId?: number | null;
    albumId?: number | null;
    artistId?: number | null;
    /** Set for a streaming item; mutually exclusive with the local ids above. */
    streaming?: StreamingItem | null;
    size?: number;
  }
  let { trackId = null, albumId = null, artistId = null, streaming = null, size = 16 }: Props =
    $props();

  let streamKey = $derived(
    streaming ? streamingFavKey(streaming.itemType, streaming.service, streaming.serviceId) : null,
  );

  // Read membership from the in-memory sets — populated once per profile.
  let isFavorite = $derived.by(() => {
    if (streamKey) return $favoriteStreamingKeys.has(streamKey);
    if (trackId)  return $favoriteTrackIds.has(trackId);
    if (albumId)  return $favoriteAlbumIds.has(albumId);
    if (artistId) return $favoriteArtistIds.has(artistId);
    return false;
  });

  let toggling = $state(false);

  async function toggle(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (toggling) return;
    toggling = true;
    let pid = $currentProfileId;
    if (!pid) {
      // No profile loaded yet — ensure one exists (loadProfiles auto-creates
      // "Default") so the heart isn't a silent no-op (Elie).
      try { await loadProfiles(); } catch {}
      pid = get(currentProfileId);
    }
    if (!pid) { toggling = false; return; }

    const wasFav = isFavorite;

    // Streaming item: profile-scoped streaming favorites (keyed by service/id),
    // a separate store/API from the local numeric-id favorites below.
    if (streaming && streamKey) {
      const key = streamKey;
      favoriteStreamingKeys.update((s) => { wasFav ? s.delete(key) : s.add(key); return s; });
      try {
        if (wasFav) {
          await api.removeProfileStreamingFavorite(pid, {
            item_type: streaming.itemType,
            service: streaming.service,
            service_id: streaming.serviceId,
          });
        } else {
          await api.addProfileStreamingFavorite(pid, {
            item_type: streaming.itemType,
            service: streaming.service,
            service_id: streaming.serviceId,
            title: streaming.title,
            artist: streaming.artist,
            album: streaming.album,
            cover_url: streaming.coverUrl,
          });
        }
      } catch (e) {
        favoriteStreamingKeys.update((s) => { wasFav ? s.add(key) : s.delete(key); return s; }); // revert
        console.error('Toggle streaming favorite error:', e);
      }
      toggling = false;
      return;
    }

    // Optimistic update of the store so UI flips instantly.
    const params: { track_id?: number; album_id?: number; artist_id?: number } = {};
    if (trackId) params.track_id = trackId;
    else if (albumId) params.album_id = albumId;
    else if (artistId) params.artist_id = artistId;

    const flip = (add: boolean) => {
      if (trackId) favoriteTrackIds.update((s) => { add ? s.add(trackId!) : s.delete(trackId!); return s; });
      else if (albumId) favoriteAlbumIds.update((s) => { add ? s.add(albumId!) : s.delete(albumId!); return s; });
      else if (artistId) favoriteArtistIds.update((s) => { add ? s.add(artistId!) : s.delete(artistId!); return s; });
    };

    flip(!wasFav);

    try {
      if (wasFav) {
        await api.removeFavorite(pid, params);
      } else {
        await api.addFavorite(pid, params);
      }
    } catch (e) {
      flip(wasFav);  // revert
      console.error('Toggle favorite error:', e);
    }
    toggling = false;
  }
</script>

<button class="heart-btn" class:active={isFavorite} onclick={toggle} style="width:{size}px;height:{size}px;" aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
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

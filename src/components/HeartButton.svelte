<script lang="ts">
  import { get } from 'svelte/store';
  import {
    currentProfileId,
    favoriteTrackIds,
    favoriteAlbumIds,
    favoriteArtistIds,
    favoritePlaylistIds,
    favoriteFacetKeys,
    facetFavKey,
    favoriteStreamingKeys,
    streamingFavKey,
    loadProfiles,
  } from '../lib/stores/profile';
  import * as api from '../lib/api';
  import { toggleStreamingFavorite, isStreamingFavorite } from '../lib/streamingFavorites';

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

  /**
   * Favori de FACETTE : un label n'a pas d'identifiant côté serveur — il
   * n'existe ni table `labels`, ni route bibliothèque, l'onglet Labels lit une
   * facette et sélectionne par CHAÎNE. Il ne peut donc pas entrer dans
   * `favorites`, dont `item_id` est un entier. Ces favoris-là vivent dans
   * `favorite_facets` et sont désignés par leur valeur (#2442, FabienM 1557).
   *
   * La même forme resservira pour genre / format / année sans rien changer
   * ici : seule `facet` change.
   */
  interface FacetItem {
    facet: string;
    value: string;
  }

  interface Props {
    trackId?: number | null;
    albumId?: number | null;
    artistId?: number | null;
    /** Playlist LOCALE (`playlists.id`) — pas une playlist de streaming. */
    playlistId?: number | null;
    /** Set for a streaming item; mutually exclusive with the local ids above. */
    streaming?: StreamingItem | null;
    /** Valeur de facette (label…) ; exclusive des ids ci-dessus. */
    facet?: FacetItem | null;
    size?: number;
  }
  let {
    trackId = null,
    albumId = null,
    artistId = null,
    playlistId = null,
    streaming = null,
    facet = null,
    size = 16,
  }: Props = $props();

  let facetKey = $derived(facet ? facetFavKey(facet.facet, facet.value) : null);

  let streamKey = $derived(
    streaming ? streamingFavKey(streaming.itemType, streaming.service, streaming.serviceId) : null,
  );

  // Read membership from the in-memory sets — populated once per profile.
  let isFavorite = $derived.by(() => {
    if (streaming) return isStreamingFavorite($favoriteStreamingKeys, streaming);
    if (facetKey) return $favoriteFacetKeys.has(facetKey);
    if (trackId)  return $favoriteTrackIds.has(trackId);
    if (albumId)  return $favoriteAlbumIds.has(albumId);
    if (artistId) return $favoriteArtistIds.has(artistId);
    if (playlistId) return $favoritePlaylistIds.has(playlistId);
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
      // Chemin unique, partagé avec la barre de lecture (`lib/streamingFavorites`).
      // Il vivait ici en propre ; la barre en avait un autre, et les deux cœurs
      // divergeaient sur la même piste (Didier, #1478).
      await toggleStreamingFavorite(streaming);
      toggling = false;
      return;
    }

    // Favori de facette (label…) : sa propre table, sa propre route — la
    // valeur remplace l'identifiant.
    if (facet && facetKey) {
      const key = facetKey;
      const flipFacet = (add: boolean) =>
        favoriteFacetKeys.update((s) => { add ? s.add(key) : s.delete(key); return s; });
      flipFacet(!wasFav);
      try {
        if (wasFav) await api.removeFacetFavorite(pid, facet.facet, facet.value);
        else await api.addFacetFavorite(pid, facet.facet, facet.value);
      } catch (e) {
        flipFacet(wasFav);  // revert
        console.error('Toggle facet favorite error:', e);
      }
      toggling = false;
      return;
    }

    // Optimistic update of the store so UI flips instantly.
    const params: api.FavoriteRef = {};
    if (trackId) params.track_id = trackId;
    else if (albumId) params.album_id = albumId;
    else if (artistId) params.artist_id = artistId;
    else if (playlistId) params.playlist_id = playlistId;

    const flip = (add: boolean) => {
      if (trackId) favoriteTrackIds.update((s) => { add ? s.add(trackId!) : s.delete(trackId!); return s; });
      else if (albumId) favoriteAlbumIds.update((s) => { add ? s.add(albumId!) : s.delete(albumId!); return s; });
      else if (artistId) favoriteArtistIds.update((s) => { add ? s.add(artistId!) : s.delete(artistId!); return s; });
      else if (playlistId) favoritePlaylistIds.update((s) => { add ? s.add(playlistId!) : s.delete(playlistId!); return s; });
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
    /*
      0.75 et non 0.4. À 0.4 sur un fond sombre, le cœur passait sous le seuil
      où on le remarque : il fallait déjà savoir qu'il était là pour le voir.
      Mesuré sur une bibliothèque de 25 821 pistes : ZÉRO favori d'artiste ou
      d'album. Ce n'est pas un désintérêt, c'est un bouton qu'on ne trouve pas.
    */
    opacity: 0.75;
    transition: opacity 0.12s, color 0.12s, transform 0.15s;
    flex-shrink: 0;
  }

  .heart-btn.active {
    color: #ef4444;
    opacity: 1;
  }

  /*
    Le survol RENFORCE, il ne révèle plus.

    L'ancienne règle montait de 0.4 à 0.6 au survol du parent — donc sur un
    appareil tactile, où il n'y a pas de survol, le bouton restait à 0.4 pour
    toujours. C'est l'iPad et le téléphone qui payaient le plus cher une
    affordance conçue à la souris.
  */
  :global(.album-card:hover) .heart-btn,
  :global(.track-item:hover) .heart-btn,
  :global(.artist-card:hover) .heart-btn {
    opacity: 1;
  }

  /*
    Sans survol possible, on ne peut rien garder en réserve : le cœur est à
    pleine opacité en permanence.
  */
  @media (hover: none) {
    .heart-btn { opacity: 1; }
  }

  .heart-btn:hover {
    opacity: 1 !important;
    transform: scale(1.15);
  }

  .heart-btn.active:hover {
    color: #ef4444;
  }
</style>

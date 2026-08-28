import { writable } from 'svelte/store';
import type { Playlist, StreamingPlaylist } from '../types';

export const playlists = writable<Playlist[]>([]);
export const playlistsLoaded = writable<boolean>(false);

/// Playlist locale à ouvrir en arrivant sur le gestionnaire de playlists.
///
/// Posée par l'onglet « Playlists » des Favoris (#2442) : sans elle, cliquer un
/// favori de playlist ne rendait que la LISTE, à charge de l'utilisateur d'y
/// retrouver celle qu'il venait de désigner. Consommée UNE FOIS par
/// `PlaylistManagerView` (remise à `null` aussitôt lue), sur le modèle de
/// `pendingStreamingAlbum` : la vue est montée/démontée par `App.svelte`, un
/// état local ne survivrait pas au trajet.
export const pendingPlaylistId = writable<number | null>(null);

// Streaming playlists cache (persists across view changes)
export const streamingPlaylistsCache = writable<Record<string, StreamingPlaylist[]>>({});
export const streamingPlaylistsLoaded = writable<boolean>(false);

/**
 * web#2096 (FabienM, fil forum 2236, point 7, 1.0.0-rc4) — « Il faut pouvoir
 * ajouter un album à une playlist, je ne vois aucun bouton permettant de le
 * faire ».
 *
 * Le menu « … » d'un album (local ou de service) pose une DEMANDE ici ;
 * `ShellV2` la rend une fois, par la fenêtre partagée `AddToPlaylistModal`,
 * avec toutes les pistes de l'album. Les pistes ne sont lues qu'au geste.
 */
import { writable } from 'svelte/store';
import type { Track } from './types';

export interface DemandeAjoutPlaylist {
  /** Le nom de l'album, pour le bandeau d'erreur. */
  nom: string;
  /** Les pistes, dans l'ordre de l'album. */
  pistes: () => Promise<Track[]>;
}

export const demandeAjoutPlaylist = writable<DemandeAjoutPlaylist | null>(null);

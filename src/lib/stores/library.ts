import { writable, derived, get } from 'svelte/store';
import type { Album, Artist, Track } from '../types';

/**
 * `recent` — l'onglet « Ajouts récents » (#3039). Sevy Tabroc le demandait au
 * même rang qu'Albums, comme chez Audirvana : « je souhaite voir les albums que
 * j'ai récemment ajoutés à ma bibliothèque locale ».
 */
export type LibraryTab = 'albums' | 'artists' | 'tracks' | 'genres' | 'years' | 'labels' | 'folders' | 'recent';

export const libraryTab = writable<LibraryTab>('albums');
export const libraryLoading = writable<boolean>(false);

// Albums
export const albums = writable<Album[]>([]);
export const selectedAlbum = writable<Album | null>(null);
export const albumTracks = writable<Track[]>([]);

/**
 * De QUEL album `albumTracks` porte les pistes — `null` quand la liste ne
 * représente aucune fiche.
 *
 * ## Pourquoi cette clé existe
 *
 * renesenses/tune-server-rust#3178 (jfpaquet, 0.9.130 Windows) : en ouvrant un
 * album, la liste de pistes affichée était celle d'un AUTRE album — pleine,
 * cohérente, dans l'ordre, et le compteur de l'entête (« 12 tracks » puis
 * « 8 tracks » pour le même disque de 9 pistes) la suivait, puisqu'il en
 * dérive. La lecture, elle, restait juste.
 *
 * Le serveur a été écarté par la mesure : `album_tracks` lie l'identifiant en
 * paramètre et rend `list_by_album_filtered(id, …).unwrap_or_default()` — une
 * panne y rend une liste VIDE, jamais une liste fausse et pleine.
 *
 * `albumTracks` est un magasin PARTAGÉ, écrit depuis sept écrans (Bibliothèque,
 * Favoris, Collections, Collections intelligentes, Tableau de bord, Lecture en
 * cours, restauration d'historique). Aucun ne le vidait avant de charger, et
 * plusieurs laissaient la liste précédente en place quand la requête échouait —
 * dont `LibraryView.selectAlbumDetail`, dont le `catch` posait le NOUVEL album
 * (`selectedAlbum.set(album)`) sans toucher aux pistes de l'ANCIEN. C'est
 * exactement l'entête juste au-dessus d'une liste étrangère.
 *
 * La clé referme les deux moitiés d'un coup :
 *  - `commencerFicheAlbum` la pose et VIDE la liste, avant toute requête ;
 *  - `poserPistesAlbum` refuse d'écrire une réponse en retard ;
 *  - et l'écran ne montre `albumTracks` que si la clé désigne l'album affiché,
 *    si bien qu'un écrivain qui l'oublierait rendrait une liste vide — honnête —
 *    plutôt qu'une liste fausse et pleine.
 */
export const albumTracksOwner = writable<number | null>(null);

/**
 * On ouvre la fiche de `albumId` : la liste de la fiche précédente tombe
 * immédiatement, avant même que la requête parte.
 *
 * N'écrit PAS `selectedAlbum` : l'abonnement d'App.svelte empile une entrée
 * d'historique à chaque écriture non nulle, et deux écritures pour une seule
 * navigation redonneraient le « premier appui sur Précédent sans effet ».
 */
export function commencerFicheAlbum(albumId: number | null | undefined): number | null {
  const id = albumId ?? null;
  albumTracksOwner.set(id);
  albumTracks.set([]);
  return id;
}

/**
 * Pose les pistes reçues pour `albumId`. Rend `false` — et n'écrit RIEN — si la
 * fiche ouverte n'est plus celle-là : une réponse en retard ne repeint pas
 * l'album suivant.
 */
export function poserPistesAlbum(albumId: number | null | undefined, list: Track[]): boolean {
  if ((albumId ?? null) !== get(albumTracksOwner)) return false;
  albumTracks.set(list);
  return true;
}

/** La fiche courante est-elle toujours celle de `albumId` ? */
export function ficheAlbumToujoursOuverte(albumId: number | null | undefined): boolean {
  return (albumId ?? null) === get(albumTracksOwner);
}

/** Referme la fiche : plus d'album affiché, plus de liste, plus de clé. */
export function fermerFicheAlbum(): void {
  selectedAlbum.set(null);
  albumTracksOwner.set(null);
  albumTracks.set([]);
}

// Artists
export const artists = writable<Artist[]>([]);
export const selectedArtist = writable<Artist | null>(null);
export const artistAlbums = writable<Album[]>([]);

// Tracks
export const tracks = writable<Track[]>([]);

// Cross-view filters (set from NowPlaying, consumed by LibraryView)
export const yearFilter = writable<number | null>(null);

/**
 * Portée de répertoire de la Bibliothèque — LA source de vérité, pour les deux
 * clients. `null` = toute la bibliothèque. Écrite par l'écran Répertoires
 * (« Voir en bibliothèque ») et par la croix de la pastille ; lue par la
 * pastille ET par les chargeurs, en dérivé, donc suivie tant que l'écran vit.
 *
 * Elle remplace `pendingLibraryFolder`, un dépôt consommé UNE fois dans
 * l'initialiseur d'un `$state` : posé alors que la Bibliothèque était déjà
 * montée, il n'était jamais lu, et les listes déjà pleines passaient pour
 * « chargées » — l'écran montrait la bibliothèque entière sous la pastille du
 * répertoire (renesenses/tune-server-rust#3101). Voir `lib/porteeBibliotheque`.
 */
export const libraryFolderScope = writable<string | null>(null);

// Reset library sub-navigation (artist detail, album detail) to root view.
// Call this whenever the user explicitly navigates to the Library from the sidebar/tabbar.
export function resetLibraryNavigation() {
  selectedArtist.set(null);
  selectedAlbum.set(null);
  // Un clic délibéré sur « Bibliothèque » demande TOUTE la bibliothèque : la
  // portée de répertoire tombe avec le reste de la sous-navigation.
  libraryFolderScope.set(null);
}

// Genres (derived from albums)
export const genres = derived(albums, ($albums) => {
  const genreMap = new Map<string, number>();
  $albums.forEach((a) => {
    if (a.genre) {
      genreMap.set(a.genre, (genreMap.get(a.genre) ?? 0) + 1);
    }
  });
  return [...genreMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
});

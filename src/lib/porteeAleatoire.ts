/**
 * Ce que « Tout lire en aléatoire » doit transmettre au serveur.
 *
 * ## 🔴 `renesenses/tune-web-client#882`
 *
 * Marco Polo, fil 1614 : « Dans la nouvelle interface, la lecture aléatoire
 * par répertoire ciblé dans la bibliothèque ne fonctionne pas : la lecture
 * aléatoire prend sa source dans TOUTE la bibliothèque. Si je passe à
 * l'ancienne interface, la lecture aléatoire fonctionne. » (0.9.142)
 *
 * Sa précision — l'ancienne marche, la nouvelle non — est ce qui borne le
 * défaut, et elle vit dans la RÉPONSE du fil, pas dans le corps de la fiche.
 *
 * ## Le mécanisme
 *
 * `LibraryView` (client actuel) bâtit ses options depuis #2801 :
 *
 *     const opts = {};
 *     if (scopedFolder) opts.folder = scopedFolder;
 *     if (searchQuery.trim()) opts.search_query = searchQuery.trim();
 *     else if (selectedGenre && !scopedFolder) opts.genre = selectedGenre;
 *
 * `LibraryV2`, lui, n'envoyait que `search_query`. La portée de répertoire
 * était pourtant là, sous ses yeux : `dossierPortee` (`$libraryFolderScope`)
 * est calculée et sert à filtrer l'affichage — elle n'était simplement pas
 * transmise à l'aléatoire. C'est le motif « écrit mais pas branché », et la
 * seconde fois qu'il touche ce réglage : #3101 l'avait déjà corrigé pour la
 * LISTE, pas pour l'aléatoire.
 *
 * ## Pourquoi une fonction partagée
 *
 * Deux shells qui construisent les mêmes options à deux endroits finissent par
 * diverger — c'est précisément ce qui est arrivé. La règle est ici, les deux
 * l'appellent, et un test la tient.
 */
import { melangee } from './shuffle';
import type { Album, Track } from './types';

export interface PorteeAleatoire {
  /** La pastille de répertoire, quand elle est posée. */
  dossier?: string | null;
  /** Le texte cherché, quand le champ n'est pas vide. */
  recherche?: string | null;
  /** Le genre choisi dans l'onglet Genres. */
  genre?: string | null;
}

export interface OptionsAleatoire {
  folder?: string;
  search_query?: string;
  genre?: string;
}

/**
 * Les options à passer à `api.shuffleAll`, ou `undefined` quand il n'y a
 * aucune portée — l'aléatoire prend alors toute la bibliothèque, ce qui est
 * le comportement voulu.
 *
 * 🔴 LE GENRE CÈDE DEVANT LE RÉPERTOIRE, et ce n'est pas un détail. La
 * pastille de répertoire est la portée EXTÉRIEURE : quand elle est posée, les
 * onglets qu'elle contient ne sont plus des filtres indépendants mais des vues
 * de ce répertoire. Envoyer les deux demanderait au serveur une intersection
 * qu'il ne fait pas, et rendrait un aléatoire vide là où l'utilisateur voit
 * des albums. C'est la règle de `LibraryView`, reprise telle quelle.
 *
 * La recherche, elle, prime sur le genre — on cherche DANS ce qu'on regarde.
 */
export function optionsAleatoire(p: PorteeAleatoire): OptionsAleatoire | undefined {
  const o: OptionsAleatoire = {};
  const dossier = (p.dossier ?? '').trim();
  const recherche = (p.recherche ?? '').trim();
  const genre = (p.genre ?? '').trim();

  if (dossier) o.folder = dossier;
  if (recherche) o.search_query = recherche;
  else if (genre && !dossier) o.genre = genre;

  return Object.keys(o).length ? o : undefined;
}

/**
 * ## 🔴 Fil 1917 — « La lecture aléatoire ne se limite pas à la sélection »
 *
 * Sevy Tabroc, v0.9.163, 58 359 pistes : filtres posés dans la Bibliothèque,
 * « Aléatoire » tirait dans TOUTE la bibliothèque.
 *
 * `optionsAleatoire` ne sait transmettre que ce que `POST /playback/shuffle-all`
 * sait tirer : répertoire, recherche, genre. Les filtres de la Bibliothèque V2
 * — qualité, fréquence, format, profondeur, Dynamic Range, compilation,
 * provenance, année de la frise — et le groupe ouvert d'un onglet de facette
 * (un genre, une année, un label) portent sur les ALBUMS, sont appliqués sur
 * place (`matches`), et n'ont aucun nom côté serveur. Ils n'arrivaient donc
 * nulle part : le serveur recevait `undefined`, et tirait dans tout.
 *
 * La sélection est pourtant là, ENTIÈRE : un filtre posé fait sortir la grille
 * du mode paginé (#4800, `sortirDesPages`) — ce qu'on voit est la liste
 * complète des albums retenus, pas une page. On tire donc dans leurs pistes.
 */
export interface SelectionAlbums {
  /** Un filtre d'ALBUM est posé (qualité, fréquence, format, profondeur, DR,
   *  compilation, provenance, année). */
  filtresAlbum: boolean;
  /** Le groupe ouvert d'un onglet de facette, s'il y en a un — ses albums sont
   *  déjà ceux qui passent les filtres. */
  groupe: readonly Album[] | null;
  /** Les albums que la grille affiche, filtres appliqués. */
  affiches: readonly Album[];
}

/**
 * Les albums sur lesquels l'aléatoire doit porter, ou `null` quand la portée
 * du serveur suffit (aucun filtre d'album, aucun groupe ouvert) — on garde
 * alors `optionsAleatoire`, et le tirage du serveur.
 *
 * Un ensemble VIDE est une réponse : la sélection ne contient rien, et il ne
 * faut surtout pas retomber sur la bibliothèque entière.
 */
export function albumsDeLaSelection(s: SelectionAlbums): Set<number> | null {
  const source = s.groupe ?? (s.filtresAlbum ? s.affiches : null);
  if (source == null) return null;
  const ids = new Set<number>();
  for (const a of source) if (a.id != null) ids.add(a.id);
  return ids;
}

/**
 * Les identifiants à lancer : les pistes des albums retenus, mélangées, bornées
 * au plafond de la file aléatoire (`shuffle_max_tracks`, #2901 — le même que
 * le serveur applique à son propre tirage, pour la même raison : une file de
 * 20 000 titres gèle l'interface, #2228).
 *
 * `garder` affine à la piste — la provenance se lit aussi sur la piste.
 */
export function pistesDeLaSelection(
  pistes: readonly Track[],
  albums: ReadonlySet<number>,
  plafond: number,
  garder: (t: Track) => boolean = () => true,
): number[] {
  const retenues = pistesRetenues(pistes, albums, garder).map((t) => t.id as number);
  return tirageAleatoire(retenues, plafond);
}

/** Les pistes des albums retenus qui passent `garder` — la règle de portée,
 *  commune à « Aléatoire » et à « Lire ». */
function pistesRetenues(
  pistes: readonly Track[],
  albums: ReadonlySet<number>,
  garder: (t: Track) => boolean,
): Track[] {
  const retenues: Track[] = [];
  for (const t of pistes) {
    if (t.id == null || t.album_id == null || !albums.has(t.album_id)) continue;
    if (!garder(t)) continue;
    retenues.push(t);
  }
  return retenues;
}

/** Le plafond de la file (`shuffle_max_tracks`, #2901), jamais sous 1. */
export function bornee<T>(ids: readonly T[], plafond: number): T[] {
  return ids.slice(0, Math.max(1, Math.trunc(plafond)));
}

/**
 * Un tirage aléatoire BORNÉ : la liste mélangée, puis coupée au plafond.
 *
 * tune-server-rust#5284 (Sevy Tabroc, fil 2002) : le réglage « Titres tirés en
 * lecture aléatoire » était à 500, et des files de 4 986 titres partaient
 * quand même. Le serveur borne `POST /playback/shuffle-all` ; mais toutes les
 * listes que le CLIENT mélange lui-même (collection, favoris, liste de
 * lecture, recherche, liste intelligente, provenance de la Bibliothèque,
 * discographie d'un service) partaient par `play { track_ids }` sans jamais
 * rencontrer le plafond. C'est ici, et nulle part ailleurs, qu'un mélange
 * côté client le rencontre : on mélange D'ABORD (sinon on tirerait toujours
 * les mêmes premiers titres), on coupe ENSUITE.
 */
export function tirageAleatoire<T>(liste: readonly T[], plafond: number): T[] {
  return bornee(melangee(liste), plafond);
}

/**
 * ## Fil 1946 — FabienM, v0.9.165 : « Lire » à côté de « Aléatoire »
 *
 * La MÊME portée que l'aléatoire — les mêmes albums, le même filtre à la
 * piste, le même plafond — mais DANS L'ORDRE AFFICHÉ : album après album,
 * dans l'ordre où la grille (ou la liste des groupes) les montre, et dans
 * chaque album les pistes par disque puis par numéro.
 *
 * `albumsOrdonnes` porte l'ordre : c'est la liste que l'écran affiche, pas un
 * ensemble. Une piste sans numéro passe après les numérotées de son disque ;
 * à égalité, l'ordre d'arrivée du serveur tient (tri stable).
 */
export function pistesDansLOrdre(
  pistes: readonly Track[],
  albumsOrdonnes: readonly number[],
  plafond: number,
  garder: (t: Track) => boolean = () => true,
): number[] {
  const rang = new Map<number, number>();
  albumsOrdonnes.forEach((id, i) => { if (!rang.has(id)) rang.set(id, i); });
  const retenues = pistesRetenues(pistes, new Set(rang.keys()), garder);
  const num = (n: number | null | undefined) => (n == null || n <= 0 ? Number.MAX_SAFE_INTEGER : n);
  retenues.sort((a, b) =>
    rang.get(a.album_id as number)! - rang.get(b.album_id as number)!
    || (a.disc_number ?? 1) - (b.disc_number ?? 1)
    || num(a.track_number) - num(b.track_number));
  return bornee(retenues.map((t) => t.id as number), plafond);
}

/**
 * ## 🔴 tune-server-rust#5526 — Sevy Tabroc, fil 2051, v0.9.168, 109 004 pistes
 *
 * « J'ai sélectionné lecture en aléatoire et cela a pris 30 secondes (voire
 * plus) pour que la mise en lecture joue. » La file partie : 322 pistes, celles
 * de 25 albums.
 *
 * Pour tirer dans ces 25 albums, l'écran chargeait la bibliothèque ENTIÈRE
 * (`api.getAllTracks()`) : `GET /library/tracks` par pages de 2 000, l'une
 * APRÈS l'autre — une cinquantaine sur 109 004 pistes, chacune triant toute la table
 * côté serveur (≈ 0,5 s). Le journal n'en montrait que les six dernières, les
 * seules au-dessus du seuil `slow_query` de 500 ms : le reste de la demi-minute
 * était là, sous le seuil. Tout ça pour en garder 322.
 *
 * Une sélection de quelques albums se lit maintenant ALBUM PAR ALBUM
 * (`/library/albums/{id}/tracks`, la liste de la fiche, concurrence bornée et
 * reprise : `api.getAlbumTracksBatch`). Au-delà de `seuil` albums, la
 * bibliothèque entière redevient moins chère que tant de requêtes : on la
 * charge comme avant. Un album illisible après reprise fait aussi retomber
 * sur la bibliothèque entière — lente, mais jamais une file tronquée en
 * silence (le défaut que `getAlbumTracksBatch` a été écrit pour fermer).
 *
 * Même ensemble dans les deux cas : l'appelant filtre toujours par album
 * (`pistesDeLaSelection`, `pistesDansLOrdre`), et la fiche replie les copies
 * de moindre qualité comme la liste des pistes (#1362, #4101).
 */
export const SEUIL_ALBUMS_PAR_FICHE = 300;

export interface ChargeursDePistes {
  /** Les pistes de ces albums, fiche par fiche (`api.getAlbumTracksBatch`). */
  parAlbums: (albumIds: number[]) => Promise<{ tracks: Track[]; failedAlbums: number }>;
  /** Toute la bibliothèque (`api.getAllTracks`). */
  toutes: () => Promise<Track[]>;
}

/** Les pistes où chercher celles des `albums` retenus — voir plus haut. */
export async function pistesDesAlbums(
  albums: Iterable<number>,
  charger: ChargeursDePistes,
  seuil: number = SEUIL_ALBUMS_PAR_FICHE,
): Promise<Track[]> {
  const ids = [...new Set(albums)];
  if (ids.length === 0) return [];
  if (ids.length > seuil) return charger.toutes();
  const { tracks, failedAlbums } = await charger.parAlbums(ids);
  return failedAlbums > 0 ? charger.toutes() : tracks;
}

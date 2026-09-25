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
  const retenues: number[] = [];
  for (const t of pistes) {
    if (t.id == null || t.album_id == null || !albums.has(t.album_id)) continue;
    if (!garder(t)) continue;
    retenues.push(t.id);
  }
  return melangee(retenues).slice(0, Math.max(1, Math.trunc(plafond)));
}

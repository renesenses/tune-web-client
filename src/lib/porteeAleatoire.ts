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

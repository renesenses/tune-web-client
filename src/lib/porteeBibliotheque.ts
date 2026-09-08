/**
 * Portée de répertoire de la Bibliothèque — ce que les listes partagées
 * CONTIENNENT, face à ce que la pastille ANNONCE.
 *
 * renesenses/tune-server-rust#3101 (Sevy Tabroc, forum 1637) : « je
 * sélectionne un répertoire, celui-ci apparaît dans bibliothèque mais c'est
 * l'entièreté de la bibliothèque qui s'affiche ». Deux mécanismes lus dans le
 * client livré produisaient exactement cela, sans laisser de trace :
 *
 *  1. La portée était un dépôt `pendingLibraryFolder` consommé UNE fois, dans
 *     l'initialiseur d'un `$state` de `LibraryView`. Et l'écran ne rechargeait
 *     une liste que si son magasin était VIDE (`$albums.length === 0`). Il
 *     suffisait d'avoir déjà visité la Bibliothèque — le magasin `albums` est
 *     partagé et survit au démontage — pour que « Voir en bibliothèque »
 *     remonte l'écran avec la pastille du répertoire… au-dessus de la
 *     bibliothèque entière, jugée « déjà chargée ».
 *  2. Quand le chargement scopé échouait, les trois `catch` écrivaient en
 *     console et laissaient la liste précédente à l'écran.
 *
 * La portée est désormais UN magasin, `libraryFolderScope` (stores/library),
 * lu par la pastille ET par les chargeurs des deux clients. Ce module tient le
 * reste : sous quelle portée chaque liste partagée a été remplie, et donc si
 * elle peut être montrée telle quelle sous la portée courante.
 */
import { get, type Writable } from 'svelte/store';
import { albums, artists, tracks } from './stores/library';

export type ListePartagee = 'albums' | 'artists' | 'tracks';

// `any[]` : on ne lit ici que la longueur et on n'écrit que le vide ; le type
// précis de chaque liste reste celui de son magasin.
const magasins: Record<ListePartagee, Writable<any[]>> = { albums, artists, tracks };

/**
 * Portée sous laquelle chaque liste partagée a été REMPLIE la dernière fois.
 * `null` = toute la bibliothèque, ce que contient un magasin jamais scopé.
 */
const porteeDesListes: Record<ListePartagee, string | null> = {
  albums: null,
  artists: null,
  tracks: null,
};

/** À appeler par celui qui écrit une liste partagée, avec la portée qu'il a servie. */
export function marquerListeChargee(liste: ListePartagee, portee: string | null): void {
  porteeDesListes[liste] = portee;
}

/**
 * Faut-il (re)charger `liste` avant de la montrer sous `portee` ?
 *
 * Oui si elle est vide — c'est l'ancienne règle, conservée —, et oui si elle a
 * été remplie sous une AUTRE portée : une liste pleine n'est pas une liste
 * juste. C'est cette seconde moitié qui manquait.
 */
export function listeARecharger(liste: ListePartagee, portee: string | null, longueur: number): boolean {
  return longueur === 0 || porteeDesListes[liste] !== portee;
}

/**
 * La portée vient de changer : toute liste remplie sous une autre portée est
 * VIDÉE tout de suite, pour qu'elle ne reste pas à l'écran — même une fraction
 * de seconde — sous une pastille qui dit autre chose. Rend les listes vidées.
 */
export function viderListesHorsPortee(portee: string | null): ListePartagee[] {
  const videes: ListePartagee[] = [];
  for (const liste of Object.keys(magasins) as ListePartagee[]) {
    if (porteeDesListes[liste] === portee) continue;
    if (get(magasins[liste]).length === 0) continue;
    magasins[liste].set([]);
    videes.push(liste);
  }
  return videes;
}

/**
 * Le chargement de `liste` sous `portee` a ÉCHOUÉ. La liste est vidée : ce
 * qu'elle contenait ne correspond pas à ce que l'écran annonce, et un écran
 * vide qui le dit vaut mieux qu'une bibliothèque entière qui ment. Vide et
 * marquée sous cette portée, elle sera retentée au prochain montage
 * (`listeARecharger` répond oui à une liste vide).
 */
export function echecChargementPortee(liste: ListePartagee, portee: string): void {
  magasins[liste].set([]);
  marquerListeChargee(liste, portee);
}

/** Le dernier segment d'un chemin, séparateurs Unix ou Windows ; '' sans portée. */
export function nomDeDossier(chemin: string | null | undefined): string {
  if (!chemin) return '';
  return chemin.split(/[/\\]/).filter(Boolean).pop() ?? chemin;
}

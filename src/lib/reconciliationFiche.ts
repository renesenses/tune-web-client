/**
 * Ce qu'il faut faire de la fiche ouverte (album / artiste) quand le navigateur
 * revient — ou repart — sur une entrée d'historique.
 *
 * Le gestionnaire `popstate` d'`App.svelte` ne faisait que NETTOYER :
 *
 * ```
 * if (!ctx?.albumId) selectedAlbum.set(null);
 * if (!ctx?.artistId) selectedArtist.set(null);
 * ```
 *
 * Or l'entrée d'historique porte l'album et l'artiste qui étaient ouverts à ce
 * moment-là : c'est un instantané fidèle, posé par les abonnements
 * `selectedAlbum` / `selectedArtist`. Ne jamais s'en servir pour RÉTABLIR la
 * fiche a une conséquence directe : revenir sur une entrée qui portait un album
 * affiche la GRILLE de la Bibliothèque au lieu de la fiche — le niveau de la
 * fiche est SAUTÉ, et l'utilisateur atterrit sur un écran par lequel il n'est
 * jamais passé.
 *
 * C'est le cas du chemin de `renesenses/tune-server-rust#2252` :
 * collection → fiche album → lien artiste → retour, où le retour doit ramener
 * à la fiche album de la collection, puis seulement à la collection.
 *
 * La décision est isolée ici pour être vérifiable sans navigateur ; le
 * chargement, lui, reste dans `App.svelte`, qui a les stores et l'API.
 */

export type CtxHistorique = {
  view?: string | null;
  albumId?: number | null;
  artistId?: number | null;
  tab?: string | null;
} | null | undefined;

/** Ce qui est à l'écran au moment où l'entrée est atteinte. */
export type FicheCourante = {
  album: number | null;
  artiste: number | null;
};

/**
 * `'vider'` : effacer la fiche ; `'garder'` : ne rien toucher ;
 * un nombre : l'identifiant de la fiche à RECHARGER puis à réafficher.
 */
export type SortFiche = 'vider' | 'garder' | number;

export type ReconciliationFiche = {
  album: SortFiche;
  artiste: SortFiche;
};

function sort(cible: number | null | undefined, vue: string | null | undefined, courant: number | null): SortFiche {
  // Pas d'identifiant sur l'entrée : il n'y avait pas de fiche ouverte.
  // C'est le comportement d'origine, y compris pour un `state` nul (première
  // entrée de Safari), et il est conservé tel quel.
  if (!cible) return 'vider';
  // L'entrée d'une AUTRE vue peut porter un identifiant : les abonnements
  // reportent la fiche encore ouverte derrière quand on quitte la Bibliothèque.
  // Cette vue-là n'est pas montée, il n'y a rien à rouvrir — et rien à vider
  // non plus, sous peine de perdre la fiche au simple passage.
  if (vue !== 'library') return 'garder';
  if (courant === cible) return 'garder';
  return cible;
}

export function reconcilierFiche(ctx: CtxHistorique, courant: FicheCourante): ReconciliationFiche {
  return {
    album: sort(ctx?.albumId, ctx?.view, courant.album),
    artiste: sort(ctx?.artistId, ctx?.view, courant.artiste),
  };
}

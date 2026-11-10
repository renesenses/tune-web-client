/**
 * L'ALBUM OUVERT DANS LA BIBLIOTHÈQUE, retenu au-delà du démontage — web#2743.
 *
 * La grille de la Bibliothèque défile elle-même (`gridEl`) et vit dans
 * `LibraryV2` : passer à « Lecture en cours » la DÉMONTE, et la grille
 * remontée au Retour repartait de la première pochette (« la Bibliothèque
 * revient au début au lieu de la position de l'album », cpadiou77, rc10).
 *
 * Ce module tient, hors du composant, l'album dont la fiche a été ouverte et
 * son rang dans la liste affichée. L'écran le lit UNE fois à son montage et
 * ramène la grille sur cet album ; refermer la fiche à l'écran l'oublie (la
 * grille, restée montée, est déjà au bon endroit).
 */
export interface AlbumRetenu {
  albumId: number;
  /** Rang dans la liste affichée au moment de l'ouverture (repli en pages). */
  index: number;
}

let retenu: AlbumRetenu | null = null;

export function retenirAlbumOuvert(albumId: number, index: number): void {
  retenu = index >= 0 ? { albumId, index } : null;
}

export function oublierAlbumOuvert(): void {
  retenu = null;
}

/** Lu au montage, et consommé : un seul retour en profite. */
export function reprendreAlbumOuvert(): AlbumRetenu | null {
  const r = retenu;
  retenu = null;
  return r;
}

/**
 * Le rang où ramener la grille : celui de l'album dans la liste remontée
 * (filtres ou tri ont pu bouger), sinon — en pages, l'album n'est peut-être
 * pas encore arrivé — le rang retenu. `null` : rien à faire.
 */
export function rangDeReprise(
  r: AlbumRetenu | null,
  liste: ReadonlyArray<{ id?: number | null } | null>,
  enPages: boolean,
): number | null {
  if (!r || liste.length === 0) return null;
  const i = liste.findIndex((a) => a?.id === r.albumId);
  if (i >= 0) return i;
  if (enPages && r.index < liste.length) return r.index;
  return null;
}

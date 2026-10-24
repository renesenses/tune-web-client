/**
 * tune-server-rust#6461 (FabienM, fil forum 2302, point 1) — dans Streaming ›
 * Qobuz › Playlists, « si depuis Tune, on retire une playlist éditoriale de
 * ses favoris alors elle sort de la bibliothèque Qobuz et doit donc
 * disparaître du menu […] et ne pas oublier de rafraîchir la page ».
 *
 * Le serveur fait la moitié : le cœur retiré désabonne la playlist chez Qobuz
 * (`/playlist/unsubscribe`) et purge sa liste mémorisée. L'écran, lui, gardait
 * la liste chargée à l'ouverture : la playlist restait là jusqu'au prochain
 * passage par l'onglet.
 *
 * Règles :
 *  - seul un RETRAIT confirmé (`etat === false`) retire quelque chose ; un
 *    ajout, ou un geste revenu en arrière (`null`, ou `true` après un échec),
 *    ne touche pas la liste ;
 *  - seule une playlist SUIVIE (`editable === false`) sort de la
 *    bibliothèque. Une playlist à soi y reste, cœur ou pas (« les playlists
 *    personnelles sont automatiquement rangées dans sa bibliothèque ») ; une
 *    playlist sans le drapeau aussi — on ne devine pas son auteur, et le
 *    rechargement qui suit tranchera.
 */
export interface PlaylistDeBibliotheque {
  source_id?: unknown;
  editable?: boolean | null;
}

export function sansLaPlaylistRetiree<T extends PlaylistDeBibliotheque>(
  liste: readonly T[],
  serviceId: string,
  etat: boolean | null,
): T[] {
  if (etat !== false || !serviceId) return [...liste];
  return liste.filter((p) => !(String(p.source_id ?? '') === serviceId && p.editable === false));
}

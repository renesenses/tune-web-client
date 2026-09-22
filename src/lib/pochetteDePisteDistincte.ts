/**
 * #4650 — une piste de l'album porte-t-elle sa PROPRE pochette ?
 *
 * Fuccaro, forum mozaiklabs fil 1317, 21/09/2026 : « est-ce possible de taguer
 * un titre qui fait partie d'un album avec l'image du single tiré de cet
 * album ? » Les quatre singles de *Hackney Diamonds* — dont « Angry » — sont
 * rangés dans le dossier de l'album et portent chacun une jaquette différente
 * de la sienne.
 *
 * Le serveur sert déjà l'image de la piste dans `cover_path` : la lecture est
 * un `COALESCE(tracks.cover_path, albums.cover_path)`, donc le champ vaut la
 * pochette PROPRE quand il y en a une, et celle de l'album sinon. Une piste
 * dont le champ est rempli n'a donc pas forcément une pochette à elle : il
 * faut la COMPARER à celle de l'album, et c'est tout ce que fait cette
 * fonction.
 *
 * Elle existe pour la fiche d'album, qui n'affiche aucune vignette par piste —
 * « sans pochette, les vingt porteraient la même », dit son commentaire, ce
 * qui est vrai partout sauf ici.
 */
export function pochettesDePisteDistinctes(
  pistes: readonly { cover_path?: string | null }[] | null | undefined,
  pochetteAlbum: string | null | undefined,
): boolean {
  if (!pistes || pistes.length === 0) return false;
  const album = pochetteAlbum ?? null;
  return pistes.some((p) => {
    const propre = p?.cover_path ?? null;
    return propre !== null && propre !== '' && propre !== album;
  });
}

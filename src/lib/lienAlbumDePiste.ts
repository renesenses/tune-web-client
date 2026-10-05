/**
 * LE NOM D'ALBUM D'UNE PISTE, CLIQUABLE — fil forum 2143, point 3 (FabienM,
 * v1.0.0-rc2), web#1871 (fil 2097) et web#1895 (fil 2120).
 *
 * « Manque l'hyperlien sur le nom de l'album dans l'historique et une
 * playlist. »
 *
 * Le geste existe déjà : « Aller à l'album » du menu « … » d'une piste
 * (`PisteActions.allerAlbum`). Ce module en est la forme partagée, pour que la
 * colonne ALBUM du tableau et la ligne d'album de l'Historique mènent au même
 * endroit que le menu, et jamais ailleurs :
 *
 *   • piste de la BIBLIOTHÈQUE avec un `album_id` → `pendingLibraryAlbum` +
 *     vue `library` (le contrat que `LibraryV2` lit) ;
 *   • piste d'un SERVICE dont l'album est connu chez lui → la fiche de la
 *     coquille (`gestesNavigationService.ouvrirAlbum`), cible calculée par
 *     `albumDeServiceDe` (`album_id_service` de l'Historique d'abord, puis
 *     `album_id` d'un `StreamTrack`).
 *
 * 🔴 « Quand l'identifiant est connu », et seulement alors : sinon `null`, et
 * le nom reste du texte. Pas de recherche par titre en repli — deux albums
 * peuvent porter le même nom, et un lien qui mène à une recherche n'est pas un
 * lien vers la fiche (#1361).
 */
import { get } from 'svelte/store';
import { activeView, gestesNavigationService, pendingLibraryAlbum, type GestesNavigationService } from './stores/navigation';
import { albumDeServiceDe } from './routageAlbum';
import { estPisteLocale } from './pisteFile';

export function ouvertureAlbumDePiste(
  piste: any,
  gestes: GestesNavigationService | null = get(gestesNavigationService),
): (() => void) | null {
  if (!piste) return null;
  if (estPisteLocale(piste)) {
    const id = piste.album_id;
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return null;
    return () => {
      pendingLibraryAlbum.set(id);
      activeView.set('library');
    };
  }
  // Coquille qui n'a pas armé les gestes de service : le lien est ABSENT,
  // comme l'entrée du menu (règle « absent, pas grisé »).
  if (!gestes) return null;
  const cible = albumDeServiceDe(piste);
  return cible ? () => gestes.ouvrirAlbum(cible) : null;
}

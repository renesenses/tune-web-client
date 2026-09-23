/**
 * Les initiales d'un nom d'artiste — le repli quand il n'y a pas de portrait.
 *
 * Une à deux initiales, LETTRES ET CHIFFRES seulement.
 *
 * Sans le filtre, « Accentus - Laurence E. » donnait « A- » : le tiret est un
 * mot pour `split`, sa première lettre est le tiret lui-même. Constaté sur
 * capture le 02/09/2026, avec « A- » débordant de son cercle.
 *
 * Extrait d'`ArtistesV2` pour #1232 (étape 1) : la fiche élue en a besoin dès
 * qu'elle accepte un artiste de la bibliothèque, et deux copies de cette règle
 * divergeraient au premier nom qui la prend en défaut.
 */
export function initialesArtiste(nom: string | null | undefined): string {
  return (nom ?? '')
    .split(/\s+/)
    .map((m) => m.replace(/[^\p{L}\p{N}]/gu, '').charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

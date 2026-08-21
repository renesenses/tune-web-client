import type { Album } from './types';

/**
 * Trie les albums d'un artiste par année, dans le sens demandé.
 *
 * Extrait du composant pour une seule raison : la règle de l'année inconnue ne
 * se déduit pas à la lecture du gabarit, et c'est elle qui se casserait à la
 * première réécriture.
 *
 * ## Un album sans année part TOUJOURS en fin de liste
 *
 * Dans les deux sens. Le réflexe serait de traiter l'année absente comme un
 * zéro et de laisser le tri faire : en croissant elle finit en tête, en
 * décroissant en queue. Le résultat se lit alors comme un tri cassé — l'auteur
 * cherche son album le plus récent et tombe sur trois pochettes sans date.
 *
 * Ce n'est pas le tri qui est en cause, c'est la donnée qui manque ; l'ordre
 * doit le dire de la même façon quel que soit le sens.
 *
 * ## Le titre départage
 *
 * Deux albums de la même année, ou deux albums sans année, sont classés par
 * titre. Sans ce départage l'ordre dépendrait de celui rendu par le serveur, et
 * changerait d'un affichage à l'autre sans raison visible.
 */
export function trierAlbumsParAnnee(albums: Album[], sens: 'asc' | 'desc'): Album[] {
  const signe = sens === 'asc' ? 1 : -1;
  const parTitre = (a: Album, b: Album) => (a.title ?? '').localeCompare(b.title ?? '');

  return [...albums].sort((a, b) => {
    const ya = a.year ?? 0;
    const yb = b.year ?? 0;
    if (ya === 0 && yb === 0) return parTitre(a, b);
    if (ya === 0) return 1;
    if (yb === 0) return -1;
    if (ya !== yb) return (ya - yb) * signe;
    return parTitre(a, b);
  });
}

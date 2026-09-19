/**
 * Intertitres d'année dans la Bibliothèque triée par année — #1313.
 *
 * Jean Valjean (fil 1671, 19/09/2026) : « Quand on fait un tri par année sur
 * la totalité de la bibliothèque, les années n'apparaissent pas lors du
 * défilement. Il n'y a donc pas de séparation. » La grille et la liste étaient
 * une seule suite plate ; le rail A–Z est retiré sur ce tri, et la frise n'est
 * montrée qu'à partir du niveau Intermédiaire et en mode « Années ».
 *
 * La règle : dans la liste DÉJÀ triée et filtrée, un intertitre se pose devant
 * le premier album de chaque suite d'albums de la même année. Il porte l'année
 * (ou `null` pour les albums sans date, rangés en dernier par le tri) et le
 * nombre d'albums de la suite. On ne regroupe pas : les albums restent dans
 * l'ordre du tri, l'intertitre ne fait que le rendre lisible.
 */
export interface Intertitre {
  annee: number | null;
  n: number;
}

/** Index du premier album de chaque suite → son intertitre. */
export function intertitresAnnee<T>(
  albums: readonly T[],
  anneeDe: (a: T) => number | null | undefined,
): Map<number, Intertitre> {
  const out = new Map<number, Intertitre>();
  let courant: Intertitre | null = null;
  albums.forEach((a, i) => {
    const an = anneeDe(a) ?? null;
    if (courant == null || courant.annee !== an) {
      courant = { annee: an, n: 0 };
      out.set(i, courant);
    }
    courant.n++;
  });
  return out;
}

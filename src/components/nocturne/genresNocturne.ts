/**
 * Mosaïque des genres (Nocturne, itération 9) : tous les genres de la
 * bibliothèque, du plus fourni au moins fourni, chacun avec une pochette (son
 * album le plus récent qui en a une) et une place dans la grille.
 *
 * Les places sont CALCULÉES pour qu'aucune rangée n'ait de trou :
 *   - grand écran (6 colonnes) : une grande tuile (4 × 2) et une haute (2 × 2)
 *     en tête, puis des rangées alternées de deux moyennes (3 + 3) et de trois
 *     petites (2 + 2 + 2) ; la dernière rangée, incomplète, se partage les six
 *     colonnes ;
 *   - téléphone et tablette étroite (2 colonnes) : la première tuile en 2 × 2,
 *     puis des paires ; une tuile seule à la fin prend la rangée.
 */
import type { Album } from '../../lib/types';
import { rangeesParGenre } from './triNocturne';

export interface PlaceTuile { colonnes: number; lignes: number }
export interface TuileGenre {
  genre: string;
  nombre: number;
  pochette: Album | null;
  /** Place sur 6 colonnes (grand écran). */
  large: PlaceTuile;
  /** Place sur 2 colonnes (écran étroit). */
  etroit: PlaceTuile;
}

/** Les places sur 6 colonnes de `n` tuiles. */
export function placesLarges(n: number): PlaceTuile[] {
  const out: PlaceTuile[] = [];
  if (n <= 0) return out;
  if (n === 1) return [{ colonnes: 6, lignes: 2 }];
  out.push({ colonnes: 4, lignes: 2 }, { colonnes: 2, lignes: 2 });
  let reste = n - 2;
  let rangee = 0;
  while (reste > 0) {
    const voulu = rangee % 2 === 0 ? 2 : 3;
    const k = Math.min(voulu, reste);
    const base = Math.floor(6 / k);
    for (let i = 0; i < k; i++) out.push({ colonnes: i === k - 1 ? 6 - base * (k - 1) : base, lignes: 1 });
    reste -= k;
    rangee++;
  }
  return out;
}

/** Les places sur 2 colonnes de `n` tuiles. */
export function placesEtroites(n: number): PlaceTuile[] {
  const out: PlaceTuile[] = [];
  if (n <= 0) return out;
  out.push({ colonnes: 2, lignes: 2 });
  const reste = n - 1;
  for (let i = 0; i < reste; i++) {
    const seuleALaFin = i === reste - 1 && reste % 2 === 1;
    out.push({ colonnes: seuleALaFin ? 2 : 1, lignes: 1 });
  }
  return out;
}

export function tuilesDeGenres(liste: Album[], max = 40): TuileGenre[] {
  const groupes = rangeesParGenre(liste, max, 1);
  const larges = placesLarges(groupes.length);
  const etroites = placesEtroites(groupes.length);
  return groupes.map((g, i) => ({
    genre: g.genre,
    nombre: g.albums.length,
    pochette: g.albums.find((a) => a.cover_path) ?? null,
    large: larges[i],
    etroit: etroites[i],
  }));
}

/** Les albums d'un genre (genre principal, insensible à la casse). */
export function albumsDuGenre(liste: Album[], genre: string, principal: (a: Album) => string | null): Album[] {
  const g = genre.trim().toLowerCase();
  return liste.filter((a) => (principal(a) ?? '').toLowerCase() === g);
}

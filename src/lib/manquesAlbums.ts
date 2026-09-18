/**
 * Ce qui manque à un album, et sur quoi on peut agir.
 *
 * Demandé par Bertrand le 18/09/2026 : « présenter les albums sans cover,
 * sans genre, sans année, et proposer des outils de correction des manques ».
 *
 * L'onglet « Manquants » donnait déjà les trois COMPTEURS et deux passes
 * automatiques. Il ne disait jamais QUELS albums, donc rien ne pouvait être
 * corrigé à la main quand la passe automatique échouait.
 */
import type { Album } from './types';

export type Manque = 'cover' | 'genre' | 'year';

/**
 * Un champ vide ou blanc compte comme absent, un `0` d'année aussi.
 *
 * 🔴 `genre` seul ne suffit pas : la base porte AUSSI `genres`, la liste
 * multiple (#1821). Un album qui n'a que `genres` renseigné n'est pas sans
 * genre — le compter ferait proposer une correction à qui n'en a pas besoin,
 * et écraser une liste par une valeur unique.
 */
export function manqueA(a: Album, quoi: Manque): boolean {
  switch (quoi) {
    case 'cover':
      return !(a.cover_path ?? '').trim();
    case 'genre':
      return !(a.genre ?? '').trim() && !(a.genres ?? '').trim();
    case 'year':
      return !a.year;
  }
}

/**
 * Les albums à corriger, les plus fournis d'abord.
 *
 * 🔴 **Locaux seulement.** Un album servi par Qobuz ou Tidal n'a pas de
 * pochette à réparer chez soi : sa fiche vient du service, et l'écrire ne
 * mènerait nulle part. Les lister serait promettre une correction impossible.
 *
 * L'ordre met en tête ce qui pèse : un coffret de quarante pistes corrigé vaut
 * quarante pistes, un single en vaut une.
 */
export function albumsAvecManque(albums: Album[], quoi: Manque): Album[] {
  return albums
    .filter((a) => (a.source ?? 'local') === 'local' && manqueA(a, quoi))
    .sort(
      (x, y) =>
        (y.track_count ?? 0) - (x.track_count ?? 0) ||
        (x.title ?? '').localeCompare(y.title ?? ''),
    );
}

/** Les genres déjà présents dans la bibliothèque, triés — pour la saisie. */
export function genresConnus(albums: Album[]): string[] {
  const s = new Set<string>();
  for (const a of albums) {
    const g = (a.genre ?? '').trim();
    if (g) s.add(g);
  }
  return [...s].sort((x, y) => x.localeCompare(y));
}

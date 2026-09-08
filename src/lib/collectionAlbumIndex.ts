import type { Album } from './types';

/**
 * Lettre du rail pour l'ordre par artiste rendu par
 * `GET /library/collections/{id}/albums` (#2675).
 *
 * Le serveur replie les accents avant de trier et place un artiste absent en
 * dernier. Le client doit employer la même identité, sinon « Édith » serait
 * classée dans le bloc E mais son raccourci apparaîtrait sous #.
 */
export function albumArtistLetter(album: Pick<Album, 'artist_name'>): string {
  const first = (album.artist_name ?? '')
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .charAt(0)
    .toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}

/** Les blocs disponibles, dans l'ordre habituel du rail : A–Z puis #. */
export function collectionAlbumLetters(
  albums: ReadonlyArray<Pick<Album, 'artist_name'>>,
): string[] {
  return [...new Set(albums.map(albumArtistLetter))].sort((a, b) =>
    a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b),
  );
}

/** Première carte du bloc demandé dans la réponse déjà triée du serveur. */
export function firstAlbumIndexForLetter(
  albums: ReadonlyArray<Pick<Album, 'artist_name'>>,
  letter: string,
): number {
  return albums.findIndex((album) => albumArtistLetter(album) === letter);
}

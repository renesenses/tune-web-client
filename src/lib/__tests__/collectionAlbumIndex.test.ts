import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  albumArtistLetter,
  collectionAlbumLetters,
  firstAlbumIndexForLetter,
} from '../collectionAlbumIndex';
import type { Album } from '../types';

function album(id: number, title: string, artistName: string | null): Album {
  return { id, title, artist_name: artistName };
}

/**
 * #2675 — le serveur rend désormais une Collection par artiste, puis année et
 * titre. Le rail doit indexer CET ordre réel : le nom d'album ne doit jamais
 * déplacer le saut vers une autre lettre.
 */
describe('rail A–Z des albums d’une Collection', () => {
  const albums = [
    album(1, 'Zulu', 'ABBA'),
    album(2, 'A New World Record', 'Electric Light Orchestra'),
    album(3, 'Arrival', 'Édith Piaf'),
    album(4, 'Apostrophe', 'Frank Zappa'),
    album(5, 'Sans crédit', null),
  ];

  it('indexe le nom d’artiste, pas le titre de l’album', () => {
    expect(albums.map(albumArtistLetter)).toEqual(['A', 'E', 'E', 'F', '#']);
  });

  it('replie les accents comme le tri serveur et garde les valeurs absentes à la fin', () => {
    expect(albumArtistLetter(album(10, 'T', 'Édith Piaf'))).toBe('E');
    expect(albumArtistLetter(album(11, 'T', '  à-ha  '))).toBe('A');
    expect(albumArtistLetter(album(12, 'T', null))).toBe('#');
    expect(albumArtistLetter(album(13, 'T', '   '))).toBe('#');
  });

  it('rend une lettre par bloc et retrouve la première carte du bloc', () => {
    expect(collectionAlbumLetters(albums)).toEqual(['A', 'E', 'F', '#']);
    expect(firstAlbumIndexForLetter(albums, 'E')).toBe(1);
    expect(firstAlbumIndexForLetter(albums, '#')).toBe(4);
    expect(firstAlbumIndexForLetter(albums, 'Q')).toBe(-1);
  });

  it('est réellement branché dans la grille, pas seulement calculé hors écran', () => {
    const source = readFileSync(
      resolve(__dirname, '../../components/CollectionsView.svelte'),
      'utf8',
    );

    expect(source).toMatch(/<AlphaIndex\s+letters=\{albumLetters\}/);
    expect(source).toMatch(/onSelect=\{scrollToAlbumLetter\}/);
    expect(source).toContain("getCollectionAlbums(col.id, 'artist')");
    expect(source).toContain("querySelectorAll('.album-card')");
    expect(source).toMatch(/<div class="collection-albums-section">/);
  });
});

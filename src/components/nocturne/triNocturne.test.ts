import { describe, expect, it } from 'vitest';
import type { Album } from '../../lib/types';
import { genrePrincipal, rangeesParGenre, trierAlbums } from './triNocturne';
import { paragraphes } from './texteNocturne';

const al = (id: number, champs: Partial<Album> = {}): Album => ({ id, title: `T${id}`, ...champs });

describe('Nocturne — tris et rangées', () => {
  it('trie par date d’ajout décroissante, par titre, par année', () => {
    const l = [al(1, { added_at: 10, title: 'b', year: 1990 }), al(2, { added_at: 30, title: 'a', year: 2001 }), al(3, { added_at: 20, title: 'c' })];
    expect(trierAlbums(l, 'ajout').map((a) => a.id)).toEqual([2, 3, 1]);
    expect(trierAlbums(l, 'titre').map((a) => a.id)).toEqual([2, 1, 3]);
    expect(trierAlbums(l, 'annee').map((a) => a.id)).toEqual([2, 1, 3]);
    expect(l.map((a) => a.id)).toEqual([1, 2, 3]);
  });

  it('prend le premier genre d’une liste multiple', () => {
    expect(genrePrincipal(al(1, { genre: 'Jazz; Soul' }))).toBe('Jazz');
    expect(genrePrincipal(al(1, { genres: 'Folk, Rock' }))).toBe('Folk');
    expect(genrePrincipal(al(1))).toBeNull();
  });

  it('ne garde que les genres assez fournis, du plus au moins fourni', () => {
    const l = [
      ...[1, 2, 3, 4, 5].map((i) => al(i, { genre: 'Jazz' })),
      ...[6, 7, 8, 9].map((i) => al(i, { genre: 'jazz' })),
      ...[10, 11, 12, 13].map((i) => al(i, { genre: 'Folk' })),
      al(14, { genre: 'Rock' }),
    ];
    const r = rangeesParGenre(l);
    expect(r.map((g) => [g.genre, g.albums.length])).toEqual([['Jazz', 9], ['Folk', 4]]);
  });
});

describe('Nocturne — texte de présentation', () => {
  it('retire les balises et découpe en paragraphes', () => {
    expect(paragraphes('<p>Un &amp; deux</p><p>Trois<br>quatre</p>')).toEqual(['Un & deux', 'Trois quatre']);
    expect(paragraphes(null)).toEqual([]);
  });
});

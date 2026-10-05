import { describe, expect, it } from 'vitest';
import { fusionnerDiscographie, partagerParTypeDeSortie, typeDeSortie } from '../discographieCommune';
import type { Album } from '../types';

const album = (
  id: number,
  title: string,
  release_type?: string | null,
  inferred_release_type?: string | null,
): Album => ({ id, title, release_type, inferred_release_type });

describe('#5616 — type déduit par le serveur sur la page artiste', () => {
  it('range les EP et singles déduits dans « EP et singles »', () => {
    const entrees = fusionnerDiscographie([
      album(1, 'Single déduit', null, 'single'),
      album(2, 'EP déduit', undefined, 'ep'),
      album(3, 'Album déduit', null, 'album'),
      album(4, 'Sans rien'),
    ], []);
    const sections = partagerParTypeDeSortie(entrees);
    expect(sections.epSingles.map((e) => e.principal.album.title)).toEqual(['Single déduit', 'EP déduit']);
    expect(sections.albums.map((e) => e.principal.album.title)).toEqual(['Album déduit', 'Sans rien']);
  });

  it('le type explicite gagne toujours sur le type déduit', () => {
    expect(typeDeSortie(album(1, 'a', 'album', 'single'))).toBe('album');
    expect(typeDeSortie(album(2, 'b', 'SINGLE', 'album'))).toBe('single');
    // Un mot inconnu n'est pas une réponse : le type déduit s'applique.
    expect(typeDeSortie(album(3, 'c', 'epMini', 'ep'))).toBe('ep');
    expect(typeDeSortie(album(4, 'd', 'epMini'))).toBe('epmini');
    expect(typeDeSortie(album(5, 'e'))).toBeUndefined();
  });

  it('un exemplaire déduit single et un exemplaire de service sans type restent dans Albums', () => {
    const entrees = fusionnerDiscographie(
      [album(1, 'Mixte', null, 'single'), album(2, 'Concordant', null, 'ep')],
      [{ service: 'qobuz', albums: [album(3, 'Mixte'), album(4, 'Concordant', 'ep')] }],
    );
    const sections = partagerParTypeDeSortie(entrees);
    expect(sections.epSingles.map((e) => e.principal.album.title)).toEqual(['Concordant']);
    expect(sections.albums.map((e) => e.principal.album.title)).toEqual(['Mixte']);
  });
});

import { describe, expect, it } from 'vitest';
import { fusionnerDiscographie, partagerParTypeDeSortie, rangDeSortie, typeDeSortie } from '../discographieCommune';
import type { Album } from '../types';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import hu from '../locales/hu';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

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
    expect(sections.singles.map((e) => e.principal.album.title)).toEqual(['Single déduit']);
    expect(sections.eps.map((e) => e.principal.album.title)).toEqual(['EP déduit']);
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
    expect(sections.eps.map((e) => e.principal.album.title)).toEqual(['Concordant']);
    expect(sections.albums.map((e) => e.principal.album.title)).toEqual(['Mixte']);
  });

  it('#5616 (05/10) — deux sections : un EP et un single ne se mélangent plus', () => {
    const entrees = fusionnerDiscographie(
      [album(1, 'Single seul', 'single'), album(2, 'EP seul', null, 'ep'), album(3, 'Mixte', 'single')],
      [{ service: 'qobuz', albums: [album(4, 'Mixte', 'ep')] }],
    );
    const sections = partagerParTypeDeSortie(entrees);
    expect(sections.singles.map((e) => e.principal.album.title)).toEqual(['Single seul']);
    // Une édition annoncée EP par une source et single par l'autre : EP.
    expect(sections.eps.map((e) => e.principal.album.title)).toEqual(['EP seul', 'Mixte']);
    expect(rangDeSortie(entrees[0])).toBe('single');
  });

  it('#5616 — les libellés des deux sections existent dans les 11 langues', () => {
    const tables: Record<string, Record<string, string>> = { fr, en, de, es, it: it_, hu, ja, ko, ro, sv, zh };
    for (const [l, table] of Object.entries(tables)) {
      expect(table['v2.disco.eps'], `${l} : v2.disco.eps`).toBeTruthy();
      expect(table['v2.disco.singles'], `${l} : v2.disco.singles`).toBeTruthy();
    }
  });
});

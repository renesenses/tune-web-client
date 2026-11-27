import { describe, expect, it } from 'vitest';
import type { Album } from '../../lib/types';
import { albumsDeCollection, genrePrincipal, rangeesParGenre, trierAlbums } from './triNocturne';
import { INTERFACES, nocturneActif, salonActif } from '../../lib/interfaceSalon';
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

describe('Nocturne — collections de la colonne Bibliothèque', () => {
  const l = [
    al(1, { format: 'flac', sample_rate: 96000, bit_depth: 24, cover_path: 'a', title: 'X', artist_name: 'A' }),
    al(2, { format: 'dsf', sample_rate: 2822400, bit_depth: 1, cover_path: null, title: 'X', artist_name: 'a' }),
    al(3, { format: 'flac', sample_rate: 44100, bit_depth: 16, cover_path: 'c', max_channels: 1, title: 'Y' }),
  ];
  it('filtre par palier, canaux, pochette, favoris et doublons', () => {
    expect(albumsDeCollection(l, 'hires', new Set()).map((a) => a.id)).toEqual([1]);
    expect(albumsDeCollection(l, 'dsd', new Set()).map((a) => a.id)).toEqual([2]);
    expect(albumsDeCollection(l, 'cd', new Set()).map((a) => a.id)).toEqual([3]);
    expect(albumsDeCollection(l, 'mono', new Set()).map((a) => a.id)).toEqual([3]);
    expect(albumsDeCollection(l, 'sansPochette', new Set()).map((a) => a.id)).toEqual([2]);
    expect(albumsDeCollection(l, 'favoris', new Set([3])).map((a) => a.id)).toEqual([3]);
    expect(albumsDeCollection(l, 'doublons', new Set()).map((a) => a.id).sort()).toEqual([1, 2]);
  });
  it('les récents : ajoutés depuis moins de 90 jours (secondes ou millisecondes)', () => {
    const maintenant = Date.UTC(2026, 10, 25);
    const r = [al(1, { added_at: maintenant / 1000 - 86400 }), al(2, { added_at: maintenant - 200 * 86_400_000 })];
    expect(albumsDeCollection(r, 'recents', new Set(), maintenant).map((a) => a.id)).toEqual([1]);
  });
});

describe('Nocturne — registre des interfaces', () => {
  it('Nocturne est une coquille à part, distincte de Salon', () => {
    expect(INTERFACES.some((i) => i.id === 'nocturne' && i.coquille === 'nocturne')).toBe(true);
    expect(nocturneActif('nocturne')).toBe(true);
    expect(salonActif('nocturne')).toBe(false);
    expect(nocturneActif('roon-like')).toBe(false);
  });
});

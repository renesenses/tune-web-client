// Yves (Sevy Tabroc), 17/09/2026 : « à partir de ma collection, rechercher
// l'album acheté en local en meilleure résolution, car pour le moment il est
// en mp3/128 ». Ses achats sont copiés dans sa bibliothèque.
import { describe, expect, it } from 'vitest';
import { copieLocale, indexerAlbumsLocaux, titreSansAnnotationDeQualite } from '../bandcampCopieLocale';
import type { Album } from '../types';

const al = (o: Partial<Album>) => o as Album;

describe('la copie locale d’un achat Bandcamp', () => {
  const index = indexerAlbumsLocaux([
    al({ id: 1, title: 'Sphaira', artist_name: 'Kino Doscun', format: 'flac', sample_rate: 44100, bit_depth: 16 }),
    al({ id: 2, title: 'Sphaira (24bit)', artist_name: 'Kino Doscun', format: 'flac', sample_rate: 96000, bit_depth: 24 }),
    al({ id: 3, title: 'Radio Voltaire (Bonus Tracks Edition)', artist_name: 'Kino', format: 'flac', sample_rate: 44100, bit_depth: 16 }),
    al({ id: 4, title: 'Déjà Vu', artist_name: 'Élodie', format: 'flac', sample_rate: 48000, bit_depth: 24 }),
  ]);

  it('même artiste et même titre : la MEILLEURE résolution gagne', () => {
    const c = copieLocale({ artist: 'Kino Doscun', title: 'Sphaira' }, index);
    expect(c?.albumId).toBe(2);
    expect(c?.bit_depth).toBe(24);
  });

  it('accents, casse et ponctuation repliés', () => {
    expect(copieLocale({ artist: 'ELODIE', title: 'deja vu' }, index)?.albumId).toBe(4);
  });

  it('une AUTRE édition n’est pas l’album acheté', () => {
    expect(copieLocale({ artist: 'Kino', title: 'Radio Voltaire' }, index)).toBeNull();
  });

  it('un autre artiste au même titre non plus', () => {
    expect(copieLocale({ artist: 'Autre', title: 'Sphaira' }, index)).toBeNull();
  });

  it('les annotations de format sont retirées, pas les mentions d’édition', () => {
    expect(titreSansAnnotationDeQualite('Sphaira (24bit)')).toBe('Sphaira');
    expect(titreSansAnnotationDeQualite('Sphaira [FLAC 24-96]')).toBe('Sphaira');
    expect(titreSansAnnotationDeQualite('Sphaira (96kHz/24bit)')).toBe('Sphaira');
    expect(titreSansAnnotationDeQualite('Sphaira (Hi-Res)')).toBe('Sphaira');
    expect(titreSansAnnotationDeQualite('Radio Voltaire (Bonus Tracks Edition)')).toBe('Radio Voltaire (Bonus Tracks Edition)');
    expect(titreSansAnnotationDeQualite('Live (Deluxe)')).toBe('Live (Deluxe)');
  });

  it('sans album local : rien', () => {
    expect(copieLocale({ artist: 'x', title: 'y' }, indexerAlbumsLocaux([]))).toBeNull();
    expect(copieLocale(null, index)).toBeNull();
  });
});

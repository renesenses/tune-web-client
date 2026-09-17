// Bertrand, 17/09/2026 : « toujours pas de tri possible dans les playlists et
// collections. Je voudrais dates, artist, album, title par asc et desc ».
import { describe, expect, it } from 'vitest';
import { trierPistes } from '../trierPistes';
import { trierAlbums } from '../trierAlbums';
import type { Album, Track } from '../types';

const p = (title: string, artist_name: string, album_title: string, year: number | null) =>
  ({ id: title.length, title, artist_name, album_title, year }) as unknown as Track;
const liste = [
  p('Zébulon', 'Arlo Parks', 'Collapsed', 2021),
  p('abc', 'Émilie Simon', 'Végétal', null),
  p('Mama', 'Genesis', 'Genesis', 1983),
];
const titres = (l: Track[]) => l.map((t) => t.title);

describe('tri des pistes d’une playlist', () => {
  it('ordre de la playlist par défaut, inversé en desc, liste reçue intacte', () => {
    expect(titres(trierPistes(liste, 'ordre', 'asc'))).toEqual(['Zébulon', 'abc', 'Mama']);
    expect(titres(trierPistes(liste, 'ordre', 'desc'))).toEqual(['Mama', 'abc', 'Zébulon']);
    expect(titres(liste)).toEqual(['Zébulon', 'abc', 'Mama']);
  });
  it('titre, artiste et album : accents et casse repliés, asc et desc', () => {
    expect(titres(trierPistes(liste, 'title', 'asc'))).toEqual(['abc', 'Mama', 'Zébulon']);
    expect(titres(trierPistes(liste, 'artist', 'asc'))).toEqual(['Zébulon', 'abc', 'Mama']);
    expect(titres(trierPistes(liste, 'artist', 'desc'))).toEqual(['Mama', 'abc', 'Zébulon']);
    expect(titres(trierPistes(liste, 'album', 'asc'))).toEqual(['Zébulon', 'Mama', 'abc']);
  });
  it('année : une piste sans année reste en dernier dans les deux sens', () => {
    expect(titres(trierPistes(liste, 'year', 'asc'))).toEqual(['Mama', 'Zébulon', 'abc']);
    expect(titres(trierPistes(liste, 'year', 'desc'))).toEqual(['Zébulon', 'Mama', 'abc']);
  });
});

describe('tri d’une collection intelligente (côté client)', () => {
  const a = (title: string, artist_name: string, year: number) => ({ id: year, title, artist_name, year }) as Album;
  const albums = [a('Keyboard Song', 'Yoann Moulin', 2026), a('Alouette!', 'Les Louanges', 2024), a('Bird Takes Flight', 'Charlie Parker', 2025)];
  it('ordre des règles = la liste telle que le serveur la rend', () => {
    expect(trierAlbums(albums, 'pertinence', 'asc').map((x) => x.year)).toEqual([2026, 2024, 2025]);
  });
  it('artiste, titre, année — asc et desc', () => {
    expect(trierAlbums(albums, 'artist', 'asc').map((x) => x.artist_name)).toEqual(['Charlie Parker', 'Les Louanges', 'Yoann Moulin']);
    expect(trierAlbums(albums, 'year', 'desc').map((x) => x.year)).toEqual([2026, 2025, 2024]);
  });
});

import { describe, expect, it } from 'vitest';
import { correspondASaisie, filtrerParSaisie } from '../filtreSaisieOnglet';

describe('#2030 — filtre de la saisie sur un onglet de service', () => {
  const albums = [
    { title: 'Avalon', artist: 'Roxy Music' },
    { title: 'Kind of Blue', artist_name: 'Miles Davis' },
    { name: 'Électro du soir' },
  ];

  it('garde ce qui contient tous les mots, sans casse ni accents', () => {
    expect(filtrerParSaisie(albums, 'roxy MUSIC')).toEqual([albums[0]]);
    expect(filtrerParSaisie(albums, 'electro')).toEqual([albums[2]]);
    expect(filtrerParSaisie(albums, 'davis kind')).toEqual([albums[1]]);
  });

  it('sous le seuil de deux caractères, ne filtre rien', () => {
    expect(filtrerParSaisie(albums, ' r ')).toEqual(albums);
    expect(filtrerParSaisie(albums, '')).toEqual(albums);
  });

  it('lit un artiste ou un album donné en objet', () => {
    expect(correspondASaisie({ title: 'X', artist: { name: 'Roxy Music' } }, 'roxy')).toBe(true);
    expect(correspondASaisie({ title: 'X', album: { title: 'Siren' } }, 'siren')).toBe(true);
    expect(correspondASaisie({ title: 'X' }, 'siren')).toBe(false);
  });

  it('accepte une liste absente', () => {
    expect(filtrerParSaisie(undefined, 'roxy')).toEqual([]);
  });
});

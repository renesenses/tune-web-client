import { describe, it, expect } from 'vitest';
import { favoritesFirst, toggleFavoriteId } from '../deviceFavorites';

// Appareils favoris de la sidebar (#1622) : les favoris remontent en tête de
// la liste APPAREILS, le reste garde l'ordre de découverte.

const devices = [
  { id: 'a', name: 'Ampli salon' },
  { id: 'b', name: 'DAC bureau' },
  { id: 'c', name: 'Enceinte cuisine' },
  { id: 'd', name: 'TV chambre' },
];

describe('favoritesFirst', () => {
  it('sans favori, rend la liste inchangée (même référence)', () => {
    expect(favoritesFirst(devices, 'net', [])).toBe(devices);
  });

  it('remonte les favoris en tête, ordre de découverte préservé', () => {
    const out = favoritesFirst(devices, 'net', ['net:c']);
    expect(out.map((d) => d.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('plusieurs favoris gardent leur ordre relatif (tri stable)', () => {
    const out = favoritesFirst(devices, 'net', ['net:d', 'net:b']);
    // b avant d : l'ordre de la LISTE fait foi, pas l'ordre de mise en favori.
    expect(out.map((d) => d.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('ne mélange pas les préfixes audio:/net:', () => {
    const out = favoritesFirst(devices, 'audio', ['net:c', 'audio:b']);
    expect(out.map((d) => d.id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('ignore les favoris absents de la liste (appareil disparu)', () => {
    const out = favoritesFirst(devices, 'net', ['net:zombie']);
    expect(out.map((d) => d.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('toggleFavoriteId', () => {
  it('ajoute une clé absente', () => {
    expect(toggleFavoriteId(['audio:x'], 'net:y')).toEqual(['audio:x', 'net:y']);
  });

  it('retire une clé présente', () => {
    expect(toggleFavoriteId(['audio:x', 'net:y'], 'net:y')).toEqual(['audio:x']);
  });

  it('ne mute pas le tableau d\'origine', () => {
    const favs = ['audio:x'];
    toggleFavoriteId(favs, 'net:y');
    expect(favs).toEqual(['audio:x']);
  });
});

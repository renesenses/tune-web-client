import { describe, expect, it } from 'vitest';
import { formatsSansCollision, LIBELLES_QUALITE } from '../utils';

/**
 * « DSD » apparaissait deux fois dans la rangée de filtres de l'onglet Albums
 * (Cyrille Moutia, #1612) — une fois comme palier de qualité, une fois comme
 * format de fichier, séparés d'une simple barre et sans intitulé.
 */
describe('facettes de format : pas de libellé en double', () => {
  it('écarte le format qui porte le même nom qu’un palier de qualité', () => {
    // La composition réelle d'une bibliothèque de 2222 albums, mesurée sur
    // le serveur de test : une seule valeur `dsd`, pas de doublon de donnée.
    const reels = ['flac', 'mp3', 'dsd', 'alac', 'aac', 'wav'];
    expect(formatsSansCollision(reels)).toEqual(['aac', 'alac', 'flac', 'mp3', 'wav']);
  });

  it('garde tous les formats qui n’entrent en collision avec aucun palier', () => {
    expect(formatsSansCollision(['flac', 'mp3'])).toEqual(['flac', 'mp3']);
  });

  it('ignore la casse — c’est un libellé affiché qu’on compare, pas une valeur', () => {
    expect(formatsSansCollision(['DSD', 'Dsd', 'flac'])).toEqual(['flac']);
  });

  it('écarte tous les paliers, pas seulement DSD', () => {
    // La règle est générale : si un format entre un jour en collision avec un
    // autre palier, elle tient sans qu'on y revienne.
    for (const palier of LIBELLES_QUALITE) {
      expect(formatsSansCollision([palier.toLowerCase(), 'flac'])).toEqual(['flac']);
    }
  });

  it('supporte les valeurs vides sans les compter', () => {
    // `.map(a => a.format)` rend des `null` pour les albums sans format.
    expect(formatsSansCollision([null, undefined, '', 'flac'])).toEqual(['flac']);
  });

  it('dédoublonne et trie', () => {
    expect(formatsSansCollision(['mp3', 'flac', 'mp3'])).toEqual(['flac', 'mp3']);
  });
});

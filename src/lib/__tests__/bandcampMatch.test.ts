import { describe, it, expect } from 'vitest';
import { normaliser, rapprocher } from '../bandcampMatch';

describe('normaliser', () => {
  it("retire la mention d'édition que Bandcamp ne porte pas", () => {
    // Le cas réel : la bibliothèque d'Yves range « A Distortion Of Love
    // [2013 SACD Reissue] », Bandcamp dit « A Distortion Of Love ». Sans ça,
    // on lui annonce comme à télécharger un disque qu'il possède.
    expect(normaliser('A Distortion Of Love [2013 SACD Reissue]')).toBe(
      normaliser('A Distortion Of Love'),
    );
    expect(normaliser('Machine Head (Deluxe Edition)')).toBe(normaliser('Machine Head'));
    expect(normaliser('Kind of Blue (2019 Remastered)')).toBe(normaliser('Kind of Blue'));
  });

  it('ignore les accents et la ponctuation', () => {
    expect(normaliser('Björk')).toBe(normaliser('Bjork'));
    expect(normaliser("Sgt. Pepper's")).toBe(normaliser('Sgt Peppers'));
  });

  it("retire l'article de tête", () => {
    expect(normaliser('The Wall')).toBe(normaliser('Wall'));
  });

  it('ne casse pas sur une valeur absente', () => {
    expect(normaliser(null)).toBe('');
    expect(normaliser(undefined)).toBe('');
    expect(normaliser('')).toBe('');
  });
});

describe('rapprocher', () => {
  const locaux = [
    { artist: 'Deep Purple', title: 'Machine Head [2016 Remaster]' },
    { artist: 'Big Big Train', title: 'The Underfall Yard' },
    { artist: 'Phideaux', title: 'Doomsday Afternoon (Expanded)' },
  ];

  it('reconnaît un album présent malgré une mention d’édition', () => {
    const r = rapprocher([{ artist: 'Deep Purple', title: 'Machine Head' }], locaux);
    expect(r[0].verdict).toBe('presente');
    expect(r[0].correspondance).toContain('Machine Head');
  });

  it('signale comme manquant ce qui ne figure nulle part', () => {
    const r = rapprocher([{ artist: 'Caravan', title: 'In the Land of Grey and Pink' }], locaux);
    expect(r[0].verdict).toBe('manquante');
  });

  it('classe en ambigu une inclusion partielle plutôt que de trancher', () => {
    // « Underfall » est contenu dans « The Underfall Yard » : probable, pas
    // certain. Annoncer une correspondance approximative comme certaine est
    // pire que ne rien annoncer.
    const r = rapprocher([{ artist: 'Big Big Train', title: 'Underfall' }], locaux);
    expect(r[0].verdict).toBe('ambigue');
    expect(r[0].correspondance).toBe('The Underfall Yard');
  });

  it("n'apparie pas sur un titre trop court", () => {
    // Sans le garde-fou de longueur, « Up » s'apparierait avec la moitié
    // d'une discographie par simple inclusion.
    const r = rapprocher([{ artist: 'Big Big Train', title: 'Up' }], locaux);
    expect(r[0].verdict).toBe('manquante');
  });

  it('ne confond pas deux artistes différents au même titre', () => {
    const r = rapprocher([{ artist: 'Someone Else', title: 'Machine Head' }], locaux);
    expect(r[0].verdict).toBe('manquante');
  });

  it('accepte une bibliothèque vide sans planter', () => {
    const r = rapprocher([{ artist: 'A', title: 'B' }], []);
    expect(r[0].verdict).toBe('manquante');
  });
});

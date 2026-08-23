import { describe, it, expect } from 'vitest';
import { trouverArtisteExact } from './libraryNavigation';

describe('trouverArtisteExact', () => {
  const resultats = [
    { id: 11, name: 'Airbourne' },
    { id: 12, name: 'Air France' },
    { id: 13, name: 'Air' },
    { id: 14, name: 'Fairground Attraction' },
  ];

  it("rend l'artiste dont le nom correspond exactement", () => {
    expect(trouverArtisteExact(resultats, 'Air')).toBe(13);
  });

  it("ignore la casse", () => {
    expect(trouverArtisteExact(resultats, 'AIRBOURNE')).toBe(11);
    expect(trouverArtisteExact(resultats, 'air france')).toBe(12);
  });

  it("ne prend PAS le premier approchant", () => {
    // Tout l'enjeu : la recherche rend des voisins. Ouvrir « Airbourne » quand
    // on a demandé « Aire » enverrait l'auditeur ailleurs sans qu'il le sache.
    expect(trouverArtisteExact(resultats, 'Aire')).toBeNull();
  });

  it("ne replie ni les accents ni la ponctuation", () => {
    // « Motorhead » et « Motörhead » sont deux entrées distinctes : les
    // confondre ouvrirait la mauvaise fiche.
    const deux = [
      { id: 21, name: 'Motörhead' },
      { id: 22, name: 'Motorhead' },
    ];
    expect(trouverArtisteExact(deux, 'Motorhead')).toBe(22);
    expect(trouverArtisteExact(deux, 'Motörhead')).toBe(21);
  });

  it("rend null plutôt qu'un identifiant absent", () => {
    expect(trouverArtisteExact([{ name: 'Air' }], 'Air')).toBeNull();
    expect(trouverArtisteExact([{ id: null, name: 'Air' }], 'Air')).toBeNull();
  });

  it("supporte une liste absente ou un nom vide", () => {
    expect(trouverArtisteExact(undefined, 'Air')).toBeNull();
    expect(trouverArtisteExact(null, 'Air')).toBeNull();
    expect(trouverArtisteExact(resultats, '')).toBeNull();
  });

  it("survit à un nom absent dans les résultats", () => {
    const bancal = [{ id: 30, name: null }, { id: 31, name: 'Air' }];
    expect(trouverArtisteExact(bancal, 'Air')).toBe(31);
  });

  it("rend la PREMIÈRE correspondance exacte quand la casse en produit deux", () => {
    // Deux entrées « air » et « Air » : on ne tranche pas, on prend la première
    // — mais le test fige le comportement pour qu'il ne change pas en silence.
    const doublons = [{ id: 41, name: 'air' }, { id: 42, name: 'Air' }];
    expect(trouverArtisteExact(doublons, 'Air')).toBe(41);
  });
});

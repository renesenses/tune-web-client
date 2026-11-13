/**
 * Recette rc12 (13/11/2026) — « Ma collection physique » reçoit sa zone de
 * recherche : titre, artiste, label, n° de catalogue, code-barres.
 */
import { describe, it, expect } from 'vitest';
import { disqueRepondA, filtrerDisques } from '../rechercheCollectionPhysique';

const KIND = { titre: 'Kind of Blue', artiste: 'Miles Davis', labels: ['Columbia'], numeros_catalogue: ['CBS 62066'], codes_barres: ['5099749522428'] };
const HELENE = { titre: 'Mélodies', artiste: 'Hélène Grimaud', labels: ['Deutsche Grammophon'], numeros_catalogue: ['479 5245'] };
const DISQUES = [KIND, HELENE];

describe('Ma collection physique — recherche', () => {
  it('vide : tout passe, la même liste', () => {
    expect(filtrerDisques(DISQUES, '  ')).toBe(DISQUES);
  });
  it('titre, artiste, label', () => {
    expect(filtrerDisques(DISQUES, 'kind').map((d) => d.titre)).toEqual(['Kind of Blue']);
    expect(filtrerDisques(DISQUES, 'MILES').length).toBe(1);
    expect(filtrerDisques(DISQUES, 'grammophon').map((d) => d.artiste)).toEqual(['Hélène Grimaud']);
  });
  it('accents ignorés, mots dans n’importe quel champ', () => {
    expect(disqueRepondA(HELENE, 'helene melodies')).toBe(true);
    expect(disqueRepondA(KIND, 'davis columbia')).toBe(true);
    expect(disqueRepondA(KIND, 'davis grammophon')).toBe(false);
  });
  it('n° de catalogue, avec ou sans espace ni tiret', () => {
    expect(disqueRepondA(KIND, 'CBS 62066')).toBe(true);
    expect(disqueRepondA(KIND, 'cbs-62066')).toBe(true);
    expect(disqueRepondA(HELENE, '4795245')).toBe(true);
  });
  it('code-barres, entier ou en partie', () => {
    expect(disqueRepondA(KIND, '5099749522428')).toBe(true);
    expect(disqueRepondA(KIND, '5 099749')).toBe(true);
    expect(disqueRepondA(HELENE, '5099749')).toBe(false);
  });
  it('un serveur sans codes-barres ne casse rien', () => {
    expect(disqueRepondA({ titre: 'X', artiste: 'Y' }, 'x')).toBe(true);
    expect(disqueRepondA({ titre: 'X', artiste: 'Y', labels: null, numeros_catalogue: null }, '123')).toBe(false);
  });
});

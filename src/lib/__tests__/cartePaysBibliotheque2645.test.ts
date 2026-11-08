/**
 * renesenses/tune-web-client#2645 — agrégation par pays de la facette
 * `country`, paliers de teinte, et pays sous un point du globe.
 */
import { describe, expect, it } from 'vitest';
import { agregerPays, palier, paysAuLieu, PALIERS } from '../bibliothequePays';

describe('agregerPays — de la facette country aux pays de la carte', () => {
  it('réunit les casses sous un code, garde les valeurs exactes et trie par nombre', () => {
    const a = agregerPays([
      { value: 'FR', count: 120 },
      { value: 'fr', count: 5 },
      { value: 'US', count: 300 },
      { value: ' jp ', count: 7 },
    ]);
    expect(a.pays.map((p) => [p.code, p.n])).toEqual([['US', 300], ['FR', 125], ['JP', 7]]);
    expect(a.pays.find((p) => p.code === 'FR')!.valeurs).toEqual(['FR', 'fr']);
    expect(a.pays.find((p) => p.code === 'JP')!.valeurs).toEqual([' jp ']);
    expect(a.max).toBe(300);
    expect(a.horsCarte).toBe(0);
  });

  it('compte à part les pseudo-codes MusicBrainz et les valeurs libres', () => {
    const a = agregerPays([
      { value: 'XE', count: 40 },
      { value: 'XW', count: 2 },
      { value: 'Germany', count: 3 },
      { value: 'DE', count: 10 },
    ]);
    expect(a.pays.map((p) => p.code)).toEqual(['DE']);
    expect(a.horsCarte).toBe(45);
  });

  it('une facette vide, absente ou abîmée donne une carte vide, sans erreur', () => {
    for (const f of [[], null, undefined, [{ value: 'FR', count: 0 }, { value: null as any, count: 3 }]]) {
      const a = agregerPays(f as any);
      expect(a.pays).toEqual([]);
      expect(a.max).toBe(0);
    }
  });
});

describe('palier — teinte relative à la bibliothèque', () => {
  it('le pays le plus fourni est au palier le plus fort, les autres en dessous', () => {
    expect(palier(300, 300)).toBe(PALIERS - 1);
    expect(palier(1, 300)).toBe(0);
    const milieu = palier(20, 300);
    expect(milieu).toBeGreaterThan(0);
    expect(milieu).toBeLessThan(PALIERS - 1);
  });
  it('zéro ou une bibliothèque vide donnent le palier le plus pâle', () => {
    expect(palier(0, 300)).toBe(0);
    expect(palier(5, 0)).toBe(0);
  });
});

describe('paysAuLieu — le pays sous un clic', () => {
  it('reconnaît des pays depuis leurs coordonnées', () => {
    expect(paysAuLieu(46.5, 2.5)).toBe('FR'); // centre de la France
    expect(paysAuLieu(39, -98)).toBe('US'); // Kansas
    expect(paysAuLieu(-25, 134)).toBe('AU'); // centre de l'Australie
    expect(paysAuLieu(36, 138)).toBe('JP');
  });
  it('rend null en pleine mer', () => {
    expect(paysAuLieu(0, -30)).toBeNull(); // Atlantique
    expect(paysAuLieu(-40, -120)).toBeNull(); // Pacifique Sud
  });
});

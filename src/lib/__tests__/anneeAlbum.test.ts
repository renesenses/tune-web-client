/**
 * Le choix de l'annee change ce que l'ecran montre — et peut le VIDER.
 *
 * Mesure sur le .18 le 04/09/2026, 4255 albums : `year` rempli sur 3049
 * (72 %), `original_year` sur 90 (2 %), `release_date` sur 0. Basculer sur
 * « origine » fait donc tomber la frise de 3049 albums dates a 90. C'est
 * legitime, mais seulement si l'ecran l'annonce — d'ou `couvertureAnnees`,
 * dont ces tests garantissent qu'elle compte ce qu'elle pretend compter.
 */
import { describe, it, expect } from 'vitest';
import { anneeAlbum, couvertureAnnees, comparerAnnees } from '../anneeAlbum';
import type { Album } from '../types';

const alb = (o: Partial<Album>): Album => ({ id: 1, title: 't', ...o }) as Album;

// « Wish You Were Here » : edition 1994, origine 1975 (mesure sur le .18).
const REEDITE = alb({ id: 1, title: 'Wish You Were Here', year: 1994, original_year: 1975 });
const SIMPLE = alb({ id: 2, title: 'Simple', year: 2001 });
const SANS = alb({ id: 3, title: 'Sans date' });

describe('anneeAlbum', () => {
  it('auto prend l’origine quand elle existe, l’édition sinon', () => {
    expect(anneeAlbum(REEDITE, 'auto')).toBe(1975);
    expect(anneeAlbum(SIMPLE, 'auto')).toBe(2001);
  });

  it('edition prend TOUJOURS l’édition, même quand l’origine existe', () => {
    expect(anneeAlbum(REEDITE, 'edition')).toBe(1994);
  });

  it('origine ne se rabat PAS sur l’édition', () => {
    // C'est ce qui fait chuter la couverture, et c'est voulu : se rabattre
    // rendrait le mode indiscernable d'`auto`.
    expect(anneeAlbum(REEDITE, 'origine')).toBe(1975);
    expect(anneeAlbum(SIMPLE, 'origine')).toBeNull();
  });

  it('auto est le défaut', () => {
    expect(anneeAlbum(REEDITE)).toBe(anneeAlbum(REEDITE, 'auto'));
  });

  it('écarte les années invraisemblables', () => {
    // Une donnee abimee (0, 12, 9999) n'est pas une annee : la laisser passer
    // creerait un groupe « 0 » en tete de frise.
    for (const y of [0, 12, 1800, 2200, 9999]) {
      expect(anneeAlbum(alb({ year: y }), 'edition')).toBeNull();
    }
    expect(anneeAlbum(alb({ year: 1801 }), 'edition')).toBe(1801);
  });

  it('rend null sur un album absent', () => {
    expect(anneeAlbum(null)).toBeNull();
    expect(anneeAlbum(undefined)).toBeNull();
  });
});

describe('couvertureAnnees', () => {
  const biblio = [REEDITE, SIMPLE, SANS];

  it('compte ce que CE mode sait dater', () => {
    expect(couvertureAnnees(biblio, 'auto')).toBe(2);
    expect(couvertureAnnees(biblio, 'edition')).toBe(2);
    expect(couvertureAnnees(biblio, 'origine')).toBe(1);
  });

  it('rend 0 sur une bibliothèque vide', () => {
    expect(couvertureAnnees([], 'auto')).toBe(0);
  });
});

describe('comparerAnnees', () => {
  it('trie dans les deux sens', () => {
    expect(comparerAnnees(1975, 1994, 'asc')).toBeLessThan(0);
    expect(comparerAnnees(1975, 1994, 'desc')).toBeGreaterThan(0);
  });

  it('un album sans année part en DERNIER dans les deux sens', () => {
    // En ordre croissant, le mettre en tete reviendrait a le dire plus ancien
    // que tout — ce qu'on ne sait pas.
    for (const ordre of ['asc', 'desc'] as const) {
      expect(comparerAnnees(null, 1975, ordre)).toBeGreaterThan(0);
      expect(comparerAnnees(1975, null, ordre)).toBeLessThan(0);
    }
    expect(comparerAnnees(null, null, 'asc')).toBe(0);
  });

  it('trie une liste complète comme attendu', () => {
    const annees = [1994, null, 1975, 2001];
    expect([...annees].sort((a, b) => comparerAnnees(a, b, 'asc'))).toEqual([1975, 1994, 2001, null]);
    expect([...annees].sort((a, b) => comparerAnnees(a, b, 'desc'))).toEqual([2001, 1994, 1975, null]);
  });
});

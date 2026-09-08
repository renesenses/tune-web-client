/**
 * Les filtres cumulatifs disent la vérité sur ce qu'ils vont rendre.
 *
 * Bertrand, 04/09/2026 : « les filtres cumulatifs ne modifient pas les valeurs
 * d'albums correspondants sur les filtres restants ». De deux façons :
 *
 *  - Format et Profondeur comptaient sur TOUTE la bibliothèque — filtrer sur
 *    Hi-Res laissait « FLAC 3 049 » alors que la combinaison n'en donne qu'une
 *    poignée ;
 *  - Qualité et Fréquence n'affichaient AUCUN compte, et proposaient des
 *    valeurs en dur dont la plupart ne correspondent à rien.
 *
 * Un filtre qui promet des albums qu'il ne rendra pas est pire qu'un filtre
 * absent : on l'essaie, on tombe sur du vide, et on soupçonne la bibliothèque.
 */
import { describe, it, expect } from 'vitest';
import {
  correspond, comptesQualite, comptesFrequence, comptesFormat, comptesProfondeur,
  type FiltresBibliotheque, type Outils,
} from '../facettesBibliotheque';
import type { Album } from '../types';

const alb = (o: Partial<Album>): Album => ({ id: 1, title: 't', ...o }) as Album;

/** Quatre albums qui se croisent : chaque facette en sépare deux. */
const BIBLIO: Album[] = [
  alb({ id: 1, title: 'A', format: 'FLAC', sample_rate: 44100, bit_depth: 16, year: 2020 }),
  alb({ id: 2, title: 'B', format: 'FLAC', sample_rate: 96000, bit_depth: 24, year: 2021 }),
  alb({ id: 3, title: 'C', format: 'WAV',  sample_rate: 96000, bit_depth: 24, year: 2021 }),
  alb({ id: 4, title: 'D', format: 'MP3',  sample_rate: 44100, bit_depth: 0,  year: 2020 }),
];

const OUTILS: Outils = {
  // Hi-Res = au-delà du CD. Suffisant pour ce test.
  qualiteDe: (a, cle) => (cle === 'hires' ? (a.sample_rate ?? 0) > 44100 : (a.sample_rate ?? 0) === 44100),
  anneeDe: (a) => a.year ?? null,
  plier: (s) => (s ?? '').toLowerCase(),
};

const AUCUN: FiltresBibliotheque = {
  qualite: null, frequence: null, annee: null, format: null, profondeur: null, recherche: '',
};

describe('sans filtre, on compte toute la bibliothèque', () => {
  it('les formats présents et leur compte', () => {
    expect(comptesFormat(BIBLIO, AUCUN, OUTILS)).toEqual([['FLAC', 2], ['MP3', 1], ['WAV', 1]]);
  });

  it('les profondeurs présentes ; zéro n’est pas une profondeur', () => {
    // Un album sans profondeur connue ne cree pas une entree « 0-bit ».
    expect(comptesProfondeur(BIBLIO, AUCUN, OUTILS)).toEqual([[16, 1], [24, 2]]);
  });
});

describe('un filtre actif change les comptes des AUTRES', () => {
  const hires: FiltresBibliotheque = { ...AUCUN, qualite: 'hires' };

  it('les formats se recomptent sous le filtre de qualité', () => {
    // C'EST LE DEFAUT SIGNALE : avant, FLAC restait a 2.
    expect(comptesFormat(BIBLIO, hires, OUTILS)).toEqual([['FLAC', 1], ['WAV', 1]]);
  });

  it('les profondeurs aussi', () => {
    expect(comptesProfondeur(BIBLIO, hires, OUTILS)).toEqual([[24, 2]]);
  });

  it('et les fréquences', () => {
    const n = comptesFrequence(BIBLIO, { ...AUCUN, format: 'FLAC' }, OUTILS, [44100, 96000, 192000]);
    expect(n.get(44100)).toBe(1);
    expect(n.get(96000)).toBe(1);
    expect(n.get(192000), 'une fréquence absente doit valoir zéro, pas disparaître').toBe(0);
  });
});

describe('une facette ne se compte JAMAIS avec elle-même', () => {
  it('choisir FLAC laisse WAV et MP3 comptables', () => {
    // Sinon le menu devient un cul-de-sac : toutes les autres valeurs à zéro,
    // et le seul geste possible est de retirer le filtre.
    const f: FiltresBibliotheque = { ...AUCUN, format: 'FLAC' };
    expect(comptesFormat(BIBLIO, f, OUTILS)).toEqual([['FLAC', 2], ['MP3', 1], ['WAV', 1]]);
  });

  it('choisir 24 bits laisse 16 bits comptable', () => {
    const f: FiltresBibliotheque = { ...AUCUN, profondeur: 24 };
    expect(comptesProfondeur(BIBLIO, f, OUTILS)).toEqual([[16, 1], [24, 2]]);
  });
});

describe('la RECHERCHE n’est pas une facette', () => {
  it('elle s’applique même au comptage des autres', () => {
    // Compter les formats d'albums qui ne correspondent pas au texte tape
    // n'aurait aucun sens : le menu proposerait ce que la liste ne montre pas.
    const f: FiltresBibliotheque = { ...AUCUN, recherche: 'a' };
    expect(comptesFormat(BIBLIO, f, OUTILS)).toEqual([['FLAC', 1]]);
  });
});

describe('correspond — le prédicat que la grille et les comptes partagent', () => {
  it('cumule tous les filtres quand on n’exclut rien', () => {
    const f: FiltresBibliotheque = { ...AUCUN, format: 'FLAC', profondeur: 24 };
    expect(BIBLIO.filter((a) => correspond(a, f, OUTILS)).map((a) => a.title)).toEqual(['B']);
  });

  it('exclure une facette la rend transparente', () => {
    const f: FiltresBibliotheque = { ...AUCUN, format: 'FLAC', profondeur: 24 };
    expect(BIBLIO.filter((a) => correspond(a, f, OUTILS, 'format')).map((a) => a.title)).toEqual(['B', 'C']);
  });
});

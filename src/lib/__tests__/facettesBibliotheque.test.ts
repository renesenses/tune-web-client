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
  provenanceDe: (a) => {
    const src = (a.source ?? 'local').trim() || 'local';
    if (src === 'local') return 'local';
    const udn = (a.source_id ?? '').split('|')[0]?.trim();
    return udn && udn.length < (a.source_id ?? '').trim().length ? `${src}:${udn}` : src;
  },
};

const AUCUN: FiltresBibliotheque = {
  qualite: [], frequence: [], annee: null, format: [], profondeur: [], recherche: '',
  // #1957 — la facette « compilation ». Ses propres cas vivent dans
  // `pastilleCompilation.test.ts` ; ici elle est simplement inactive, pour que
  // les comptes existants restent ceux d'avant.
  compilation: null,
  // #4152 — la facette « provenance ». Ses propres cas vivent plus bas ; ici
  // elle est inactive, pour que les comptes existants restent ceux d'avant.
  provenance: null,
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
  const hires: FiltresBibliotheque = { ...AUCUN, qualite: ['hires'] };

  it('les formats se recomptent sous le filtre de qualité', () => {
    // C'EST LE DEFAUT SIGNALE : avant, FLAC restait a 2.
    expect(comptesFormat(BIBLIO, hires, OUTILS)).toEqual([['FLAC', 1], ['WAV', 1]]);
  });

  it('les profondeurs aussi', () => {
    expect(comptesProfondeur(BIBLIO, hires, OUTILS)).toEqual([[24, 2]]);
  });

  it('et les fréquences', () => {
    const n = comptesFrequence(BIBLIO, { ...AUCUN, format: ['FLAC'] }, OUTILS, [44100, 96000, 192000]);
    expect(n.get(44100)).toBe(1);
    expect(n.get(96000)).toBe(1);
    expect(n.get(192000), 'une fréquence absente doit valoir zéro, pas disparaître').toBe(0);
  });
});

describe('une facette ne se compte JAMAIS avec elle-même', () => {
  it('choisir FLAC laisse WAV et MP3 comptables', () => {
    // Sinon le menu devient un cul-de-sac : toutes les autres valeurs à zéro,
    // et le seul geste possible est de retirer le filtre.
    const f: FiltresBibliotheque = { ...AUCUN, format: ['FLAC'] };
    expect(comptesFormat(BIBLIO, f, OUTILS)).toEqual([['FLAC', 2], ['MP3', 1], ['WAV', 1]]);
  });

  it('choisir 24 bits laisse 16 bits comptable', () => {
    const f: FiltresBibliotheque = { ...AUCUN, profondeur: [24] };
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
    const f: FiltresBibliotheque = { ...AUCUN, format: ['FLAC'], profondeur: [24] };
    expect(BIBLIO.filter((a) => correspond(a, f, OUTILS)).map((a) => a.title)).toEqual(['B']);
  });

  it('exclure une facette la rend transparente', () => {
    const f: FiltresBibliotheque = { ...AUCUN, format: ['FLAC'], profondeur: [24] };
    expect(BIBLIO.filter((a) => correspond(a, f, OUTILS, 'format')).map((a) => a.title)).toEqual(['B', 'C']);
  });
});

/**
 * Le OU À L'INTÉRIEUR d'une facette — #898, Cyrille Moutia (fil 1665).
 *
 * « C'est dire par exemple je sélectionne aiff + flac et je filtre aussi sur
 * des fréquences d'échantillonnage différentes ». Il joint une capture
 * d'Audirvana pour le montrer : des CASES À COCHER, pas des pastilles.
 *
 * L'écran Oxygen sait le faire depuis le 28/08 (`FacetParam`, `appendFacetParam`,
 * clé répétée). La BIBLIOTHÈQUE, elle, ne l'a jamais su : chaque filtre y était
 * un scalaire, et sa précision du 04/09 19h46 demande les DEUX écrans.
 *
 * Arbitrage de Bertrand, 11/09/2026 : « OU intra-facette + ET inter-facettes,
 * sur toutes les facettes — pas un jalon limité au seul Format. »
 *
 * ⚠️ Ces filtres-ci s'appliquent SUR PLACE, sur une bibliothèque déjà chargée
 * (`matches` dans LibraryV2) : aucune route, aucun SQL, aucun index n'entre
 * dans ce contrat. C'est ce qui rend la moitié cliente livrable seule.
 */
describe('le OU à l’intérieur d’une facette (#898)', () => {
  it('« aiff + flac » : deux formats cochés rendent l’union, pas le vide', () => {
    const f: FiltresBibliotheque = { ...AUCUN, format: ['FLAC', 'WAV'] };
    expect(BIBLIO.filter((a) => correspond(a, f, OUTILS)).map((a) => a.title)).toEqual(['A', 'B', 'C']);
  });

  it('« des fréquences d’échantillonnage différentes »', () => {
    const f: FiltresBibliotheque = { ...AUCUN, frequence: [44100, 96000] };
    expect(BIBLIO.filter((a) => correspond(a, f, OUTILS)).map((a) => a.title)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('deux quantifications', () => {
    const f: FiltresBibliotheque = { ...AUCUN, profondeur: [16, 24] };
    expect(BIBLIO.filter((a) => correspond(a, f, OUTILS)).map((a) => a.title)).toEqual(['A', 'B', 'C']);
  });

  it('deux paliers de qualité', () => {
    const f: FiltresBibliotheque = { ...AUCUN, qualite: ['hires', 'cd'] };
    expect(BIBLIO.filter((a) => correspond(a, f, OUTILS)).map((a) => a.title)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('le ET entre facettes tient : (FLAC ou WAV) ET 96 kHz', () => {
    // C'est la seconde moitié de sa demande, et elle ne doit pas se perdre en
    // ouvrant la première : l'union DANS une facette, l'intersection ENTRE.
    const f: FiltresBibliotheque = { ...AUCUN, format: ['FLAC', 'WAV'], frequence: [96000] };
    expect(BIBLIO.filter((a) => correspond(a, f, OUTILS)).map((a) => a.title)).toEqual(['B', 'C']);
  });

  it('une facette vide ne filtre rien — c’est l’absence de filtre', () => {
    const f: FiltresBibliotheque = { ...AUCUN, format: [], frequence: [] };
    expect(BIBLIO.filter((a) => correspond(a, f, OUTILS)).map((a) => a.title)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('une facette multivaluée ne se compte toujours pas avec elle-même', () => {
    // Sans cette règle, cocher FLAC puis WAV serait impossible : la seconde
    // valeur serait affichée à zéro et désarmée.
    const f: FiltresBibliotheque = { ...AUCUN, format: ['FLAC'] };
    expect(comptesFormat(BIBLIO, f, OUTILS)).toEqual([['FLAC', 2], ['MP3', 1], ['WAV', 1]]);
  });

  it('les comptes des AUTRES facettes suivent l’union, pas la première valeur', () => {
    // FLAC seul donne 16 bits ×1 et 24 bits ×1 ; FLAC+WAV ajoute le WAV 24.
    const f: FiltresBibliotheque = { ...AUCUN, format: ['FLAC', 'WAV'] };
    expect(comptesProfondeur(BIBLIO, f, OUTILS)).toEqual([[16, 1], [24, 2]]);
  });
});

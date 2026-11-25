/**
 * [rc14] Onglet Crédits — trois doublons écartés et l'ordre des instruments.
 * Idées signalées par Xavier Joly (testeur).
 *
 * (a) un musicien rangé sous son instrument ne se répète pas sous « Musicien » ;
 * (b) un compositeur ne se répète pas comme auteur (writer, lyricist) ;
 * (c) une personne une fois par ligne malgré accents, casse et espaces.
 */
import { describe, it, expect } from 'vitest';
import {
  blocsDeCredits,
  normaliserNom,
  uniqueInstruments,
  type CreditAvecPiste,
  type LigneCredits,
} from '../library/credits';
import type { TrackCredit } from '../types';

let n = 0;
function c(p: Partial<CreditAvecPiste>): CreditAvecPiste {
  return {
    id: ++n, track_id: 1, artist_id: null, artist_name: 'X', role: 'performer',
    instrument: null, position: n, ...p,
  };
}

function lignes(credits: CreditAvecPiste[], langue?: string): LigneCredits[] {
  return blocsDeCredits(credits, langue).flatMap((b) => b.lignes);
}

/** « rôle/instrument = noms » pour chaque ligne. */
function resume(credits: CreditAvecPiste[], langue?: string): string[] {
  return lignes(credits, langue).map(
    (l) => `${l.role}${l.instrument ? `/${l.instrument}` : ''} = ${l.artistes.map((a) => a.artist_name).join(', ')}`,
  );
}

describe('(a) instrument précis plutôt que « Musicien » générique', () => {
  it('le violoncelliste n’apparaît plus sous « performer »', () => {
    expect(resume([
      c({ artist_id: 7, artist_name: 'Anne Gastinel', role: 'performer' }),
      c({ artist_id: 7, artist_name: 'Anne Gastinel', role: 'performer', instrument: 'cello' }),
    ])).toEqual(['performer/cello = Anne Gastinel']);
  });

  it('même sans identifiant, par le nom normalisé', () => {
    expect(resume([
      c({ artist_name: 'HELENE  GRIMAUD', role: 'performer' }),
      c({ artist_name: 'Hélène Grimaud', role: 'performer', instrument: 'piano' }),
    ])).toEqual(['performer/piano = Hélène Grimaud']);
  });

  it('contre-exemple : un autre musicien générique reste', () => {
    expect(resume([
      c({ artist_id: 1, artist_name: 'Orchestre de Paris', role: 'performer' }),
      c({ artist_id: 2, artist_name: 'Anne Gastinel', role: 'performer', instrument: 'cello' }),
    ])).toEqual(['performer = Orchestre de Paris', 'performer/cello = Anne Gastinel']);
  });

  it('contre-exemple : sur un album, le crédit générique d’une AUTRE piste reste', () => {
    const l = lignes([
      c({ track_id: 1, track_number: 1, artist_id: 7, artist_name: 'A', role: 'performer', instrument: 'violin' }),
      c({ track_id: 2, track_number: 2, artist_id: 7, artist_name: 'A', role: 'performer' }),
      c({ track_id: 1, track_number: 1, artist_id: 7, artist_name: 'A', role: 'performer' }),
    ]);
    const generique = l.find((x) => x.role === 'performer' && !x.instrument)!;
    expect(generique.artistes[0].pistes.map((p) => p.numero)).toEqual([2]);
  });

  it('contre-exemple : la voix et l’artiste principal ne sont pas des rôles génériques', () => {
    expect(resume([
      c({ artist_id: 7, artist_name: 'A', role: 'vocal' }),
      c({ artist_id: 7, artist_name: 'A', role: 'performer', instrument: 'guitar' }),
    ])).toEqual(['performer/guitar = A', 'vocal = A']);
  });
});

describe('(b) l’auteur ne répète pas le compositeur', () => {
  it('writer = compositeur : écarté', () => {
    expect(resume([
      c({ artist_id: 3, artist_name: 'Agnes Obel', role: 'composer' }),
      c({ artist_id: 3, artist_name: 'Agnes Obel', role: 'writer' }),
    ])).toEqual(['composer = Agnes Obel']);
  });

  it('lyricist = compositeur, graphie différente : écarté', () => {
    expect(resume([
      c({ artist_name: 'Léo Ferré', role: 'composer' }),
      c({ artist_name: 'LEO FERRE', role: 'lyricist' }),
    ])).toEqual(['composer = Léo Ferré']);
  });

  it('contre-exemple : un parolier distinct reste', () => {
    expect(resume([
      c({ artist_id: 1, artist_name: 'Michel Legrand', role: 'composer' }),
      c({ artist_id: 2, artist_name: 'Jacques Demy', role: 'lyricist' }),
      c({ artist_id: 2, artist_name: 'Jacques Demy', role: 'writer' }),
    ])).toEqual(['composer = Michel Legrand', 'writer = Jacques Demy', 'lyricist = Jacques Demy']);
  });

  it('contre-exemple : parmi deux auteurs, seul le compositeur est écarté', () => {
    expect(resume([
      c({ artist_id: 1, artist_name: 'Elton John', role: 'composer' }),
      c({ artist_id: 1, artist_name: 'Elton John', role: 'writer' }),
      c({ artist_id: 2, artist_name: 'Bernie Taupin', role: 'writer' }),
    ])).toEqual(['composer = Elton John', 'writer = Bernie Taupin']);
  });

  it('contre-exemple : compositeur d’une autre piste seulement, l’auteur reste', () => {
    const l = lignes([
      c({ track_id: 1, track_number: 1, artist_id: 1, artist_name: 'A', role: 'composer' }),
      c({ track_id: 2, track_number: 2, artist_id: 1, artist_name: 'A', role: 'writer' }),
    ]);
    expect(l.map((x) => x.role)).toEqual(['composer', 'writer']);
  });
});

describe('(c) une personne une fois par rôle', () => {
  it('normaliserNom : NFKD, sans diacritiques, minuscules, espaces resserrés', () => {
    expect(normaliserNom('  Beyoncé   Knowles ')).toBe('beyonce knowles');
    expect(normaliserNom('BEYONCE KNOWLES')).toBe('beyonce knowles');
    expect(normaliserNom('Beyoncé Knowles')).toBe('beyonce knowles');
  });

  it('variantes d’accents, de casse et d’espaces : une seule ligne, la graphie la plus complète', () => {
    const l = lignes([
      c({ track_id: 1, track_number: 1, artist_name: 'Francoise Hardy', role: 'vocal' }),
      c({ track_id: 2, track_number: 2, artist_name: 'FRANÇOISE  HARDY', role: 'vocal' }),
      c({ track_id: 3, track_number: 3, artist_name: 'Françoise Hardy', role: 'vocal' }),
    ]);
    expect(l).toHaveLength(1);
    expect(l[0].artistes).toHaveLength(1);
    expect(l[0].artistes[0].artist_name).toBe('Françoise Hardy');
    expect(l[0].artistes[0].pistes.map((p) => p.numero)).toEqual([1, 2, 3]);
  });

  it('deux fiches pour deux graphies : fusionnées, l’identifiant gardé', () => {
    const l = lignes([
      c({ artist_id: null, artist_name: 'Beyonce', role: 'vocal' }),
      c({ artist_id: 42, artist_name: 'Beyoncé', role: 'vocal' }),
    ]);
    expect(l[0].artistes).toEqual([
      expect.objectContaining({ artist_id: 42, artist_name: 'Beyoncé' }),
    ]);
  });

  it('contre-exemple : homonymes aux MBID différents restent deux', () => {
    const l = lignes([
      c({ artist_id: 10, artist_mbid: 'aaaa', artist_name: 'John Williams', role: 'composer' }),
      c({ artist_id: 11, artist_mbid: 'bbbb', artist_name: 'John Williams', role: 'composer' }),
    ]);
    expect(l[0].artistes.map((a) => a.artist_id)).toEqual([10, 11]);
  });

  it('contre-exemple : deux fiches au nom rigoureusement identique restent deux', () => {
    const l = lignes([
      c({ artist_id: 10, artist_name: 'John Williams', role: 'performer', instrument: 'guitar' }),
      c({ artist_id: 11, artist_name: 'John Williams', role: 'performer', instrument: 'guitar' }),
    ]);
    expect(l[0].artistes.map((a) => a.artist_id)).toEqual([10, 11]);
  });

  it('contre-exemple : noms proches mais différents restent deux', () => {
    const l = lignes([
      c({ artist_name: 'Jean Martin', role: 'performer', instrument: 'piano' }),
      c({ artist_name: 'Jeanne Martin', role: 'performer', instrument: 'piano' }),
    ]);
    expect(l[0].artistes.map((a) => a.artist_name)).toEqual(['Jean Martin', 'Jeanne Martin']);
  });

  it('les instruments aux graphies voisines se rejoignent sur une ligne', () => {
    expect(resume([
      c({ artist_id: 1, artist_name: 'A', instrument: 'Violoncelle' }),
      c({ artist_id: 2, artist_name: 'B', instrument: 'violoncelle' }),
    ])).toEqual(['performer/Violoncelle = A, B']);
  });
});

describe('ordre alphabétique des instruments selon la langue', () => {
  it('blocsDeCredits : la ligne générique d’abord, puis les instruments triés', () => {
    expect(resume([
      c({ artist_id: 1, artist_name: 'A', instrument: 'violoncelle' }),
      c({ artist_id: 2, artist_name: 'B', instrument: 'Alto' }),
      c({ artist_id: 3, artist_name: 'C', instrument: 'épinette' }),
      c({ artist_id: 4, artist_name: 'D' }),
      c({ artist_id: 5, artist_name: 'E', instrument: 'basson' }),
    ], 'fr')).toEqual([
      'performer = D',
      'performer/Alto = B',
      'performer/basson = E',
      'performer/épinette = C',
      'performer/violoncelle = A',
    ]);
  });

  it('uniqueInstruments : ordre de la langue, pas des points de code', () => {
    const t = (instrument: string): TrackCredit =>
      ({ id: null, track_id: 1, artist_id: null, artist_name: 'X', role: 'performer', instrument, position: 0 });
    expect(uniqueInstruments([t('violon'), t('Basson'), t('épinette'), t('alto')], 'fr'))
      .toEqual(['alto', 'Basson', 'épinette', 'violon']);
  });
});

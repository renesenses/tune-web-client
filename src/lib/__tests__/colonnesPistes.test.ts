/**
 * Le modèle de colonnes du tableau de pistes (chantier du 07/09/2026,
 * maquette Levente).
 *
 * Ces gardes tiennent surtout les décisions PRODUIT, celles qu'un refactor
 * ultérieur effacerait sans s'en apercevoir : quelles colonnes existent, ce
 * qui est verrouillé, ce qui n'a pas de donnée, et ce qu'on affiche quand on
 * ne sait pas.
 */
import { describe, expect, it } from 'vitest';
import {
  COLONNES, DEFAUTS, MODES_BRANCHES, PAR_CLE,
  colonnesRetenues, gabaritGrille, valeurColonne, type CleColonne,
} from '../colonnesPistes';
import type { Track } from '../types';

/** Une piste telle que `/library/albums/{id}/tracks` la rend, mesurée le 07/09. */
const piste = (o: Partial<Track> = {}) => ({
  id: 5, track_number: 1, title: 'Almoraima', artist_name: 'Paco de Lucia',
  composer: 'Paco de Lucia', duration_ms: 327506, year: 1996, channels: 2,
  bpm: null, genre: 'World Music', format: 'flac', sample_rate: 44100, bit_depth: 16,
  ...o,
}) as unknown as Track;

describe('le catalogue', () => {
  it('couvre les douze colonnes de la maquette', () => {
    expect(COLONNES.map((c) => c.cle)).toEqual([
      'num', 'title', 'artist', 'composer', 'time', 'year',
      'plays', 'lastPlayed', 'channels', 'bpm', 'genre', 'quality',
    ]);
  });

  it('chaque colonne porte une CLÉ de traduction, pas un libellé', () => {
    for (const c of COLONNES) expect(c.cleI18n, c.cle).toMatch(/^v2\.tcol\./);
  });

  it('le TITRE est la seule colonne verrouillée', () => {
    // Une liste de pistes sans titre n'est plus une liste de pistes. Le
    // numéro, lui, reste décochable — il n'a pas de sens hors d'un album, et
    // la maquette le laisse décoché.
    expect(COLONNES.filter((c) => c.verrouillee).map((c) => c.cle)).toEqual(['title']);
  });

  it('🔴 « # Plays » et « Last Played » sont déclarées SANS DONNÉE', () => {
    // Mesuré sur le .18 : `/library/albums/{id}/tracks` rend 31 champs, ni
    // `play_count` ni `last_played_at`. La maquette les coche pourtant. Les
    // proposer sans le dire remplirait la colonne de vide.
    expect(COLONNES.filter((c) => c.indisponible).map((c) => c.cle))
      .toEqual(['plays', 'lastPlayed']);
  });
});

describe('les colonnes retenues', () => {
  it('respectent l’ordre du CATALOGUE, pas celui du réglage', () => {
    const r = colonnesRetenues(['quality', 'artist', 'num']);
    expect(r.map((c) => c.cle)).toEqual(['num', 'title', 'artist', 'quality']);
  });

  it('gardent le titre même s’il est absent du réglage', () => {
    expect(colonnesRetenues([]).map((c) => c.cle)).toEqual(['title']);
  });

  it('🔴 écartent une colonne SANS DONNÉE, même cochée', () => {
    // Le réglage survit au serveur : une colonne cochée hier ne doit pas
    // réapparaître vide si la donnée n'arrive toujours pas.
    expect(colonnesRetenues(['plays', 'lastPlayed']).map((c) => c.cle)).toEqual(['title']);
  });

  it('écartent une clé INCONNUE au lieu de casser la grille', () => {
    // Un réglage écrit par une version future ne doit pas produire une
    // `grid-template-columns` avec un trou.
    const r = colonnesRetenues(['artist', 'colonne-du-futur', '']);
    expect(r.map((c) => c.cle)).toEqual(['title', 'artist']);
  });
});

describe('le gabarit de grille', () => {
  it('est fabriqué UNE fois pour l’en-tête et les lignes', () => {
    // C'est la leçon de la vue Liste de la Bibliothèque : deux gabarits
    // calculés séparément finissent par diverger, et les colonnes ne
    // s'alignent plus d'une ligne à l'autre.
    expect(gabaritGrille(colonnesRetenues(['num', 'artist', 'time'])))
      .toBe('44px minmax(0,2fr) minmax(0,1.4fr) 64px');
  });
});

describe('les valeurs', () => {
  it.each([
    ['num', '1'], ['title', 'Almoraima'], ['artist', 'Paco de Lucia'],
    ['composer', 'Paco de Lucia'], ['time', '5:27'], ['year', '1996'],
    ['channels', '2'], ['genre', 'World Music'],
  ] as [CleColonne, string][])('%s', (cle, attendu) => {
    expect(valeurColonne(piste(), cle)).toBe(attendu);
  });

  it('🔴 « on ne sait pas » rend null, jamais « — » ni « 0 »', () => {
    // Une cellule vide se lit comme une absence ; un zéro affirme une valeur.
    // C'est la confusion qui avait fait perdre du temps sur le bandeau de fin
    // de scan (fil 1512).
    expect(valeurColonne(piste({ bpm: null } as any), 'bpm')).toBeNull();
    expect(valeurColonne(piste({ year: null } as any), 'year')).toBeNull();
    expect(valeurColonne(piste({ genre: '   ' } as any), 'genre')).toBeNull();
    expect(valeurColonne(piste(), 'plays')).toBeNull();
    expect(valeurColonne(piste(), 'lastPlayed')).toBeNull();
  });

  it('un zéro RÉEL reste zéro', () => {
    expect(valeurColonne(piste({ channels: 0 } as any), 'channels')).toBe('0');
    expect(valeurColonne(piste({ track_number: 0 } as any), 'num')).toBe('0');
  });

  it('la qualité ne passe pas par le texte : c’est une pastille', () => {
    expect(valeurColonne(piste(), 'quality')).toBeNull();
  });
});

describe('les défauts par mode', () => {
  it('ne citent que des clés du catalogue', () => {
    for (const [mode, cles] of Object.entries(DEFAUTS))
      for (const c of cles) expect(PAR_CLE[c as CleColonne], `${mode} → ${c}`).toBeTruthy();
  });

  it('n’avancent AUCUNE colonne sans donnée', () => {
    // Les proposer cochées d'office remplirait l'écran de vide le premier jour.
    for (const cles of Object.values(DEFAUTS))
      for (const c of cles) expect(PAR_CLE[c as CleColonne].indisponible, c).toBeFalsy();
  });

  it('Essentiel est le plus sobre des trois', () => {
    expect(DEFAUTS.beginner.length).toBeLessThan(DEFAUTS.intermediate.length);
    expect(DEFAUTS.intermediate.length).toBeLessThan(DEFAUTS.expert.length);
  });

  it('🔴 seul Essentiel est branché, et le code le DIT', () => {
    // Option A retenue par Bertrand : la matrice montrera les trois modes,
    // les deux autres grisés et annoncés comme non appliqués. Cette constante
    // est ce sur quoi l'écran s'appuiera — pas une condition écrite en dur
    // dans le balisage.
    expect(MODES_BRANCHES).toEqual(['beginner']);
  });
});

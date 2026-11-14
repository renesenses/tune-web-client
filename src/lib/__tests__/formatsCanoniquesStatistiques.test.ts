/**
 * Recette de Bertrand sur le .18 (14/11) — la carte « Formats » des
 * Statistiques listait « MPEG » (146 pistes) ET « MP3 » (143), « DSF » et
 * « DSD », « MP4 » à côté de « AAC » / « ALAC ». Les doublons venaient des
 * pistes UPnP, dont le format est un type MIME (`audio/mpeg`, `audio/dsd`,
 * `audio/mp4`). Le filtre Format de la Bibliothèque avait les mêmes doublons.
 */
import { describe, expect, it } from 'vitest';
import { formatCanonique, formatsBrutsDe } from '../typeDeFichier';
import { filtreDe, lireRepartitions } from '../repartitionsBibliotheque';
import { comptesFormat, correspond, type FiltresBibliotheque, type Outils } from '../facettesBibliotheque';
import type { Album } from '../types';

describe('formatCanonique — le codec, pas le conteneur', () => {
  it('MPEG → MP3, DSF/DFF/DSD → DSD, MP4/M4A → ALAC (avec profondeur) ou M4A (codec non lu)', () => {
    expect(formatCanonique('mpeg')).toBe('MP3');
    expect(formatCanonique('audio/mpeg')).toBe('MP3');
    expect(formatCanonique('MP3')).toBe('MP3');
    expect(formatCanonique('dsf')).toBe('DSD');
    expect(formatCanonique('dff')).toBe('DSD');
    expect(formatCanonique('audio/x-dsd')).toBe('DSD');
    expect(formatCanonique('mp4', 24)).toBe('ALAC');
    expect(formatCanonique('m4a', 16)).toBe('ALAC');
    // #5710 — le serveur écrit `m4a` quand il n'a pas lu le codec : jamais AAC.
    expect(formatCanonique('mp4', 0)).toBe('M4A');
    expect(formatCanonique('mp4')).toBe('M4A');
    expect(formatCanonique('m4a')).toBe('M4A');
    expect(formatCanonique('alac', 24)).toBe('ALAC');
    expect(formatCanonique('aac')).toBe('AAC');
    expect(formatCanonique('flac')).toBe('FLAC');
    expect(formatCanonique('')).toBeNull();
    expect(formatCanonique(null)).toBeNull();
  });
});

describe('🔴 Statistiques › Formats : une entrée par codec', () => {
  // Les valeurs exactes du .18 (GET /library/stats, 14/11), serveur d'avant.
  const STATS_18 = {
    distributions: {
      by_codec: [
        { value: 'flac', tracks: 82404 }, { value: 'aac', tracks: 11492 }, { value: 'dsf', tracks: 740 },
        { value: 'wav', tracks: 680 }, { value: 'dsd', tracks: 636 }, { value: 'mpeg', tracks: 146 },
        { value: 'mp3', tracks: 143 }, { value: 'mp4', tracks: 111 }, { value: 'alac', tracks: 72 },
        { value: null, tracks: 3 },
      ],
      by_sample_rate: [], by_decade: [], by_credit_role: [],
    },
  };

  it('MPEG et MP3 fusionnés, DSF et DSD fusionnés, l’inconnu toujours en dernier', () => {
    const r = lireRepartitions(STATS_18)!;
    expect(r.by_codec).toEqual([
      { value: 'flac', tracks: 82404 }, { value: 'aac', tracks: 11492 }, { value: 'dsd', tracks: 1376 },
      { value: 'wav', tracks: 680 }, { value: 'mp3', tracks: 289 },
      // Sans profondeur (serveur qui ne range pas encore) : MP4 → M4A.
      { value: 'm4a', tracks: 111 }, { value: 'alac', tracks: 72 },
      { value: null, tracks: 3 },
    ]);
  });

  it('la barre filtre sur le codec : « mpeg » ouvre « MP3 », « dsf » ouvre « DSD »', () => {
    expect(filtreDe('by_codec', 'mpeg')).toEqual({ format: 'MP3' });
    expect(filtreDe('by_codec', 'dsf')).toEqual({ format: 'DSD' });
    expect(filtreDe('by_codec', 'flac')).toEqual({ format: 'FLAC' });
    expect(filtreDe('by_codec', 'mp4')).toEqual({ format: 'M4A' });
    expect(filtreDe('by_codec', 'm4a')).toEqual({ format: 'M4A' });
  });
});

describe('🔴 Bibliothèque › filtre Format : mêmes codecs que les Statistiques', () => {
  const alb = (o: Partial<Album>): Album => ({ id: 1, title: 't', ...o }) as Album;
  const BIBLIO: Album[] = [
    alb({ id: 1, format: 'MP3' }), alb({ id: 2, format: 'MPEG' }),
    alb({ id: 3, format: 'DSF', bit_depth: 1 }), alb({ id: 4, format: 'DSD', bit_depth: 1 }),
    alb({ id: 5, format: 'MP4', bit_depth: 24 }), alb({ id: 6, format: 'ALAC', bit_depth: 24 }),
    alb({ id: 7, format: 'AAC' }), alb({ id: 8, format: 'M4A' }),
  ];
  const OUTILS: Outils = {
    qualiteDe: () => true, anneeDe: () => null, plier: (s) => (s ?? '').toLowerCase(), provenanceDe: () => 'local',
  };
  const AUCUN: FiltresBibliotheque = {
    qualite: [], frequence: [], annee: null, format: [], profondeur: [], recherche: '', compilation: null, provenance: null,
  };

  it('le menu Format ne propose plus MPEG, DSF ni MP4', () => {
    expect(comptesFormat(BIBLIO, AUCUN, OUTILS)).toEqual([['ALAC', 2], ['DSD', 2], ['MP3', 2], ['AAC', 1], ['M4A', 1]]);
  });

  it('« MP3 » rend aussi les albums MPEG ; « DSD » les DSF', () => {
    const mp3 = BIBLIO.filter((a) => correspond(a, { ...AUCUN, format: ['MP3'] }, OUTILS)).map((a) => a.id);
    expect(mp3).toEqual([1, 2]);
    const dsd = BIBLIO.filter((a) => correspond(a, { ...AUCUN, format: ['DSD'] }, OUTILS)).map((a) => a.id);
    expect(dsd).toEqual([3, 4]);
  });

  it('🔴 un clic sur la barre MP4 retrouve ses albums (serveur qui n’envoie pas la profondeur)', () => {
    const f = filtreDe('by_codec', 'mp4')!;
    expect(f).toEqual({ format: 'M4A' });
    const ids = BIBLIO.filter((a) => correspond(a, { ...AUCUN, format: [(f as { format: string }).format] }, OUTILS)).map((a) => a.id);
    // L'album MP4 à 24 bits (ALAC) ET le M4A au codec non lu.
    expect(ids).toEqual([5, 8]);
  });

  it('serveur qui range : la barre « alac » retrouve l’album MP4 à profondeur et l’ALAC', () => {
    const f = filtreDe('by_codec', 'alac') as { format: string };
    const ids = BIBLIO.filter((a) => correspond(a, { ...AUCUN, format: [f.format] }, OUTILS)).map((a) => a.id);
    expect(ids).toEqual([5, 6]);
  });

  it('l’export du catalogue reçoit les formats BRUTS que la grille a comptés', () => {
    expect(formatsBrutsDe(BIBLIO, ['DSD', 'MP3'])).toEqual(['dsd', 'dsf', 'mp3', 'mpeg']);
    expect(formatsBrutsDe(BIBLIO, ['ALAC'])).toEqual(['alac', 'mp4']);
    expect(formatsBrutsDe(BIBLIO, ['WAV'])).toEqual(['wav']);
    expect(formatsBrutsDe(BIBLIO, [])).toEqual([]);
  });
});

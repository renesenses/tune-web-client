/**
 * #4805 lot 1 — enrichissement d'après MetaRust, de Xavier Joly : la phrase
 * des pistes manquantes, les instruments Wikidata dans les crédits, la clé
 * masquée. Fonctions pures : aucun réseau.
 */
import { describe, expect, it } from 'vitest';
import fr from '../locales/fr';
import en from '../locales/en';
import { phraseDesManquantes, cleMasquee, bpmAffiche, type PisteManquante } from '../enrichissementAlbum';
import { blocsDeCredits, libelleInstrumentWikidata, type CreditAvecPiste } from '../library/credits';

const tFr = (k: string) => (fr as Record<string, string>)[k] ?? k;
const tEn = (k: string) => (en as Record<string, string>)[k] ?? k;

describe('complétude d\'album', () => {
  const manquent: PisteManquante[] = [
    { disque: 2, position: 8, titre: 'Huit' },
    { disque: 2, position: 7, titre: 'Sept' },
  ];

  it('dit « il manque les pistes 7 et 8 (disque 2) »', () => {
    expect(phraseDesManquantes(manquent, true, tFr, 'fr')).toBe('Il manque les pistes 7 et 8 (disque 2)');
    expect(phraseDesManquantes(manquent, true, tEn, 'en')).toBe('Tracks 7 and 8 (disc 2) are missing');
  });

  it('ne nomme pas le disque d\'un album à un seul disque', () => {
    expect(phraseDesManquantes([{ disque: 1, position: 3, titre: 'Trois' }], false, tFr, 'fr'))
      .toBe('Il manque la piste 3');
  });

  it('sépare les disques et garde le numéro imprimé d\'un vinyle', () => {
    const p = phraseDesManquantes(
      [{ disque: 1, position: 3, numero: 'A3', titre: 'x' }, { disque: 2, position: 1, titre: 'y' }],
      true, tFr, 'fr',
    );
    expect(p).toBe('Il manque les pistes A3 (disque 1) ; 1 (disque 2)');
  });

  it('ne dit rien quand rien ne manque', () => {
    expect(phraseDesManquantes([], true, tFr, 'fr')).toBe('');
  });
});

describe('instruments Wikidata dans les crédits', () => {
  const credits: CreditAvecPiste[] = [
    {
      id: 1, track_id: 10, artist_id: null, artist_name: 'Miles Davis', role: 'performer', instrument: null, position: 0,
      track_number: 1, disc_number: 1,
      instruments_wikidata: [{ qid: 'Q8338', fr: 'trompette', en: 'trumpet' }],
    },
    {
      id: 2, track_id: 11, artist_id: null, artist_name: 'Miles Davis', role: 'performer', instrument: null, position: 0,
      track_number: 2, disc_number: 1,
      instruments_wikidata: [{ qid: 'Q8338', fr: 'trompette', en: 'trumpet' }, { qid: 'Q382616', fr: 'bugle', en: 'flugelhorn' }],
    },
  ];

  it('les rattache à l\'artiste, sans doublon, sans toucher à l\'instrument MusicBrainz', () => {
    const blocs = blocsDeCredits(credits);
    const ligne = blocs[0].lignes[0];
    expect(ligne.instrument).toBeNull();
    expect(ligne.artistes).toHaveLength(1);
    expect(ligne.artistes[0].instrumentsWikidata?.map((i) => i.qid)).toEqual(['Q8338', 'Q382616']);
  });

  it('choisit la langue de l\'interface', () => {
    const i = { qid: 'Q8338', fr: 'trompette', en: 'trumpet' };
    expect(libelleInstrumentWikidata(i, 'fr')).toBe('trompette');
    expect(libelleInstrumentWikidata(i, 'de')).toBe('trumpet');
    expect(libelleInstrumentWikidata({ qid: 'Q1' }, 'fr')).toBe('Q1');
  });
});

describe('clés d\'API et BPM', () => {
  it('ne montre que les quatre derniers caractères', () => {
    expect(cleMasquee({ service: 'discogs', personnelle: true, fin: '6978', illisible: false, integree: false, utilisee: 'personnelle' }))
      .toBe('•••• 6978');
    expect(cleMasquee({ service: 'discogs', personnelle: true, fin: '', illisible: false, integree: false, utilisee: 'personnelle' }))
      .toBe('••••');
  });

  it('arrondit le BPM et tait l\'absence', () => {
    expect(bpmAffiche({ track_id: 1, bpm: 119.6, source: 'signal' })).toBe('120');
    expect(bpmAffiche({ track_id: 1, bpm: null, source: null })).toBe('');
    expect(bpmAffiche(undefined)).toBe('');
  });
});

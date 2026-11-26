/**
 * rc14 — harmonisation de l'écran Concerts (maquette `concerts.html`,
 * 26/11/2026). Les calculs de la nouvelle présentation, mesurés sur des
 * données : regroupement par mois, bloc date, casse des salles, initiales,
 * rapprochement avec les images d'artiste, filtre de la liste des pays.
 */
import { describe, it, expect } from 'vitest';
import type { Concert } from '../api';
import { grouperConcerts } from '../concertsTri';
import {
  blocDate, casseDeTitre, cleArtiste, filtrerPays, grouperParMois, indexImagesArtistes, initiales, teinteDe,
} from '../concertsAffichage';

const c = (artist_name: string, event_date: string, extra: Partial<Concert> = {}): Concert =>
  ({ artist_name, event_date, ...extra });

describe('grouperParMois — les blocs « Par date »', () => {
  const liste = [
    c('Calogero', '2026-12-09'), c('Calogero', '2026-12-11'), c('Bernard Lavilliers', '2027-02-18'),
    c('Keziah Jones', '2027-04-10'), c('Sting', '2027-07-16'), c('Jean-Louis Aubert', '2027-07-17'),
  ];

  it('un bloc par mois, dans l’ordre reçu, libellé dans la langue de l’écran', () => {
    const mois = grouperParMois(liste, liste.map((_, i) => `k${i}`), 'en');
    expect(mois.map((m) => m.cle)).toEqual(['2026-12', '2027-02', '2027-04', '2027-07']);
    expect(mois.map((m) => m.libelle)).toEqual(['December 2026', 'February 2027', 'April 2027', 'July 2027']);
    expect(mois.map((m) => m.concerts.length)).toEqual([2, 1, 1, 2]);
    expect(mois[3].cles).toEqual(['k4', 'k5']);
  });

  it('le libellé prend une capitale initiale en français', () => {
    expect(grouperParMois([c('A', '2026-12-09')], ['k'], 'fr')[0].libelle).toBe('Décembre 2026');
  });

  it('ne trie pas : il découpe la liste déjà triée par `grouperConcerts`', () => {
    const triee = grouperConcerts([c('B', '2027-01-05'), c('A', '2026-10-04'), c('C', '2026-10-20')], 'date');
    const mois = grouperParMois(triee.flatMap((g) => g.concerts), triee.flatMap((g) => g.cles), 'en');
    expect(mois.map((m) => m.concerts.map((x) => x.artist_name))).toEqual([['A', 'C'], ['B']]);
  });

  it('une date illisible forme un DERNIER bloc, sans libellé : la ligne reste visible', () => {
    const mois = grouperParMois([c('X', 'bientôt'), c('A', '2026-12-09')], ['k0', 'k1'], 'en');
    expect(mois.map((m) => m.cle)).toEqual(['2026-12', 'autre']);
    expect(mois[1].libelle).toBe('');
    expect(mois[1].concerts[0].artist_name).toBe('X');
  });

  it('liste vide : aucun bloc', () => {
    expect(grouperParMois([], [], 'en')).toEqual([]);
  });
});

describe('blocDate — le bloc date de la carte', () => {
  it('jour sur deux chiffres, mois abrégé en capitales, jour de la semaine', () => {
    expect(blocDate('2026-12-09', 'en')).toEqual({ jour: '09', mois: 'DEC', semaine: 'Wed' });
  });
  it('sans point d’abréviation en français', () => {
    const b = blocDate('2026-12-09', 'fr')!;
    expect(b.jour).toBe('09');
    expect(b.mois).toBe('DÉC');
    expect(b.semaine).toBe('Mer');
  });
  it('null pour une date qui n’est pas `YYYY-MM-DD`', () => {
    expect(blocDate('09/12/2026', 'en')).toBeNull();
    expect(blocDate(undefined, 'en')).toBeNull();
  });
  it('ne glisse pas d’un jour selon le fuseau (date locale à minuit)', () => {
    expect(blocDate('2027-01-01', 'en')!.jour).toBe('01');
  });
});

describe('casseDeTitre — les salles en capitales', () => {
  it.each([
    ['ZENITH DE DIJON', 'Zenith de Dijon'],
    ['JURAPARC', 'Juraparc'],
    ['LA SALINE ROYALE - ARC ET SENANS', 'La Saline Royale - Arc et Senans'],
    ['STADE DE BRAM', 'Stade de Bram'],
    ['ARC-ET-SENANS', 'Arc-et-Senans'],
    ["L'OLYMPIA", "L'Olympia"],
    ['THEATRE D\'ARRAS', "Theatre d'Arras"],
    ['ÉGLISE SAINT-EUSTACHE', 'Église Saint-Eustache'],
  ])('%s → %s', (brut, attendu) => {
    expect(casseDeTitre(brut, 'fr')).toBe(attendu);
  });

  it('un nom qui porte déjà des minuscules est laissé tel quel', () => {
    expect(casseDeTitre('Parc des Expositions')).toBe('Parc des Expositions');
    expect(casseDeTitre('AccorHotels Arena')).toBe('AccorHotels Arena');
    expect(casseDeTitre('Chalon Sur Saone')).toBe('Chalon Sur Saone');
  });

  it('vide, nul ou sans lettre : rendu tel quel', () => {
    expect(casseDeTitre(null)).toBe('');
    expect(casseDeTitre('  ')).toBe('');
    expect(casseDeTitre('104')).toBe('104');
  });
});

describe('initiales et teinte — la vignette sans photo', () => {
  it.each([
    ['Calogero', 'CA'], ['Sting', 'ST'], ['Jean-Louis Aubert', 'JA'], ['Bernard Lavilliers', 'BL'],
    ['The Rolling Stones', 'TS'], ['  ', ''], ['!!!', ''],
  ])('%s → %s', (nom, attendu) => {
    expect(initiales(nom)).toBe(attendu);
  });

  it('une teinte stable par artiste, dans [0, 5)', () => {
    expect(teinteDe('Calogero')).toBe(teinteDe('Calogero'));
    for (const n of ['A', 'Calogero', 'Sting', '']) {
      expect(teinteDe(n)).toBeGreaterThanOrEqual(0);
      expect(teinteDe(n)).toBeLessThan(5);
    }
  });
});

describe('images d’artiste — rapprochement par nom', () => {
  it('sans casse ni accents ni espaces superflus', () => {
    expect(cleArtiste('  Bernard  LAVILLIERS ')).toBe('bernard lavilliers');
    expect(cleArtiste('Björk')).toBe(cleArtiste('bjork'));
  });

  it('seuls les artistes AVEC image entrent ; le premier homonyme imagé gagne', () => {
    const index = indexImagesArtistes([
      { name: 'Sting', image_path: null },
      { name: 'Calogero', image_path: '/a/calogero.jpg' },
      { name: 'sting', image_path: '/a/sting.jpg' },
      { name: 'Sting', image_path: '/a/autre.jpg' },
      { name: '', image_path: '/a/sans-nom.jpg' },
    ]);
    expect(index.get(cleArtiste('Calogero'))).toBe('/a/calogero.jpg');
    expect(index.get(cleArtiste('STING'))).toBe('/a/sting.jpg');
    expect(index.size).toBe(2);
    expect(indexImagesArtistes(null).size).toBe(0);
  });
});

describe('filtrerPays — la recherche de la liste des pays', () => {
  const options = [
    { code: 'DE', nom: 'Allemagne' }, { code: 'BE', nom: 'Belgique' },
    { code: 'FR', nom: 'France' }, { code: 'CH', nom: 'Suisse' }, { code: 'GB', nom: 'Royaume-Uni' },
  ];
  it('requête vide : toute la liste, dans l’ordre', () => {
    expect(filtrerPays(options, '  ').map((o) => o.code)).toEqual(['DE', 'BE', 'FR', 'CH', 'GB']);
  });
  it('sur le nom, sans casse ni accents', () => {
    expect(filtrerPays(options, 'ALLEM').map((o) => o.code)).toEqual(['DE']);
    expect(filtrerPays(options, 'royaume').map((o) => o.code)).toEqual(['GB']);
    expect(filtrerPays([{ code: 'FR', nom: 'Frànce' }], 'france').map((o) => o.code)).toEqual(['FR']);
  });
  it('ou sur le code ISO exact', () => {
    expect(filtrerPays(options, 'ch').map((o) => o.code)).toEqual(['CH']);
  });
  it('rien ne correspond : liste vide', () => {
    expect(filtrerPays(options, 'zzz')).toEqual([]);
  });
});

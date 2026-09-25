import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FILE_ALEATOIRE_DEFAUT,
  FILE_ALEATOIRE_MIN_REPLI,
  FILE_ALEATOIRE_MAX_REPLI,
  bornesFileAleatoire,
  bornerFileAleatoire,
  lireFileAleatoire,
  versPatchFileAleatoire,
} from '../fileAleatoire';
import * as LOCALES from './lesOnzeLangues';

/**
 * tune-server-rust#2901 — « Limite à 500 de la file d'attente en paramètre »
 * (Bertrand, 23/09/2026).
 *
 * Le serveur bornait déjà le tirage aléatoire (`shuffle_max_tracks`, défaut
 * 500, plancher 1, plafond 5 000) et publiait ses bornes ; aucun écran ne les
 * montrait. Cette garde tient les trois points qui pouvaient dériver : les
 * bornes viennent du SERVEUR, rien ne part hors bornes, et la phrase existe
 * dans les onze langues.
 */
describe('#2901 — la limite de la file aléatoire se règle depuis l’écran Réglages', () => {
  it('prend les bornes du serveur, sinon le repli', () => {
    expect(bornesFileAleatoire({ shuffle_max_tracks_min: 1, shuffle_max_tracks_max: 5000 }))
      .toEqual({ min: 1, max: 5000 });
    // Un serveur qui élargit sa plage : l'écran suit, sans retouche ici.
    expect(bornesFileAleatoire({ shuffle_max_tracks_min: 10, shuffle_max_tracks_max: 50_000 }))
      .toEqual({ min: 10, max: 50_000 });
    // `settings` ne stocke que des chaînes : une clé republiée brute reste lisible.
    expect(bornesFileAleatoire({ shuffle_max_tracks_min: '2', shuffle_max_tracks_max: '900' }))
      .toEqual({ min: 2, max: 900 });
    const repli = { min: FILE_ALEATOIRE_MIN_REPLI, max: FILE_ALEATOIRE_MAX_REPLI };
    // Serveur antérieur à #2901 : il publie la valeur, pas ses bornes.
    expect(bornesFileAleatoire({ shuffle_max_tracks: 500 })).toEqual(repli);
    expect(bornesFileAleatoire(null)).toEqual(repli);
    // Un couple inversé ou absurde ne décrit aucun intervalle.
    expect(bornesFileAleatoire({ shuffle_max_tracks_min: 900, shuffle_max_tracks_max: 10 }))
      .toEqual(repli);
    expect(bornesFileAleatoire({ shuffle_max_tracks_min: 0, shuffle_max_tracks_max: 'oui' }))
      .toEqual(repli);
  });

  it('lit la valeur courante, et retombe sur 500 quand le serveur se tait', () => {
    const bornes = { min: 1, max: 5000 };
    expect(lireFileAleatoire({ shuffle_max_tracks: 1200 }, bornes)).toBe(1200);
    expect(lireFileAleatoire({}, bornes)).toBe(FILE_ALEATOIRE_DEFAUT);
    expect(FILE_ALEATOIRE_DEFAUT).toBe(500);
  });

  it('🔴 rien ne part hors bornes, ni à vide', () => {
    const bornes = { min: 1, max: 5000 };
    expect(bornerFileAleatoire(9999, bornes)).toBe(5000);
    expect(bornerFileAleatoire(0, bornes)).toBe(1);
    expect(bornerFileAleatoire(-40, bornes)).toBe(1);
    // Le champ qu'on vient d'effacer ne doit pas partir en « 0 piste ».
    expect(bornerFileAleatoire('', bornes)).toBe(FILE_ALEATOIRE_DEFAUT);
    expect(bornerFileAleatoire(null, bornes)).toBe(FILE_ALEATOIRE_DEFAUT);
    expect(bornerFileAleatoire('abc', bornes)).toBe(FILE_ALEATOIRE_DEFAUT);
    // La charge utile porte UNE clé, bornée : les bornes sont en lecture seule.
    expect(versPatchFileAleatoire('7000', bornes)).toEqual({ shuffle_max_tracks: 5000 });
    expect(versPatchFileAleatoire('  250  ', { min: 10, max: 200 }))
      .toEqual({ shuffle_max_tracks: 200 });
  });

  const ECRAN = readFileSync(
    resolve(__dirname, '../../components/v2/SettingsV2.svelte'),
    'utf-8',
  );

  /** Le bloc de la section « Lecture » SEUL.
   *
   *  🔴 Les deux bornes sont exigées `> -1` AVANT toute comparaison : un
   *  `indexOf` qui ne trouve rien rend -1, et « A avant B » serait alors vrai
   *  pour un écran où la section n'existe plus. */
  function sectionLecture(): string {
    const debut = ECRAN.indexOf("s.id === 'playback'");
    expect(debut, 'section Lecture introuvable').toBeGreaterThan(-1);
    const fin = ECRAN.indexOf("s.id === 'voice'", debut);
    expect(fin, 'fin de la section Lecture introuvable').toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(debut);
    return ECRAN.slice(debut, fin);
  }

  it('l’écran Réglages porte le champ, dans la section Lecture', () => {
    expect(ECRAN).toContain('bornesFileAleatoire(');
    expect(ECRAN).toContain('versPatchFileAleatoire(');
    // Le champ est bien DANS la section « Lecture », pas ailleurs dans l'écran.
    expect(sectionLecture()).toContain('settings.shuffleMaxTracks');
  });

  it('🔴 les bornes du champ viennent du serveur, jamais d’une constante recopiée', () => {
    const bloc = sectionLecture();
    expect(bloc).toMatch(/min=\{fileAleatoireBornes\.min\}/);
    expect(bloc).toMatch(/max=\{fileAleatoireBornes\.max\}/);
    expect(bloc, 'borne recopiée en dur').not.toMatch(/min="1"|max="5000"|max="5 ?000"/);
  });

  it('les phrases du réglage existent dans les 11 langues', () => {
    const langues = Object.entries(LOCALES).filter(
      ([, v]) => v && typeof v === 'object' && 'settings.searchExact' in (v as object),
    );
    expect(langues.length).toBeGreaterThanOrEqual(11);
    for (const [code, table] of langues) {
      const tr = table as Record<string, string>;
      expect(tr['settings.shuffleMaxTracks'], code).toBeTruthy();
      expect(tr['settings.shuffleMaxTracksHint'], code).toBeTruthy();
      // La plage se compose des bornes du serveur : les deux jetons sont requis.
      expect(tr['settings.shuffleMaxTracksRange'], code).toContain('{min}');
      expect(tr['settings.shuffleMaxTracksRange'], code).toContain('{max}');
    }
  });
});

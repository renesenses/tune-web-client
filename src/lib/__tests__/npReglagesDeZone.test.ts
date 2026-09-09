import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { conditionsA } from './pileDeBlocs';

/**
 * Sleep, DSP et Réveil sont des réglages de ZONE — #534.
 *
 * Même défaut que celui corrigé pour l'égaliseur par la PR #531, sur trois
 * autres boutons de la même barre. Ils vivaient dans
 * `{#if !isRadio && normalizedTrack?.id != null}`, le bloc qui garde les
 * crédits, les paroles et le partage. Or leurs gestionnaires ne prennent que
 * la zone — vérifié ci-dessous en lisant leur corps :
 *
 *   handleSleepTimer  -> api.setSleepTimer(zone.id, minutes)
 *   enregistrerCrossfeed / chargerCrossfeed -> api.setDsp / api.getDsp(zone.id)
 *   handleSetAlarm / handleCancelAlarm -> api.setAlarm / api.cancelAlarm(zone.id)
 *
 * Aucun ne lit `displayTrack`. Sur une radio — et sur toute piste absente de
 * la bibliothèque — ces trois réglages étaient donc introuvables depuis
 * « En écoute », en privant l'auditeur de radio des deux qui ont le plus de
 * sens pour lui : s'endormir dessus, et se réveiller dessus.
 *
 * Reste en environnement `node` : le test ne lit que du texte.
 */

const SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/NowPlaying.svelte'),
  'utf-8',
);

/**
 * Ce qu'on interdit : l'IDENTIFIANT de la piste et le fait que ce soit une
 * radio. Le garde extérieur `{#if zone && displayTrack}` (l'écran entier est
 * vide quand rien ne joue) reste légitime : il n'exige pas une piste
 * identifiée, seulement une lecture en cours.
 */
const GARDE_DE_PISTE = /displayTrack\s*\??\.\s*id|\btrack\s*\??\.\s*id\b|isRadio/;

/** Indice unique d'un repère dans la source, ou échec explicite. */
function indiceUnique(repere: string): number {
  const premier = SOURCE.indexOf(repere);
  expect(premier, `repère introuvable : ${repere}`).toBeGreaterThan(-1);
  expect(SOURCE.indexOf(repere, premier + 1), `repère ambigu : ${repere}`).toBe(-1);
  return premier;
}

/** Le corps d'une `async function <nom>` du bloc script. */
function corpsDeFonction(nom: string): string {
  const debut = SOURCE.indexOf(`async function ${nom}`);
  expect(debut, `fonction introuvable : ${nom}`).toBeGreaterThan(-1);
  const fin = SOURCE.indexOf('\n  }', debut);
  expect(fin, `fin de ${nom} introuvable`).toBeGreaterThan(debut);
  return SOURCE.slice(debut, fin);
}

const REPERES: Record<string, string> = {
  Sleep: 'class="np-sleep-wrapper"',
  DSP: 'class:active={cfEnabled}',
  'Réveil': 'class:active={alarmActive || showAlarm}',
};

describe('les trois réglages de zone de l’écran « En écoute »', () => {
  for (const [nom, repere] of Object.entries(REPERES)) {
    it(`« ${nom} » n’est enfermé dans aucune condition portant sur la piste`, () => {
      const conditions = conditionsA(SOURCE, indiceUnique(repere));
      for (const c of conditions) {
        expect(c, `« ${nom} » est de nouveau conditionné par « ${c} »`).not.toMatch(
          GARDE_DE_PISTE,
        );
      }
    });
  }

  /**
   * Le bouton Réveil n'ouvrirait rien si son panneau restait gardé par la
   * piste : on aurait déplacé le silence au lieu de le supprimer.
   */
  it('le panneau du réveil ne dépend plus que de `showAlarm`', () => {
    const conditions = conditionsA(SOURCE, indiceUnique('class="np-alarm-panel"'));
    for (const c of conditions) {
      expect(c, `le panneau du réveil est de nouveau conditionné par « ${c} »`).not.toMatch(
        GARDE_DE_PISTE,
      );
    }
    // Il faut bien qu'une condition le garde, sinon l'assertion ci-dessus
    // passerait sur un panneau toujours affiché.
    expect(conditions.join(' ')).toContain('showAlarm');
  });

  it('le panneau du crossfeed non plus', () => {
    const conditions = conditionsA(SOURCE, indiceUnique('class="np-crossfeed"'));
    for (const c of conditions) {
      expect(c, `le panneau crossfeed est de nouveau conditionné par « ${c} »`).not.toMatch(
        GARDE_DE_PISTE,
      );
    }
    expect(conditions.join(' ')).toContain('showDspMenu');
  });
});

describe('ces trois réglages s’écrivent par la ZONE, jamais par la piste', () => {
  const ECRITURES: Record<string, RegExp> = {
    handleSleepTimer: /api\.setSleepTimer\(zone\.id/,
    handleSetAlarm: /api\.setAlarm\(zone\.id/,
    handleCancelAlarm: /api\.cancelAlarm\(zone\.id/,
    enregistrerCrossfeed: /api\.setDsp\(zone\.id/,
    chargerCrossfeed: /api\.getDsp\(zone\.id/,
  };

  for (const [nom, appel] of Object.entries(ECRITURES)) {
    it(`${nom} ne prend que la zone`, () => {
      const corps = corpsDeFonction(nom);
      expect(corps).toMatch(appel);
      expect(corps, `${nom} lit la piste`).not.toContain('displayTrack');
      expect(corps, `${nom} lit la piste`).not.toContain('normalizedTrack');
    });
  }
});

/**
 * Sans cette contre-épreuve, un analyseur cassé qui rendrait toujours une pile
 * vide laisserait tout ce qui précède au vert en n'ayant rien examiné. Les
 * crédits et le partage, eux, ont besoin d'un identifiant de piste : leurs
 * boutons DOIVENT rester gardés.
 */
describe('l’analyseur voit encore les gardes légitimes', () => {
  it('les crédits restent conditionnés par l’identifiant de la piste', () => {
    const conditions = conditionsA(SOURCE, indiceUnique('class:active={showCredits}'));
    expect(conditions.join(' && ')).toContain('normalizedTrack?.id != null');
  });

  it('le partage aussi', () => {
    const conditions = conditionsA(SOURCE, indiceUnique('onclick={handleShare}'));
    expect(conditions.join(' && ')).toMatch(GARDE_DE_PISTE);
  });
});

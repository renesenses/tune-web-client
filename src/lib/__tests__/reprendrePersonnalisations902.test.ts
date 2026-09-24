/**
 * #902 — « Reprendre ses personnalisations sur une nouvelle machine : rien ne
 * le propose ».
 *
 * Le mécanisme EXISTE depuis longtemps (`api.importConfig`), mais il n'était
 * atteignable que depuis Réglages › Système, c'est-à-dire là où l'on ne va
 * pas quand on vient de monter une machine neuve. L'assistant de première
 * installation, lui, n'en soufflait mot : quatre étapes, aucune ne demandait
 * « vous venez d'ailleurs ? ».
 *
 * ## Où l'offre doit être, et pourquoi
 *
 * À l'ACCUEIL de l'assistant, avant l'étape des dossiers. Une restauration
 * apporte des dossiers de musique et des réglages audio ; la proposer APRÈS
 * que l'utilisateur a ajouté ses dossiers à la main, ce serait écraser ce
 * qu'il vient de faire.
 *
 * ## Ce que cette garde tient
 *
 * 1. L'offre existe dans l'assistant, et elle est à l'accueil.
 * 2. Le fichier choisi n'est pas appliqué dans la foulée : la restauration
 *    écrase, et rien ne la défait — un second geste la confirme.
 * 3. La limite est DITE. ⚠️ La liste de familles a été CORRIGÉE : elle
 *    nommait les profils d'égaliseur, qui suivent en réalité (clé de réglage
 *    `eq_presets`), et taisait les zones et le jeton Discogs, qui ne suivent
 *    pas. Cette garde figeait donc une phrase fausse — le détail du relevé et
 *    la garde multilingue vivent dans `repriseConfigVerite902.test.ts`.
 *    Livrer une reprise partielle en laissant croire le contraire serait pire
 *    que ne rien proposer.
 * 4. Les textes existent dans les onze dictionnaires.
 *
 * ## Ce qu'elle ne tient PAS
 *
 * Que le serveur restaure vraiment : `importConfig` est servie ailleurs, ce
 * lot ne fait que l'atteindre depuis l'endroit où elle manquait.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu'];
const CLES = [
  'onboarding.restoreTitle',
  'onboarding.restoreDesc',
  'onboarding.restoreLimits',
  'onboarding.restoreChoose',
];

/** L'assistant PRIVÉ DE SES COMMENTAIRES : une garde qui parle du code lit le code. */
function assistant(): string {
  return lire('src/components/partages/OnboardingWizard.svelte')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
}

describe('#902 — l’assistant propose de reprendre une installation', () => {
  it('l’offre existe', () => {
    expect(assistant()).toContain('api.importConfig');
  });

  it('elle est à l’accueil, AVANT l’étape des dossiers', () => {
    const src = assistant();
    const offre = src.indexOf('onboarding.restoreTitle');
    const dossiers = src.indexOf('{:else if step === 2}');
    // 🔴 Les deux bornes d'abord : `-1 < n` est vrai, donc un « A avant B »
    // comparé à l'aveugle passerait si A était ABSENT.
    expect(offre, 'l’offre de reprise a disparu de l’assistant').toBeGreaterThan(-1);
    expect(dossiers, 'l’étape des dossiers a disparu').toBeGreaterThan(-1);
    expect(offre).toBeLessThan(dossiers);
  });

  it('le fichier choisi n’est pas appliqué dans la foulée', () => {
    const src = assistant();
    const choix = src.indexOf('function rstChoisi');
    const confirme = src.indexOf('function rstConfirmer');
    expect(choix, 'le choix de fichier a disparu').toBeGreaterThan(-1);
    expect(confirme, 'la confirmation a disparu : la restauration écrase sans retour').toBeGreaterThan(-1);
    const corpsDuChoix = src.slice(choix, confirme);
    expect(
      corpsDuChoix.includes('api.importConfig'),
      'choisir un fichier ne doit pas le RESTAURER : la restauration écrase dossiers et réglages audio.'
    ).toBe(false);
  });

  it('elle dit ce qu’elle NE reprend PAS', () => {
    expect(assistant()).toContain('onboarding.restoreLimits');
  });

  it('les quatre textes existent dans les onze dictionnaires', () => {
    for (const langue of LANGUES) {
      const dictionnaire = lire(`src/lib/locales/${langue}.ts`);
      for (const cle of CLES) {
        // Les dictionnaires mêlent guillemets simples et doubles : la garde
        // porte sur la CLÉ, pas sur le style de citation.
        const present =
          dictionnaire.includes(`"${cle}"`) || dictionnaire.includes(`'${cle}'`);
        expect(present, `${cle} manque dans ${langue}.ts`).toBe(true);
      }
    }
  });

  it('la phrase des limites nomme les familles non reprises', () => {
    // ⚠️ `galiseur` a été RETIRÉ de cette liste : les préréglages
    // d'égaliseur sont rangés sous la clé de réglage `eq_presets`, donc le
    // dump plat de `settings` les emporte. Les zones et le jeton Discogs, eux,
    // n'en sortent pas — voir `repriseConfigVerite902.test.ts`, qui tient la
    // règle dans les onze langues.
    const fr = lire('src/lib/locales/fr.ts');
    const ligne =
      fr.split('\n').find((l) => /['"]onboarding\.restoreLimits['"]/.test(l)) ?? '';
    expect(ligne, 'la phrase des limites a disparu du dictionnaire français').not.toBe('');
    for (const mot of ['zone', 'Discogs', 'streaming', 'radio']) {
      expect(ligne.toLowerCase()).toContain(mot.toLowerCase());
    }
  });
});

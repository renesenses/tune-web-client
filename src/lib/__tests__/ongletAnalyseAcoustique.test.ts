import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { V2_SETTINGS, tabLabel } from '../v2Settings';
import * as LOCALES from '../locales';

/**
 * #2104 — l'onglet de l'analyse acoustique porte le nom de sa FONCTION.
 *
 * Bilou (forum 1368, 11/08) corrigeait les notes de version : le réglage de
 * débit de l'analyse acoustique n'était pas là où le texte l'envoyait. Le bloc
 * a depuis encore déménagé, et l'onglet qui l'accueille s'appelait « CLAP » —
 * le nom du modèle d'apprentissage. Rien dans « CLAP » ne dit « analyse
 * acoustique » à quelqu'un qui cherche l'écran ; l'onglet avait justement été
 * créé parce que le bloc était introuvable, et il l'est resté.
 *
 * Arbitrage de Bertrand du 01/09/2026 : renommer l'onglet.
 *
 * Ce garde tient les trois maillons de la chaîne, parce qu'il suffit que l'un
 * lâche pour que le message renvoie à nouveau dans le vide :
 *   1. les onze locales nomment l'onglet par sa fonction ;
 *   2. le registre des Réglages v2 TRADUIT ce libellé au lieu de l'écrire en
 *      dur — sans quoi l'onglet v2 dirait « CLAP » pendant que l'onglet v1
 *      dirait « Analyse acoustique » ;
 *   3. le texte d'aide d'Ambiance interpole ce libellé-là, et le réglage de
 *      débit vit bien DANS cet onglet — c'est le maillon que #640 avait posé
 *      et que rien ne surveillait.
 */

/** Les onze locales livrées, telles que `locales/index.ts` les exporte. */
const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'hu', 'ja', 'ko', 'ro', 'sv', 'zh'] as const;
const dict = (l: string) => (LOCALES as Record<string, Record<string, string>>)[l];

const settingsView = readFileSync(
  resolve(__dirname, '../../components/SettingsView.svelte'),
  'utf-8',
);
const ambianceView = readFileSync(
  resolve(__dirname, '../../components/AmbianceView.svelte'),
  'utf-8',
);

describe('#2104 — l’onglet acoustique se nomme par sa fonction', () => {
  it('les onze locales ne servent plus le nom du modèle', () => {
    const fautives: string[] = [];
    for (const l of LANGUES) {
      const v = dict(l)?.['settings.tabClap'];
      if (typeof v !== 'string' || v.length === 0) {
        fautives.push(`${l} : clé absente`);
        continue;
      }
      // « CLAP » seul est le nom du modèle. Il reste légitime entre
      // parenthèses ailleurs (`v2.health.cardClapSub`), pas comme libellé.
      if (v.trim().toUpperCase() === 'CLAP') fautives.push(`${l} : « ${v} »`);
    }
    expect(
      fautives,
      'l’onglet reprend le nom du modèle au lieu de sa fonction :\n  ' + fautives.join('\n  '),
    ).toEqual([]);
  });

  it('le français porte le libellé arbitré', () => {
    expect(dict('fr')['settings.tabClap']).toBe('Analyse acoustique');
  });

  it('le registre v2 traduit l’onglet au lieu de l’écrire en dur', () => {
    const clap = V2_SETTINGS.find((t) => t.id === 'clap');
    expect(clap, 'l’onglet « clap » a disparu du registre v2').toBeTruthy();
    expect(clap!.labelKey).toBe('settings.tabClap');
    expect(clap!.label, 'un libellé littéral rendrait l’onglet v2 intraduisible').toBeUndefined();
    expect(tabLabel(clap!, (k) => dict('fr')[k] ?? k)).toBe('Analyse acoustique');
    expect(tabLabel(clap!, (k) => dict('en')[k] ?? k)).toBe('Acoustic analysis');
  });
});

describe('#2104 — le texte d’aide désigne l’écran où le bloc vit', () => {
  it('les onze locales interpolent le nom de l’onglet, sans le figer', () => {
    const fautives: string[] = [];
    for (const l of LANGUES) {
      const v = dict(l)?.['ambiance.analysisNotReady'];
      if (typeof v !== 'string') {
        fautives.push(`${l} : clé absente`);
        continue;
      }
      // Sans le jeton, la locale nomme un écran en dur : c'est exactement ce
      // qui a envoyé Bilou vers « Métadonnées » pendant dix jours.
      if (!v.includes('{onglet}')) fautives.push(`${l} : pas de {onglet}`);
    }
    expect(
      fautives,
      'le texte d’aide fige un nom d’écran au lieu d’interpoler l’onglet :\n  ' +
        fautives.join('\n  '),
    ).toEqual([]);
  });

  it('Ambiance interpole bien le libellé de CET onglet', () => {
    expect(ambianceView).toContain("$t('ambiance.analysisNotReady')");
    expect(ambianceView).toContain("replace('{onglet}', $t('settings.tabClap' as any))");
  });

  it('le réglage de débit vit dans l’onglet ainsi nommé', () => {
    // Garde de texte source : le sélecteur `acoustic-throttle` doit se trouver
    // ENTRE l'ouverture du bloc `settingsTab === 'clap'` et le bloc suivant.
    // S'il redéménage, ce test tombe et le texte d'aide devra suivre.
    const ouverture = settingsView.indexOf("{#if settingsTab === 'clap'}");
    expect(ouverture, "le bloc de l’onglet acoustique a disparu").toBeGreaterThan(-1);
    const suivant = settingsView.indexOf('{#if settingsTab === ', ouverture + 1);
    const debit = settingsView.indexOf('id="acoustic-throttle"');
    expect(debit, 'le sélecteur de débit a disparu de SettingsView').toBeGreaterThan(-1);
    expect(
      debit > ouverture && (suivant === -1 || debit < suivant),
      'le réglage de débit n’est plus dans l’onglet que le texte d’aide désigne',
    ).toBe(true);
  });
});

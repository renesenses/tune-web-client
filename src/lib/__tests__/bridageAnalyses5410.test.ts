// tune-server-rust#5410 / #6176 (Didier, fil 2239 : un Ryzen arrêté en
// surchauffe pendant l'analyse de la plage dynamique, sous Windows).
//
// Sans température lisible, le serveur bride les analyses de fond à un
// fichier à la fois et le publie dans `GET /system/diagnostics`
// (`analyses_bridees` : `temperature_illisible` ou `temperature_figee`).
// L'écran « État du serveur » doit le DIRE : sans quoi l'utilisateur voit des
// analyses plus lentes sans savoir pourquoi.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bridageDesAnalyses } from '../temperatureProcesseur';

const L = { illisible: 'ILLISIBLE', figee: 'FIGEE' };

describe('#5410 — le bridage des analyses à l’écran', () => {
  it('🔴 un motif de bridage rend sa phrase', () => {
    expect(bridageDesAnalyses('temperature_illisible', L)).toBe('ILLISIBLE');
    expect(bridageDesAnalyses('temperature_figee', L)).toBe('FIGEE');
    // Un motif inconnu d'un serveur plus récent : bridé quand même, on le dit.
    expect(bridageDesAnalyses('autre_motif', L)).toBe('ILLISIBLE');
  });

  it('pas de bridage, ou serveur antérieur : rien n’est affiché', () => {
    expect(bridageDesAnalyses(null, L)).toBeNull();
    expect(bridageDesAnalyses(undefined, L)).toBeNull();
    expect(bridageDesAnalyses('', L)).toBeNull();
  });

  it('l’État du serveur lit `analyses_bridees` et affiche la phrase', () => {
    const src = readFileSync('src/components/v2/TuneHealthV2.svelte', 'utf8');
    expect(src).toContain('diag[0].value?.analyses_bridees');
    expect(src).toMatch(/\{#if bridage\}<div class="sub bridage">\{bridage\}<\/div>\{\/if\}/);
  });

  it('les deux phrases existent dans toutes les langues', () => {
    for (const l of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'vi', 'el', 'nb', 'pl']) {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      expect(src, l).toContain('"v2.health.analysesBrideesIllisible":');
      expect(src, l).toContain('"v2.health.analysesBrideesFigee":');
    }
    const fr = readFileSync('src/lib/locales/fr.ts', 'utf8');
    expect(fr).toContain('Température non lisible sur cette machine : analyses bridées');
  });
});

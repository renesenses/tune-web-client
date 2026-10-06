/**
 * Décision du 06/10 — les jauges Plage dynamique et ReplayGain de l'écran
 * Santé valent les pistes TRAITÉES (mesurées, ou déclarées non gérables) sur
 * le TOTAL. Elles n'atteignent 100 % que lorsque chaque piste est l'une ou
 * l'autre. Une ligne dit combien de pistes ne sont pas gérées, et pourquoi.
 * Face à un serveur qui ne compte pas les traitées, le calcul d'avant reste.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  jaugeTraiteesPlageDynamique, jaugeTraiteesReplayGain, ligneNonGerees,
} from '../santeJaugeTraitees';
import fr from '../locales/fr';

const tFr = (k: string) => (fr as Record<string, string>)[k] ?? k;
const nombre = (n: number) => String(n);

describe('jauge des pistes traitées — plage dynamique', () => {
  // 1 000 pistes : 900 avec un DR, 30 sans fichier, 12 illisibles, 8 dans un
  // dossier exclu ; 50 restent à faire, dont 20 reportées.
  const c = {
    total_tracks: 1000,
    with_dynamic_range: 900,
    dynamic_range_processed: 950,
    dynamic_range_unmanageable: 50,
    dynamic_range_unmeasurable: 12,
    dynamic_range_oversized: 0,
    dynamic_range_without_file: 30,
    dynamic_range_out_of_scope: 8,
    dynamic_range_deferred: 20,
  };

  it('le dénominateur est le TOTAL, le numérateur les traitées', () => {
    const j = jaugeTraiteesPlageDynamique(c)!;
    expect(j.fait).toBe(950);
    expect(j.total).toBe(1000);
    expect(Math.round((j.fait / j.total) * 100)).toBe(95);
  });

  it('elle atteint 100 % quand chaque piste est mesurée ou non gérable, et seulement là', () => {
    expect(jaugeTraiteesPlageDynamique({ ...c, dynamic_range_processed: 999 })!.fait).toBeLessThan(1000);
    const j = jaugeTraiteesPlageDynamique({ ...c, dynamic_range_processed: 1000 })!;
    expect(j.fait).toBe(j.total);
  });

  it('les traitées ne dépassent jamais le total', () => {
    expect(jaugeTraiteesPlageDynamique({ ...c, dynamic_range_processed: 1200 })!.fait).toBe(1000);
  });

  it('la ligne nomme les non gérées et leurs causes', () => {
    const j = jaugeTraiteesPlageDynamique(c);
    expect(j!.nonGerees).toBe(50);
    expect(ligneNonGerees(j, tFr, nombre)).toBe(
      '50 pistes non gérées : 30 sans fichier propre (images CUE), 12 illisibles ou en échec de mesure, '
      + '8 dans un dossier exclu des analyses.',
    );
  });

  it('rien de non géré : pas de ligne', () => {
    const j = jaugeTraiteesPlageDynamique({
      ...c, dynamic_range_unmeasurable: 0, dynamic_range_without_file: 0, dynamic_range_out_of_scope: 0,
    });
    expect(ligneNonGerees(j, tFr, nombre)).toBeUndefined();
  });

  it('un serveur sans le compteur des traitées : null, la carte garde son calcul', () => {
    const { dynamic_range_processed: _, ...ancien } = c;
    expect(jaugeTraiteesPlageDynamique(ancien)).toBeNull();
    expect(jaugeTraiteesPlageDynamique(null)).toBeNull();
  });
});

describe('jauge des pistes traitées — ReplayGain', () => {
  it('traitées sur le total de la bibliothèque, causes nommées', () => {
    const j = jaugeTraiteesReplayGain({
      library_total: 1000, library_processed: 980,
      library_without_file: 30, library_out_of_scope: 0, library_failed: 5,
    })!;
    expect([j.fait, j.total, j.nonGerees]).toEqual([980, 1000, 35]);
    expect(ligneNonGerees(j, tFr, nombre)).toBe(
      '35 pistes non gérées : 30 sans fichier propre (images CUE), 5 en échec de mesure.',
    );
  });

  it('un serveur sans les nouveaux champs : null', () => {
    expect(jaugeTraiteesReplayGain({ library_total: null, library_processed: null })).toBeNull();
    expect(jaugeTraiteesReplayGain({})).toBeNull();
  });
});

describe('la carte Santé applique la règle', () => {
  const SOURCE = fs.readFileSync(
    fileURLToPath(new URL('../../components/v2/TuneHealthV2.svelte', import.meta.url)),
    'utf8',
  );

  it('plage dynamique : traitées sur total, calcul d’avant face à un serveur ancien', () => {
    expect(SOURCE).toMatch(/const traitees = jaugeTraiteesPlageDynamique\(c\);/);
    expect(SOURCE).toMatch(/const jauge = traitees \? \{ fait: traitees\.fait, total: traitees\.total, exclues: 0 \} : jaugeAvant;/);
    expect(SOURCE).toMatch(/total - traitees\.fait - reportees/);
    expect(SOURCE).toMatch(/ligneNonGerees\(traitees,/);
  });

  it('ReplayGain : traitées sur total quand la jauge parle de la bibliothèque', () => {
    expect(SOURCE).toMatch(/const rgTraitees = jauge\.bibliotheque \? jaugeTraiteesReplayGain\(avRg\) : null;/);
    expect(SOURCE).toMatch(/fait: rgTraitees \? rgTraitees\.fait : jauge\.fait,/);
    expect(SOURCE).toMatch(/total: rgTraitees \? rgTraitees\.total : jauge\.total,/);
    expect(SOURCE).toMatch(/ligneNonGerees\(rgTraitees,/);
  });

  it('les clés existent dans les onze langues, avec leurs marqueurs', () => {
    const cles: [string, RegExp][] = [
      ['v2.health.rgProcessed', /\{n\}[\s\S]*\{t\}|\{t\}[\s\S]*\{n\}/],
      ['v2.health.unmanagedLine', /\{n\}[\s\S]*\{causes\}/],
      ['v2.health.unmanaged.withoutFile', /\{n\}/],
      ['v2.health.unmanaged.unmeasurable', /\{n\}/],
      ['v2.health.unmanaged.failed', /\{n\}/],
      ['v2.health.unmanaged.oversized', /\{n\}/],
      ['v2.health.unmanaged.outOfScope', /\{n\}/],
    ];
    for (const l of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh']) {
      const src = fs.readFileSync(fileURLToPath(new URL(`../locales/${l}.ts`, import.meta.url)), 'utf8');
      for (const [k, marqueurs] of cles) {
        const m = src.match(new RegExp(`"${k.replace(/\./g, '\\.')}": "([^"]*)"`));
        expect(m, `${l} ${k}`).not.toBeNull();
        expect(m![1], `${l} ${k}`).toMatch(marqueurs);
      }
    }
  });
});

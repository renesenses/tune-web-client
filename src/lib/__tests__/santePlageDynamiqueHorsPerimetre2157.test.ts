/**
 * Fil 2157 — « Analyse plage dynamique reste bloquée à 97 % ».
 *
 * Une piste sans DR dans une racine exclue des analyses
 * (tune-server-rust#5593) n'est candidate d'aucune passe. Le serveur la
 * compte à part (`dynamic_range_out_of_scope`) ; la carte doit la retirer du
 * dénominateur de la jauge et des pistes « en attente », et dire pourquoi.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { jaugePlageDynamique } from '../santePlageDynamique';

describe('fil 2157 — les pistes hors du périmètre des analyses', () => {
  it('elles ne retiennent plus la jauge sous 100 %', () => {
    const j = jaugePlageDynamique({
      total: 1000, avec: 950, ecartees: 0, tropLongues: 0, sansFichier: 0, horsPerimetre: 50,
    });
    expect(j).toEqual({ fait: 950, total: 950, exclues: 50 });
  });

  it('un serveur qui ne publie pas le compteur garde la jauge d’avant', () => {
    expect(jaugePlageDynamique({ total: 1000, avec: 950, ecartees: 0, tropLongues: 0, sansFichier: 0 }))
      .toEqual({ fait: 950, total: 1000, exclues: 0 });
  });

  const SOURCE = fs.readFileSync(
    fileURLToPath(new URL('../../components/v2/TuneHealthV2.svelte', import.meta.url)),
    'utf8',
  );

  it('la carte lit le compteur, le retire des pistes en attente et le nomme', () => {
    expect(SOURCE).toMatch(/c\.dynamic_range_out_of_scope/);
    expect(SOURCE).toMatch(/tropLongues - sansFichier - horsPerimetre\)/);
    expect(SOURCE).toMatch(/sansFichier, horsPerimetre \}\)/);
    expect(SOURCE).toMatch(/v2\.health\.drOutOfScope/);
  });

  it('la clé existe dans les onze langues, avec {n}', () => {
    for (const l of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh']) {
      const src = fs.readFileSync(
        fileURLToPath(new URL(`../locales/${l}.ts`, import.meta.url)), 'utf8');
      expect(src, l).toMatch(/"v2\.health\.drOutOfScope": "[^"]*\{n\}/);
    }
  });
});

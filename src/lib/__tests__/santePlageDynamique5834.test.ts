/**
 * tune-server-rust#5834 — fil 2157 : « Analyse plage dynamique reste bloquée à
 * 97 % » (rc2, 17 659 pistes, 606 sans DR).
 *
 * La jauge de la carte valait `with_dynamic_range / total_tracks`. Les pistes
 * qu'aucune passe ne mesurera (écartées pour de bon, trop longues pour le
 * budget de l'analyse, sans fichier propre) restaient au dénominateur : la
 * jauge ne pouvait pas finir, et rien ne disait pourquoi.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { jaugePlageDynamique } from '../santePlageDynamique';

describe('#5834 — la jauge de la plage dynamique porte sur ce qui peut se mesurer', () => {
  it('le cas du fil 2157 : tout ce qui pouvait se mesurer l’a été, la jauge est pleine', () => {
    // 17 659 pistes, 606 sans DR : 200 écartées, 380 trop longues, 26 CUE.
    const j = jaugePlageDynamique({
      total: 17_659, avec: 17_053, ecartees: 200, tropLongues: 380, sansFichier: 26,
    });
    expect(j.total).toBe(17_053);
    expect(j.fait).toBe(17_053);
    expect(j.exclues).toBe(606);
    expect(Math.round((j.fait / j.total) * 100)).toBe(100);
  });

  it('une seule piste écartée ne bloque plus la jauge sous 100 %', () => {
    const j = jaugePlageDynamique({ total: 10, avec: 9, ecartees: 1, tropLongues: 0, sansFichier: 0 });
    expect(j.fait).toBe(j.total);
  });

  it('des pistes encore à faire laissent la jauge en dessous de 100 %', () => {
    const j = jaugePlageDynamique({ total: 100, avec: 50, ecartees: 10, tropLongues: 0, sansFichier: 0 });
    expect(j).toEqual({ fait: 50, total: 90, exclues: 10 });
  });

  it('sans exclusion, la jauge reste avec / total, comme avant', () => {
    expect(jaugePlageDynamique({ total: 47_118, avec: 26_857, ecartees: 0, tropLongues: 0, sansFichier: 0 }))
      .toEqual({ fait: 26_857, total: 47_118, exclues: 0 });
  });

  it('jamais au-dessus de 100 % quand une piste porte un DR ET une marque d’écart', () => {
    // Le serveur ne déduplique pas `dynamic_range_unavailable` : un DR lu
    // dans un `foo_dr.txt` après l'écart compte des deux côtés.
    const j = jaugePlageDynamique({ total: 10, avec: 10, ecartees: 2, tropLongues: 0, sansFichier: 0 });
    expect(j.fait).toBeLessThanOrEqual(j.total);
    expect(j.total).toBe(10);
  });

  it('un serveur qui ne connaît pas les compteurs (valeurs absentes ou folles) ne fausse rien', () => {
    const j = jaugePlageDynamique({ total: 10, avec: 5, ecartees: NaN, tropLongues: -3, sansFichier: 0 });
    expect(j).toEqual({ fait: 5, total: 10, exclues: 0 });
  });
});

describe('#5834 — la carte lit la jauge et dit ce qu’elle exclut', () => {
  const SOURCE = fs.readFileSync(
    fileURLToPath(new URL('../../components/v2/TuneHealthV2.svelte', import.meta.url)),
    'utf8',
  );
  it('la carte lit les deux compteurs du serveur', () => {
    expect(SOURCE).toMatch(/c\.dynamic_range_oversized/);
    expect(SOURCE).toMatch(/c\.dynamic_range_without_file/);
  });
  it('la carte prend fait / total de la jauge, plus de `with_dynamic_range / total_tracks`', () => {
    expect(SOURCE).toMatch(/fait: jauge\.fait,/);
    expect(SOURCE).toMatch(/total: jauge\.total \|\| undefined,/);
    expect(SOURCE).not.toMatch(/fait: avec,/);
  });
  it('les pistes exclues ne comptent plus « en attente »', () => {
    expect(SOURCE).toMatch(/total - avec - ecartees - reportees - tropLongues - sansFichier/);
  });
  it('les clés existent dans les onze langues', () => {
    for (const l of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh']) {
      const src = fs.readFileSync(
        fileURLToPath(new URL(`../locales/${l}.ts`, import.meta.url)), 'utf8');
      for (const k of ['v2.health.drGaugeMeasurable', 'v2.health.drOversized', 'v2.health.drWithoutFile']) {
        expect(src, `${l} ${k}`).toContain(`"${k}"`);
        expect(src, `${l} ${k} {n}`).toMatch(new RegExp(`"${k.replace(/\./g, '\\.')}": "[^"]*\\{n\\}`));
      }
    }
  });
});

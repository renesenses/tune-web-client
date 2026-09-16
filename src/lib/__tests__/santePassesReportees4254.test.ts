import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { jaugeReplayGain } from '../santeReplayGain';

/**
 * #4254 — les pistes que la passe REPORTE (fichier qui ne répond pas, #1865)
 * ne sont ni faites, ni à faire. Le serveur les exclut du dénominateur — à
 * raison — mais sans les compter à part, une bibliothèque entière sur un
 * partage démonté se lisait « ReplayGain terminée » (Benjithom, 0.9.151,
 * fil 1811). La règle : quand il ne reste QUE des reports, la carte dit
 * « en attente d'un disque », jamais « terminée ».
 */
describe('#4254 — pistes reportées sur la carte ReplayGain', () => {
  it('🔴 « rien à analyser » + des reports = au repos, PAS terminée', () => {
    const j = jaugeReplayGain(true, {
      active: false, processed: 0, total: 0, enabled: true, reported: true,
      deferred: 20344, waiting_reason: 'unresolved_paths',
    });
    expect(j.etat).toBe('idle');
    expect(j.attendLesFichiers).toBe(true);
    expect(j.reportees).toBe(20344);
  });

  it('une passe finie mais des reports vivants : au repos, avec le compte', () => {
    const j = jaugeReplayGain(true, {
      active: false, processed: 120, total: 120, enabled: true, reported: true,
      deferred: 30, waiting_reason: 'unresolved_paths',
    });
    expect(j.etat).toBe('idle');
    expect(j.fait).toBe(120);
    expect(j.reportees).toBe(30);
  });

  it('des reports pendant qu\'il reste du travail : la passe tourne, le compte est dit', () => {
    const j = jaugeReplayGain(true, {
      active: true, processed: 10, total: 500, enabled: true, reported: true,
      deferred: 3, waiting_reason: null,
    });
    expect(j.etat).toBe('running');
    expect(j.reportees).toBe(3);
    expect(j.attendLesFichiers).toBe(false);
  });

  it('un serveur qui ne compte pas les reports (≤ 0.9.151) : rien ne change', () => {
    const j = jaugeReplayGain(true, {
      active: false, processed: 0, total: 0, enabled: true, reported: true,
    });
    expect(j.etat).toBe('done');
    expect(j.reportees).toBe(0);
    expect(j.attendLesFichiers).toBe(false);
  });

  it('un `waiting_reason` sans compteur ne fabrique pas un report', () => {
    const j = jaugeReplayGain(true, {
      active: false, processed: 0, total: 0, enabled: true, reported: true,
      deferred: 0, waiting_reason: 'unresolved_paths',
    });
    expect(j.etat).toBe('done');
  });
});

describe('#4214 / #4254 — les trois cartes lisent les reports', () => {
  const SOURCE = fs.readFileSync(
    fileURLToPath(new URL('../../components/v2/TuneHealthV2.svelte', import.meta.url)),
    'utf8',
  );
  it('la carte acoustique lit processed / eligible, comme la jauge des Réglages (#4214)', () => {
    expect(SOURCE).toMatch(/s\?\.eligible_tracks/);
    expect(SOURCE).toMatch(/s\?\.processed_tracks/);
  });
  it('les trois cartes affichent la même clé de report', () => {
    expect((SOURCE.match(/v2\.health\.deferredPaths/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
  it('la plage dynamique retire les reports de « en attente derrière ReplayGain »', () => {
    expect(SOURCE).toMatch(/total - avec - ecartees - reportees/);
  });
  it('la clé existe dans les onze langues', () => {
    for (const l of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh']) {
      const src = fs.readFileSync(
        fileURLToPath(new URL(`../locales/${l}.ts`, import.meta.url)), 'utf8');
      expect(src, l).toContain('"v2.health.deferredPaths"');
    }
  });
});

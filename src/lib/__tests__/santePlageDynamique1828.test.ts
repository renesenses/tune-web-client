import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  etatCartePlageDynamique,
  etatServeurPlageDynamique,
  stockDuRattrapage,
  stocksPlageDynamique,
} from '../santePlageDynamique';

/**
 * tune-web-client#1828 — la carte « Plage dynamique » de l'écran Santé.
 *
 * Capture de Tades (0.9.168, 517 356 pistes) : carte « AU REPOS » pendant que
 * le rattrapage travaillait, et « 409 846 pistes en attente. La plage
 * dynamique passe en premier, avant le ReplayGain » alors que, ReplayGain
 * armé, le rattrapage ne prend que les pistes déjà vues par le ReplayGain.
 */

describe('#1828 — état de la carte', () => {
  it('dit « en cours » quand le serveur publie dynamic_range en_cours', () => {
    expect(
      etatCartePlageDynamique({ analyseActive: true, restantes: 409_846, reportees: 0, etatServeur: 'en_cours' }),
    ).toBe('running');
  });

  it('reste « au repos » quand le serveur dit au_repos, ou ne dit rien (≤ 0.9.158)', () => {
    for (const etatServeur of ['au_repos', 'en_pause', undefined]) {
      expect(
        etatCartePlageDynamique({ analyseActive: true, restantes: 10, reportees: 0, etatServeur }),
      ).toBe('idle');
    }
  });

  it('« terminée » et « éteinte » priment sur l’état publié', () => {
    expect(
      etatCartePlageDynamique({ analyseActive: true, restantes: 0, reportees: 0, etatServeur: 'en_cours' }),
    ).toBe('done');
    expect(
      etatCartePlageDynamique({ analyseActive: false, restantes: 10, reportees: 0, etatServeur: 'en_cours' }),
    ).toBe('off');
  });

  it('lit l’état du SEUL traitement dynamic_range dans l’instantané', () => {
    const inst = {
      pausable: [
        { id: 'replaygain', state: 'au_repos' },
        { id: 'dynamic_range', state: 'en_cours' },
      ],
    };
    expect(etatServeurPlageDynamique(inst)).toBe('en_cours');
    expect(etatServeurPlageDynamique({ pausable: [{ id: 'replaygain', state: 'en_cours' }] })).toBeUndefined();
    expect(etatServeurPlageDynamique(null)).toBeUndefined();
    expect(etatServeurPlageDynamique({})).toBeUndefined();
  });
});

describe('#1828 — les deux stocks', () => {
  it('ReplayGain armé : le rattrapage ne compte que son stock, le reste va au ReplayGain', () => {
    expect(stocksPlageDynamique({ restantes: 409_846, rattrapage: 1_200, replayGainArme: true })).toEqual({
      rattrapage: 1_200,
      parLeReplayGain: 408_646,
    });
  });

  it('ReplayGain coupé : le rattrapage prend tout', () => {
    expect(stocksPlageDynamique({ restantes: 500, rattrapage: 480, replayGainArme: false })).toEqual({
      rattrapage: 500,
      parLeReplayGain: 0,
    });
  });

  it('un compte serveur plus grand que le reste ne fabrique pas de négatif', () => {
    expect(stocksPlageDynamique({ restantes: 10, rattrapage: 25, replayGainArme: true })).toEqual({
      rattrapage: 10,
      parLeReplayGain: 0,
    });
  });

  it('serveur muet : pas de séparation, la carte garde son message d’origine', () => {
    expect(stocksPlageDynamique({ restantes: 10, rattrapage: null, replayGainArme: true })).toBeNull();
  });

  it('le stock du rattrapage vient de candidates au repos, de remaining pendant une mesure', () => {
    expect(stockDuRattrapage({ active: false, candidates: 42 })).toBe(42);
    expect(stockDuRattrapage({ active: true, remaining: 7, candidates: null })).toBe(7);
    expect(stockDuRattrapage({ active: false, candidates: null })).toBeNull();
    expect(stockDuRattrapage({ candidates: Number.NaN })).toBeNull();
    expect(stockDuRattrapage(null)).toBeNull();
  });
});

describe('#1828 — la carte est branchée sur ces décisions', () => {
  const src = fs.readFileSync(
    fileURLToPath(new URL('../../components/v2/TuneHealthV2.svelte', import.meta.url)),
    'utf-8',
  );
  it('l’état de la carte DR passe par etatCartePlageDynamique', () => {
    expect(src).toMatch(/etat:\s*etatCartePlageDynamique\(/);
    expect(src).not.toMatch(/restantes === 0 && reportees === 0 \? 'done' : 'idle'/);
  });
  it('le message d’ordre de passage porte le stock du rattrapage, pas le total', () => {
    expect(src).toMatch(/drQueuedBehindRg'\) as any\)\.replace\('\{n\}', \$formatNombre\(enAttente\)\)/);
    expect(src).toMatch(/v2\.health\.drMeasuredByRg/);
  });
});

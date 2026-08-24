import { describe, it, expect } from 'vitest';
import {
  CF_MAX_AMOUNT,
  CF_MAX_DELAY,
  CF_PRESETS,
  presetActif,
  reglagesCrossfeed,
} from '../crossfeed';

describe('reglagesCrossfeed', () => {
  it('borne aux valeurs que le serveur accepte', () => {
    expect(reglagesCrossfeed(true, 9, 99)).toEqual({
      enabled: true,
      amount: CF_MAX_AMOUNT,
      delay_ms: CF_MAX_DELAY,
    });
    expect(reglagesCrossfeed(true, -1, -1)).toEqual({ enabled: true, amount: 0, delay_ms: 0 });
  });

  it('laisse passer une valeur dans les bornes', () => {
    expect(reglagesCrossfeed(false, 0.3, 0.5)).toEqual({
      enabled: false,
      amount: 0.3,
      delay_ms: 0.5,
    });
  });
});

describe('presetActif', () => {
  it('reconnait chaque reglage tout fait', () => {
    for (const p of CF_PRESETS) {
      expect(presetActif(p.amount, p.delay)).toBe(p.key);
    }
  });

  // Les curseurs travaillent au centieme : une egalite stricte sur des
  // flottants n'allumerait jamais le bouton.
  it('tolere l ecart d un curseur', () => {
    expect(presetActif(0.3001, 0.4999)).toBe('standard');
  });

  it('ne reconnait rien quand les valeurs sont personnelles', () => {
    expect(presetActif(0.12, 1.8)).toBe(null);
  });
});

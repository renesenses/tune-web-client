import { describe, expect, it } from 'vitest';
import { dbSigne, libelleCompensation } from './compensationNiveau';

describe('compensation de niveau (tune-server-rust#4685)', () => {
  it('signe les gains au dixième, sans « -0.0 »', () => {
    expect(dbSigne(9.36)).toBe('+9.4');
    expect(dbSigne(-1.02)).toBe('-1.0');
    expect(dbSigne(-0.04)).toBe('0.0');
    expect(dbSigne(Number.NaN)).toBe('0.0');
  });

  it('active : ce que chaque étage retire et ce que le volume rend', () => {
    const l = libelleCompensation({
      enabled: true, eq_db: -9.36, crossfeed_db: -1.02, compensation_db: 10.38, local_output_only: true,
    });
    expect(l).toEqual({ cle: 'v2.lc.valueOn', eq: '-9.4', cf: '-1.0', comp: '+10.4' });
  });

  it('éteinte : la perte est dite, rien n\'est rendu', () => {
    const l = libelleCompensation({
      enabled: false, eq_db: -9.36, crossfeed_db: 0, compensation_db: 0, local_output_only: true,
    });
    expect(l.cle).toBe('v2.lc.valueOff');
  });

  it('rien à compenser : la phrase le dit, quel que soit l\'interrupteur', () => {
    const l = libelleCompensation({
      enabled: true, eq_db: 0, crossfeed_db: 0.02, compensation_db: -0.02, local_output_only: true,
    });
    expect(l.cle).toBe('v2.lc.valueNone');
  });
});

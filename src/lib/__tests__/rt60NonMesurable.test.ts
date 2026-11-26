// RT60 « non mesurable (bruit) » : une bande sans aucun temps rend la plage
// dynamique disponible ; une bande mesurée, ou un serveur sans plage, rien.
import { describe, expect, it } from 'vitest';
import { plageNonMesurable, rt60De } from '../correctionPiece';

describe('RT60 non mesurable', () => {
  it('une bande sans temps rend sa plage dynamique', () => {
    expect(plageNonMesurable({ centre_hz: 250, edt_s: null, t20_s: null, t30_s: null, dynamique_db: 17.6 })).toBe(17.6);
  });

  it('une bande avec un EDT seul est mesurée : pas de plage', () => {
    const b = { centre_hz: 500, edt_s: 0.48, t20_s: null, t30_s: null, dynamique_db: 27 };
    expect(rt60De(b)).toBe(0.48);
    expect(plageNonMesurable(b)).toBeNull();
  });

  it('un serveur plus ancien, sans plage : rien (le tiret reste)', () => {
    expect(plageNonMesurable({ centre_hz: 63, edt_s: null, t20_s: null, t30_s: null })).toBeNull();
    expect(plageNonMesurable({ centre_hz: 63, edt_s: null, t20_s: null, t30_s: null, dynamique_db: null })).toBeNull();
  });

  it('une plage négative est ramenée à 0', () => {
    expect(plageNonMesurable({ centre_hz: 63, edt_s: null, t20_s: null, t30_s: null, dynamique_db: -2 })).toBe(0);
  });
});

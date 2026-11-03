import { describe, expect, it } from 'vitest';
import {
  confortAuDessusDeLaSecurite,
  courseDb,
  dbDepuisFraction,
  fondDesZones,
  formaterDbAppareil,
  fractionDepuisDb,
  graduations,
  limiteDepuisDb,
  texteLimiteDb,
  zonesDeLimites,
} from '../volumeCourseDb';

// tune-server-rust#6918 : la course Devialet AIR par défaut, −80 à −10 dB, pas de 0,5 dB.
const AIR = {
  output_type: 'devialet_air',
  device_volume_range: { min_db: -80, max_db: -10, step_db: 0.5, floor_db: -80, ceiling_db: -10 },
  device_volume_db: -45,
};

describe('curseur et limites en dB (#7517)', () => {
  it('la course vient du serveur : sans device_volume_range, curseur en pour-cent', () => {
    expect(courseDb(AIR)).toEqual({ min_db: -80, max_db: -10, step_db: 0.5 });
    expect(courseDb({ output_type: 'dlna' })).toBeNull();
    expect(courseDb({ device_volume_range: null })).toBeNull();
    expect(courseDb(null)).toBeNull();
    // Valeurs incohérentes : pas de course inventée.
    expect(courseDb({ device_volume_range: { min_db: -10, max_db: -80, step_db: 0.5 } })).toBeNull();
    expect(courseDb({ device_volume_range: { min_db: -80, max_db: -10, step_db: 0 } })).toBeNull();
    expect(courseDb({ device_volume_range: { min_db: -80, max_db: -10 } })).toBeNull();
    // La zone navigateur joue dans l'onglet : jamais de course.
    expect(courseDb({ ...AIR, output_type: 'browser' })).toBeNull();
  });

  it('dB ↔ position du curseur, aller-retour au pas de 0,5 dB', () => {
    const c = courseDb(AIR)!;
    expect(fractionDepuisDb(c, -80)).toBe(0);
    expect(fractionDepuisDb(c, -10)).toBe(1);
    expect(fractionDepuisDb(c, -45)).toBeCloseTo(0.5, 10);
    expect(dbDepuisFraction(c, 0.5)).toBe(-45);
    expect(dbDepuisFraction(c, 0)).toBe(-80);
    expect(dbDepuisFraction(c, 1)).toBe(-10);
    for (const db of [-80, -62.5, -45, -23.5, -10]) {
      expect(dbDepuisFraction(c, fractionDepuisDb(c, db))).toBe(db);
    }
    // hors course : borné, jamais extrapolé
    expect(fractionDepuisDb(c, -5)).toBe(1);
    expect(fractionDepuisDb(c, -120)).toBe(0);
    expect(dbDepuisFraction(c, Number.NaN)).toBe(-80);
  });

  it('affichage et graduations tous les 10 dB', () => {
    const c = courseDb(AIR)!;
    expect(formaterDbAppareil(-45)).toBe('-45.0 dB');
    expect(formaterDbAppareil(-0.04)).toBe('0.0 dB');
    expect(graduations(c).map((g) => g.db)).toEqual([-80, -70, -60, -50, -40, -30, -20, -10]);
    expect(graduations(c)[0].pos).toBe(0);
    expect(graduations(c).at(-1)!.pos).toBe(1);
  });

  it('les zones : vert sous le confort, orange jusqu’à la sécurité, rouge au-delà', () => {
    const fond = fondDesZones(zonesDeLimites({ volume_limit_comfort: 0.4, volume_limit_safety: 0.7 }))!;
    expect(fond).toContain('var(--tune-success, #3fb950) 0%');
    expect(fond).toContain('var(--tune-success, #3fb950) 40%');
    expect(fond).toContain('var(--tune-warning, #d29922) 40%');
    expect(fond).toContain('var(--tune-warning, #d29922) 70%');
    expect(fond).toContain('var(--tune-error, #f85149) 70%');
    expect(fond).toContain('var(--tune-error, #f85149) 100%');
  });

  it('contre-épreuve : sans limite, aucun fond ; sécurité seule : vert puis rouge ; confort seul : vert puis orange', () => {
    expect(fondDesZones(zonesDeLimites({}))).toBeNull();
    const s = fondDesZones(zonesDeLimites({ volume_limit_safety: 0.6 }))!;
    expect(s).not.toContain('tune-warning');
    expect(s).toContain('tune-error, #f85149) 60%');
    const c = fondDesZones(zonesDeLimites({ volume_limit_comfort: 0.3 }))!;
    expect(c).not.toContain('tune-error');
    expect(c).toContain('tune-warning, #d29922) 100%');
    // Un confort au-dessus de la sécurité agit plafonné : pas d’orange.
    const m = fondDesZones(zonesDeLimites({ volume_limit_comfort: 0.9, volume_limit_safety: 0.5 }))!;
    expect(m).not.toContain('tune-warning');
  });

  it('la saisie d’une limite en dB : vide = aucune, hors course ou illisible = refus', () => {
    const c = courseDb(AIR)!;
    expect(limiteDepuisDb('', c)).toEqual({ fraction: null, db: null });
    const l = limiteDepuisDb('-24 dB', c);
    expect(l).toEqual({ fraction: fractionDepuisDb(c, -24), db: -24 });
    expect(limiteDepuisDb('-24,5', c)).toMatchObject({ db: -24.5 });
    expect(limiteDepuisDb('-5', c)).toEqual({ refus: 'hors-course' });
    expect(limiteDepuisDb('-90', c)).toEqual({ refus: 'hors-course' });
    expect(limiteDepuisDb('3', c)).toEqual({ refus: 'hors-course' });
    expect(limiteDepuisDb('fort', c)).toEqual({ refus: 'illisible' });
    expect(texteLimiteDb(-24)).toBe('-24.0');
    expect(texteLimiteDb(null)).toBe('');
  });

  it('un confort au-dessus de la sécurité est refusé ; égal ou absent est accepté', () => {
    expect(confortAuDessusDeLaSecurite(0.5, 0.3)).toBe(true);
    expect(confortAuDessusDeLaSecurite(0.3, 0.3)).toBe(false);
    expect(confortAuDessusDeLaSecurite(0.2, 0.3)).toBe(false);
    expect(confortAuDessusDeLaSecurite(0.5, null)).toBe(false);
    expect(confortAuDessusDeLaSecurite(null, 0.3)).toBe(false);
  });
});

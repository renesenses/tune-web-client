import { describe, it, expect } from 'vitest';
import {
  MIN_DB,
  MAX_DB,
  RED_FROM_DB,
  PEAK_LAMP_DBFS,
  TICKS,
  LABELED_TICKS,
  dbToFraction,
} from './tvVuScale';

// Échelle des VU-mètres Grand écran (#439) : l'aiguille lit le RMS en dBFS
// sur −40…0, et la zone rouge est réservée aux vrais −3…0 dBFS. Ces tests
// verrouillent ce qui a cassé deux fois de suite (#323, #370) : la place de
// la butée haute par rapport aux niveaux RMS réels des masters modernes.
describe('tvVuScale', () => {
  it('borne le cadran : MIN_DB → 0, MAX_DB (pleine échelle) → 1, au-delà clampe', () => {
    expect(dbToFraction(MIN_DB)).toBe(0);
    expect(dbToFraction(MAX_DB)).toBe(1);
    expect(dbToFraction(MIN_DB - 60)).toBe(0);
    expect(dbToFraction(MAX_DB + 6)).toBe(1);
  });

  it('est strictement croissante sur toute la plage', () => {
    let prev = dbToFraction(MIN_DB);
    for (let db = MIN_DB + 1; db <= MAX_DB; db++) {
      const f = dbToFraction(db);
      expect(f).toBeGreaterThan(prev);
      prev = f;
    }
  });

  it('un master moderne (−12…−8 dBFS RMS) vit hors zone rouge, sans être en butée', () => {
    const redStart = dbToFraction(RED_FROM_DB);
    for (const db of [-12, -10, -8]) {
      const f = dbToFraction(db);
      expect(f).toBeLessThan(redStart); // pas dans le rouge
      expect(f).toBeLessThan(0.95); // pas collé en butée
      expect(f).toBeGreaterThan(0.5); // mais l'aiguille vit dans la moitié haute
    }
  });

  it('un enregistrement calme (−30 dBFS RMS) reste lisible, loin du zéro', () => {
    const f = dbToFraction(-30);
    expect(f).toBeGreaterThan(0.2);
    expect(f).toBeLessThan(0.5);
  });

  it('la zone rouge ne couvre que les vrais −3…0 dBFS', () => {
    expect(RED_FROM_DB).toBe(-3);
    const redStart = dbToFraction(RED_FROM_DB);
    expect(dbToFraction(-3.5)).toBeLessThan(redStart);
    expect(dbToFraction(-1)).toBeGreaterThan(redStart);
    // La zone rouge existe mais reste une zone d'alerte, pas la moitié du cadran.
    expect(1 - redStart).toBeGreaterThan(0.02);
    expect(1 - redStart).toBeLessThan(0.15);
  });

  it('témoin de crête : quasi pleine échelle, au-dessus du début de zone rouge', () => {
    expect(PEAK_LAMP_DBFS).toBeGreaterThan(RED_FROM_DB);
    expect(PEAK_LAMP_DBFS).toBeLessThan(MAX_DB);
  });

  it('graduations : triées, dans le cadran, et chiffres pris parmi elles', () => {
    for (let i = 1; i < TICKS.length; i++) expect(TICKS[i]).toBeGreaterThan(TICKS[i - 1]);
    expect(TICKS[0]).toBe(MIN_DB);
    expect(TICKS[TICKS.length - 1]).toBe(MAX_DB);
    for (const t of LABELED_TICKS) expect(TICKS).toContain(t);
  });
});

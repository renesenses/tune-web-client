import { describe, it, expect } from 'vitest';
import { CADENCES_PLAFOND, libelleCadence } from '../cadencesPlafondZone';

describe("Fréquence max d'une zone", () => {
  it('propose 768 kHz et 1536 kHz, avec les deux familles complètes', () => {
    expect(CADENCES_PLAFOND).toEqual([
      44100, 48000, 88200, 96000, 176400, 192000, 352800, 384000,
      705600, 768000, 1411200, 1536000,
    ]);
  });
  it('est strictement croissante', () => {
    for (let i = 1; i < CADENCES_PLAFOND.length; i++) {
      expect(CADENCES_PLAFOND[i]).toBeGreaterThan(CADENCES_PLAFOND[i - 1]);
    }
  });
  it('libelle à la virgule décimale', () => {
    expect(libelleCadence(768000)).toBe('768 kHz');
    expect(libelleCadence(1536000)).toBe('1536 kHz');
    expect(libelleCadence(44100)).toBe('44,1 kHz');
    expect(libelleCadence(1411200)).toBe('1411,2 kHz');
  });
});

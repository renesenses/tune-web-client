// Bertrand, 17/09/2026 : « sous le spectrogramme, ajoute les fréquences à
// partir de 20 Hz !! » — la capture montrait un axe qui commençait à 125 Hz.
import { describe, expect, it } from 'vitest';
import { spectrumGravesTicks, spectrumIsoTicks, serverBandSpans } from '../spectrumScale';

describe('repères du grave, à partir de 20 Hz', () => {
  it('à 44,1 kHz, 20 / 31 / 63 Hz précèdent le premier repère résolu', () => {
    const iso = spectrumIsoTicks(44100, 32);
    expect(iso[0].hz, 'la capture : le premier repère résolu est 125 Hz').toBe(125);
    const graves = spectrumGravesTicks(44100, iso[0].hz);
    expect(graves.map((t) => t.hz)).toEqual([20, 31, 63]);
    expect(graves[0].pos).toBe(0);
    // Croissants, et tous à gauche du premier repère résolu.
    const positions = [...graves, iso[0]].map((t) => t.pos);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('la position nominale est celle de la bande du serveur qui porte la fréquence', () => {
    // La bande b couvre nominalement 20·r^(b/n) … 20·r^((b+1)/n) : 63 Hz doit
    // tomber dans la bande dont l'indice vaut floor(pos · n).
    const n = 32;
    const [, , t63] = spectrumGravesTicks(44100, 125);
    const b = Math.floor(t63.pos * n);
    const r = 20000 / 20;
    expect(63).toBeGreaterThanOrEqual(20 * Math.pow(r, b / n));
    expect(63).toBeLessThan(20 * Math.pow(r, (b + 1) / n));
    expect(serverBandSpans(44100, n).length).toBe(n);
  });

  it('ne double pas un repère que la grille résolue porte déjà', () => {
    expect(spectrumGravesTicks(44100, 31).map((t) => t.hz)).toEqual([20]);
    expect(spectrumGravesTicks(44100, 20)).toEqual([]);
  });

  it('sans fréquence d’échantillonnage connue : aucun repère', () => {
    expect(spectrumGravesTicks(null, 125)).toEqual([]);
    expect(spectrumGravesTicks(0, 125)).toEqual([]);
  });
});

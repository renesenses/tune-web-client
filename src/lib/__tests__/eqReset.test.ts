import { describe, it, expect } from 'vitest';
import { NEUTRAL_PARAMETRIC_BAND, resetParametricBands } from '../eqReset';

describe('resetParametricBands', () => {
  it('rend une bande unique, neutre (1 kHz / 0 dB)', () => {
    const bands = resetParametricBands();
    expect(bands).toHaveLength(1);
    expect(bands[0]).toEqual(NEUTRAL_PARAMETRIC_BAND);
  });

  it('remet le gain à zéro quel que soit le réglage précédent', () => {
    // Ce que Jean Valjean (#1385) avait à l'écran : plusieurs bandes creusées.
    const before = [
      { freq: 60, gain: -9, q: 0.7, type: 'lowshelf' },
      { freq: 3200, gain: 7.5, q: 2.4, type: 'peak' },
      { freq: 12000, gain: -4, q: 0.7, type: 'highshelf' },
    ];
    const after = resetParametricBands();
    expect(after.every((b) => b.gain === 0)).toBe(true);
    expect(after.length).toBeLessThan(before.length);
  });

  it('rend une NOUVELLE liste à chaque appel (réactivité Svelte)', () => {
    const a = resetParametricBands();
    const b = resetParametricBands();
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
    expect(a).toEqual(b);
  });

  it('ne laisse pas muter la constante partagée', () => {
    const bands = resetParametricBands();
    bands[0].gain = 6;
    expect(NEUTRAL_PARAMETRIC_BAND.gain).toBe(0);
  });
});

/**
 * #1554 — l'historique de forme d'onde est un anneau : une poussée ne décale
 * plus le tableau, quel que soit le nombre de colonnes retenues.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WAVE_FLOOR_DB, WAVE_HISTORY_SLOTS, WaveformHistory, peakDbToAmplitude } from './waveformHistory';

/** dBFS dont l'amplitude vaut exactement `k / 1000` — un marqueur lisible. */
const marque = (k: number) => WAVE_FLOOR_DB + (k / 1000) * -WAVE_FLOOR_DB;

describe('#1554 — comportement de l’anneau', () => {
  it('reste borné et dans l’ordre après de nombreux tours complets', () => {
    const h = new WaveformHistory();
    const total = WAVE_HISTORY_SLOTS * 7 + 13; // plusieurs tours + un reste
    for (let i = 0; i < total; i++) h.push(marque(i % 1000), WAVE_FLOOR_DB);
    expect(h.length).toBe(WAVE_HISTORY_SLOTS);
    const s = h.samples();
    expect(s.length).toBe(WAVE_HISTORY_SLOTS);
    // La fenêtre retenue est EXACTEMENT les WAVE_HISTORY_SLOTS dernières.
    for (let i = 0; i < s.length; i++) {
      const k = (total - WAVE_HISTORY_SLOTS + i) % 1000;
      expect(s[i].left).toBeCloseTo(peakDbToAmplitude(marque(k)), 9);
    }
  });

  it('se remplit sans rien perdre avant d’atteindre la capacité', () => {
    const h = new WaveformHistory();
    for (let i = 0; i < 10; i++) h.push(marque(i * 10), marque(i * 10));
    expect(h.samples().map((c) => Math.round(c.left * 1000))).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  it('repart de zéro après clear, même au milieu d’un tour', () => {
    const h = new WaveformHistory();
    for (let i = 0; i < WAVE_HISTORY_SLOTS + 37; i++) h.push(0, 0);
    h.clear();
    expect(h.length).toBe(0);
    expect(h.samples()).toEqual([]);
    h.push(marque(500), marque(250));
    expect(h.samples()).toEqual([{ left: 0.5, right: 0.25 }]);
  });

  it('respecte une capacité donnée', () => {
    const h = new WaveformHistory(3);
    expect(h.capacity).toBe(3);
    for (const k of [100, 200, 300, 400, 500]) h.push(marque(k), marque(k));
    expect(h.samples().map((c) => Math.round(c.left * 1000))).toEqual([300, 400, 500]);
  });

  it('rend un instantané que les poussées suivantes ne modifient pas', () => {
    // L'ancienne version rendait son tableau INTERNE : qui le gardait le
    // voyait grandir et perdre sa tête sous ses yeux.
    const h = new WaveformHistory();
    h.push(0, 0);
    const avant = h.samples();
    for (let i = 0; i < WAVE_HISTORY_SLOTS + 5; i++) h.push(WAVE_FLOOR_DB, WAVE_FLOOR_DB);
    expect(avant.length).toBe(1);
    expect(avant[0]).toEqual({ left: 1, right: 1 });
  });

  it('ne reconstruit pas l’instantané tant qu’aucune trame n’arrive (dessin à 60 i/s)', () => {
    const h = new WaveformHistory();
    h.push(0, 0);
    const a = h.samples();
    expect(h.samples()).toBe(a);
    h.push(0, 0);
    expect(h.samples()).not.toBe(a);
  });
});

describe('#1554 — coût d’une poussée', () => {
  afterEach(() => vi.restoreAllMocks());

  it('10⁵ poussées ne décalent jamais le tableau (ni splice, ni shift)', () => {
    const splice = vi.spyOn(Array.prototype, 'splice');
    const shift = vi.spyOn(Array.prototype, 'shift');
    const h = new WaveformHistory();
    for (let i = 0; i < 100_000; i++) h.push(-6, -12);
    const appels = splice.mock.calls.length + shift.mock.calls.length;
    vi.restoreAllMocks();
    expect(appels).toBe(0);
    expect(h.length).toBe(WAVE_HISTORY_SLOTS);
  });

  it('le coût ne croît pas avec la capacité : 10⁵ poussées en bien moins de 250 ms', () => {
    // Mesuré sur Shrek : ~1,5 ms pour l'anneau, à 150 comme à 50 000
    // colonnes ; `splice` en demandait 98 ms à 150 et 10 s à 50 000.
    // La borne laisse deux ordres de grandeur à la charge de la machine.
    for (const cap of [WAVE_HISTORY_SLOTS, 50_000]) {
      const h = new WaveformHistory(cap);
      const t0 = performance.now();
      for (let i = 0; i < 100_000; i++) h.push(-6, -12);
      const ms = performance.now() - t0;
      expect(h.length).toBe(cap);
      expect(ms, `capacité ${cap} : ${ms.toFixed(1)} ms`).toBeLessThan(250);
    }
  });
});

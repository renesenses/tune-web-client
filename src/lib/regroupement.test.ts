// @vitest-environment jsdom
/**
 * Fil forum 2134 — la Bibliothèque se rechargeait toutes les 1 à 2 s.
 *
 * Le diagnostic du fil montre `library.updated` émis toutes les 0,96 s
 * pendant une réécriture massive. `regrouper` ne doit laisser passer qu'un
 * appel par rafale, et au plus un par intervalle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { regrouper } from './regroupement';

const CALME = 2_500;
const INTERVALLE = 10_000;

let visibilite: DocumentVisibilityState = 'visible';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  visibilite = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilite });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('fil 2134 — regrouper les invalidations', () => {
  it('un signal isolé part UNE fois, après le calme', () => {
    const appel = vi.fn();
    const r = regrouper(appel, { calmeMs: CALME, intervalleMs: INTERVALLE });
    r.signaler();
    vi.advanceTimersByTime(CALME - 1);
    expect(appel).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(appel).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(appel).toHaveBeenCalledTimes(1);
  });

  it('🔴 la cadence du fil (0,96 s pendant 60 s) : au plus un appel par intervalle, et un dernier après la rafale', () => {
    const appel = vi.fn();
    const r = regrouper(appel, { calmeMs: CALME, intervalleMs: INTERVALLE });
    const instants: number[] = [];
    appel.mockImplementation(() => instants.push(Date.now()));
    // 63 événements, soit ~60 s de rafale — 63 rechargements avant.
    for (let t = 0; t <= 60_000; t += 960) {
      vi.setSystemTime(t);
      vi.advanceTimersByTime(0);
      r.signaler();
      vi.advanceTimersByTime(959);
    }
    vi.advanceTimersByTime(INTERVALLE * 2);
    expect(appel.mock.calls.length).toBeLessThanOrEqual(7);
    expect(appel.mock.calls.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < instants.length; i++) {
      expect(instants[i] - instants[i - 1], `écart ${i}`).toBeGreaterThanOrEqual(INTERVALLE);
    }
    // Le dernier appel suit la FIN de la rafale : rien de la rafale n'est perdu.
    expect(instants.at(-1)!).toBeGreaterThanOrEqual(60_000);
  });

  it('deux signaux espacés de plus que l’intervalle donnent deux appels', () => {
    const appel = vi.fn();
    const r = regrouper(appel, { calmeMs: CALME, intervalleMs: INTERVALLE });
    r.signaler();
    vi.advanceTimersByTime(INTERVALLE + CALME);
    r.signaler();
    vi.advanceTimersByTime(CALME);
    expect(appel).toHaveBeenCalledTimes(2);
  });

  it('page masquée : rien ne part ; au retour, un seul appel', () => {
    const appel = vi.fn();
    const r = regrouper(appel, { calmeMs: CALME, intervalleMs: INTERVALLE });
    visibilite = 'hidden';
    for (let i = 0; i < 20; i++) { r.signaler(); vi.advanceTimersByTime(960); }
    vi.advanceTimersByTime(INTERVALLE * 3);
    expect(appel).not.toHaveBeenCalled();
    visibilite = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(0);
    expect(appel).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(INTERVALLE * 3);
    expect(appel).toHaveBeenCalledTimes(1);
  });

  it('arrêté, plus rien ne part', () => {
    const appel = vi.fn();
    const r = regrouper(appel, { calmeMs: CALME, intervalleMs: INTERVALLE });
    r.signaler();
    r.arreter();
    vi.advanceTimersByTime(INTERVALLE * 3);
    expect(appel).not.toHaveBeenCalled();
  });
});

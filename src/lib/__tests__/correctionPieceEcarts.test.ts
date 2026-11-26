/**
 * Retour de Didier (rc13.90) — l'écran dit les écarts que la correction
 * laisse, et pourquoi ; la limite haute se règle jusqu'à 1 kHz (GO rc13.91).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ecartsNonCorriges, proposerJusqua, enregistrerJusqua, limiteDePlace } from '../correctionPieceEcarts';
import type { Proposition } from '../correctionPiece';
import * as api from '../api';

/** Une proposition sur grille log 20 Hz–2 kHz, cible plate à 0 dB. */
function proposition(corrigee: (f: number) => number, zone: [number, number] = [20, 300]): Proposition {
  const freqs = Array.from({ length: 160 }, (_, i) => 20 * 2 ** (i / 24));
  return {
    id: 'm1', zone_id: 1, bandes: [], zone_hz: zone, pic_avant_db: 0, pic_apres_db: 0, avertissements: [],
    courbes: { freqs_hz: freqs, mesure_db: freqs.map(corrigee), cible_db: freqs.map(() => 0), corrigee_db: freqs.map(corrigee) },
  };
}
const bosse = (f: number, f0: number, db: number) => db * Math.exp(-((Math.log2(f / f0) * 4) ** 2));

describe('écarts que la correction laisse', () => {
  it('nomme un creux, une bosse hors zone, une bosse restante dans la zone', () => {
    const p = proposition((f) => bosse(f, 90, -8) + bosse(f, 420, 6) + bosse(f, 50, 4));
    const e = ecartsNonCorriges(p);
    const a = (f: number) => e.find((x) => Math.abs(Math.log2(x.freq_hz / f)) < 0.1);
    expect(a(90)?.raison).toBe('creux');
    expect(a(420)?.raison).toBe('hors_zone');
    expect(a(50)?.raison).toBe('limite');
    expect(a(420)!.ecart_db).toBeGreaterThan(5);
  });

  it('ignore les petits écarts et ce qui passe 1 kHz', () => {
    const p = proposition((f) => bosse(f, 150, 2) + bosse(f, 1600, 9));
    expect(ecartsNonCorriges(p)).toEqual([]);
  });

  it('avec la limite à 1 kHz, la bosse de 420 Hz est dans la zone', () => {
    const p = proposition((f) => bosse(f, 420, 6), [20, 1000]);
    expect(ecartsNonCorriges(p)[0].raison).toBe('limite');
  });
});

describe('limite haute (GO rc13.91)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('envoie f_max_hz seulement si elle est choisie, à la proposition comme au profil', async () => {
    const f = vi.spyOn(api, 'fetchJSON').mockResolvedValue({} as never);
    await proposerJusqua('mesures', 'm1', 'plate', null);
    await proposerJusqua('sessions', 's1', 'harman', 1000);
    await enregistrerJusqua('sessions', 's1', 'harman', 1000);
    const corps = f.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)));
    expect(corps[0]).toEqual({ cible: { type: 'plate' } });
    expect(corps[1]).toEqual({ cible: { type: 'harman' }, f_max_hz: 1000 });
    expect(String(f.mock.calls[2][0])).toMatch(/\/sessions\/s1\/correction\/profil$/);
    expect(corps[2]).toEqual(corps[1]);
  });

  it('la correction ne vaut que pour la place au-delà de 300 Hz en un point, 500 Hz en moyenne', () => {
    expect(limiteDePlace('une')).toBe(300);
    expect(limiteDePlace('plusieurs')).toBe(500);
  });
});

import { describe, expect, it } from 'vitest';
import {
  WAVE_FLOOR_DB,
  WAVE_HISTORY_SLOTS,
  WAVE_SLOT_MS,
  WaveformHistory,
  peakDbToAmplitude,
} from './waveformHistory';

describe('peakDbToAmplitude', () => {
  it('mappe la pleine échelle numérique sur 1', () => {
    expect(peakDbToAmplitude(0)).toBe(1);
  });

  it('mappe le plancher et tout ce qui est dessous sur 0', () => {
    expect(peakDbToAmplitude(WAVE_FLOOR_DB)).toBe(0);
    expect(peakDbToAmplitude(WAVE_FLOOR_DB - 20)).toBe(0);
    expect(peakDbToAmplitude(-96)).toBe(0);
  });

  it('est linéaire en décibels entre le plancher et 0 dBFS', () => {
    // Mi-chemin en dB (−30 dBFS sur une échelle −60…0) → mi-hauteur.
    expect(peakDbToAmplitude(WAVE_FLOOR_DB / 2)).toBeCloseTo(0.5, 6);
  });

  it('écrête au-dessus de 0 dBFS au lieu de dépasser le cadre', () => {
    expect(peakDbToAmplitude(6)).toBe(1);
  });

  it('traite une valeur non finie comme du silence', () => {
    expect(peakDbToAmplitude(Number.NaN)).toBe(0);
    expect(peakDbToAmplitude(-Infinity)).toBe(0);
  });
});

describe('WaveformHistory', () => {
  it("démarre vide — sans donnée, le mode ne dessine RIEN plutôt qu'un faux", () => {
    const h = new WaveformHistory();
    expect(h.length).toBe(0);
    expect(h.samples()).toEqual([]);
  });

  it('empile les crêtes reçues dans l’ordre chronologique (la plus ancienne en tête)', () => {
    const h = new WaveformHistory();
    h.push(0, 0); // pleine échelle
    h.push(WAVE_FLOOR_DB / 2, WAVE_FLOOR_DB / 2); // mi-hauteur
    h.push(WAVE_FLOOR_DB, WAVE_FLOOR_DB); // silence

    const s = h.samples();
    expect(s.length).toBe(3);
    expect(s[0].left).toBeCloseTo(1, 6);
    expect(s[1].left).toBeCloseTo(0.5, 6);
    expect(s[2].left).toBeCloseTo(0, 6);
  });

  it('conserve la dissymétrie gauche/droite — un vrai stéréo, pas un miroir', () => {
    const h = new WaveformHistory();
    h.push(0, WAVE_FLOOR_DB);
    const [s] = h.samples();
    expect(s.left).toBeCloseTo(1, 6);
    expect(s.right).toBeCloseTo(0, 6);
  });

  it('reste borné : au-delà de la capacité, la plus ancienne crête sort', () => {
    const h = new WaveformHistory();
    const total = WAVE_HISTORY_SLOTS + 50;
    for (let i = 0; i < total; i++) {
      // Marqueur croissant décodable : −60 + i/total * 60.
      h.push(WAVE_FLOOR_DB + (i / total) * -WAVE_FLOOR_DB, WAVE_FLOOR_DB);
    }
    expect(h.length).toBe(WAVE_HISTORY_SLOTS);

    const s = h.samples();
    // La fenêtre retenue est la PLUS RÉCENTE : elle se termine sur la
    // dernière crête poussée, pas sur une valeur du début.
    const lastDb = WAVE_FLOOR_DB + ((total - 1) / total) * -WAVE_FLOOR_DB;
    expect(s[s.length - 1].left).toBeCloseTo(peakDbToAmplitude(lastDb), 6);
    // …et elle est strictement croissante : aucune trame n'a été réordonnée.
    for (let i = 1; i < s.length; i++) {
      expect(s[i].left).toBeGreaterThan(s[i - 1].left);
    }
  });

  it('se vide sur clear — changement de piste ou de zone', () => {
    const h = new WaveformHistory();
    h.push(0, 0);
    h.clear();
    expect(h.length).toBe(0);
    expect(h.samples()).toEqual([]);
  });

  it('est DÉTERMINISTE : deux historiques nourris à l’identique tracent la même chose', () => {
    // C'est le cœur de #2182. L'ancien mode intercalait `Math.random()` et une
    // phase tirée de `performance.now()` : deux lectures du MÊME passage
    // donnaient deux tracés différents. Un instrument ne fait pas ça.
    const dbs = [-3, -12, -40, -6, -55, -21, 0, -33];
    const a = new WaveformHistory();
    const b = new WaveformHistory();
    for (const db of dbs) {
      a.push(db, db - 2);
      b.push(db, db - 2);
    }
    expect(a.samples()).toEqual(b.samples());
  });

  it('rend un silence PLAT — aucune ondulation inventée sous le plancher', () => {
    const h = new WaveformHistory();
    for (let i = 0; i < 40; i++) h.push(-96, -96);
    for (const s of h.samples()) {
      expect(s.left).toBe(0);
      expect(s.right).toBe(0);
    }
  });

  it('déclare la cadence réelle du serveur (fenêtre de 40 ms, ~25 trames/s)', () => {
    // tune-core/src/audio/tap.rs:341 — `window: Duration::from_millis(40)`.
    expect(WAVE_SLOT_MS).toBe(40);
    // Le tampon doit couvrir quelques secondes, pas la piste entière.
    const spanSeconds = (WAVE_HISTORY_SLOTS * WAVE_SLOT_MS) / 1000;
    expect(spanSeconds).toBeGreaterThanOrEqual(4);
    expect(spanSeconds).toBeLessThanOrEqual(10);
  });
});

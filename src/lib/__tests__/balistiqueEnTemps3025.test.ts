/**
 * Fil 3025 (François Mercier, 25/11/2026) — aiguilles et spectre « un peu en
 * retard » sur le son. La balistique se comptait en IMAGES : 533 ms de montée
 * et 1,84 s de retombée pour l'aiguille à 30 i/s, le double à 15 i/s. Elle se
 * compte désormais en TEMPS, sur la norme du VU : 99 % en 300 ms.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CHUTE_REPERE_CRETE_DB_PAR_S,
  TAU_SPECTRE_ATTAQUE_MS,
  TAU_SPECTRE_RETOMBEE_MS,
  TAU_VU_MS,
  TEMPS_D_INTEGRATION_VU_MS,
  ecartDImage,
  lisser,
  partParcourue,
} from '../balistique';
import { avancerAiguille } from '../dessinVuMetre';

/** Fait tourner l'aiguille `dureeMs` à `ips` images par seconde. */
function aiguilleApres(depart: number, cible: number, dureeMs: number, ips: number): number {
  const pas = 1000 / ips;
  let a = depart;
  let t = 0;
  while (t + pas <= dureeMs + 1e-9) {
    a = avancerAiguille(a, cible, false, pas);
    t += pas;
  }
  return a;
}

/** Part du chemin parcourue de `depart` vers `cible`. */
const part = (depart: number, cible: number, valeur: number) => (valeur - depart) / (cible - depart);

describe('balistique du VU — 99 % en 300 ms (IEC 60268-17)', () => {
  it('la constante de temps rend 99 % au temps d’intégration', () => {
    expect(TEMPS_D_INTEGRATION_VU_MS).toBe(300);
    expect(partParcourue(TEMPS_D_INTEGRATION_VU_MS, TAU_VU_MS)).toBeCloseTo(0.99, 6);
  });

  // 300 ms tombent sur une image à ces cadences ; 15 i/s est vérifié à 400 ms.
  for (const ips of [20, 30, 60, 120]) {
    it(`à ${ips} i/s, l’aiguille monte à 99 % en 300 ms`, () => {
      const a = aiguilleApres(-40, -10, 300, ips);
      expect(part(-40, -10, a)).toBeCloseTo(0.99, 2);
    });

    it(`à ${ips} i/s, l’aiguille RETOMBE à 99 % en 300 ms (et non 1,84 s)`, () => {
      const a = aiguilleApres(-10, -40, 300, ips);
      expect(part(-10, -40, a)).toBeCloseTo(0.99, 2);
    });
  }

  it('à 15 i/s, la réponse est celle du temps écoulé, pas du nombre d’images', () => {
    const a = aiguilleApres(-40, -10, 400, 15);
    expect(part(-40, -10, a)).toBeCloseTo(partParcourue(400, TAU_VU_MS), 9);
  });

  it('à 100 ms, la montée n’est ni instantanée ni traînante (≈ 79 %)', () => {
    const p = part(-40, -10, aiguilleApres(-40, -10, 100, 30));
    expect(p).toBeGreaterThan(0.75);
    expect(p).toBeLessThan(0.82);
  });

  it('l’ancienne balistique par image, à 30 i/s, restait à 53 % de la retombée après 300 ms', () => {
    // Témoin du défaut : 1 − 0,92^9.
    let a = -10;
    for (let i = 0; i < 9; i++) a = a + (-40 - a) * 0.08;
    expect(part(-10, -40, a)).toBeLessThan(0.55);
    expect(part(-10, -40, aiguilleApres(-10, -40, 300, 30))).toBeGreaterThan(0.98);
  });

  it('un écart nul ne fait rien bouger, un très long mène à la cible', () => {
    expect(avancerAiguille(-40, -10, false, 0)).toBe(-40);
    expect(avancerAiguille(-40, -10, false, 10_000)).toBeCloseTo(-10, 6);
  });
});

describe('écart d’image', () => {
  it('première image, horloge recalée ou non finie : 0', () => {
    expect(ecartDImage(null, 1000)).toBe(0);
    expect(ecartDImage(1000, 900)).toBe(0);
    expect(ecartDImage(1000, Number.NaN)).toBe(0);
  });
  it('sinon, l’écart en ms', () => {
    expect(ecartDImage(1000, 1033.3)).toBeCloseTo(33.3, 6);
  });
});

describe('balistique du spectre', () => {
  const apres = (depart: number, cible: number, dureeMs: number, ips: number) => {
    let v = depart;
    const pas = 1000 / ips;
    for (let t = pas; t <= dureeMs + 1e-9; t += pas) {
      v = lisser(v, cible, pas, TAU_SPECTRE_ATTAQUE_MS, TAU_SPECTRE_RETOMBEE_MS);
    }
    return v;
  };

  for (const ips of [15, 30, 60]) {
    it(`à ${ips} i/s, une barre monte à 90 % en ~60 ms, quelle que soit la cadence`, () => {
      const pas = 1000 / ips;
      const duree = Math.ceil(60 / pas) * pas;
      expect(apres(0, 1, duree, ips)).toBeCloseTo(partParcourue(duree, TAU_SPECTRE_ATTAQUE_MS), 6);
      expect(partParcourue(60, TAU_SPECTRE_ATTAQUE_MS)).toBeGreaterThan(0.9);
    });

    it(`à ${ips} i/s, une barre retombe de 90 % en ~250 ms, pas 600 ms`, () => {
      const v = apres(1, 0, 600, ips);
      expect(v).toBeLessThan(0.01);
      expect(partParcourue(250, TAU_SPECTRE_RETOMBEE_MS)).toBeGreaterThan(0.89);
    });
  }
});

describe('les surfaces passent par la balistique en temps', () => {
  const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

  it('le spectre n’a plus de coefficient par image', () => {
    const src = lire('src/components/partages/AudioVisualizer.svelte');
    expect(src).not.toMatch(/const ATTACK = /);
    expect(src).not.toMatch(/const DECAY = /);
    expect(src).toContain('TAU_SPECTRE_RETOMBEE_MS');
  });

  it('le bargraphe du Grand écran suit le VU et compte son témoin en ms', () => {
    const src = lire('src/components/v2-heritage/TvVuBars.svelte');
    expect(src).toContain('TAU_VU_MS');
    expect(src).toContain('MAINTIEN_CRETE_MS');
    expect(src).not.toContain('peakHold[ch] = 45');
    expect(CHUTE_REPERE_CRETE_DB_PAR_S).toBe(21);
  });
});

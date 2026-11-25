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
  PLAFOND_ECART_MS,
  TAU_CRETE_SPECTRE_MS,
  TAU_SPECTRE_ARRET_MS,
  amortir,
  horlogeDImage,
  suivreRepereDeCrete,
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
  it('plafonné à 100 ms : un onglet rendu après 10 s ne fait pas sauter les instruments', () => {
    expect(PLAFOND_ECART_MS).toBe(100);
    expect(ecartDImage(1000, 11_000)).toBe(100);
    // L'aiguille fait au plus le chemin d'une image à 10 i/s (~79 %), pas 100 %.
    const a = avancerAiguille(-40, -10, false, ecartDImage(1000, 11_000));
    expect(part(-40, -10, a)).toBeLessThan(0.8);
  });
});

describe('garage puis reprise de la boucle (VuMetreCanal)', () => {
  it('après 1 h à l’arrêt, l’aiguille repart de la butée et MONTE en 300 ms', () => {
    const horloge = horlogeDImage();
    let aiguille = -40;
    let t = 0;
    // Lecture, puis dernière image avant garage, puis l'oubli — dans cet ordre.
    for (let i = 0; i < 30; i++) aiguille = avancerAiguille(aiguille, -40, false, horloge.ecart((t += 33.3)));
    horloge.oublier();
    // Reprise une heure plus tard, niveau à −10 dB.
    t += 3_600_000;
    aiguille = avancerAiguille(aiguille, -10, false, horloge.ecart(t));
    expect(aiguille).toBe(-40); // première image : écart nul, pas de saut
    const debut = t;
    while (t - debut < 300 - 1e-6) {
      t += 1000 / 30;
      aiguille = avancerAiguille(aiguille, -10, false, horloge.ecart(t));
    }
    expect(part(-40, -10, aiguille)).toBeCloseTo(0.99, 2);
  });

  it('un oubli placé AVANT la dernière image serait réécrit (le défaut relu)', () => {
    const horloge = horlogeDImage();
    horloge.ecart(0);
    horloge.oublier();
    horloge.ecart(33); // la dernière image dessinée relève l'horloge
    expect(horloge.ecart(3_600_000)).toBe(PLAFOND_ECART_MS);
  });

  it('le composant oublie l’horloge APRÈS la dernière image', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/partages/VuMetreCanal.svelte'), 'utf-8');
    const garage = src.slice(src.indexOf('if (auRepos(maintenant))'));
    const iDessin = garage.indexOf('dessiner(ctx');
    const iOubli = garage.indexOf('horloge.oublier()');
    expect(iDessin).toBeGreaterThan(-1);
    expect(iOubli).toBeGreaterThan(iDessin);
  });
});

describe('repère de crête du bargraphe : 21 dB/s', () => {
  for (const ips of [15, 30, 60, 120]) {
    it(`à ${ips} i/s, il perd 21 dB en 1 s`, () => {
      let r = -3;
      for (let i = 0; i < ips; i++) r = suivreRepereDeCrete(r, -60, -60, 1000 / ips);
      expect(r).toBeCloseTo(-3 - CHUTE_REPERE_CRETE_DB_PAR_S, 6);
      expect(CHUTE_REPERE_CRETE_DB_PAR_S).toBe(21);
    });
  }
  it('saute sur une crête plus haute, et ne passe pas sous le plancher', () => {
    expect(suivreRepereDeCrete(-20, -6, -60, 33)).toBe(-6);
    expect(suivreRepereDeCrete(-59.5, -70, -60, 100)).toBe(-60);
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

    it(`à ${ips} i/s, une barre retombe de 90 % en 250 ms simulées, pas 600 ms`, () => {
      // Simulé image par image ; la première image à 250 ms ou après (266,7 ms
      // à 15 i/s) montre la barre retombée de plus de 90 %, et sa hauteur ne
      // dépend que du temps écoulé.
      const pas = 1000 / ips;
      const duree = Math.ceil(250 / pas - 1e-9) * pas;
      const v = apres(1, 0, duree, ips);
      expect(v).toBeLessThan(0.1);
      expect(v).toBeCloseTo(Math.exp(-duree / TAU_SPECTRE_RETOMBEE_MS), 9);
      // Et à 250 ms pile, en temps continu.
      expect(partParcourue(250, TAU_SPECTRE_RETOMBEE_MS)).toBeGreaterThan(0.9);
    });

    it(`à ${ips} i/s, l’extinction à l’arrêt et la chute des crêtes se comptent en temps`, () => {
      const pas = 1000 / ips;
      let barre = 1;
      let crete = 1;
      for (let t = pas; t <= 600 + 1e-9; t += pas) {
        barre = amortir(barre, pas, TAU_SPECTRE_ARRET_MS);
        crete = amortir(crete, pas, TAU_CRETE_SPECTRE_MS);
      }
      const n = Math.floor(600 / pas + 1e-9) * pas;
      expect(barre).toBeCloseTo(Math.exp(-n / TAU_SPECTRE_ARRET_MS), 9);
      expect(crete).toBeCloseTo(Math.exp(-n / TAU_CRETE_SPECTRE_MS), 9);
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
    expect(src).not.toMatch(/PEAK_FALL|decayRate/);
    expect(src).toContain('horlogeSpectre.oublier()');
  });

  it('le bargraphe du Grand écran suit le VU et compte son témoin en ms', () => {
    const src = lire('src/components/v2-heritage/TvVuBars.svelte');
    expect(src).toContain('TAU_VU_MS');
    expect(src).toContain('MAINTIEN_CRETE_MS');
    expect(src).not.toContain('peakHold[ch] = 45');
    expect(src).toContain('suivreRepereDeCrete(');
  });
});

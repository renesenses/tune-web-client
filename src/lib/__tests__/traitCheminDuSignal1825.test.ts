/**
 * Fil 1825 (Jean Valjean) — « Deux affichages différents pour la même
 * indication » : une seule règle pour les étapes et les traits du chemin du
 * signal, lue par la barre de lecture ET par Lecture en cours.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { etapeIntacte, traitIntact } from '../formatInconnu';

const etapes = [
  { bit_perfect: true },
  { bit_perfect: false },
  { bit_perfect: true },
  {},
];

describe('etapeIntacte / traitIntact', () => {
  it('l’étape lit son propre drapeau, le verdict global n’est qu’un repli', () => {
    expect(etapeIntacte({ bit_perfect: true }, false)).toBe(true);
    expect(etapeIntacte({ bit_perfect: false }, true)).toBe(false);
    expect(etapeIntacte({}, true)).toBe(true);
    expect(etapeIntacte(undefined, false)).toBe(false);
  });

  it('un trait n’est intact que si ses deux extrémités le sont', () => {
    expect(traitIntact(etapes, 0, true)).toBe(false); // vers l’étape altérée
    expect(traitIntact(etapes, 1, true)).toBe(false); // depuis l’étape altérée
    expect(traitIntact(etapes, 2, true)).toBe(true); // repli global sur l’étape 3
    expect(traitIntact(etapes, 2, false)).toBe(false);
  });
});

describe('les deux panneaux lisent la même règle', () => {
  const lire = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
  for (const [nom, chemin] of [
    ['barre de lecture', '../../components/partages/TransportBar.svelte'],
    ['Lecture en cours', '../../components/partages/NowPlaying.svelte'],
  ] as const) {
    it(`${nom} : aucune copie locale, le trait passe par traitIntact`, () => {
      const src = lire(chemin);
      expect(src).not.toMatch(/function etapeIntacte\(/);
      expect(src).toMatch(/traitIntact\(zone\.signal_path\.steps, i, zone\.signal_path\.bit_perfect\)/);
    });
  }
});

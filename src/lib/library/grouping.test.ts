import { describe, it, expect } from 'vitest';
import { sectionHeadsForDisc, sectionHeads } from './grouping';
import type { Track } from '../types';

function t(id: number, title: string, grouping?: string | null): Track {
  return { id, title, disc_number: 1, track_number: id, grouping } as Track;
}

describe('sectionHeadsForDisc', () => {
  it('ne pose aucun en-tête quand aucune piste ne porte GROUPING', () => {
    const heads = sectionHeadsForDisc([t(1, 'I'), t(2, 'II'), t(3, 'III')]);
    expect(heads.size).toBe(0);
  });

  it('ne pose aucun en-tête quand une seule valeur couvre tout le disque', () => {
    const heads = sectionHeadsForDisc([
      t(1, 'I', 'Symphonie no 5'),
      t(2, 'II', 'Symphonie no 5'),
      t(3, 'III', 'Symphonie no 5'),
    ]);
    expect(heads.size).toBe(0);
  });

  it('pose un en-tête au début de chaque bloc, et nulle part ailleurs', () => {
    const heads = sectionHeadsForDisc([
      t(1, 'I', 'Symphonie no 5'),
      t(2, 'II', 'Symphonie no 5'),
      t(3, 'Ouverture', 'Bonus'),
      t(4, 'Répétition', 'Bonus'),
    ]);
    expect([...heads.entries()]).toEqual([
      [1, 'Symphonie no 5'],
      [3, 'Bonus'],
    ]);
  });

  it('laisse hors section les pistes sans GROUPING', () => {
    const heads = sectionHeadsForDisc([
      t(1, 'Titre'),
      t(2, 'Titre'),
      t(3, 'Prise alternative', 'Bonus'),
    ]);
    expect([...heads.entries()]).toEqual([[3, 'Bonus']]);
  });

  it('fait deux sections de deux blocs disjoints portant le même libellé', () => {
    const heads = sectionHeadsForDisc([
      t(1, 'a', 'Concert'),
      t(2, 'b', 'Studio'),
      t(3, 'c', 'Concert'),
    ]);
    expect([...heads.entries()]).toEqual([
      [1, 'Concert'],
      [2, 'Studio'],
      [3, 'Concert'],
    ]);
  });

  it("traite une valeur d'espaces comme une absence", () => {
    const heads = sectionHeadsForDisc([t(1, 'a', '   '), t(2, 'b', '  ')]);
    expect(heads.size).toBe(0);
  });

  it('ignore une piste sans identifiant plutôt que de la clefer sur null', () => {
    const sansId = { id: null, title: 'flux', grouping: 'Bonus' } as Track;
    const heads = sectionHeadsForDisc([t(1, 'a'), sansId]);
    expect(heads.size).toBe(0);
  });
});

describe('sectionHeads', () => {
  it("ne laisse jamais une section traverser une frontière de disque", () => {
    const heads = sectionHeads([
      [t(1, 'a', 'Bonus'), t(2, 'b')],
      [t(3, 'c', 'Bonus'), t(4, 'd')],
    ]);
    // Chaque disque redémarre son propre découpage : deux en-têtes, pas un.
    expect([...heads.entries()]).toEqual([
      [1, 'Bonus'],
      [3, 'Bonus'],
    ]);
  });

  it('ne pose rien sur un disque homogène même si le voisin est découpé', () => {
    const heads = sectionHeads([
      [t(1, 'a', 'Bonus'), t(2, 'b')],
      [t(3, 'c', 'Intégrale'), t(4, 'd', 'Intégrale')],
    ]);
    expect([...heads.entries()]).toEqual([[1, 'Bonus']]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  basculerAlbum, dossiersDesPistes, pistesCochees, poserPistes, selectionVide, sourcesDeLaSelection,
} from '../convertisseurPistes';

// tune-server-rust#5483 — choisir les pistes.
describe('dossiersDesPistes', () => {
  it('nomme les disques par ce qui les distingue', () => {
    const d = dossiersDesPistes([
      { id: 1, file_path: '/m/Miles Smiles/CD1/01 - Orbits.dsf' },
      { id: 2, file_path: '/m/Miles Smiles/CD1/02 - Circle.dsf' },
      { id: 3, file_path: '/m/Miles Smiles/CD2/01 - Orbits.dsf' },
    ]);
    expect(d.map((g) => [g.libelle, g.pistes.map((p) => p.id)])).toEqual([['CD1', [1, 2]], ['CD2', [3]]]);
  });
  it('un album d\'un seul dossier n\'a pas d\'intitulé de dossier', () => {
    const d = dossiersDesPistes([{ id: 1, file_path: 'C:\\m\\A\\1.flac' }, { id: 2, file_path: 'C:\\m\\A\\2.flac' }]);
    expect(d).toHaveLength(1);
    expect(d[0].libelle).toBe('');
  });
});

describe('sélection', () => {
  const toutes = [10, 11, 12];
  it('décocher une piste d\'un album entier le rend partiel, envoyé en track_ids', () => {
    let s = basculerAlbum(selectionVide(), 7);
    expect(sourcesDeLaSelection(s)).toEqual([{ album_id: 7 }]);
    const cochees = pistesCochees(s, 7, toutes);
    cochees.delete(11);
    s = poserPistes(s, 7, toutes, cochees);
    expect(sourcesDeLaSelection(s)).toEqual([{ track_id: 10 }, { track_id: 12 }]);
  });
  it('tout recocher redevient l\'album entier ; tout décocher le retire', () => {
    let s = poserPistes(selectionVide(), 7, toutes, new Set([10]));
    s = poserPistes(s, 7, toutes, new Set(toutes));
    expect(sourcesDeLaSelection(s)).toEqual([{ album_id: 7 }]);
    s = poserPistes(s, 7, toutes, new Set());
    expect(sourcesDeLaSelection(s)).toEqual([]);
  });
  it('la carte d\'un album partiel le retire entièrement', () => {
    const s = basculerAlbum(poserPistes(selectionVide(), 7, toutes, new Set([10])), 7);
    expect(sourcesDeLaSelection(s)).toEqual([]);
  });
});

// Fil 2526 (r5yk5) — « Aléatoire » dans les collections et les étiquettes,
// comme dans la Bibliothèque (#4558) : même rang, stable pour une graine.
import { describe, expect, it } from 'vitest';
import { albumsTires, rangAleatoire } from '../shuffle';

const ALBUMS = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, title: `Album ${i + 1}` }));

describe('albumsTires', () => {
  it('garde tous les albums, sans doublon ni perte', () => {
    const t = albumsTires(ALBUMS, 7);
    expect(t).toHaveLength(30);
    expect(new Set(t.map((a) => a.id)).size).toBe(30);
  });
  it('est stable pour une graine et change avec elle', () => {
    expect(albumsTires(ALBUMS, 7).map((a) => a.id)).toEqual(albumsTires(ALBUMS, 7).map((a) => a.id));
    expect(albumsTires(ALBUMS, 7).map((a) => a.id)).not.toEqual(albumsTires(ALBUMS, 8).map((a) => a.id));
  });
  it('ne rend pas l’ordre d’origine', () => {
    expect(albumsTires(ALBUMS, 7).map((a) => a.id)).not.toEqual(ALBUMS.map((a) => a.id));
  });
  it('suit le rang de la Bibliothèque', () => {
    const t = albumsTires(ALBUMS, 7);
    for (let i = 1; i < t.length; i++) {
      expect(rangAleatoire(t[i - 1].id!, 7)).toBeLessThanOrEqual(rangAleatoire(t[i].id!, 7));
    }
  });
  it('un album sans identifiant tire sur son titre, sans planter', () => {
    const t = albumsTires([{ id: null, title: 'B' }, { id: null, title: 'A' }, { id: 3, title: 'C' }], 5);
    expect(t.map((a) => a.title).sort()).toEqual(['A', 'B', 'C']);
  });
  it('ne modifie pas la liste reçue', () => {
    const copie = ALBUMS.map((a) => a.id);
    albumsTires(ALBUMS, 9);
    expect(ALBUMS.map((a) => a.id)).toEqual(copie);
  });
});

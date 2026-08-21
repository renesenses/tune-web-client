import { describe, it, expect, vi, afterEach } from 'vitest';
import { melangee } from './shuffle';

afterEach(() => vi.restoreAllMocks());

describe('melangee', () => {
  it('ne touche pas la liste reçue', () => {
    const l = [1, 2, 3, 4, 5];
    const copie = [...l];
    melangee(l);
    expect(l).toEqual(copie);
  });

  it('garde exactement les mêmes éléments', () => {
    const l = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect([...melangee(l)].sort()).toEqual([...l].sort());
    expect(melangee(l)).toHaveLength(l.length);
  });

  it('supporte le vide et le singleton', () => {
    expect(melangee([])).toEqual([]);
    expect(melangee([42])).toEqual([42]);
  });

  it('permute réellement quand le hasard le demande', () => {
    // Math.random() = 0 fait choisir j = 0 à chaque tour. Sur [1,2,3] :
    //   i=2 → échange a[2] et a[0] → [3,2,1]
    //   i=1 → échange a[1] et a[0] → [2,3,1]
    // Résultat déterministe, et différent de l'entrée.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(melangee([1, 2, 3])).toEqual([2, 3, 1]);
  });

  it("un hasard qui pointe toujours l'élément courant laisse l'ordre intact", () => {
    // Math.random() juste sous 1 fait choisir j = i : chaque élément
    // s'échange avec lui-même. C'est le cas dégénéré, et il ne doit ni
    // dupliquer ni perdre quoi que ce soit.
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(melangee([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });

  it("n'est pas biaisé vers la position d'origine", () => {
    // Le `sort(() => Math.random() - 0.5)` qu'on écrit spontanément laisse le
    // premier élément en tête bien plus souvent qu'un tiers du temps. Fisher-
    // Yates non : sur 3 000 tirages d'une liste de 3, chaque position doit
    // être occupée par « 1 » à peu près un tiers du temps.
    const comptes = [0, 0, 0];
    for (let n = 0; n < 3000; n++) {
      comptes[melangee([1, 2, 3]).indexOf(1)]++;
    }
    for (const c of comptes) {
      expect(c).toBeGreaterThan(3000 / 3 - 150);
      expect(c).toBeLessThan(3000 / 3 + 150);
    }
  });
});

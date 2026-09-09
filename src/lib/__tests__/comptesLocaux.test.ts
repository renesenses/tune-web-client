import { describe, expect, it } from 'vitest';
import { compteLocalAAfficher } from '../comptesLocaux';

describe('compteLocalAAfficher', () => {
  it("rend le compte local quand il differe du total — le cas de Bruno (#2147)", () => {
    expect(compteLocalAAfficher(46847, 46705)).toBe(46705);
  });

  it('se tait sur une bibliotheque purement locale', () => {
    expect(compteLocalAAfficher(17507, 17507)).toBeNull();
  });

  it("se tait quand le serveur ne sert pas la ventilation (champ absent)", () => {
    expect(compteLocalAAfficher(46847, undefined)).toBeNull();
    expect(compteLocalAAfficher(undefined, 46705)).toBeNull();
  });

  it('se tait sur un local superieur au total', () => {
    expect(compteLocalAAfficher(10, 11)).toBeNull();
  });

  it('zero local est une reponse, pas une absence', () => {
    expect(compteLocalAAfficher(120, 0)).toBe(0);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { monterCartesParTrames, trancheAlbums } from './fenetreAlbumsPaginee';

describe('fenêtre bornée des albums #7774', () => {
  it.each([1, 4, 7])('conserve la hauteur et la cible avec %i colonnes, même après Z puis B', colonnes => {
    const total = 6000, pas = 232, espace = 22;
    for (const cible of [0, 2700, 5800, 250, 5999]) {
      const position = Math.floor(cible / colonnes) * pas;
      const t = trancheAlbums(total, position, 800, colonnes, pas, espace);
      expect(t.debut).toBeLessThanOrEqual(cible);
      expect(t.fin).toBeGreaterThan(cible);
      expect(t.fin - t.debut).toBeLessThan(240);
      expect(t.debut % colonnes).toBe(0);
      const lignesMontees = Math.ceil((t.fin - t.debut) / colonnes);
      const cales = Number(t.avant > 0) + Number(t.apres > 0);
      const hauteur = t.avant + t.apres + lignesMontees * (pas - espace)
        + (lignesMontees + cales - 1) * espace;
      expect(hauteur).toBe(Math.ceil(total / colonnes) * pas - espace);
    }
  });

  it('en grille, monte les rangées proches et garde la hauteur des 9 490 albums', () => {
    const tranche = trancheAlbums(9490, 3000, 800, 7, 200, 12, true);
    expect(tranche.fin - tranche.debut).toBe(56); // quatre rangées visibles, deux de chaque côté
    expect(tranche.debut).toBe(13 * 7);
    expect(tranche.avant + tranche.apres + 8 * 200 + 12).toBe(Math.ceil(9490 / 7) * 200 - 12);
  });

  it('fractionne une page, conserve les cartes communes et annule le travail au changement de vue', () => {
    let prochaine: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { prochaine = f; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => { prochaine = undefined; });
    try {
      let rendu = new Set<number>();
      const page = Array.from({ length: 100 }, (_, i) => i + 100);
      const annuler = monterCartesParTrames(page, new Set([98, 99, 100]), c => { rendu = c; });
      expect([...rendu]).toEqual([100, 101, 102, 103, 104]);
      prochaine!(0);
      expect(rendu.size).toBe(9);
      annuler();
      expect(prochaine).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('garde les petites bibliothèques entièrement montées', () => {
    expect(trancheAlbums(60, 200, 800, 4, 232, 22))
      .toEqual({ debut: 0, fin: 60, avant: 0, apres: 0 });
  });
});

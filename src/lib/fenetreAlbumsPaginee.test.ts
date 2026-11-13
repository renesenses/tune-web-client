import { describe, expect, it } from 'vitest';
import { trancheAlbums } from './fenetreAlbumsPaginee';

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

  it('garde les petites bibliothèques entièrement montées', () => {
    expect(trancheAlbums(60, 200, 800, 4, 232, 22))
      .toEqual({ debut: 0, fin: 60, avant: 0, apres: 0 });
  });
});

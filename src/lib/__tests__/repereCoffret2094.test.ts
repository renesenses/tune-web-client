import { describe, it, expect } from 'vitest';
import { finDeDossier } from '../repereCoffret';

/**
 * Fil 2094 — le sélecteur Métadonnées › Coffret montre le DOSSIER de chaque
 * candidat : vingt-sept « Arkhangelsk » identiques s'y distinguent par leur
 * fin de chemin.
 */
describe('finDeDossier', () => {
  it('garde les deux derniers segments, précédés de …', () => {
    expect(finDeDossier('/srv/musique/Arkhangelsk/CD07')).toBe('…/Arkhangelsk/CD07');
    expect(finDeDossier('/srv/musique/Arkhangelsk/CD07/')).toBe('…/Arkhangelsk/CD07');
  });

  it('coupe aussi un chemin Windows', () => {
    expect(finDeDossier('C:\\Musique\\Arkhangelsk\\CD08')).toBe('…/Arkhangelsk/CD08');
  });

  it('un chemin court reste entier', () => {
    expect(finDeDossier('Arkhangelsk/CD01')).toBe('Arkhangelsk/CD01');
    expect(finDeDossier('/CD01')).toBe('CD01');
  });

  it("rien pour un serveur d'avant, qui ne transmet pas le dossier", () => {
    expect(finDeDossier(undefined)).toBeNull();
    expect(finDeDossier(null)).toBeNull();
    expect(finDeDossier('  ')).toBeNull();
  });

  it('deux disques identiques ne se ressemblent plus', () => {
    const a = finDeDossier('/m/Arkhangelsk/CD01');
    const b = finDeDossier('/m/Arkhangelsk/CD02');
    expect(a).not.toBe(b);
  });
});

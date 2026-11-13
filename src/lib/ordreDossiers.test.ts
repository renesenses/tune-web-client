import { describe, expect, it } from 'vitest';
import { cleDossier, dossiersOrdonnes, ordreDeLaReponse } from './ordreDossiers';

describe('tune-server-rust#7876 — ordre des dossiers de musique', () => {
  it("retrouve les dossiers quand l'écriture normalisée diffère (séparateur final)", () => {
    const musicDirs = ['/musique/nas/', '/musique/hires/'];
    // Le serveur rend l'écriture normalisée, la flèche ↓ a été cliquée sur « nas ».
    expect(dossiersOrdonnes(musicDirs, ['/musique/hires', '/musique/nas'])).toEqual([
      '/musique/hires/',
      '/musique/nas/',
    ]);
  });

  it('retrouve les dossiers Windows écrits avec des barres obliques', () => {
    const musicDirs = ['D:/Musique', 'E:/Hires/'];
    expect(dossiersOrdonnes(musicDirs, ['E:\\Hires', 'D:\\Musique'])).toEqual(['E:/Hires/', 'D:/Musique']);
  });

  it("garde à la suite les dossiers que l'ordre ne cite pas, sans doublon", () => {
    expect(dossiersOrdonnes(['/a', '/b', '/c'], ['/c', '/c/', '/inconnu'])).toEqual(['/c', '/a', '/b']);
  });

  it('serveur sans la route : la liste reste telle quelle', () => {
    expect(dossiersOrdonnes(['/a', '/b'], null)).toEqual(['/a', '/b']);
  });

  it('les racines gardent leur séparateur', () => {
    expect(cleDossier('/')).toBe('/');
    expect(cleDossier('C:\\')).toBe('C:');
    expect(cleDossier('C:/')).toBe('C:');
  });

  it('préfère ordre_affiche du serveur, sinon ordre', () => {
    expect(ordreDeLaReponse({ ordre: ['/a'], ordre_affiche: ['/a/'] })).toEqual(['/a/']);
    expect(ordreDeLaReponse({ ordre: ['/a'] })).toEqual(['/a']);
    expect(ordreDeLaReponse({})).toBeNull();
    expect(ordreDeLaReponse(null)).toBeNull();
  });
});

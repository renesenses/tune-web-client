import { describe, it, expect } from 'vitest';
import { parseSmbAddress } from '../smbAddress';

describe('parseSmbAddress', () => {
  it('laisse un hôte seul intact', () => {
    expect(parseSmbAddress('192.168.1.159')).toEqual({ host: '192.168.1.159' });
    expect(parseSmbAddress('nas.local')).toEqual({ host: 'nas.local' });
  });

  it('retire le préfixe UNC', () => {
    expect(parseSmbAddress('\\\\192.168.1.159')).toEqual({ host: '192.168.1.159' });
    expect(parseSmbAddress('//nas.local')).toEqual({ host: 'nas.local' });
  });

  it("sépare le partage de l'hôte", () => {
    expect(parseSmbAddress('\\\\nas\\Musique')).toEqual({ host: 'nas', share: 'Musique' });
  });

  /** Le cas exact de Benjithom : chemin Windows complet collé tel quel. */
  it('découpe un chemin Windows complet, barre oblique finale comprise', () => {
    expect(parseSmbAddress('\\\\192.168.1.159\\344207a4420769c6\\Musique\\')).toEqual({
      host: '192.168.1.159',
      share: '344207a4420769c6',
      path: 'Musique',
    });
  });

  it('accepte un schéma et des séparateurs mélangés', () => {
    expect(parseSmbAddress('smb://nas/Musique\\Albums/2026')).toEqual({
      host: 'nas',
      share: 'Musique',
      path: 'Albums/2026',
    });
  });

  it('ignore les séparateurs superflus', () => {
    expect(parseSmbAddress('  \\\\\\nas//Musique//  ')).toEqual({
      host: 'nas',
      share: 'Musique',
    });
  });

  it('renvoie null quand il ne reste rien', () => {
    expect(parseSmbAddress('')).toBeNull();
    expect(parseSmbAddress('   ')).toBeNull();
    expect(parseSmbAddress('\\\\')).toBeNull();
    expect(parseSmbAddress('smb://')).toBeNull();
  });
});

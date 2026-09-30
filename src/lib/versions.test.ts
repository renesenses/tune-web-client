import { describe, expect, it } from 'vitest';
import { comparerVersions, estPlusRecente, versionDeBase } from './versions';

// Les six cas demandés le 29/09/2026 pour le passage 0.9.169 → 1.0.0-rc1.
describe('estPlusRecente — passage à la 1.0.0-rc1', () => {
  it('0.9.169 → 1.0.0-rc1 : mise à jour proposée', () => {
    expect(estPlusRecente('0.9.169', '1.0.0-rc1')).toBe(true);
  });
  it('1.0.0-rc1 → 1.0.0-rc2 : mise à jour proposée', () => {
    expect(estPlusRecente('1.0.0-rc1', '1.0.0-rc2')).toBe(true);
  });
  it('1.0.0-rc1 → 1.0.0 : la finale passe après sa pré-version', () => {
    expect(estPlusRecente('1.0.0-rc1', '1.0.0')).toBe(true);
  });
  it('1.0.0 → 1.0.1 : mise à jour proposée', () => {
    expect(estPlusRecente('1.0.0', '1.0.1')).toBe(true);
  });
  it('égalité : rien à proposer', () => {
    expect(estPlusRecente('1.0.0-rc1', '1.0.0-rc1')).toBe(false);
    expect(estPlusRecente('1.0.0', 'v1.0.0')).toBe(false);
  });
  it('1.0.0-rc1 → 0.9.169 : jamais de retour en arrière', () => {
    expect(estPlusRecente('1.0.0-rc1', '0.9.169')).toBe(false);
  });
});

describe('comparerVersions — cas de bord', () => {
  it('rc9 < rc10 (ordre numérique du suffixe, comme le serveur)', () => {
    expect(comparerVersions('1.0.0-rc9', '1.0.0-rc10')).toBe(-1);
  });
  it('une finale passe après TOUTES ses pré-versions, jamais après la suivante', () => {
    expect(comparerVersions('1.0.0', '1.0.0-rc2')).toBe(1);
    expect(comparerVersions('1.0.0', '1.0.1-rc1')).toBe(-1);
  });
  it('0.9.99 < 0.9.169 (numérique, pas lexical)', () => {
    expect(comparerVersions('0.9.99', '0.9.169')).toBe(-1);
  });
  it('les métadonnées de build sont ignorées', () => {
    expect(comparerVersions('1.0.0+514', '1.0.0')).toBe(0);
  });
  it('une version illisible ne passe jamais pour plus récente', () => {
    expect(comparerVersions('1.0', '1.0.0')).toBeNull();
    expect(estPlusRecente('0.9.169', 'moissonneur-v1.0.0')).toBe(false);
  });
});

describe('versionDeBase — dérive client/serveur (SettingsV2, clientStale)', () => {
  it('le serveur 1.0.0-rc1 et le client 1.0.0 ont la même base', () => {
    expect(versionDeBase('1.0.0-rc1')).toBe(versionDeBase('1.0.0'));
  });
  it('un client 0.9.169 servi par un serveur rc1 reste une dérive', () => {
    expect(versionDeBase('1.0.0-rc1')).not.toBe(versionDeBase('0.9.169'));
  });
  it('préfixe v et build retirés', () => {
    expect(versionDeBase('v1.0.0-rc0-test')).toBe('1.0.0');
    expect(versionDeBase('1.0.0+7')).toBe('1.0.0');
  });
});

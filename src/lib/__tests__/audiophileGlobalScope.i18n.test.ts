import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as locales from '../locales';

const LANGUES = {
  fr: locales.fr,
  en: locales.en,
  de: locales.de,
  es: locales.es,
  it: locales.it,
  zh: locales.zh,
  ja: locales.ja,
  ko: locales.ko,
  ro: locales.ro,
  sv: locales.sv,
  hu: locales.hu,
} as Record<string, Record<string, string>>;

describe('portée configurable du verrou de volume PURE (#2425, #2526)', () => {
  it('le chemin du signal agit sur la zone courante', () => {
    const transport = readFileSync(
      resolve(__dirname, '../../components/TransportBar.svelte'),
      'utf-8',
    );
    const row = transport.indexOf('<div class="sp-audiophile sp-ap-sub-row">');

    expect(row).toBeGreaterThanOrEqual(0);
    expect(transport.indexOf("$t('audiophile.lockVolumeZone'", row)).toBeGreaterThan(
      row,
    );
    expect(transport.indexOf("$t('audiophile.lockVolumeZoneHelp'", row)).toBeGreaterThan(
      row,
    );
    expect(transport).toContain('setZoneVolumeLock(z.id, enabled, fullVolumeConfirmed)');
  });

  it('les réglages distinguent le défaut global et les trois choix par zone', () => {
    const settings = readFileSync(
      resolve(__dirname, '../../components/SettingsView.svelte'),
      'utf-8',
    );

    expect(settings).toContain("$t('audiophile.lockVolume'");
    expect(settings).toContain("$t('audiophile.lockVolumeHelp'");
    expect(settings).toContain('<option value="inherit">');
    expect(settings).toContain('<option value="on">');
    expect(settings).toContain('<option value="off">');
  });

  for (const [code, dictionnaire] of Object.entries(LANGUES)) {
    it(`${code} distingue le défaut, la zone courante et ses trois choix`, () => {
      const global = dictionnaire['audiophile.lockVolume'];
      const zone = dictionnaire['audiophile.lockVolumeZone'];
      const choix = [
        dictionnaire['audiophile.lockInherit'],
        dictionnaire['audiophile.lockAlways'],
        dictionnaire['audiophile.lockNever'],
      ];

      expect(global.trim()).not.toBe('');
      expect(zone.trim()).not.toBe('');
      expect(global).not.toBe(zone);
      expect(choix.every((libelle) => libelle.trim() !== '')).toBe(true);
      expect(new Set(choix).size).toBe(3);
    });
  }
});

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

const MARQUEUR_GLOBAL: Record<string, RegExp> = {
  fr: /toutes les zones/i,
  en: /all zones/i,
  de: /alle zonen/i,
  es: /todas las zonas/i,
  it: /tutte le zone/i,
  zh: /所有区域/,
  ja: /すべてのゾーン/,
  ko: /모든 존/,
  ro: /toate zonele/i,
  sv: /alla zoner/i,
  hu: /minden zón/i,
};

describe('portée globale du verrou de volume PURE (#2425)', () => {
  it('le panneau du chemin du signal affiche le titre et son aide', () => {
    const transport = readFileSync(
      resolve(__dirname, '../../components/TransportBar.svelte'),
      'utf-8',
    );
    const row = transport.indexOf('<div class="sp-audiophile sp-ap-sub-row">');

    expect(row).toBeGreaterThanOrEqual(0);
    expect(transport.indexOf("$t('audiophile.lockVolume'", row)).toBeGreaterThan(
      row,
    );
    expect(transport.indexOf("$t('audiophile.lockVolumeHelp'", row)).toBeGreaterThan(
      row,
    );
  });

  for (const [code, dictionnaire] of Object.entries(LANGUES)) {
    it(`${code} annonce que le réglage vaut pour toutes les zones`, () => {
      const texte = `${dictionnaire['audiophile.lockVolume']} ${
        dictionnaire['audiophile.lockVolumeHelp']
      }`;
      expect(texte).toMatch(MARQUEUR_GLOBAL[code]);
    });
  }
});

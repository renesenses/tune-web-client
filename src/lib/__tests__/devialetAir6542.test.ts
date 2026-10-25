// @vitest-environment jsdom
//
// #6542 — DEVIALET AIR, OPTION EXPÉRIMENTALE.
//
// Décision de Bertrand (19/10) : la sortie Devialet AIR, pour les Devialet
// Expert de première génération (D200, D400…), est livrée en rc7 DÉSACTIVÉE,
// derrière un réglage et un avertissement (protocole reconstitué par
// rétro-ingénierie, ni documenté ni approuvé par Devialet, jamais essayé sur
// un ampli). Le serveur expose `GET/POST /devialet-air/reglages`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as api from '../api';
import { V2_SETTINGS } from '../v2Settings';
import { TYPES_DE_SORTIE } from '../types';
import { zoneTypeLabel } from '../zoneIdentity';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import zh from '../locales/zh';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import hu from '../locales/hu';
import viLocale from '../locales/vi';
import elLocale from '../locales/el';

const LANGUES: Record<string, Record<string, string>> = {
  fr, en, de, es, it: it_, zh, ja, ko, ro, sv, hu, vi: viLocale, el: elLocale,
} as any;

const CLES = [
  'v2.set.devialetAirTitle',
  'v2.set.devialetAirEnable',
  'v2.set.devialetAirWarning',
  'v2.set.devialetAirDiscoveryHint',
  'v2.set.devialetAirSource',
  'v2.set.devialetAirSourceHint',
  'v2.set.devialetAirLimits',
  'v2.set.devialetAirUnavailable',
];

const REGLAGES = {
  enabled: false, experimental: true, source_index: 9, source_index_default: 9,
  source_index_max: 14, volume_ceiling_db: -10, max_sample_rate: 96000,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('#6542 — Devialet AIR expérimental', () => {
  it('🔴 les huit textes existent dans les 13 langues, avec leurs marques', () => {
    for (const [lang, table] of Object.entries(LANGUES)) {
      for (const cle of CLES) {
        expect(table[cle], `${lang} : ${cle}`).toBeTruthy();
      }
      expect(table['v2.set.devialetAirSourceHint'], `${lang} : {n}`).toContain('{n}');
      expect(table['v2.set.devialetAirLimits'], `${lang} : {db}`).toContain('{db}');
      expect(table['v2.set.devialetAirLimits'], `${lang} : {khz}`).toContain('{khz}');
      expect(table['v2.set.devialetAirWarning'], `${lang} nomme Devialet`).toContain('Devialet');
      expect(table['v2.set.devialetAirWarning'], `${lang} nomme le D400`).toContain('D400');
    }
    expect(fr['v2.set.devialetAirTitle']).toBe('Devialet AIR (expérimental)');
  });

  it('🔴 les réglages se lisent et se posent par la route du serveur', async () => {
    const appels: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      appels.push({ url, init });
      return new Response(JSON.stringify({ ...REGLAGES, enabled: true, source_index: 13 }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }));
    const lu = await api.getDevialetAirReglages();
    expect(lu.source_index).toBe(13);
    const pose = await api.setDevialetAirReglages({ enabled: true, source_index: 13 });
    expect(pose.enabled).toBe(true);
    expect(appels).toHaveLength(2);
    expect(appels[0].url).toContain('/devialet-air/reglages');
    expect(appels[1].url).toContain('/devialet-air/reglages');
    expect(appels[1].init?.method).toBe('POST');
    expect(JSON.parse(String(appels[1].init?.body))).toEqual({ enabled: true, source_index: 13 });
  });

  it('🔴 la section existe dans l’onglet Appareils, au niveau intermédiaire', () => {
    const onglet = V2_SETTINGS.find((t) => t.id === 'devices')!;
    const section = onglet.sections.find((s) => s.id === 'devialetAir');
    expect(section, 'section devialetAir absente').toBeDefined();
    expect(section!.min).toBe('intermediate');
    expect((section as any).titleKey).toBe('v2.set.devialetAirTitle');
  });

  it('🔴 l’écran des Réglages porte l’interrupteur, l’avertissement et le choix de source', () => {
    const src = readFileSync(resolve(__dirname, '../../components/v2/SettingsV2.svelte'), 'utf8');
    expect(src).toContain("s.id === 'devialetAir'");
    for (const cle of CLES.filter((c) => c !== 'v2.set.devialetAirTitle')) {
      expect(src, cle).toContain(`$t('${cle}'`);
    }
    expect(src).toContain('api.getDevialetAirReglages()');
    expect(src).toContain('api.setDevialetAirReglages(');
    expect(src).toContain('reglerDevialetAir({ enabled:');
    expect(src).toContain('reglerDevialetAir({ source_index:');
  });

  it('🔴 le type de sortie est connu et nommé', () => {
    expect(TYPES_DE_SORTIE).toContain('devialet_air');
    expect(zoneTypeLabel('devialet_air')).toBe('Devialet AIR');
  });
});

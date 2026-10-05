/**
 * tune-server-rust#5792 (fil 2148) — le délai de relecture des partages
 * réseau : réglage serveur en secondes, montré en minutes, borné par le
 * serveur, et caché si le serveur ne le connaît pas.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CLE_SONDE_RESEAU,
  bornerSondeReseau,
  bornesSondeReseau,
  lireSondeReseau,
  versPatchSondeReseau,
} from '../sondeReseau';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import hu from '../locales/hu';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

const CATALOGUES: Record<string, Record<string, string>> = {
  fr, en, de, es, it: it_, hu, ja, ko, ro, sv, zh,
} as unknown as Record<string, Record<string, string>>;

const publie = {
  network_poll_interval_secs: 300,
  network_poll_interval_secs_min: 60,
  network_poll_interval_secs_max: 3600,
};

describe('délai de relecture des partages réseau (#5792)', () => {
  it('se lit en minutes, avec les bornes du serveur', () => {
    const bornes = bornesSondeReseau(publie);
    expect(bornes).toEqual({ min: 1, max: 60 });
    expect(lireSondeReseau(publie, bornes)).toBe(5);
  });

  it("n'existe pas pour un serveur qui ne publie pas la clé", () => {
    expect(lireSondeReseau({ shuffle_max_tracks: 500 })).toBeNull();
    expect(lireSondeReseau(null)).toBeNull();
  });

  it('part en secondes, bornée, et une saisie vide retombe sur 5 min', () => {
    const bornes = bornesSondeReseau(publie);
    expect(versPatchSondeReseau('10', bornes)).toEqual({ [CLE_SONDE_RESEAU]: 600 });
    expect(versPatchSondeReseau('0', bornes)).toEqual({ [CLE_SONDE_RESEAU]: 60 });
    expect(versPatchSondeReseau('999', bornes)).toEqual({ [CLE_SONDE_RESEAU]: 3600 });
    expect(versPatchSondeReseau('', bornes)).toEqual({ [CLE_SONDE_RESEAU]: 300 });
  });

  it('des bornes serveur qui ne tombent pas sur la minute restent dedans', () => {
    const bornes = bornesSondeReseau({
      ...publie,
      network_poll_interval_secs_min: 90,
      network_poll_interval_secs_max: 1000,
    });
    expect(bornes).toEqual({ min: 2, max: 16 });
    expect(bornerSondeReseau(1, bornes) * 60).toBeGreaterThanOrEqual(90);
    expect(bornerSondeReseau(99, bornes) * 60).toBeLessThanOrEqual(1000);
  });

  it('une valeur publiée en chaîne se lit pareil', () => {
    expect(lireSondeReseau({ ...publie, network_poll_interval_secs: '900' })).toBe(15);
  });
});

describe("l'écran Réglages › Bibliothèque › Dossiers (#5792)", () => {
  it('montre le délai dans la section des dossiers et écrit par versPatchSondeReseau', () => {
    const ecran = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
    const debut = ecran.indexOf("{:else if s.id === 'musicDirs'}");
    const section = ecran.slice(debut, ecran.indexOf('{:else if s.id ===', debut + 10));
    expect(section).toContain("$t('settings.networkPollInterval'");
    expect(section).toContain('setSondeReseau(');
    expect(ecran).toContain('api.updateConfig(versPatchSondeReseau(');
  });

  it('les trois libellés existent dans les 11 langues', () => {
    expect(Object.keys(CATALOGUES)).toHaveLength(11);
    for (const [lg, cat] of Object.entries(CATALOGUES)) {
      expect(cat['settings.networkPollInterval'], lg).toBeTruthy();
      expect(cat['settings.networkPollIntervalHint'], lg).toBeTruthy();
      expect(cat['settings.networkPollIntervalRange'], lg).toContain('{min}');
      expect(cat['settings.networkPollIntervalRange'], lg).toContain('{max}');
    }
  });
});

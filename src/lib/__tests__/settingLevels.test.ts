/**
 * Niveaux d'affichage des réglages (tune-server-rust#1617).
 *
 * Couvre le registre central, la RÈGLE D'OR (un réglage dont la valeur
 * diffère de son défaut reste toujours visible), le compteur « n réglages
 * masqués » et la migration de l'ancien toggle « réglages avancés ».
 */
import { describe, it, expect } from 'vitest';
import {
  SETTING_LEVELS,
  SETTINGS_LEVELS,
  levelRank,
  isSettingVisible,
  isKeyVisible,
  hiddenCountByTab,
  nextLevel,
  isSettingsLevel,
  legacyAdvancedToLevel,
  type SettingKey,
  type SettingsTab,
  type SettingLevelEntry,
} from '../settingLevels';

/** Le registre est figé `as const` : on repasse par le type large pour itérer. */
const ALL_ENTRIES = Object.values(SETTING_LEVELS) as SettingLevelEntry[];

describe('registre des niveaux', () => {
  it('ordonne débutant < intermédiaire < expert', () => {
    expect(SETTINGS_LEVELS).toEqual(['beginner', 'intermediate', 'expert']);
    expect(levelRank('beginner')).toBeLessThan(levelRank('intermediate'));
    expect(levelRank('intermediate')).toBeLessThan(levelRank('expert'));
  });

  it('chaque onglet garde au moins un réglage débutant (aucun onglet ne se vide)', () => {
    const tabs: SettingsTab[] = ['general', 'library', 'services', 'network', 'system'];
    for (const tab of tabs) {
      const beginners = ALL_ENTRIES.filter((e) => e.tab === tab && e.level === 'beginner');
      expect(beginners.length, `onglet ${tab}`).toBeGreaterThan(0);
    }
  });

  it('les niveaux clés de l\'inventaire #1617 sont respectés', () => {
    // Échantillon représentatif : un par niveau et par onglet sensible.
    expect(SETTING_LEVELS['general.theme'].level).toBe('beginner');
    expect(SETTING_LEVELS['general.crossfade'].level).toBe('intermediate');
    expect(SETTING_LEVELS['library.clearLibrary'].level).toBe('expert'); // action destructive
    expect(SETTING_LEVELS['library.discogsToken'].level).toBe('expert');
    expect(SETTING_LEVELS['network.audioBackend'].level).toBe('expert');
    expect(SETTING_LEVELS['network.eqBands'].level).toBe('intermediate');
    expect(SETTING_LEVELS['services.perZoneDsdMode'].level).toBe('expert');
    expect(SETTING_LEVELS['system.databaseMigration'].level).toBe('expert');
    expect(SETTING_LEVELS['system.premiumLicense'].level).toBe('beginner');
  });

  it('les cinq sections de l\'ancien toggle « avancé » sont toutes expert', () => {
    // Absorption de showAdvancedSystem : ce qu'il repliait passe au niveau E.
    for (const key of ['system.dataLocation', 'system.databaseInfo', 'system.libraryImport',
      'system.configExportImport', 'system.exportCsv'] as SettingKey[]) {
      expect(SETTING_LEVELS[key].level, key).toBe('expert');
    }
  });
});

describe('visibilité par niveau', () => {
  it('débutant ne voit que le niveau débutant', () => {
    expect(isSettingVisible('beginner', 'beginner')).toBe(true);
    expect(isSettingVisible('intermediate', 'beginner')).toBe(false);
    expect(isSettingVisible('expert', 'beginner')).toBe(false);
  });

  it('intermédiaire voit débutant + intermédiaire, expert voit tout', () => {
    expect(isSettingVisible('beginner', 'intermediate')).toBe(true);
    expect(isSettingVisible('intermediate', 'intermediate')).toBe(true);
    expect(isSettingVisible('expert', 'intermediate')).toBe(false);
    expect(isSettingVisible('expert', 'expert')).toBe(true);
  });
});

describe('règle d\'or : valeur ≠ défaut ⇒ toujours visible', () => {
  it('un réglage expert MODIFIÉ reste visible au niveau débutant', () => {
    // Le cas d'école du ticket : un mode DSD par zone forcé en natif ne doit
    // jamais disparaître de l'écran, même chez un « débutant ».
    expect(isSettingVisible('expert', 'beginner', true)).toBe(true);
    expect(isKeyVisible('services.perZoneDsdMode', 'beginner', true)).toBe(true);
  });

  it('un réglage intermédiaire MODIFIÉ reste visible au niveau débutant', () => {
    // Crossfade activé ⇒ le toggle (et sa durée) restent visibles partout.
    expect(isKeyVisible('general.crossfade', 'beginner', true)).toBe(true);
  });

  it('le même réglage NON modifié est bien masqué sous son niveau', () => {
    expect(isKeyVisible('services.perZoneDsdMode', 'beginner', false)).toBe(false);
    expect(isKeyVisible('services.perZoneDsdMode', 'intermediate', false)).toBe(false);
    expect(isKeyVisible('general.crossfade', 'beginner', false)).toBe(false);
  });

  it('la règle d\'or ne rétrograde jamais : un réglage débutant modifié reste visible', () => {
    expect(isSettingVisible('beginner', 'beginner', true)).toBe(true);
  });
});

describe('compteur « n réglages masqués »', () => {
  it('expert ne masque rien', () => {
    const counts = hiddenCountByTab('expert');
    for (const tab of Object.keys(counts) as SettingsTab[]) {
      expect(counts[tab], tab).toBe(0);
    }
  });

  it('débutant masque tout ce qui est > débutant (hors sous-réglages)', () => {
    const counts = hiddenCountByTab('beginner');
    const expected: Record<SettingsTab, number> = { general: 0, library: 0, services: 0, network: 0, system: 0 };
    for (const entry of ALL_ENTRIES) {
      if (!entry.sub && entry.level !== 'beginner') expected[entry.tab]++;
    }
    expect(counts).toEqual(expected);
    // Chaque onglet a bien quelque chose à révéler en montant de niveau.
    for (const tab of Object.keys(counts) as SettingsTab[]) {
      expect(counts[tab], tab).toBeGreaterThan(0);
    }
  });

  it('un réglage modifié sort du compte : il est déjà visible (règle d\'or)', () => {
    const base = hiddenCountByTab('beginner');
    const counts = hiddenCountByTab('beginner', (k) => k === 'network.tuneBridge');
    expect(counts.network).toBe(base.network - 1);
    expect(counts.library).toBe(base.library);
  });

  it('un bloc absent du contexte sort du compte (ex. appliance)', () => {
    const base = hiddenCountByTab('beginner');
    const counts = hiddenCountByTab('beginner', () => false, (k) => k !== 'system.dataLocation');
    expect(counts.system).toBe(base.system - 1);
  });

  it('les sous-réglages ne comptent pas (invisibles sans leur parent)', () => {
    expect(SETTING_LEVELS['general.crossfadeDuration'].sub).toBe(true);
    const withSub = hiddenCountByTab('beginner', (k) => k === 'general.crossfadeDuration');
    // Marquer un sous-réglage modifié ne change pas le compte : il n'y est pas.
    expect(withSub).toEqual(hiddenCountByTab('beginner'));
  });
});

describe('niveau supérieur / validation', () => {
  it('nextLevel monte d\'un cran et plafonne à expert', () => {
    expect(nextLevel('beginner')).toBe('intermediate');
    expect(nextLevel('intermediate')).toBe('expert');
    expect(nextLevel('expert')).toBe('expert');
  });

  it('isSettingsLevel rejette les valeurs inconnues', () => {
    expect(isSettingsLevel('beginner')).toBe(true);
    expect(isSettingsLevel('advanced')).toBe(false);
    expect(isSettingsLevel(1)).toBe(false);
    expect(isSettingsLevel(undefined)).toBe(false);
  });
});

describe('migration de l\'ancien toggle « réglages avancés »', () => {
  it('toggle actif (« 1 ») ⇒ niveau expert', () => {
    expect(legacyAdvancedToLevel('1')).toBe('expert');
  });

  it('toggle inactif ou absent ⇒ défaut débutant POUR TOUS (arbitrage 14/08)', () => {
    expect(legacyAdvancedToLevel('0')).toBe('beginner');
    expect(legacyAdvancedToLevel(null)).toBe('beginner');
  });
});

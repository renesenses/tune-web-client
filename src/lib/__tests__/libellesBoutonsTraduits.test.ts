import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import en from '../locales/en';
import fr from '../locales/fr';

// Retour d'Alex Campbell (22/10/2026) : « Activate under Tune Bridge in English
// still reads Activer ». Trois boutons avaient un libellé français en dur.
describe('Boutons Tune Bridge, licence et greffons : libellés traduits', () => {
  const reglages = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
  const greffons = readFileSync('src/components/v2/PluginsV2.svelte', 'utf8');

  it("aucun « Activer », « Désactiver » ou « Installer » en dur", () => {
    expect(reglages).not.toMatch(/: 'Activer'\}|'Désactiver' :/);
    expect(greffons).not.toContain(": 'Installer'}");
  });

  it('les clés existent en anglais et en français', () => {
    const e = en as Record<string, string>, f = fr as Record<string, string>;
    expect(e['v2.lic.activate']).toBe('Activate');
    expect(e['settings.enable']).toBe('Enable');
    expect(e['plugins.install']).toBe('Install');
    expect(f['v2.lic.activate']).toBe('Activer');
    expect(f['plugins.install']).toBe('Installer');
  });
});

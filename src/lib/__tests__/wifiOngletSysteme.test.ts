import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { V2_SETTINGS, ongletDeLaSection, searchSettings } from '../v2Settings';

/**
 * Le Wi-Fi de l'appliance Tune OS quitte l'onglet Audio pour l'onglet Système.
 *
 * Le réseau de la machine n'a rien à voir avec la chaîne audio : rangé dans
 * Audio, l'écran Wi-Fi n'était pas trouvé là où on le cherche. Le déplacement
 * ne doit rien changer d'autre : même niveau d'affichage, même garde
 * « appliance seulement », et une cible qui nomme encore « audio » mène
 * toujours à la section.
 */
const V2 = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
const onglet = (id: string) => V2_SETTINGS.find((t) => t.id === id)!;

describe('Wi-Fi : onglet Système', () => {
  it("la section 'wifi' est dans Système, et nulle part ailleurs", () => {
    const porteurs = V2_SETTINGS.filter((t) => t.sections.some((s) => s.id === 'wifi')).map((t) => t.id);
    expect(porteurs).toEqual(['system']);
    expect(onglet('audio').sections.map((s) => s.id)).not.toContain('wifi');
  });

  it("garde son niveau d'affichage et son titre", () => {
    const wifi = onglet('system').sections.find((s) => s.id === 'wifi')!;
    expect(wifi.min).toBe('expert');
    expect(wifi.titleKey).toBe('settings.applianceWifi');
  });

  it('garde la garde « appliance Tune OS seulement »', () => {
    const debut = V2.indexOf("{:else if s.id === 'wifi'}");
    expect(debut).toBeGreaterThan(-1);
    const bloc = V2.slice(debut, debut + 400);
    expect(bloc).toContain('{#if isAppliance === false}');
    expect(bloc).toContain("settings.wifiApplianceOnly");
  });

  it('une cible restée sur « audio » est redirigée vers Système', () => {
    expect(ongletDeLaSection('audio', 'wifi')).toBe('system');
    expect(ongletDeLaSection('system', 'wifi')).toBe('system');
  });

  it("ne détourne ni une cible juste, ni une cible sans section ou inconnue", () => {
    expect(ongletDeLaSection('library', 'musicDirs')).toBe('library');
    expect(ongletDeLaSection('audio')).toBe('audio');
    expect(ongletDeLaSection('audio', 'sectionInexistante')).toBe('audio');
  });

  it('SettingsV2 applique la redirection à la cible de navigation', () => {
    expect(V2).toContain('tabId = ongletDeLaSection(target.tab, target.section);');
  });

  it('la recherche des réglages mène au Wi-Fi dans Système', () => {
    const hits = searchSettings('wifi', (k) => k);
    const hit = hits.find((h) => h.section.id === 'wifi');
    expect(hit?.tab.id).toBe('system');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { V2_SETTINGS } from '../v2Settings';

/**
 * Appareils ignorés — portés de l'ancienne interface vers les Réglages v2.
 *
 * Deux défauts dans l'interface actuelle, un seul geste pour les deux :
 *
 *  1. la croix d'un appareil réseau appelait `DELETE /devices/{id}`, que la
 *     découverte défait au passage suivant (#1280, « ils réapparaissent
 *     rapidement ») — l'ancienne interface avait été corrigée, pas celle-ci ;
 *  2. aucun écran ne listait les appareils ignorés : un appareil ignoré par
 *     erreur ne revenait plus jamais. La gestion n'existait que dans
 *     `SettingsView.svelte`, que la phase 5 supprime.
 */
const V2 = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');

function corpsDe(nom: string): string {
  const debut = V2.indexOf(`async function ${nom}(`);
  expect(debut, `fonction introuvable : ${nom}`).toBeGreaterThan(-1);
  return V2.slice(debut, V2.indexOf('\n  }\n', debut));
}

function blocDeSection(id: string): string {
  const debut = V2.indexOf(`{:else if s.id === '${id}'}`);
  expect(debut, `aucun rendu pour la section « ${id} »`).toBeGreaterThan(-1);
  return V2.slice(debut, V2.indexOf('{:else if s.id ===', debut + 1));
}

describe('la croix d’un appareil réseau ignore DURABLEMENT', () => {
  it('elle passe par la route `ignore`, plus par la suppression en mémoire', () => {
    const liste = blocDeSection('netDevices');
    expect(liste, 'la croix de la liste des appareils réseau n’appelle pas ignoreDevice').toMatch(
      /class="del"[^>]*onclick=\{\(\) => ignoreDevice\(d\.id, d\.name\)\}/,
    );
    expect(V2, '`DELETE /devices/{id}` est revenu : l’appareil réapparaîtra').not.toContain(
      'api.deleteDevice(',
    );
    expect(corpsDe('ignoreDevice')).toContain('api.ignoreDevice(deviceId)');
  });

  it('la ligne quitte la liste tout de suite, sous ses deux identités', () => {
    expect(corpsDe('ignoreDevice')).toMatch(
      /sansAppareils\(l, \[deviceId, r\.ignored\?\.device_id \?\? ''\]\)/,
    );
  });
});

describe('le geste est réversible : la section « Appareils ignorés »', () => {
  it('existe dans la carte des Réglages, à côté des appareils réseau', () => {
    const audio = V2_SETTINGS.find((t) => t.id === 'audio')!;
    const ids = audio.sections.map((s) => s.id);
    expect(ids).toContain('ignoredDevices');
    expect(ids.indexOf('ignoredDevices')).toBe(ids.indexOf('netDevices') + 1);
  });

  it('liste les appareils ignorés et offre de les rétablir', () => {
    const bloc = blocDeSection('ignoredDevices');
    expect(bloc).toContain('{#each ignoredDevices as d (d.device_id)}');
    expect(bloc).toContain('onclick={() => unignoreDevice(d)}');
    expect(bloc, 'une liste vide doit le dire').toContain("$t('settings.noIgnoredDevices'");
    expect(corpsDe('unignoreDevice')).toContain('api.unignoreDevice(d.device_id)');
  });

  it('la liste est chargée à l’ouverture, et rechargée après chaque geste', () => {
    expect(V2).toMatch(/\$effect\(\(\) => \{ void loadIgnoredDevices\(\); \}\);/);
    expect(corpsDe('ignoreDevice')).toContain('await loadIgnoredDevices()');
    expect(corpsDe('unignoreDevice')).toContain('await loadIgnoredDevices()');
  });
});

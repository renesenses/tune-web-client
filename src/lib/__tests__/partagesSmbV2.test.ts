import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Partages réseau (SMB) — portés de l'ancienne interface vers les Réglages v2.
 *
 * L'assistant SMB (découverte des hôtes, partages, test, montage) n'était
 * ouvert QUE par `SettingsView.svelte`. Dans l'interface actuelle, on ne
 * pouvait déclarer qu'un chemin déjà monté par le système, et l'état réel des
 * partages (#2069) n'était lu nulle part. L'assistant lui-même est gardé par
 * `assistantSmbPartagesDecouverts3637` ; ce fichier garde son BRANCHEMENT.
 */
const V2 = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');

function blocDeSection(id: string): string {
  const debut = V2.indexOf(`{:else if s.id === '${id}'}`);
  expect(debut, `aucun rendu pour la section « ${id} »`).toBeGreaterThan(-1);
  return V2.slice(debut, V2.indexOf('{:else if s.id ===', debut + 1));
}

describe('l’assistant SMB est atteignable depuis les dossiers de musique', () => {
  it('la section ouvre l’assistant', () => {
    expect(blocDeSection('musicDirs')).toContain('onclick={() => (showSmbWizard = true)}');
  });

  it('l’assistant est monté, et un ajout recharge les dossiers ET l’état des partages', () => {
    expect(V2).toContain("import SmbWizard from '../partages/SmbWizard.svelte';");
    const debut = V2.indexOf('{#if showSmbWizard}');
    expect(debut, 'l’assistant n’est monté nulle part').toBeGreaterThan(-1);
    const bloc = V2.slice(debut, V2.indexOf('{/if}', debut));
    expect(bloc).toContain('onClose={() => (showSmbWizard = false)}');
    expect(bloc).toContain('await refreshLibrary()');
    expect(bloc).toContain('await loadSmbMounts()');
  });
});

describe('l’état réel de chaque partage est dit (#2069)', () => {
  it('la liste est chargée à l’ouverture, sans priver la section en cas d’échec', () => {
    expect(V2).toMatch(/\$effect\(\(\) => \{ void loadSmbMounts\(\); \}\);/);
    expect(V2).toMatch(/try \{ smbMounts = await api\.listSmbMounts\(\); \} catch \{ smbMounts = \[\]; \}/);
  });

  it('chaque partage dit s’il est monté, sa cause d’échec, et un repli SMB 1', () => {
    const bloc = blocDeSection('musicDirs');
    expect(bloc).toContain('{@const e = etatPartage(m)}');
    expect(bloc).toContain("e.enEchec ? $t('settings.smbNotMounted'");
    expect(bloc, 'la cause rendue par mount.cifs n’est pas affichée').toContain('{#if e.cause}');
    expect(bloc).toContain('e.signalerSmb1');
  });
});

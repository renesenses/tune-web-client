import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Base de données — sauvegardes, export/import, index de recherche, portés de
 * l'ancienne interface vers la section « Base » des Réglages v2.
 *
 * 🔴 La restauration n'a JAMAIS été atteignable : `MetadataView` définissait
 * `restoreBackup`, aucun bouton ne l'appelait. On créait des sauvegardes qu'on
 * ne pouvait pas rendre. Le premier test l'exige d'un BOUTON, pas d'une
 * fonction.
 */
const V2 = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');

function blocDeSection(id: string): string {
  const debut = V2.indexOf(`{:else if s.id === '${id}'}`);
  expect(debut, `aucun rendu pour la section « ${id} »`).toBeGreaterThan(-1);
  return V2.slice(debut, V2.indexOf('{:else if s.id ===', debut + 1));
}
function corpsDe(nom: string): string {
  const debut = V2.indexOf(`async function ${nom}(`);
  expect(debut, `fonction introuvable : ${nom}`).toBeGreaterThan(-1);
  return V2.slice(debut, V2.indexOf('\n  }\n', debut));
}

describe('sauvegardes : créer, lister, RESTAURER', () => {
  it('🔴 chaque sauvegarde listée porte un bouton qui la restaure', () => {
    const bloc = blocDeSection('database');
    expect(bloc).toContain('{#each backups as b (b.filename)}');
    expect(bloc, 'aucun bouton n’appelle restoreBackup : la sauvegarde ne se rend pas').toContain(
      'onclick={() => restoreBackup(b.filename)}',
    );
    expect(bloc).toContain("$t('maintenance.noBackups'");
  });

  it('restaurer remplace la base : la confirmation est exigée, et marquée dangereuse', () => {
    const corps = corpsDe('restoreBackup');
    expect(corps.indexOf('dialogs.confirm(')).toBeGreaterThan(-1);
    expect(corps.indexOf('dialogs.confirm(')).toBeLessThan(corps.indexOf('api.restoreBackup('));
    expect(corps).toContain('{ danger: true }');
  });

  it('créer une sauvegarde recharge la liste, et la liste est lue à l’ouverture', () => {
    expect(blocDeSection('database')).toContain('onclick={createBackup}');
    expect(corpsDe('createBackup')).toContain('await loadBackups()');
    expect(V2).toMatch(/\$effect\(\(\) => \{ void loadBackups\(\); \}\);/);
  });
});

describe('export / import de la base, index de recherche', () => {
  it('l’export et l’import sont offerts', () => {
    const bloc = blocDeSection('database');
    expect(bloc).toContain('onclick={exportDatabase}');
    expect(bloc).toContain('onchange={onDbImportFile}');
    expect(V2).toContain('window.location.href = api.exportDatabaseUrl();');
  });

  it('importer écrase la base : confirmation dangereuse AVANT l’envoi', () => {
    const corps = corpsDe('onDbImportFile');
    // `> -1` d'abord : sans confirmation, indexOf vaut -1 et l'ordre seul
    // passerait quand même (défaut trouvé par contre-épreuve le 19/09).
    expect(corps.indexOf('dialogs.confirm('), 'plus de confirmation').toBeGreaterThan(-1);
    expect(corps.indexOf('dialogs.confirm(')).toBeLessThan(corps.indexOf('api.importDatabase('));
    expect(corps).toContain('{ danger: true }');
  });

  it('l’index de recherche se reconstruit, et le résultat est dit', () => {
    expect(blocDeSection('database')).toContain('onclick={rebuildFtsIndex}');
    expect(corpsDe('rebuildFtsIndex')).toContain('api.rebuildFts()');
    expect(blocDeSection('database')).toContain('{#if ftsResult}');
  });
});

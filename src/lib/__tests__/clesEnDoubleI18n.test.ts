import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { clesEnDouble } from '../../../scripts/lib/clesEnDouble.mjs';

/**
 * La garde des clés en double (`check-i18n`), prouvée dans les deux sens :
 * le doublon est SIGNALÉ, une clé unique ne l'est PAS. Puis l'état réel des
 * fichiers de langue : aucun doublon.
 *
 * Origine : #3441 et #3451 ajoutaient toutes deux
 * `tess.reason.not_applied_on_transport`, à des endroits différents ; git
 * fusionnait sans conflit et la clé existait deux fois dans les 20 langues.
 */
describe('clés de langue en double', () => {
  it('signale une clé déclarée deux fois, avec ses lignes', () => {
    const source = [
      'export default {',
      '  "a.b": "un",',
      '  "tess.reason.not_applied_on_transport": "Pas appliqué",',
      '  "c.d": "deux",',
      "  'tess.reason.not_applied_on_transport': 'Ne s’applique pas',",
      '};',
    ].join('\n');
    expect(clesEnDouble(source)).toEqual([
      { cle: 'tess.reason.not_applied_on_transport', lignes: [3, 5] },
    ]);
  });

  it('ne signale rien quand chaque clé est unique', () => {
    expect(clesEnDouble('export default {\n  "a.b": "un",\n  "a.c": "deux",\n};')).toEqual([]);
  });

  it('aucun fichier de src/lib/locales ne déclare une clé deux fois', () => {
    const dossier = resolve(__dirname, '../locales');
    const fichiers = readdirSync(dossier).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    expect(fichiers.length).toBeGreaterThanOrEqual(20);
    const doublons = fichiers.flatMap((f) =>
      clesEnDouble(readFileSync(join(dossier, f), 'utf8')).map((d) => `${f}: ${d.cle} (lignes ${d.lignes.join(', ')})`),
    );
    expect(doublons).toEqual([]);
  });
});

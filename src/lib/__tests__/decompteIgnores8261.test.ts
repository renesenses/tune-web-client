/**
 * tune-server-rust#8261 — jfpaquet (fil 2736, rc11, 742 000 pistes) : « le
 * dernier scan du répertoire que j'ai ajouté indique 63 titres skipped ??
 * Serait-ce possible de savoir lesquels ? et pourquoi. »
 *
 * Le serveur compte ses « ignorés » par motif (`skipped_unchanged`,
 * `skipped_duplicate`, `skipped_no_metadata`, `skipped_unsupported`, rapport
 * de `GET /system/scan/report`), mais seuls doublons, sans métadonnées et
 * formats non pris en charge ont une liste de chemins. Les INCHANGÉS n'en ont
 * pas, et Réglages › Bibliothèque ne lisait aucun de ces quatre nombres :
 * « 63 ignorés » pouvait n'ouvrir aucune liste, ou une liste plus courte,
 * sans rien qui dise d'où venait l'écart.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { aDesEcarts, decompteIgnores } from '../rapportEcartes';

/** Un dossier relu : 63 ignorés, dont 60 inchangés et 3 doublons, sans aucun autre écart. */
const RAPPORT = {
  inserted: 0,
  updated: 0,
  skipped: 63,
  skipped_unchanged: 60,
  skipped_duplicate: 3,
  skipped_no_metadata: 0,
  skipped_unsupported: 0,
  skipped_duplicate_paths: ['/m/a (1).flac (exemplaire de /m/a.flac)', '/m/b (1).flac (exemplaire de /m/b.flac)', '/m/c (1).flac (exemplaire de /m/c.flac)'],
};

describe('#8261 — les ignorés du dernier scan, motif par motif', () => {
  it('🔴 les 63 ignorés se lisent : 60 inchangés (sans liste) et 3 doublons (listés)', () => {
    expect(decompteIgnores(RAPPORT)).toEqual([
      { cle: 'skipped_unchanged', titre: 'v2.scan.skipUnchanged', nombre: 60 },
      { cle: 'skipped_duplicate', titre: 'v2.scan.skipDuplicate', nombre: 3 },
    ]);
    const somme = decompteIgnores(RAPPORT).reduce((n, d) => n + d.nombre, 0);
    expect(somme).toBe(RAPPORT.skipped);
  });

  it('🔴 que des inchangés : la section des écartés reste fermée, le décompte parle quand même', () => {
    const r = { inserted: 0, skipped: 63, skipped_unchanged: 63 };
    expect(aDesEcarts(r)).toBe(false);
    expect(decompteIgnores(r).map((d) => d.cle)).toEqual(['skipped_unchanged']);
  });

  it('rien à dire sur un scan sans ignoré, ou devant un serveur qui ne compte pas', () => {
    expect(decompteIgnores({ inserted: 12, skipped: 0, skipped_unchanged: 0 })).toEqual([]);
    expect(decompteIgnores({})).toEqual([]);
    expect(decompteIgnores(null)).toEqual([]);
    expect(decompteIgnores({ skipped_unchanged: 'oups', skipped_duplicate: -2 })).toEqual([]);
  });

  it("l'écran rend le décompte sous la ligne « Dernière passe », dans les 15 langues", () => {
    const vue = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
    expect(vue).toContain('decompteIgnores(scanReport)');
    expect(vue).toContain('v2.scan.skippedBreakdown');
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu', 'vi', 'el', 'nb', 'pl']) {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      for (const c of ['v2.scan.skipUnchanged', 'v2.scan.skippedBreakdown']) expect(src, `${l} / ${c}`).toContain(`"${c}"`);
    }
  });
});

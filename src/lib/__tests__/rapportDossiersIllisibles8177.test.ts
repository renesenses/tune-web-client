/**
 * tune-server-rust#8177 — macOS rc10, 460 000 pistes : « macOS refuse l'accès
 * à certains dossiers de musique (Operation not permitted), qui sont donc
 * ignorés ». Attendu : « les dossiers refusés par macOS sont signalés
 * clairement ».
 *
 * Le serveur NOMME ces dossiers dans `GET /system/scan/report` :
 * `missing_dir_reasons` / `missing_dirs` pour un emplacement qu'il n'a pas pu
 * ouvrir, `error_dirs` pour un sous-dossier refusé en cours de parcours
 * (tune-core `scanner::walker`). Réglages › Bibliothèque › « Écartés du
 * dernier scan » ne les lisait pas : un rapport qui ne portait QUE des
 * dossiers refusés n'ouvrait même pas la section.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { aDesDossiersIllisibles, aDesEcarts, groupesEcartes } from '../rapportEcartes';

/** La forme du rapport rendu par le serveur pour un sous-dossier refusé par macOS (TCC). */
const RAPPORT_MACOS = {
  inserted: 0,
  updated: 0,
  skipped: 0,
  failed_paths: [],
  missing_dirs: [],
  missing_dir_reasons: [],
  error_dirs: ['/Users/alejandro/Music/Archives'],
};

describe('#8177 — les dossiers refusés apparaissent dans le rapport du scan', () => {
  it('🔴 un rapport qui ne porte que des dossiers refusés ouvre la section', () => {
    expect(aDesEcarts(RAPPORT_MACOS)).toBe(true);
    expect(aDesDossiersIllisibles(RAPPORT_MACOS)).toBe(true);
  });

  it('🔴 le sous-dossier refusé est NOMMÉ, sous son propre titre', () => {
    const g = groupesEcartes(RAPPORT_MACOS);
    expect(g).toEqual([
      { cle: 'error_dirs', titre: 'v2.scan.skipDirUnreadable', chemins: ['/Users/alejandro/Music/Archives'] },
    ]);
  });

  it('un emplacement inaccessible se lit avec son motif, sinon par son seul chemin', () => {
    const motif = '/Volumes/NAS/Musique: accès refusé — …';
    expect(groupesEcartes({ missing_dirs: ['/Volumes/NAS/Musique'], missing_dir_reasons: [motif] })[0])
      .toEqual({ cle: 'missing_dirs', titre: 'v2.scan.skipRootUnreachable', chemins: [motif] });
    // Serveur sans motif : le chemin seul plutôt que rien.
    expect(groupesEcartes({ missing_dirs: ['/Volumes/NAS/Musique'] })[0].chemins).toEqual(['/Volumes/NAS/Musique']);
  });

  it('les dossiers passent EN TÊTE, devant les fichiers écartés', () => {
    const g = groupesEcartes({ ...RAPPORT_MACOS, failed_paths: ['/m/a.flac'], missing_dirs: ['/Volumes/X'] });
    expect(g.map((x) => x.cle)).toEqual(['missing_dirs', 'error_dirs', 'failed_paths']);
  });

  it('un scan propre ne montre toujours rien', () => {
    expect(aDesEcarts({ inserted: 12, skipped: 0, missing_dirs: [], error_dirs: [] })).toBe(false);
    expect(aDesDossiersIllisibles({ failed_paths: ['/m/a.flac'] })).toBe(false);
  });

  it("l'écran dit le geste (accès complet au disque) quand un dossier est refusé", () => {
    const vue = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
    expect(vue).toContain('aDesDossiersIllisibles(scanReport)');
    expect(vue).toContain('v2.scan.dirsUnreadableHint');
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu', 'vi', 'el', 'nb', 'pl']) {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      for (const c of ['v2.scan.skipRootUnreachable', 'v2.scan.skipDirUnreadable', 'v2.scan.dirsUnreadableHint']) {
        expect(src, `${l} / ${c}`).toContain(`"${c}"`);
      }
    }
  });
});

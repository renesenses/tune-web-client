/**
 * #1068 — « des fichiers absents », sans savoir lesquels (Belkadi Yacine,
 * fil 1600).
 *
 * Le serveur les nomme depuis la v0.9.144 et la v0.9.146
 * (tune-server-rust#2060, PR #3666 et #3875). Écrit là-bas, jamais branché
 * ici : `grep -rnE 'cue_sheets|sheets_skipped|skipped_empty_file_paths' src/`
 * rendait 0.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  groupesEcartes,
  motifsDesFeuilles,
  listeTronquee,
  aDesEcarts,
} from '../rapportEcartes';

const RAPPORT = {
  inserted: 12,
  failed_paths: ['/m/a.flac'],
  skipped_empty_file_paths: ['/m/vide.flac', '/m/vide2.flac'],
  cue_sheets_skipped_paths: ['/m/x.cue (cue-image-introuvable)'],
  skipped_no_metadata_paths: [],
  skipped_unsupported_paths: ['/m/lisezmoi.txt'],
  skipped_duplicate_paths: ['/m/copie.flac'],
  skipped_paths_truncated: false,
  cue_sheets: {
    sheets_used: 40,
    sheets_skipped: 130,
    sheets_skipped_by_reason: { 'cue-image-introuvable': 126, 'cue-illisible': 4, 'jamais': 0 },
  },
};

describe('#1068 — les groupes de chemins', () => {
  it('les cinq listes nominatives arrivent, plus les échecs', () => {
    const g = groupesEcartes(RAPPORT);
    expect(g.map((x) => x.cle)).toEqual([
      'failed_paths',
      'skipped_empty_file_paths',
      'cue_sheets_skipped_paths',
      'skipped_unsupported_paths',
      'skipped_duplicate_paths',
    ]);
    expect(g[1].chemins).toHaveLength(2);
  });

  it('🔴 un groupe VIDE ne s\'affiche pas', () => {
    // « 0 fichier de 0 octet » est du bruit dans un rapport qu'on ouvre
    // justement pour trouver quelque chose.
    expect(groupesEcartes(RAPPORT).some((x) => x.cle === 'skipped_no_metadata_paths')).toBe(false);
    expect(groupesEcartes({})).toEqual([]);
    expect(groupesEcartes(null)).toEqual([]);
  });

  it('un champ qui n\'est pas un tableau ne fait pas tomber l\'écran', () => {
    expect(groupesEcartes({ failed_paths: 'oups' })).toEqual([]);
    expect(groupesEcartes({ failed_paths: [null, '', '/ok'] })[0].chemins).toEqual(['/ok']);
  });

  it('chaque groupe porte une clé i18n, jamais un texte', () => {
    for (const g of groupesEcartes(RAPPORT)) expect(g.titre).toMatch(/^v2\.scan\./);
  });
});

describe('#1068 — les motifs des feuilles CUE', () => {
  it('du plus fréquent au moins fréquent, les zéros écartés', () => {
    expect(motifsDesFeuilles(RAPPORT)).toEqual([
      { motif: 'cue-image-introuvable', nombre: 126 },
      { motif: 'cue-illisible', nombre: 4 },
    ]);
  });

  it('rien à dire quand le serveur ne l\'envoie pas', () => {
    expect(motifsDesFeuilles({})).toEqual([]);
    expect(motifsDesFeuilles({ cue_sheets: {} })).toEqual([]);
    expect(motifsDesFeuilles({ cue_sheets: { sheets_skipped_by_reason: [] } })).toEqual([]);
  });
});

describe('#1068 — la liste est un ÉCHANTILLON quand le serveur le dit', () => {
  it('le drapeau est lu tel quel', () => {
    expect(listeTronquee(RAPPORT)).toBe(false);
    expect(listeTronquee({ ...RAPPORT, skipped_paths_truncated: true })).toBe(true);
    // Absent = pas tronqué : un serveur antérieur ne prétend rien.
    expect(listeTronquee({})).toBe(false);
  });
});

describe('#1068 — la section n\'apparaît que s\'il y a quelque chose', () => {
  it('un scan propre ne montre aucune section', () => {
    expect(aDesEcarts({ inserted: 12, skipped: 0 })).toBe(false);
    expect(aDesEcarts(RAPPORT)).toBe(true);
    // Les motifs seuls suffisent, même sans chemin (listes plafonnées à zéro).
    expect(aDesEcarts({ cue_sheets: { sheets_skipped_by_reason: { x: 3 } } })).toBe(true);
  });
});

describe('#1068 — le branchement', () => {
  const vue = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');

  it('l\'écran rend la section, repliée', () => {
    expect(vue).toContain('aDesEcarts(scanReport)');
    expect(vue).toContain('groupesEcartes(scanReport)');
    expect(vue).toContain('motifsDesFeuilles(scanReport)');
    expect(vue).toContain("<details class=\"ecartes\">");
    // 🔴 replié par défaut : pas d'attribut `open`.
    const i = vue.indexOf('<details class="ecartes"');
    expect(vue.slice(i, i + 40)).not.toContain('open');
  });

  it('🔴 il DIT que la liste est un échantillon', () => {
    expect(vue).toContain('listeTronquee(scanReport)');
    expect(vue).toContain('v2.scan.discardedSample');
  });

  it('le type de la réponse porte les champs, y compris le drapeau', () => {
    const api = readFileSync('src/lib/api.ts', 'utf8');
    for (const k of [
      'skipped_empty_file_paths', 'cue_sheets_skipped_paths', 'skipped_paths_truncated',
      'sheets_skipped_by_reason',
    ]) expect(api, k).toContain(k);
  });

  it('les huit clés existent dans les ONZE langues', () => {
    const cles = ['v2.scan.discarded', 'v2.scan.discardedSample', 'v2.scan.skipFailed',
      'v2.scan.skipEmpty', 'v2.scan.skipCue', 'v2.scan.skipNoMeta',
      'v2.scan.skipUnsupported', 'v2.scan.skipDuplicate'];
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu']) {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      for (const c of cles) expect(src, `${l} / ${c}`).toContain(c);
    }
  });
});

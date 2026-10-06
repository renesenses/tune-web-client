import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * tune-server-rust#5593 — exclure une racine de bibliothèque (un NAS, un
 * dossier) des analyses de fond : ReplayGain, plage dynamique, empreintes,
 * CLAP. Le serveur publie `background_analysis_excluded_roots` (un tableau,
 * vide par défaut) et refuse toute autre forme.
 */
const src = fs.readFileSync(
  fileURLToPath(new URL('../../components/v2/SettingsV2.svelte', import.meta.url)),
  'utf-8',
);

describe('#5593 — une case « Analyses de fond » par racine', () => {
  it('lit le réglage du serveur, et se tait s’il ne le publie pas', () => {
    expect(src).toMatch(/analysisExcluded = Array\.isArray\(c\?\.background_analysis_excluded_roots\)/);
    expect(src).toContain(': null;');
    // Les cases n'existent que si le serveur connaît le réglage.
    expect(src).toMatch(/\{#if analysisExcluded !== null\}\s*<label class="dir-analyse"/);
  });

  it('une case par racine, cochée tant que la racine n’est pas exclue', () => {
    expect(src).toMatch(/checked=\{!analysisExcluded\.includes\(d\)\}/);
    expect(src).toMatch(/onchange=\{\(e\) => setAnalyseDuDossier\(d, \(e\.currentTarget as HTMLInputElement\)\.checked\)\}/);
  });

  it('écrit la liste COMPLÈTE des racines exclues, et revient en arrière sur un refus', () => {
    expect(src).toMatch(/patch\(\{ background_analysis_excluded_roots: suivant \}, \(\) => \{ analysisExcluded = avant; \}\)/);
    // Décocher ajoute la racine une seule fois ; cocher la retire.
    expect(src).toContain('analyser ? avant.filter((r) => r !== d) : [...avant.filter((r) => r !== d), d]');
  });

  it('les onze langues nomment la case, son libellé accessible et son explication', () => {
    const dossier = fileURLToPath(new URL('../locales/', import.meta.url));
    const langues = fs.readdirSync(dossier).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    expect(langues.length).toBe(11);
    for (const f of langues) {
      const texte = fs.readFileSync(dossier + f, 'utf-8');
      for (const cle of ['backgroundAnalysisFolder', 'backgroundAnalysisFolderAria', 'backgroundAnalysisFoldersHint']) {
        expect(texte, `${f} : settings.${cle}`).toContain(`"settings.${cle}":`);
      }
      const aria = texte.match(/"settings\.backgroundAnalysisFolderAria": "([^"]*)"/);
      expect(aria?.[1], `${f} : le libellé accessible nomme le dossier`).toContain('{path}');
    }
  });
});

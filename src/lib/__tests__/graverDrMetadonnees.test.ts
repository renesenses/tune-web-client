// Graver le Dynamic Range dans les fichiers — Bertrand, 16/09/2026 :
// « dans la vue metadata, j'aimerai un bouton pour graver les DRs sur les
// pistes », puis « cette clé doit pouvoir être relue ».
//
// Ce que ce fichier tient, côté client :
//  - l'écran Métadonnées a bien l'onglet, et il appelle la route du serveur
//    (`/library/dr/gravure`) par `apiPost` pour lancer — jamais `apiFetch`
//    avec des options, qui partirait en GET et « réussirait » sans rien
//    graver (piège documenté de `api.ts`) ;
//  - le bouton est inerte quand il n'y a rien à graver ou que la passe tourne ;
//  - les douze libellés existent dans les onze langues.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

describe('graver le DR depuis Métadonnées', () => {
  const api = sansCommentaires(lire('src/lib/api.ts'));
  const vue = sansCommentaires(lire('src/components/v2/MetadataV2.svelte'));

  it('lancer passe par apiPost sur /library/dr/gravure, l’état par apiFetch', () => {
    expect(api).toMatch(/export function lancerGravureDr\(\)[\s\S]{0,200}apiPost\('\/library\/dr\/gravure'/);
    expect(api).toMatch(/export function getGravureDr\(\)[\s\S]{0,120}apiFetch\('\/library\/dr\/gravure'\)/);
  });

  it('l’écran a l’onglet et branche les deux appels', () => {
    expect(vue).toContain("tab = 'dr'");
    expect(vue).toContain('api.getGravureDr()');
    expect(vue).toContain('api.lancerGravureDr()');
  });

  it('le bouton est inerte sans rien à graver, ou pendant la passe', () => {
    const i = vue.indexOf('onclick={graverDr}');
    expect(i).toBeGreaterThan(-1);
    const bouton = vue.slice(vue.lastIndexOf('<button', i), i);
    expect(bouton).toMatch(/disabled=\{[^}]*dr\.status === 'running'[^}]*\}/);
    expect(bouton).toMatch(/disabled=\{[^}]*dr\.a_graver === 0[^}]*\}/);
  });

  it('la relance suit le serveur : on ne repolle que tant qu’il dit « running »', () => {
    expect(vue).toMatch(/if \(dr\?\.status === 'running'\) \{[\s\S]{0,160}setTimeout\(chargerDr, 2000\)/);
  });

  it('les douze libellés existent dans les onze langues', () => {
    const cles = ['tabDr','drEngrave','drHint','drEngraveBtn','drRunning','drToEngrave','drInFiles','drOtherFormats','drProgress','drDone','drNothing','drUnavail'];
    for (const l of ['de','en','es','fr','hu','it','ja','ko','ro','sv','zh']) {
      const src = lire(`src/lib/locales/${l}.ts`);
      for (const c of cles) expect(src, `${l} : v2.meta.${c}`).toContain(`"v2.meta.${c}":`);
    }
  });
});

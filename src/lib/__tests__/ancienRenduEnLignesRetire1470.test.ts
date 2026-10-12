/**
 * #1470 — l'ancien affichage des pistes EN LIGNES est retiré, et ne revient pas.
 *
 * Depuis #1994 (07/10/2026), le mode Avancé rend le tableau comme Essentiel et
 * Expert : plus aucun mode n'empruntait `LignePisteV2`. Go de Bertrand : le
 * supprimer après la rc3. Avec lui sont partis ce qui ne servait qu'à lui —
 * la branche `{#if !enTableau}` de `ListePistesV2`, ses styles `.avecSuffixe`
 * et `.suffixe`, les props `avecAlbum` et `pochette`, `MODES_BRANCHES` et
 * `modeEnTableau`, `champsLigne`, et les clés `v2.lib.openAlbum` et
 * `settings.colModeNotWired`.
 *
 * Garde légère, par lecture de source : elle échoue si le composant revient,
 * si un écran le remonte, ou si la liste recommence à choisir entre deux
 * formes.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as colonnesPistes from '../colonnesPistes';

const racine = resolve(process.cwd(), 'src');
// Aiguille ASSEMBLÉE à l'exécution : écrite en clair, elle figurerait dans ce
// fichier, et la garde se trouverait elle-même.
const ANCIEN = 'LignePiste' + 'V2';

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) {
      if (nom === '__tests__' || nom === 'node_modules') continue;
      out.push(...sources(p));
    } else if (/\.(svelte|ts)$/.test(nom) && !/\.test\.ts$/.test(nom)) {
      out.push(p);
    }
  }
  return out;
}

const sansCommentaires = (src: string) =>
  src.replace(/<!--[\s\S]*?-->/g, '')
     .replace(/\/\*[\s\S]*?\*\//g, '')
     .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('#1470 — l’ancien rendu des pistes en lignes est retiré', () => {
  it('🔴 le composant n’existe plus', () => {
    expect(existsSync(join(racine, 'components/v2', `${ANCIEN}.svelte`))).toBe(false);
  });

  it('🔴 aucun fichier de l’application ne l’importe ni ne le monte', () => {
    const fautifs = sources(racine).filter((f) => sansCommentaires(readFileSync(f, 'utf-8')).includes(ANCIEN));
    expect(fautifs).toEqual([]);
  });

  it('la liste partagée ne choisit plus entre tableau et lignes', () => {
    const liste = sansCommentaires(readFileSync(join(racine, 'components/v2/ListePistesV2.svelte'), 'utf-8'));
    expect(liste).not.toMatch(/\benTableau\b/);
    expect(liste).not.toMatch(/avecSuffixe/);
    expect(liste).toContain('<div class="tbl"');
  });

  it('le module des colonnes n’exporte plus la décision tableau / lignes', () => {
    expect('MODES_BRANCHES' in colonnesPistes).toBe(false);
    expect('modeEnTableau' in colonnesPistes).toBe(false);
  });
});

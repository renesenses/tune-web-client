// Suite du fil 3031 (#3379) — la cible de build est Safari 14 (Vite 6), et
// une API plus récente n'y lève pas en silence : lue dans un `$derived`, elle
// fige le rendu qui la lit (l'écran « Lecture en cours » restait sur la piste
// d'avant sur un iPad sous iPadOS 16) ; au niveau d'un module, une expression
// régulière inconnue est une `SyntaxError` qui empêche le module de se charger.
//
// Deux témoins :
//  - une GARDE sur tout `src` (hors tests) contre les API absentes de
//    Safari 14 ;
//  - les fonctions qui les employaient, exécutées dans un environnement qui
//    n'a pas `Object.hasOwn` / `Array.prototype.at`, comme Safari 15.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** API absentes de Safari 14, et la version qui les apporte. */
const INTERDITS: { nom: string; motif: RegExp }[] = [
  { nom: 'Object.groupBy / Map.groupBy (Safari 17.4)', motif: /\b(?:Object|Map)\.groupBy\s*\(/ },
  { nom: 'Object.hasOwn (Safari 15.4)', motif: /\bObject\.hasOwn\s*\(/ },
  { nom: '.at( sur un tableau ou une chaîne (Safari 15.4)', motif: /\.at\(\s*-?\s*[\w.]+\s*\)/ },
  { nom: 'lookbehind (?<! / (?<= (Safari 16.4)', motif: /\(\?<[!=]/ },
  { nom: 'findLast / findLastIndex (Safari 15.4)', motif: /\.findLast(?:Index)?\s*\(/ },
  { nom: 'toSorted / toReversed / toSpliced (Safari 16)', motif: /\.to(?:Sorted|Reversed|Spliced)\s*\(/ },
  { nom: 'structuredClone (Safari 15.4)', motif: /\bstructuredClone\s*\(/ },
  { nom: 'Promise.withResolvers (Safari 17.4)', motif: /\bwithResolvers\s*\(/ },
];

function sources(dossier: string, out: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      if (nom !== '__tests__') sources(chemin, out);
      continue;
    }
    if (/\.(ts|svelte)$/.test(nom) && !/\.test\.ts$/.test(nom) && !nom.endsWith('.d.ts')) out.push(chemin);
  }
  return out;
}

describe('cible Safari 14 — aucune API plus récente dans le client', () => {
  const fichiers = sources('src');
  for (const { nom, motif } of INTERDITS) {
    it(`🔴 ${nom}`, () => {
      const fautifs: string[] = [];
      for (const f of fichiers) {
        readFileSync(f, 'utf8').split('\n').forEach((ligne, i) => {
          // Les commentaires peuvent NOMMER l'API.
          const code = ligne.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
          if (motif.test(code)) fautifs.push(`${f}:${i + 1}`);
        });
      }
      expect(fautifs).toEqual([]);
    });
  }
});

describe('les fonctions corrigées tournent sans Object.hasOwn ni Array.prototype.at', () => {
  let hasOwn: unknown;
  let at: unknown;
  beforeEach(() => {
    hasOwn = (Object as any).hasOwn;
    at = (Array.prototype as any).at;
    delete (Object as any).hasOwn;
    delete (Array.prototype as any).at;
  });
  afterEach(() => {
    (Object as any).hasOwn = hasOwn;
    (Array.prototype as any).at = at;
  });

  it('🔴 bandeau des tâches de fond (lu dans un $derived de la barre latérale)', async () => {
    const m = await import('../tachesDeFond');
    const taches = [{ id: 'credits', label: 'Crédits', paused: false, progress: { processed: 3, total: 10, detail_code: 'source', detail_params: { n: 2 } } }] as any;
    expect(() => m.libelleBanniereEnrichissement(taches, 'secours', (c) => c)).not.toThrow();
    expect(() => m.bulleBanniereEnrichissement(taches, 'secours', (c) => c)).not.toThrow();
    expect(m.libelleBanniereEnrichissement(taches, 'secours', (c) => c)).toContain('3/10');
  });
});

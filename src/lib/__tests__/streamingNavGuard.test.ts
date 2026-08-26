import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Garde de code pour le correctif du bug de navigation Qobuz (Dominique
 * COMET, 0.9.66).
 *
 * Le test de mécanisme voisin (`streamingNavScope.test.ts`) prouve la RÈGLE :
 * un corps enfermé dans `untrack` n'hérite pas des stores qu'il lit. Celui-ci
 * prouve qu'elle est encore APPLIQUÉE dans `StreamingView`. Les deux sont
 * nécessaires : sans le second, supprimer une seule ligne ramènerait le bug
 * sans qu'aucun test ne bronche.
 *
 * Reste en environnement `node` : il ne lit que du texte.
 */
describe('StreamingView garde sa remise à zéro sous untrack', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/StreamingView.svelte'),
    'utf-8',
  );

  it('le corps de la remise à zéro est appelé sous untrack', () => {
    // Le corps de l'effet service est enfermé dans un untrack : la restauration
    // du contexte OU la remise à zéro s'y font. On vérifie que resetForService(s)
    // reste appelé À L'INTÉRIEUR de ce bloc untrack (garde Dominique COMET) —
    // la forme exacte a changé (bloc au lieu d'appel direct) quand le bouton
    // retour a gagné sa branche de restauration.
    expect(source).toMatch(/untrack\(\(\)\s*=>\s*\{[\s\S]*?resetForService\(s\)/);
  });

  it('untrack est importé depuis svelte', () => {
    expect(source).toMatch(/import\s*\{[^}]*\buntrack\b[^}]*\}\s*from\s*'svelte'/);
  });

  it('resetForService efface bien la navigation par genre', () => {
    // Sans ceci, vider la fonction laisserait les deux tests ci-dessus au vert.
    const start = source.indexOf('function resetForService');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('\n  }', start));
    expect(body).toContain('browsingGenres = false');
    expect(body).toContain('genreBreadcrumb = []');
    expect(body).toContain('genreAlbums = []');
  });

  it('les chargeurs restent DANS le corps untracké, pas dans l’effet', () => {
    // Si un chargeur remontait dans l'effet, sa lecture réactive
    // redeviendrait une dépendance et le bug reviendrait à l'identique.
    const start = source.indexOf('$effect(() => {\n    const s = service;');
    const end = source.indexOf('function resetForService');
    // Sans ces deux bornes, la tranche serait vide et l'assertion passerait
    // sans rien avoir examine — un test vert qui ne regarde rien.
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const effect = source.slice(start, end);
    expect(effect).not.toMatch(/load[A-Z]\w*\(/);
  });
});

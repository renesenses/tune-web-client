import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Bertrand, 22/09/2026 (v0.9.161, onglet Genres) : « grey color under heart
 * icon ».
 *
 * 🔴 Le bouton `.fcoeur` est peint à DEUX endroits — l'en-tête d'une facette
 * ouverte (`.facet h2`) et chaque ligne de la liste des facettes (`.fl`) —
 * mais ses règles n'étaient écrites que pour le premier. Dans la liste, il
 * n'héritait d'aucun style : le navigateur lui posait son fond de bouton par
 * défaut, un carré gris opaque sous chaque cœur, sur toute la colonne.
 */
describe('Bibliothèque : le cœur d’une facette n’a pas de fond gris', () => {
  const vue = readFileSync(
    resolve(__dirname, '../../components/v2/LibraryV2.svelte'),
    'utf-8',
  );
  const css = vue.slice(vue.lastIndexOf('<style>'));

  it('le cœur de la LISTE est habillé, pas seulement celui de l’en-tête', () => {
    // Un `<button>` sans `background` déclaré prend celui du navigateur.
    expect(css).toMatch(/\.fl \.fcoeur\s*\{[^}]*background:\s*transparent/s);
  });

  it('les deux emplacements partagent les mêmes règles', () => {
    for (const etat of [':hover', ':focus-visible', '.on']) {
      expect(css, `l'état ${etat} manque à la liste`).toContain(`.fl .fcoeur${etat}`);
    }
    // Le cœur s'allume au survol de la LIGNE, comme il s'allume au survol de
    // l'en-tête : sans cela il resterait à demi effacé sur une ligne survolée.
    expect(css).toContain('.fl:hover .fcoeur');
  });

  it('le bouton existe bien aux deux endroits, sinon la garde ne garde rien', () => {
    const liste = vue.slice(vue.indexOf('<div class="fliste">'), vue.indexOf('.fliste{'));
    expect(liste).toContain('class="fcoeur"');
    expect(vue).toContain('class="fcoeur"');
  });
});

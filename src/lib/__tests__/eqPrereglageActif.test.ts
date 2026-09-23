import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Thierry Clémont, 22/09/2026 (v0.9.161, écran Égaliseur) : « quelle
 * égalisation est-elle choisie ? aucun moyen de le savoir alors qu'il eût
 * suffi de la surligner ».
 *
 * 🔴 Aucun des préréglages — ni les sept intégrés, ni « Mes presets » —
 * ne portait d'état actif : les boutons étaient tous identiques, avant comme
 * après le clic. Rien ne mémorise le choix, ni l'écran ni le serveur, qui ne
 * garde que les bandes : on le RETROUVE en comparant la courbe affichée.
 */
describe('Égaliseur : le préréglage en vigueur se voit', () => {
  const vue = readFileSync(
    resolve(__dirname, '../../components/v2/EqualizerV2.svelte'),
    'utf-8',
  );
  const css = vue.slice(vue.lastIndexOf('<style>'));

  it('les deux rangées portent l’état actif', () => {
    const integres = vue.slice(vue.indexOf('{#each PRESETS as p'), vue.indexOf('{#each mesPresets as p'));
    expect(integres).toContain('class:actif');
    expect(integres).toContain('aria-pressed={actif}');
    const miens = vue.slice(vue.indexOf('{#each mesPresets as p'));
    expect(miens.slice(0, 600)).toContain('class:actif');
  });

  it('l’actif est DÉDUIT de la courbe, pas d’un souvenir du clic', () => {
    // Un souvenir du clic mentirait après un rechargement, un changement de
    // zone, ou le moindre curseur bougé.
    // Ancré sur le NOM et le calcul, pas sur l'annotation de type entre les
    // deux : `$derived.by<T>(…)` ne passe pas svelte-check, la forme retenue
    // est `const x: T = $derived.by(…)`.
    expect(vue).toMatch(/const presetActif[^=]*= \$derived\.by/);
    expect(vue).toMatch(/const mienActif[^=]*= \$derived\.by/);
    expect(vue).toContain('p.gains.every((g, i) => memeGain(g, gains[i]))');
  });

  it('la comparaison tolère un arrondi, sans confondre deux courbes', () => {
    expect(vue).toMatch(/function memeGain[\s\S]{0,400}< 0\.05/);
  });

  it('la marque se voit d’un coup d’œil : couleur ET fond', () => {
    const regle = css.slice(css.indexOf('.presets button.actif'), css.indexOf('.presets button.actif') + 260);
    expect(regle).toContain('var(--v2-acc1)');
    expect(regle, 'une bordure seule se confond avec le survol').toContain('background:');
  });
});

/**
 * AUDIT DES TOILES EN THÈME CLAIR — arbitrage de Bertrand du 27/09/2026.
 *
 * Après le VU-mètre (« vumètres en thème clair »), il restait à mesurer les
 * autres instruments dessinés sur une toile. Une toile n'hérite d'aucune
 * couleur : aucune garde du dépôt ne regarde une couleur, et le défaut ne se
 * voit qu'à l'œil, dans le bon thème.
 *
 * ## Ce que l'audit a trouvé
 *
 *  - `AudioVisualizer` : **rien**. Il lit déjà `--tune-accent` et
 *    `--tune-text-muted`, que `tune-v2.css` ponte vers les jetons du thème.
 *    Il suivait donc le thème clair depuis toujours. Mesure, pas supposition.
 *  - `CreteMetre` : en clair, il ne restait QUE les barres — rail, trait de
 *    crête et lampe ÉTEINTE étaient blancs sur blanc, et « éteint » est
 *    l'état normal d'une lampe.
 *  - `TvVuMeters` : 🔴 une RÉGRESSION introduite le jour même. Le Grand écran
 *    a son propre mode clair/sombre ; le cadran lisait le thème de
 *    l'application. Écran noir + client en thème clair = encre sombre sur
 *    fond noir.
 *  - `TvVuBars` : même écran, mêmes couleurs en dur, défaut antérieur.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PALETTE_CRETE_SOMBRE, paletteCreteDepuis } from '../peakMetre';
import { avecAlpha } from '../dessinVuMetre';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe("l'analyseur suivait déjà le thème — on ne le touche pas", () => {
  it('lit les jetons pontés, et ne peint aucune couleur en dur', () => {
    const src = sansCommentaires(lire('src/components/partages/AudioVisualizer.svelte'));
    expect(src).toContain("getPropertyValue('--tune-accent')");
    expect(src).toContain("getPropertyValue('--tune-text-muted')");
  });

  it('et le pont existe bien, dans les deux sens', () => {
    const css = lire('src/styles/tune-v2.css');
    expect(css).toContain('--tune-accent: var(--v2-acc1);');
    expect(css).toContain('--tune-text-muted: var(--v2-txt3);');
  });
});

describe('le crête-mètre suit désormais le thème', () => {
  const src = sansCommentaires(lire('src/components/partages/CreteMetre.svelte'));
  const css = lire('src/styles/tune-v2.css');

  it('🔴 ne peint plus aucune couleur en dur', () => {
    const i = src.indexOf('let COULEURS');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i), "une couleur en dur est revenue").not.toMatch(/#[0-9a-fA-F]{6}'|rgba\(255,255,255/);
  });

  it('relit la palette au changement de thème, jamais à chaque image', () => {
    expect(src).toContain('void $preferences.v2Theme');
    expect(src).toContain('COULEURS = paletteCreteDepuis(c)');
    const boucle = src.slice(src.indexOf('return boucleImages('));
    expect(boucle).not.toContain('paletteCreteDepuis');
  });

  it('les six jetons existent dans le thème de base ET dans les deux clairs', () => {
    const jetons = ['--v2-crete-fond', '--v2-crete-vert', '--v2-crete-ambre',
                    '--v2-crete-rouge', '--v2-crete-ppm', '--v2-crete-eteint'];
    for (const j of jetons) expect(css, `${j} manque au thème de base`).toContain(`${j}:`);
    for (const theme of ['clear-white', 'clear-grey']) {
      const i = css.indexOf(`[data-v2-theme="${theme}"]`);
      const bloc = css.slice(i, css.indexOf('}', i));
      for (const j of jetons) expect(bloc, `${theme} ne redéfinit pas ${j}`).toContain(j);
    }
  });

  it("l'état ÉTEINT redevient visible : c'est l'état NORMAL d'une lampe", () => {
    // C'est le cœur du défaut : deux lampes éteintes en blanc sur blanc, dans
    // la barre de lecture, n'existaient tout simplement pas.
    const i = css.indexOf('[data-v2-theme="clear-white"]');
    const bloc = css.slice(i, css.indexOf('}', i));
    expect(bloc).toMatch(/--v2-crete-eteint:rgba\(20,28,36/);
  });

  it('le sens des couleurs est PRÉSERVÉ, pas repeint au thème', () => {
    // Vert, ambre et rouge portent une information (ok, alerte, surcharge).
    // Les remplacer par la couleur d'accent effacerait cette information —
    // c'est la règle déjà écrite pour `--tune-danger` et ses voisines.
    const i = css.indexOf('[data-v2-theme="clear-white"]');
    const bloc = css.slice(i, css.indexOf('}', i));
    expect(bloc).toContain('--v2-crete-vert:#16a34a');
    expect(bloc).toContain('--v2-crete-rouge:#c0392b');
    expect(bloc, "l'accent du thème a remplacé une couleur de sens").not.toContain('var(--v2-acc1)');
  });

  it('retombe sur le crête-mètre d’origine hors de `.tune-v2`', () => {
    expect(paletteCreteDepuis(null)).toEqual(PALETTE_CRETE_SOMBRE);
    expect(PALETTE_CRETE_SOMBRE.vert).toBe('#4ade80');
  });
});

describe('🔴 le Grand écran suit SON mode, pas le thème de l’application', () => {
  const tv = lire('src/components/v2-heritage/TvView.svelte');

  it('pose sa propre palette sur `.tv-root` et sur `.tv-root.light`', () => {
    // La régression : le cadran lisait les jetons du thème v2. Un Grand écran
    // NOIR ouvert pendant que le client est en thème clair peignait une encre
    // sombre sur un fond noir.
    const sombre = tv.slice(tv.indexOf('.tv-root {'), tv.indexOf('.tv-root.hide-cursor'));
    expect(sombre).toContain('--v2-vu-encre: 237,233,224;');
    const clair = tv.slice(tv.indexOf('.tv-root.light {'));
    expect(clair.slice(0, 700)).toContain('--v2-vu-encre: 44,50,58;');
  });

  it('passe son mode aux DEUX instruments, pour qu’ils relisent', () => {
    expect(tv).toContain("<TvVuMeters playing={isPlaying} width={560} clair={settings.theme === 'light'} />");
    expect(tv).toContain("clair={settings.theme === 'light'}");
    for (const f of ['src/components/v2-heritage/TvVuMeters.svelte',
                     'src/components/v2-heritage/TvVuBars.svelte']) {
      const src = sansCommentaires(lire(f));
      expect(src, `${f} ne relit pas au changement de mode`).toContain('void clair;');
    }
  });

  it('le bargraphe ne peint plus ivoire et blanc en dur', () => {
    const src = sansCommentaires(lire('src/components/v2-heritage/TvVuBars.svelte'));
    expect(src).not.toContain("'rgba(237,233,224,'");
    expect(src).not.toContain("'rgba(255,255,255,0.05)'");
    expect(src).toContain('paletteVuDepuis(canvas)');
  });
});

describe('avecAlpha — une couleur du thème à l’opacité voulue', () => {
  it('sait lire les deux formes que rend `getComputedStyle`', () => {
    expect(avecAlpha('#f2b441', 0.85)).toBe('rgba(242, 180, 65, 0.85)');
    expect(avecAlpha('rgb(224, 82, 82)', 0.5)).toBe('rgba(224, 82, 82, 0.5)');
    expect(avecAlpha('rgba(224,82,82,0.9)', 0.2)).toBe('rgba(224, 82, 82, 0.2)');
  });

  it('rend telle quelle une valeur qu’il ne sait pas lire', () => {
    // Une couleur inattendue vaut mieux qu'une couleur fausse : peindre du
    // noir par défaut ferait disparaître l'instrument sans rien dire.
    expect(avecAlpha('color-mix(in srgb, red, blue)', 0.5)).toBe('color-mix(in srgb, red, blue)');
    expect(avecAlpha('', 0.5)).toBe('');
  });
});

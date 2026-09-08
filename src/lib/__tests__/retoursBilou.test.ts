import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Contraste relatif entre deux couleurs hexadécimales (WCAG). */
function contraste(a: string, b: string): number {
  const lum = (h: string) => {
    const v = h.replace('#', '');
    const c = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
    const f = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (h + 0.05) / (l + 0.05);
}

describe('Retours de Bilou sur le forum (05/09/2026)', () => {
  const css = lire('src/styles/tune-v2.css');
  const barre = sansCommentaires(lire('src/components/v2/Sidebar.svelte'));

  it('la surface de CHOIX se détache du fond sur les thèmes sombres', () => {
    // « La couleur de fond des sous-menus / listes de choix devrait être
    // légèrement différente de celle du fond d'écran ». Elle valait 1,00 à 1,04
    // — c'est-à-dire aucune différence.
    const paires = [...css.matchAll(
      /--v2-bg:(#[0-9A-Fa-f]{6});[^}]*?--v2-surface:(#[0-9A-Fa-f]{6}); --v2-surface2:(#[0-9A-Fa-f]{6});/g,
    )].map((m) => ({ bg: m[1], surface: m[2], surface2: m[3] }));
    expect(paires.length).toBeGreaterThanOrEqual(6);

    const sombres = paires.filter((p) => contraste(p.bg, '#FFFFFF') > 10);
    expect(sombres.length, 'les quatre thèmes sombres').toBe(4);
    for (const p of sombres) {
      // Le seuil est bas parce que les rapports WCAG se TASSENT sur un fond
      // très sombre : de #071418 à #101B23, le pas est de (7,20,24) à
      // (16,27,35) — parfaitement visible à l'écran pour 1,07 de rapport.
      expect(contraste(p.bg, p.surface2), `${p.bg} / ${p.surface2}`).toBeGreaterThan(1.06);
      // …mais elle reste SOUS la surface des menus flottants, qui doit dominer.
      expect(contraste(p.bg, p.surface2)).toBeLessThan(contraste(p.bg, p.surface));
      // Et la surface flottante se détache VRAIMENT : à 1,11 elle ne dominait
      // rien du tout sur les deux premiers thèmes.
      expect(contraste(p.bg, p.surface), `surface ${p.surface}`).toBeGreaterThan(1.18);
    }
  });

  it('la barre latérale est COMPACTE — elle obligeait à défiler', () => {
    // Vingt-deux entrées à 42 px en faisaient 924, plus que la hauteur utile
    // d'un portable : la barre défilait chez tout le monde.
    const nav = /\.nav\{[^}]*padding:(\d+(?:\.\d+)?)px 14px[^}]*font-size:(\d+(?:\.\d+)?)px/.exec(barre);
    expect(nav, 'la règle .nav a changé de forme').not.toBeNull();
    const [pad, police] = [Number(nav![1]), Number(nav![2])];
    expect(2 * pad + Math.round(police * 1.2), 'hauteur d’une entrée').toBeLessThanOrEqual(34);
    expect(barre).toContain('.grp{display:flex; flex-direction:column; gap:1px}');
  });

  it('les étiquettes élidées portent leur texte complet en `title`', () => {
    // « Ne pas oublier d'afficher les titres et artistes tronqués au passage de
    // la souris, partout où des albums sont listés. »
    for (const f of ['LibraryV2', 'SearchV2', 'FavoritesV2', 'PlaylistsV2', 'ArtistesV2',
                     'CollectionsV2', 'EtiquettesV2', 'StreamingV2', 'PageWidgets']) {
      const src = lire(`src/components/v2/${f}.svelte`);
      // On compte la CLASSE, quel que soit l'élément : dans Streaming, le titre
      // d'une vignette est un <button>, pas un <span>.
      const elidees = (src.match(/class="c[ta]"/g) ?? []).length;
      const titrees = (src.match(/class="c[ta]" title=/g) ?? []).length;
      expect(titrees, `${f} : ${titrees}/${elidees} étiquettes portent un title`).toBe(elidees);
    }
    const ligne = lire('src/components/v2/LignePisteV2.svelte');
    expect(ligne).toContain('<span class="tt" title={piste.title}>');
    expect(ligne).toContain('<em title={sousTitre}>');
  });

  it('« Derniers ajouts » est une pastille, pas une ligne de menu', () => {
    // « Manque les derniers ajouts en vue bibliothèque ». Le tri existait,
    // enfoui dans le menu : ce qu'on veut voir en arrivant ne s'y cherche pas.
    const lib = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));
    expect(lib).toContain("v2.lib.recent");
    expect(lib).toContain("sortKey = sortKey === 'added' ? 'title' : 'added'");
    // Elle n'apparaît que si la donnée existe — un tri qui ne trie rien est
    // pire qu'un tri absent.
    expect(lib).toMatch(/\{#if hasAddedAt\}\s*\n\s*<button class="chip" class:active=\{sortKey === 'added'\}/);
  });
});

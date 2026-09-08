import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Frise des années : la grille suit le curseur (Bertrand, 05/09/2026)', () => {
  const lib = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));

  it('la grille est filtrée par l’année EFFECTIVE, pas seulement par le clic', () => {
    // Jusqu'ici la frise ne filtrait qu'au clic : balayer cinquante ans ne
    // montrait rien.
    expect(lib).toContain('const anneeEffective = $derived(hoverYear ?? fYear)');
    expect(lib).toContain('if (anneeEffective != null && albumYear(a) !== anneeEffective) return false;');
    expect(lib, 'la grille lit encore fYear directement').not.toContain('if (fYear != null && albumYear(a) !== fYear)');
  });

  it('le SURVOL l’emporte sur le choix, jamais l’inverse', () => {
    // Sans cet ordre, une année figée empêcherait d'en prévisualiser une autre :
    // la frise serait morte dès le premier clic.
    expect(lib).toContain('hoverYear ?? fYear');
    expect(lib, "l'ordre est inversé").not.toContain('$derived(fYear ?? hoverYear');
  });

  it('quitter la frise rend la main à l’année choisie', () => {
    // `hoverYear` repasse à null, et la grille retombe sur `fYear` — ou sur
    // rien si aucune année n'est figée.
    expect(lib).toContain('onmouseleave={() => { hoverYear = null; hoverMonth = null; }}');
    // Le clic, lui, FIGE.
    expect(lib).toContain('onclick={() => (fYear = fYear === b.year ? null : b.year)}');
  });

  it('le curseur suit la même règle que la grille', () => {
    // Sinon le curseur montrerait une année et la grille en afficherait une
    // autre.
    expect(lib).toContain('const cursorYear = $derived(hoverYear ?? fYear ?? busiestYear)');
  });

  it('les compteurs de FACETTES ne suivent pas le survol', () => {
    // Ils décrivent les filtres posés ; les recalculer à chaque année traversée
    // ferait clignoter toute la rangée et coûterait un parcours complet de la
    // bibliothèque par cran.
    expect(lib).toContain('qualite: fQuality, frequence: fRate, annee: fYear,');
  });

  it('parcourir la frise au CLAVIER ne filtre pas en silence', () => {
    // `onfocus` posait `hoverYear` : depuis que le survol filtre, tabuler dans
    // la frise aurait recomposé la grille sans que rien ne l'annonce.
    expect(lib).toContain('onfocus={() => { hoverMonth = null; }}');
    expect(lib).not.toContain('onfocus={() => { hoverYear = b.year;');
  });
});

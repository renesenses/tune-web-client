// web#3163 — la colonne des Réglages s'élargit sur les grands écrans.
//
// Pierre (fil 2867, rc12) : la colonne de 720 px (maquette de Levente, #3058)
// « gaspille un grand écran ». Décision de Bertrand (17/11/2026) : l'élargir
// au-delà d'un seuil, sans rien changer sur un 13 pouces (1440 px), et sans
// étirer les lignes de réglage.
//
// jsdom ne met rien en page : ce banc lit la SOURCE et ÉVALUE la formule de la
// colonne aux trois largeurs de la recette. La mesure réelle, au navigateur,
// est faite par les captures Playwright de la PR (1440, 1920, 2560).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ECRAN = readFileSync(join(__dirname, '..', '..', 'components', 'v2', 'SettingsV2.svelte'), 'utf8');
const CSS = ECRAN.slice(ECRAN.lastIndexOf('<style>'));

/** Le bloc `@media (min-width:Npx){…}` des Réglages, accolades équilibrées. */
function blocGrandEcran(css: string): { seuil: number; corps: string } | null {
  const m = /@media \(min-width:(\d+)px\)\{/.exec(css);
  if (!m) return null;
  let i = m.index + m[0].length;
  let prof = 1;
  const debut = i;
  while (i < css.length && prof > 0) {
    if (css[i] === '{') prof++;
    else if (css[i] === '}') prof--;
    i++;
  }
  return { seuil: Number(m[1]), corps: css.slice(debut, i - 1) };
}

/** Largeur de la colonne pour une fenêtre donnée, d'après la source. */
function colonne(fenetre: number): number {
  const b = blocGrandEcran(CSS);
  if (!b || fenetre < b.seuil) return 720;
  const f = /--reglages-colonne:min\((\d+)px, calc\((\d+)px \+ \(100vw - (\d+)px\) \/ (\d+)\)\)/.exec(b.corps);
  if (!f) throw new Error('formule de la colonne introuvable');
  const [, plafond, base, depart, diviseur] = f.map(Number);
  return Math.min(plafond, base + (fenetre - depart) / diviseur);
}

describe('web#3163 — Réglages sur grand écran', () => {
  it('un 13 pouces (1440 px) garde la colonne de 720 px, hors de toute règle nouvelle', () => {
    expect(CSS).toMatch(/\.pane > \*\{[^}]*max-width:720px/);
    const b = blocGrandEcran(CSS);
    expect(b, 'la règle grand écran manque').not.toBeNull();
    expect(b!.seuil).toBeGreaterThan(1440);
    expect(colonne(1440)).toBe(720);
  });

  it('la colonne s’élargit progressivement : 880 px à 1920, 1200 px à 2560, sans saut au seuil', () => {
    expect(colonne(1920)).toBe(880);
    expect(colonne(2560)).toBe(1200);
    const b = blocGrandEcran(CSS)!;
    expect(colonne(b.seuil)).toBeLessThan(722);
    expect(b.corps).toMatch(/\.pane > \*\{max-width:var\(--reglages-colonne\)\}/);
  });

  it('les lignes de réglage et les paragraphes d’aide gardent une mesure de lecture', () => {
    const b = blocGrandEcran(CSS)!;
    const m = /\.pane \.card \.row:not\(\.row-mon-theme\):not\(:has\(\.pleine-largeur\)\), \.pane \.card p\{max-width:(\d+)px\}/.exec(b.corps);
    expect(m, 'la mesure des lignes manque').not.toBeNull();
    const mesure = Number(m![1]);
    // Pas plus étroite qu'une ligne d'aujourd'hui (720 − 2 × 18 de marge de carte)…
    expect(mesure).toBeGreaterThanOrEqual(684);
    // … et nettement plus étroite que la colonne d'un grand écran.
    expect(mesure).toBeLessThan(colonne(1920));
  });

  it('les blocs larges (pleine-largeur) restent libres, et leurs lignes suivent la colonne', () => {
    expect(CSS).toMatch(/\.pane > \.card:has\(\.pleine-largeur\)\{max-width:none\}/);
    const b = blocGrandEcran(CSS)!;
    expect(b.corps).toMatch(/:not\(:has\(\.pleine-largeur\)\)\{max-width:var\(--reglages-colonne\)\}/);
  });
});

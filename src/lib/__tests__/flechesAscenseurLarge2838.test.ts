// web#2838 — fil 2748 : avec « Barres de défilement larges » (web#2798),
// sous Opera (Chromium) sur Linux Mint, les flèches de l'ascenseur étaient
// INACTIVES ; Chrome et Edge sous Windows allaient bien ; Firefox n'a pas de
// flèches (attendu : rien au-delà de scrollbar-width / scrollbar-color).
//
// Cause : dès qu'une page style `::-webkit-scrollbar`, Chromium ne dessine
// plus les boutons fléchés natifs ; sans `::-webkit-scrollbar-button`, ils
// restent sans taille ni dessin, donc sans action.
//
// Ce banc garde la feuille (jsdom ne dessine pas d'ascenseur) :
//   1. les boutons `:single-button` sont affichés, avec une taille saisissable ;
//   2. les quatre sens ont chacun leur flèche, dessinée aux couleurs du thème
//      (jeton `--v2-txt2`, clair sur sombre, foncé sur clair) ;
//   3. macOS / Safari (`:no-button`) et les `:double-button` ne sont pas visés,
//      et rien ne sort du mode large ni du bloc `@supports`.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/styles/tune-theme.css'), 'utf-8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const supports = /@supports\s+selector\(::-webkit-scrollbar\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
const PREFIXE = String.raw`html\[data-ascenseurs-larges\]\s*::-webkit-scrollbar-button:single-button`;

function regle(suffixe: string): string | undefined {
  return new RegExp(`${PREFIXE}${suffixe}\\s*\\{([^}]*)\\}`).exec(supports)?.[1];
}

describe('web#2838 — flèches de l’ascenseur large (Chromium Windows / Linux)', () => {
  it('les boutons fléchés sont affichés et assez grands pour la souris', () => {
    const m = regle('');
    expect(m, 'aucun style ::-webkit-scrollbar-button:single-button en mode large').toBeDefined();
    expect(m!).toMatch(/display\s*:\s*block/);
    expect(Number(/(?:^|[\s;])width\s*:\s*(\d+)px/.exec(m!)?.[1])).toBeGreaterThanOrEqual(16);
    expect(Number(/(?:^|[\s;])height\s*:\s*(\d+)px/.exec(m!)?.[1])).toBeGreaterThanOrEqual(16);
    expect(m!).toMatch(/background-color\s*:\s*color-mix\([^;]*var\(--v2-txt2/);
  });

  it.each([
    [':vertical:decrement', 'haut'],
    [':vertical:increment', 'bas'],
    [':horizontal:decrement', 'gauche'],
    [':horizontal:increment', 'droite'],
  ])('flèche %s (%s) dessinée aux couleurs du thème', (sens) => {
    const m = regle(sens);
    expect(m, `bouton ${sens} sans flèche`).toBeDefined();
    const degrades = m!.match(/linear-gradient\([^)]*var\(--v2-txt2[^)]*\)[^)]*\)/g) ?? [];
    expect(degrades.length).toBe(2);
    expect(m!).toMatch(/background-size\s*:/);
    expect(m!).toMatch(/background-position\s*:/);
  });

  it('macOS / Safari (sans flèches) et les doubles boutons ne sont pas touchés', () => {
    expect(css).not.toMatch(/::-webkit-scrollbar-button:(?:no-button|double-button)/);
    // Seul le mode large dessine des boutons, et seulement là où
    // `::-webkit-scrollbar` existe (Firefox ne voit rien).
    const horsSupports = css.replace(/@supports[\s\S]*?\n\}/g, '');
    expect(horsSupports).not.toMatch(/::-webkit-scrollbar-button/);
    for (const sel of supports.match(/[^{}]*::-webkit-scrollbar-button[^{]*\{/g) ?? []) {
      for (const s of sel.replace('{', '').split(',')) {
        expect(s.trim()).toMatch(/^html\[data-ascenseurs-larges\]\s+::-webkit-scrollbar-button:single-button/);
      }
    }
  });
});

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// web#2773 (fil forum 2741, 10/11/2026) : en thème clair, les barres de
// défilement étaient quasi invisibles. Deux causes cumulées :
//   - Chrome 121+ honore `scrollbar-color` et, dès qu'il est posé, IGNORE les
//     `::-webkit-scrollbar-thumb`. La règle globale `* { scrollbar-color:
//     rgba(255,255,255,.35) … }` imposait donc un pouce BLANC partout ;
//   - Safari, qui lit les `::-webkit-scrollbar-thumb`, recevait `--v2-line2`
//     (#D2DAE2 / #C2C9D1), à peine plus foncé que le fond.
// La garde résout `--v2-scrollthumb` dans chaque thème clair et calcule son
// contraste WCAG (≥ 3:1, élément d'interface) sur les fonds où il se pose.

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

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

/** Déclarations `--v2-*` du bloc `:root[data-v2-theme="theme"] .tune-v2`. */
function jetons(theme: string): Map<string, string> {
  const css = sansCommentaires(lire('src/styles/tune-v2.css'));
  const sel = `:root[data-v2-theme="${theme}"] .tune-v2`;
  const out = new Map<string, string>();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map((s) => s.trim()).includes(sel)) continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) out.set(d[1], d[2].trim());
  }
  return out;
}

function svelte(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? svelte(p) : p.endsWith('.svelte') ? [p] : [];
  });
}

describe('web#2773 — pouce des barres de défilement visible en thème clair', () => {
  for (const theme of ['clear-white', 'clear-grey']) {
    it(`${theme} : --v2-scrollthumb ≥ 3:1 sur fond, fond 2, surface et surface de choix`, () => {
      const t = jetons(theme);
      const pouce = t.get('--v2-scrollthumb');
      expect(pouce, `--v2-scrollthumb absent du thème ${theme}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      for (const fond of ['--v2-bg', '--v2-bg2', '--v2-surface', '--v2-surface2']) {
        const c = contraste(pouce!, t.get(fond)!);
        expect(c, `${theme} : pouce ${pouce} sur ${fond} ${t.get(fond)} = ${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('la règle globale `scrollbar-color` (que Chrome préfère aux ::-webkit) lit --v2-scrollthumb', () => {
    const css = sansCommentaires(lire('src/styles/tune-theme.css'));
    const etoile = /(?:^|\})\s*\*\s*\{([^}]*)\}/.exec(css);
    expect(etoile, 'règle `* { … }` introuvable').not.toBeNull();
    const couleur = /scrollbar-color\s*:\s*([^;]+);/.exec(etoile![1]);
    expect(couleur?.[1]).toMatch(/^var\(--v2-scrollthumb,/);
  });

  it('aucun ::-webkit-scrollbar-thumb des vues ne pose --v2-line2 en direct', () => {
    const fautifs = svelte(resolve(process.cwd(), 'src/components')).filter((f) =>
      /scrollbar-thumb\s*\{\s*background\s*:\s*var\(--v2-line2\)/.test(readFileSync(f, 'utf-8')),
    );
    expect(fautifs).toEqual([]);
  });
});

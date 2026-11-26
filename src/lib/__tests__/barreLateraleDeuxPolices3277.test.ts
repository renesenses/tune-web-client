// #3277 (ticket support 318) — « toutes les polices présentes dans la sidebar
// devraient disparaître pour ne garder que les deux » de l'écran Tune Circle :
// Cormorant Garamond pour les titres, Inter pour le texte.
//
// La barre mélangeait Inter et une monospace (`--v2-mono`, Roboto Mono, jamais
// chargée : chaque système montrait SA monospace) pour « MOZAIKLABS », la
// version, les intertitres et le compte des rayons. Cette garde lit le CSS :
// la barre ne nomme plus une famille, elle écrit les deux jetons de rôle.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(__dirname, '..', '..', p), 'utf8');
const style = (src: string) => src.slice(src.indexOf('<style>'));

/** Toutes les familles écrites par `font-family:` ou par le raccourci `font:`. */
function familles(css: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/g)) out.push(m[1].trim());
  for (const m of css.matchAll(/(?<![-\w])font\s*:\s*([^;}]+)/g)) {
    const v = m[1].trim();
    if (v === 'inherit') continue;
    // La famille est le DERNIER terme du raccourci (`font:600 calc(…) var(--x)`).
    const fin = v.match(/(var\(--[\w-]+\)|[^\s)]+)\s*$/);
    out.push(fin ? fin[1] : v);
  }
  return out;
}

const PERMIS = new Set(['var(--v2-police-texte)', 'var(--v2-police-titre)', 'inherit']);

describe('#3277 — la barre latérale V2 n’emploie que les deux polices', () => {
  // Harmonisation, phase 1 (26/11/2026) : les familles ne sont plus écrites
  // dans tune-v2.css ni dans tune-theme.css, mais UNE fois, dans
  // fondations.css. Les deux feuilles les LISENT. La garde vérifie donc deux
  // choses au lieu d'une chaîne : la valeur dans fondations.css, et le
  // chaînage de chaque jeton historique jusqu'à elle — un jeton qui se
  // remettrait à nommer une famille casserait le chaînage.
  it('les deux jetons de rôle sont définis, sur les polices de Tune Circle', () => {
    const fondations = lire('styles/fondations.css');
    expect(fondations).toMatch(/--police-titre: 'Cormorant Garamond', 'Georgia', serif;/);
    expect(fondations).toMatch(/--police-texte: 'Inter', system-ui,/);
    const v2 = lire('styles/tune-v2.css');
    expect(v2).toMatch(/--v2-police-titre:var\(--police-titre\)/);
    expect(v2).toMatch(/--v2-police-texte:var\(--v2-sans\)/);
    expect(v2).toMatch(/--v2-sans:var\(--police-texte\);/);
    const v1 = lire('styles/tune-theme.css');
    expect(v1).toMatch(/--font-display: var\(--police-titre\);/);
    // Lato retirée : le texte V1 rejoint Inter, comme le V2.
    for (const j of ['--font-body', '--font-label', '--font-primary']) {
      expect(v1).toMatch(new RegExp(`${j}: var\\(--police-texte\\);`));
    }
    const sansCommentaires = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
    expect(sansCommentaires(v1 + v2 + fondations + lire('../index.html'))).not.toMatch(/Lato/);
  });

  it('Sidebar.svelte : aucune monospace, aucune famille écrite en dur', () => {
    const css = style(lire('components/v2/Sidebar.svelte'));
    expect(css).not.toContain('--v2-mono');
    const f = familles(css);
    expect(f.length).toBeGreaterThan(5);
    expect(f.filter((x) => !PERMIS.has(x))).toEqual([]);
  });

  it('ArbreRayons replié dans la barre : la monospace est remplacée par le texte', () => {
    const css = style(lire('components/v2/ArbreRayons.svelte'));
    expect(css).toMatch(
      /\.compact \.compte, \.compact \.sorte, \.compact \.titre-menu, \.compact \.hors h2\{font-family:var\(--v2-police-texte\)\}/,
    );
  });
});

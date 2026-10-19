import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #2092, fil forum 2230 (Daniel, rc3, thème « Clair / Gris ») : la fenêtre
// « Choisir un dossier de musique » gardait un fond gris très foncé, avec des
// noms de dossiers et un bouton « Annuler » en texte sombre. Cause :
// `FolderBrowser.svelte` lisait `--tune-bg-secondary` et `--tune-bg-hover`,
// jetons définis NULLE PART : leur repli sombre (#1e1e1e, #2a2a2a) valait
// dans tous les thèmes, alors que `--tune-text` suivait le thème clair.
// La garde exige que chaque jeton lu existe, puis résout les couleurs comme
// le navigateur et mesure le contraste WCAG dans les thèmes clairs.

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const composant = sansCommentaires(lire('src/components/partages/FolderBrowser.svelte'));
const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(composant)![1];

type Regle = { selecteurs: string[]; decl: Map<string, string> };
function regles(css: string): Regle[] {
  const out: Regle[] = [];
  for (const m of sansCommentaires(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decl = new Map<string, string>();
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) decl.set(d[1], d[2].trim());
    out.push({ selecteurs: m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')), decl });
  }
  return out;
}
const theme = regles(lire('src/styles/tune-theme.css'));
const v2 = regles(lire('src/styles/tune-v2.css'));

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

/** Valeur d'un jeton dans une suite de portées de spécificité croissante. */
function resoudre(portees: Regle[], nom: string, prof = 0): string {
  expect(prof, `boucle en résolvant ${nom}`).toBeLessThan(10);
  let v: string | undefined;
  for (const r of portees) if (r.decl.has(nom)) v = r.decl.get(nom);
  expect(v, `${nom} n'est défini nulle part`).toBeDefined();
  const ref = /^var\((--[\w-]+)\)$/.exec(v!);
  return ref ? resoudre(portees, ref[1], prof + 1) : v!;
}

/** Jeton que pose la propriété `prop` de la règle `sel`. */
function jeton(sel: string, prop: string): string {
  const corps = new RegExp(`(^|[}\\s])${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(style);
  expect(corps, `règle ${sel} introuvable`).not.toBeNull();
  const m = new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*var\\((--[\\w-]+)(?:,[^)]*)?\\)\\s*;`).exec(corps![2]);
  expect(m, `${sel} { ${prop} } doit lire un jeton du thème`).not.toBeNull();
  return m![1];
}

const racine = theme.filter((r) => r.selecteurs.includes(':root'));
const PORTEES: Record<string, Regle[]> = {
  'thème clair': [...racine, ...theme.filter((r) => r.selecteurs.includes('[data-theme="light"]'))],
  ...Object.fromEntries(
    ['clear-grey', 'clear-white'].map((t) => [
      `v2 ${t}`,
      [
        ...racine,
        ...v2.filter((r) => r.selecteurs.includes('.tune-v2')),
        ...v2.filter((r) => r.selecteurs.includes(`:root[data-v2-theme="${t}"] .tune-v2`)),
      ],
    ]),
  ),
};

describe('#2092 — sélecteur de dossier lisible en thème clair', () => {
  it('chaque jeton lu par FolderBrowser est défini dans tune-theme.css', () => {
    const definis = new Set(racine.flatMap((r) => [...r.decl.keys()]));
    const lus = [...style.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
    expect(lus.length).toBeGreaterThan(0);
    expect(lus.filter((n) => !definis.has(n))).toEqual([]);
  });

  for (const [nom, portees] of Object.entries(PORTEES)) {
    it(`${nom} : noms de dossiers et « Annuler » ≥ 4,5:1 sur le fond de la fenêtre`, () => {
      const fond = resoudre(portees, jeton('.folder-modal', 'background'));
      expect(fond).toMatch(/^#[0-9A-Fa-f]{6}$/);
      for (const sel of ['.folder-modal', '.dir-item', '.cancel-btn']) {
        const texte = resoudre(portees, jeton(sel, 'color'));
        expect(contraste(texte, fond), `${sel} : ${texte} sur ${fond}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

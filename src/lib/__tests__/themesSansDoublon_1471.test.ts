import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
/**
 * GARDE des thèmes v2 : aucune propriété déclarée deux fois dans un bloc.
 *
 * ── CE QUI EST ARRIVÉ (#1471) ───────────────────────────────────────────
 *
 * Le bloc « Noir / Bleu » de `src/styles/tune-v2.css` portait DEUX lignes de
 * halos : la bonne (`--v2-glow:rgba(0,188,212,.22)`, bleu) et, juste
 * dessous, une copie mot pour mot de la ligne du thème par défaut
 * « Noir / Vert » (`rgba(0,212,170,…)`, turquoise). En CSS, la dernière
 * déclaration gagne : le thème bleu affichait des halos et des anneaux de
 * focus verts depuis sa naissance (commit 2643312d, 27/08). Aucun outil ne
 * signale une propriété personnalisée redéclarée, et l'œil ne relit pas une
 * ligne de 200 caractères.
 *
 * ── CE QUE CE FICHIER PROUVE ────────────────────────────────────────────
 *
 *  1. Dans le bloc Noir / Bleu, chaque `--v2-*` n'est déclarée qu'UNE fois,
 *     et `--v2-glow` y vaut bien la valeur bleue.
 *  2. Même règle pour les six blocs de thème : un doublon, où qu'il soit,
 *     rougit ici en nommant le thème et la propriété.
 *
 * Contre-épreuve faite : sur `main` avant le correctif, le test 1 rougit
 * (`--v2-glow` déclarée 2 fois, valeur lue `rgba(0,212,170,.22)`).
 */

const ICI = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(ICI, '../../styles/tune-v2.css'), 'utf8');

/** Isole le corps `{ … }` du bloc dont le sélecteur commence par `selecteur`. */
function blocDeTheme(selecteur: string): string {
  const debut = CSS.indexOf(selecteur);
  expect(debut, `sélecteur introuvable : ${selecteur}`).toBeGreaterThan(-1);
  const ouvrante = CSS.indexOf('{', debut);
  const fermante = CSS.indexOf('}', ouvrante);
  expect(ouvrante).toBeGreaterThan(-1);
  expect(fermante).toBeGreaterThan(ouvrante);
  return CSS.slice(ouvrante + 1, fermante);
}

/** `--nom:valeur; --nom2:valeur2;` → liste ordonnée de [nom, valeur]. */
function declarations(corps: string): Array<[string, string]> {
  return corps
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d.startsWith('--'))
    .map((d) => {
      const i = d.indexOf(':');
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as [string, string];
    });
}

function doublons(decls: Array<[string, string]>): Map<string, string[]> {
  const vues = new Map<string, string[]>();
  for (const [nom, valeur] of decls) vues.set(nom, [...(vues.get(nom) ?? []), valeur]);
  return new Map([...vues].filter(([, valeurs]) => valeurs.length > 1));
}

const THEMES: Array<[string, string]> = [
  ['Noir / Vert (défaut)', '\n.tune-v2{'],
  ['Noir / Bleu', ':root[data-v2-theme="black-blue"] .tune-v2{'],
  ['Minuit / Orange', ':root[data-v2-theme="midnight-orange"] .tune-v2{'],
  ['Brun', ':root[data-v2-theme="brown"] .tune-v2{'],
  ['Clair / Blanc', ':root[data-v2-theme="clear-white"] .tune-v2{'],
  ['Clair / Gris', ':root[data-v2-theme="clear-grey"] .tune-v2{'],
];

describe('tune-v2.css — thème Noir / Bleu (#1471)', () => {
  const decls = declarations(blocDeTheme(':root[data-v2-theme="black-blue"] .tune-v2{'));

  it('ne déclare aucune propriété deux fois', () => {
    const d = doublons(decls);
    expect(
      [...d].map(([nom, valeurs]) => `${nom} × ${valeurs.length} : ${valeurs.join(' → ')}`),
    ).toEqual([]);
  });

  it('a des halos bleus, pas ceux du thème vert', () => {
    const valeur = (nom: string) => decls.filter(([n]) => n === nom).at(-1)?.[1];
    expect(valeur('--v2-glow')).toBe('rgba(0,188,212,.22)');
    expect(valeur('--v2-glow-strong')).toBe('rgba(0,188,212,.28)');
    expect(valeur('--v2-acc-soft')).toBe('rgba(46,125,246,.10)');
    expect(valeur('--v2-focus')).toBe('rgba(46,125,246,.16)');
    expect(valeur('--v2-scrim')).toBe('rgba(6,17,26,.8)');
  });
});

describe('tune-v2.css — aucun thème ne redéclare une propriété', () => {
  it.each(THEMES)('%s', (_nom, selecteur) => {
    const d = doublons(declarations(blocDeTheme(selecteur)));
    expect([...d.keys()]).toEqual([]);
  });
});

/**
 * tune-server-rust#6138 — « la page Concerts ne mentionne pas les artistes »
 * (forum 2219, Tades, rc3 Linux).
 *
 * ## Ce que montre la capture
 *
 * Les noms SONT dans la page : « Agnes Obel », « Alain Chamfort »… se lisent
 * en forçant, en quasi-noir sur le fond sombre du thème v2. Les dates, le
 * titre et le libellé « Pays » aussi. Seule la ligne du lieu (`.cc-lieu`,
 * `--tune-text-muted`) ressort. Le journal du serveur le confirme
 * (`upcoming_concerts_fetched count=100`), et le nuage rend bien
 * `artist_name` : rien ne se perd en chemin, c'est l'affichage.
 *
 * ## La cause
 *
 * `body` prend `color: var(--tune-text)` à la racine, où `--tune-text` est
 * celle du thème HÉRITÉ (`tune-theme.css` : `#1A1A1A` sur un thème clair).
 * La coquille v2 ponte `--tune-text: var(--v2-txt)` sur `.tune-v2`, mais une
 * variable pontée ne repeint rien : la couleur déjà CALCULÉE sur `body` est
 * héritée telle quelle. Un écran hérité qui ne redéclare pas `color` affiche
 * donc le texte du thème hérité sur le fond du thème v2. `ConcertsView` était
 * dans ce cas : ni `.cc`, ni `h2`, ni `h3`, ni `.cc-date` ne posaient de
 * couleur.
 *
 * ## Ce que cette garde tient
 *
 * La racine `.cc` redéclare `color: var(--tune-text)` (résolue sous
 * `.tune-v2`, donc au thème v2 courant), et le lien « Billets » prend
 * l'accent du thème au lieu du bleu du navigateur.
 *
 * ## Ce qu'elle ne tient PAS
 *
 * Elle lit la feuille DÉCLARÉE du composant (le CSS scopé de Svelte n'est pas
 * injecté sous vitest+jsdom) : elle prouve la règle, pas le rendu. Elle ne dit
 * rien des autres écrans hérités qui auraient le même oubli.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/v2-heritage/ConcertsView.svelte'),
  'utf-8',
);

/** La feuille du composant seule : le balisage a des `{#if}` qui ressemblent à des blocs. */
const FEUILLE = (() => {
  const i = SOURCE.lastIndexOf('<style');
  const debut = SOURCE.indexOf('>', i) + 1;
  const fin = SOURCE.lastIndexOf('</style>');
  expect(i, 'ConcertsView.svelte n’a plus de <style>').toBeGreaterThan(-1);
  return SOURCE.slice(debut, fin).replace(/\/\*[\s\S]*?\*\//g, '');
})();

/** Les déclarations de toutes les règles dont le sélecteur est exactement `sel`. */
function declarations(sel: string): string {
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(FEUILLE))) {
    const sels = m[1].split(',').map((s) => s.trim());
    if (sels.includes(sel)) out.push(m[2]);
  }
  return out.join(';');
}

describe('#6138 — les artistes de l’écran Concerts sont lisibles sur le thème v2', () => {
  it('la racine .cc redéclare la couleur du texte au thème courant', () => {
    expect(
      declarations('.cc'),
      '`.cc` ne pose aucune `color` : le nom des artistes hérite de la couleur ' +
        'du thème hérité calculée sur `body` (quasi-noir sur fond sombre, #6138)',
    ).toMatch(/(^|;)\s*color\s*:\s*var\(--tune-text\)/);
  });

  it('le lien « Billets » prend l’accent du thème, pas le bleu du navigateur', () => {
    expect(declarations('.cc-dates a')).toMatch(/(^|;)\s*color\s*:\s*var\(--tune-accent/);
  });
});

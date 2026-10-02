// #1873 (Levente Toth, fil 2103, 01/10/2026) : sur la fiche artiste, la
// pastille « All » de la rangée Source était rendue en texte nu, sans bordure,
// et plus bas que « Local » / « YOUTUBE ».
//
// Cause : `DiscographieCommune.svelte` nommait AUSSI `.raz` le bouton « Tout
// afficher » du panneau Focus, et sa règle `.raz { border: 0; padding: 0;
// align-self: flex-end; … }` — de même poids que `.pill`, mais écrite après —
// l'emportait sur la pastille « Toutes » (`class="pill raz"`) : plus de
// bordure, plus de marge, et posée en bas de la rangée.
//
// La garde rejoue la cascade des styles du composant (règles plates, poids =
// nombre de classes, à égalité la dernière gagne ; Svelte ajoute la même
// classe de portée à chaque sélecteur, l'ordre ne change pas) et exige que la
// pastille « Toutes » reçoive la bordure, la marge et l'alignement d'une
// pastille ordinaire. Même exigence pour la rangée de la Recherche.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (nom: string) => readFileSync(resolve(__dirname, '../../components/v2', nom), 'utf-8');

type Regle = { selecteurs: string[]; decl: Map<string, string> };

/** Les règles de premier niveau du `<style>` (les blocs `@media` sont écartés). */
function regles(source: string): Regle[] {
  const m = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!m) throw new Error('pas de <style>');
  let css = m[1].replace(/\/\*[\s\S]*?\*\//g, '');
  // Écarter les at-règles à blocs imbriqués.
  for (;;) {
    const i = css.search(/@[a-z-]+[^{;]*\{/);
    if (i < 0) break;
    let j = css.indexOf('{', i) + 1;
    let prof = 1;
    while (prof > 0 && j < css.length) {
      if (css[j] === '{') prof++;
      else if (css[j] === '}') prof--;
      j++;
    }
    css = css.slice(0, i) + css.slice(j);
  }
  const out: Regle[] = [];
  for (const r of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decl = new Map<string, string>();
    for (const d of r[2].split(';')) {
      const k = d.indexOf(':');
      if (k > 0) decl.set(d.slice(0, k).trim(), d.slice(k + 1).trim());
    }
    out.push({ selecteurs: r[1].split(',').map((s) => s.trim()).filter(Boolean), decl });
  }
  return out;
}

/**
 * Poids d'un sélecteur s'il vise un `<button>` portant exactement `classes`
 * (état de repos : pas de `:hover`), sinon null. Un sélecteur descendant est
 * retenu dès que son dernier maillon vise le bouton — prudence : on en voit
 * trop plutôt que pas assez.
 */
function poids(sel: string, classes: Set<string>): number | null {
  if (/:(hover|focus|active|focus-visible|disabled)/.test(sel)) return null;
  const maillons = sel.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const dernier = maillons[maillons.length - 1];
  const tag = dernier.match(/^[a-z][a-z0-9-]*/i)?.[0];
  if (tag && tag !== 'button') return null;
  if (/[#[:]/.test(dernier)) return null;
  const cls = [...dernier.matchAll(/\.([\w-]+)/g)].map((x) => x[1]);
  if (!cls.length && !tag) return null;
  if (!cls.every((c) => classes.has(c))) return null;
  return maillons.reduce((n, x) => n + (x.match(/\./g)?.length ?? 0), 0);
}

/** Valeur gagnante de chaque propriété pour un bouton portant `classes`. */
function cascade(rs: Regle[], classes: string[]): Map<string, string> {
  const c = new Set(classes);
  const gagnant = new Map<string, { p: number; o: number; v: string }>();
  rs.forEach((r, o) => {
    const p = Math.max(-1, ...r.selecteurs.map((s) => poids(s, c) ?? -1));
    if (p < 0) return;
    for (const [k, v] of r.decl) {
      const g = gagnant.get(k);
      if (!g || p > g.p || (p === g.p && o >= g.o)) gagnant.set(k, { p, o, v });
    }
  });
  return new Map([...gagnant].map(([k, g]) => [k, g.v]));
}

const PROPRIETES = ['border', 'border-width', 'padding', 'align-self', 'margin'] as const;
const forme = (m: Map<string, string>) => Object.fromEntries(PROPRIETES.map((k) => [k, m.get(k)]));

describe('#1873 — la pastille « Toutes » a l’allure d’une pastille', () => {
  for (const [fichier, ordinaire] of [
    ['DiscographieCommune.svelte', ['pill']],
    ['SearchV2.svelte', ['pill', 'src']],
  ] as const) {
    const source = lire(fichier);

    it(`${fichier} : « Toutes » est rendue \`pill raz\``, () => {
      expect(source).toMatch(/<button class="pill raz" data-pastille="tout"/);
    });

    it(`${fichier} : aucune autre règle n’ôte à « Toutes » bordure, marge ou alignement`, () => {
      const rs = regles(source);
      const pastille = forme(cascade(rs, [...ordinaire]));
      expect(pastille.border ?? pastille['border-width']).toMatch(/^1px/);
      for (const etat of [['pill', 'raz'], ['pill', 'raz', 'on']]) {
        expect(forme(cascade(rs, etat))).toEqual(pastille);
      }
    });
  }
});

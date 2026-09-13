/**
 * #1009 — les lignes de TITRE et d’OBJET ne s’alignaient pas.
 *
 * Fabien, fil « v0.9.148 : v1 divers bugs », point 1, capture à l’appui :
 *
 *   « mauvais alignement des titres vs albums/playlist […] la colonne # du
 *     titre devrait être juste en dessous de la colonne + de l’album »
 *
 * ## La cause
 *
 * Deux sortes de lignes de premier niveau, deux mises en page indépendantes :
 *
 * ```text
 * ligne d’OBJET    grille locale `18px auto 1fr auto auto`
 *                  gap 10px · padding 9px 12px · bordure 1px
 * ligne de TITRE   grille CALCULÉE par `ListePistesV2`
 *                  gap 14px · padding 0 10px
 * ```
 *
 * Aucune colonne commune, ni le même écartement, ni la même marge. Elles ne
 * pouvaient s’aligner que par accident.
 *
 * ## Ce que cette garde tient
 *
 * Que la largeur n’est pas RECOPIÉE mais LUE à la source. Le gabarit du
 * tableau dépend des colonnes que l’utilisateur a cochées — Pierre M en avait
 * vingt (#853) — et un nombre figé se déferait au premier changement de
 * réglage.
 *
 * ## Ce qu’elle ne tient PAS
 *
 * L’alignement en pixels à l’écran. Une garde de source ne mesure pas un
 * rendu ; elle empêche les deux lignes de repartir chacune de son côté.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { colonnesRetenues, COLONNES } from '../colonnesPistes';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const hist = () => lire('src/components/v2/HistoriqueV2.svelte');
const liste = () => lire('src/components/v2/ListePistesV2.svelte');

/** Le bloc de règles d’un sélecteur, du `{` au `}`. */
function regle(src: string, selecteur: string): string {
  const i = src.indexOf(selecteur);
  expect(i, `sélecteur absent : ${selecteur}`).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('}', i));
}

describe('#1009 — la ligne d’objet s’aligne sur le tableau des pistes', () => {
  /** 🔴 LE POINT CENTRAL : lue à la source, jamais recopiée. */
  it('la largeur de la première colonne vient de `colonnesPistes`', () => {
    const src = hist();
    expect(src).toContain("from '../../lib/colonnesPistes'");
    expect(src).toContain('colonnesRetenues(');
    // et elle est POSÉE sur la ligne d’objet
    expect(src).toMatch(/style="--col1:\{largeurPremiereColonne\}"/);
    expect(src).toMatch(/grid-template-columns:var\(--col1/);
  });

  it('aucune largeur de première colonne n’est écrite en dur', () => {
    const r = regle(hist(), '.objet{');
    // `44px` ne peut apparaître QUE comme repli du `var()`.
    const enDur = r.match(/grid-template-columns:\s*(\d+px)/);
    expect(enDur, `première colonne figée à ${enDur?.[1]}`).toBeNull();
  });

  /** L’écartement et la marge doivent être ceux de `.trow`. */
  it('l’écartement est celui du tableau des pistes', () => {
    const t = regle(liste(), '.thead, .trow{');
    const gapTableau = /gap:\s*(\d+)px/.exec(t)?.[1];
    const gapObjet = /gap:\s*(\d+)px/.exec(regle(hist(), '.objet{'))?.[1];
    expect(gapTableau, 'le tableau n’a plus de gap lisible').toBeTruthy();
    expect(gapObjet, `objet=${gapObjet} tableau=${gapTableau}`).toBe(gapTableau);
  });

  it('la marge gauche tombe au même endroit, bordure comprise', () => {
    const t = regle(liste(), '.thead, .trow{');
    const padTableau = Number(/padding:\s*0\s+(\d+)px/.exec(t)?.[1]);
    const o = regle(hist(), '.objet{');
    const padObjet = Number(/padding:\s*(\d+)px/.exec(o)?.[1]);
    const bordure = Number(/border:\s*(\d+)px/.exec(o)?.[1] ?? 0);
    expect(padTableau).toBeGreaterThan(0);
    // La bordure de la ligne d’objet compte dans son inset : 1 + 9 = 10.
    expect(bordure + padObjet, `objet ${bordure}+${padObjet} ≠ tableau ${padTableau}`)
      .toBe(padTableau);
  });

  /** Le « + » se cale comme le numéro de piste : à droite de sa cellule. */
  it('le « + » est aligné à droite, comme la colonne des numéros', () => {
    expect(regle(hist(), '.objet .pli{')).toContain('text-align:right');
    const num = COLONNES.find((c) => c.cle === 'num');
    expect(num?.align).toBe('droite');
  });

  /**
   * 🔴 La source LIT bien quelque chose : si `colonnesRetenues` rendait une
   * liste vide, la garde ci-dessus serait verte sur du néant.
   */
  it('la source rend bien une première colonne, dans les deux modes', () => {
    for (const mode of ['beginner', 'expert'] as const) {
      const c = colonnesRetenues([], mode);
      expect(c.length, `aucune colonne en ${mode}`).toBeGreaterThan(0);
      expect(c[0].largeur, `première colonne sans largeur en ${mode}`).toBeTruthy();
    }
  });
});

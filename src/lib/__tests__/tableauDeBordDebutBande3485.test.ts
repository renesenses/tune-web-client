// web#3485 (FabienM, fil 3127, point 10) — Tableau de bord : « Top albums »,
// « Top artistes », « Écoutes par genre », « Il y a quelques années » écrasés
// sur une colonne.
//
// Cause : la grille fluide a douze pistes ; un bloc s'étend sur 3, 4 ou 6
// pistes (`grid-column: span N`). Le premier bloc d'une bande reçoit en plus
// `grid-column-start: 1` pour commencer une rangée. Or cette propriété
// REMPLACE le début « span N » : il reste `1 / auto`, soit UNE piste. Le
// premier classement (« Top albums ») tenait donc dans 1/12 de la largeur.
//
// jsdom ne calcule pas les grilles : ce test lit la feuille et vérifie, pour
// chaque palier, que la règle du premier bloc d’une bande écrit son début ET
// son étendue (jamais `grid-column-start` seul).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', '..', 'components', 'v2', 'PageWidgets.svelte'), 'utf8');
const STYLE = (SRC.split('<style>')[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');

/** Les règles de premier niveau et celles des `@container (max-width: N px)`,
 *  avec leur palier (`large` hors requête), en suivant les accolades. */
function regles(): { palier: string; sel: string; decl: string }[] {
  const out: { palier: string; sel: string; decl: string }[] = [];
  const i = 0;
  const lireBloc = (debut: number, palier: string, fin: number) => {
    let j = debut;
    while (j < fin) {
      const o = STYLE.indexOf('{', j);
      if (o < 0 || o >= fin) break;
      const tete = STYLE.slice(j, o).trim();
      const m = tete.match(/@container\s*\(max-width:\s*(\d+)px\)/);
      if (m) {
        let prof = 1, k = o + 1;
        while (k < fin && prof) { if (STYLE[k] === '{') prof++; else if (STYLE[k] === '}') prof--; k++; }
        lireBloc(o + 1, m[1], k - 1);
        j = k;
      } else if (tete.startsWith('@')) {
        let prof = 1, k = o + 1;
        while (k < fin && prof) { if (STYLE[k] === '{') prof++; else if (STYLE[k] === '}') prof--; k++; }
        j = k;
      } else {
        const c = STYLE.indexOf('}', o);
        out.push({ palier, sel: tete, decl: STYLE.slice(o + 1, c) });
        j = c + 1;
      }
    }
  };
  lireBloc(i, 'large', STYLE.length);
  return out;
}

/** Les déclarations d'une règle visant le premier bloc d'une bande fluide. */
function reglesDebutBande(): { palier: string; decl: string }[] {
  return regles()
    .filter((r) => r.sel.includes('.mosaique.fluide') && r.sel.includes('.bloc.debut-bande'))
    .map(({ palier, decl }) => ({ palier, decl }));
}

describe('web#3485 — le premier bloc d’une bande garde son étendue', () => {
  const regles = reglesDebutBande();

  it('des règles existent pour chaque palier de la grille fluide', () => {
    const paliers = new Set(regles.map((r) => r.palier));
    expect(paliers.has('large')).toBe(true);
    expect(paliers.has('1059')).toBe(true);
  });

  it('aucune n’écrit `grid-column-start` seul (il remplacerait le « span »)', () => {
    for (const r of regles) {
      expect(r.decl, `${r.palier} : ${r.decl}`).not.toMatch(/grid-column-start\s*:/);
    }
  });

  it('chacune donne le début ET l’étendue : 1 / span 3, 4, 6, ou 1 / -1', () => {
    for (const r of regles) {
      const v = r.decl.match(/grid-column\s*:\s*([^;]+)/)?.[1]?.trim() ?? '';
      expect(v, `${r.palier} : ${r.decl}`).toMatch(/^1\s*\/\s*(span\s+(3|4|6)|-1)$/);
    }
  });

  it('les classements (Top albums…) s’étendent sur 3 pistes au palier large', () => {
    const large = regles.filter((r) => r.palier === 'large').map((r) => r.decl).join(' ');
    expect(large).toMatch(/grid-column:\s*1\s*\/\s*span 3/);
  });
});

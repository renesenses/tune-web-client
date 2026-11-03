import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { V2_THEMES, isV2Theme, v2ThemeLabel } from '../v2Theme';
import * as LANGUES from './lesOnzeLangues';

// #2419 — thème « Mozaiklabs » (décision de Bertrand, 26/10/2026, rc9) : fond
// gris anthracite, accent orange en dégradé #F97316 → #EA580C, comme la page
// de connexion Mozaiklabs. Cette garde fixe :
//   - sa place dans la liste des thèmes, avec les MÊMES jetons que les autres
//     thèmes sombres ;
//   - le contraste WCAG AA (4,5:1) du texte, du secondaire, de l'atténué et de
//     l'accent, sur chaque fond ; 3:1 pour l'extrémité sombre du dégradé, qui
//     sert de remplissage et de filet (WCAG 1.4.11), pas de texte ;
//   - le texte posé SUR le dégradé orange (4,5:1 aux deux extrémités) ;
//   - le nom traduit dans toutes les langues.
// Le test de contraste de #2416 (`contrasteThemesSombres2416`) parcourt déjà
// `V2_THEMES` : il couvrira ce thème dès que les deux PR seront fusionnées.

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const ID = 'mozaiklabs';

function luminance(h: string): number {
  const v = h.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const f = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
function contraste(a: string, b: string): number {
  const [h, l] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (h + 0.05) / (l + 0.05);
}

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
const V2 = regles(lire('src/styles/tune-v2.css'));
const jetons = (theme: string) => {
  const m = new Map<string, string>();
  for (const r of V2.filter((r) => r.selecteurs.includes(`:root[data-v2-theme="${theme}"] .tune-v2`)))
    for (const [k, v] of r.decl) m.set(k, v);
  return m;
};
const J = jetons(ID);
const c = (n: string) => {
  const v = J.get(n);
  expect(v, `${n} manque au thème`).toMatch(/^#[0-9A-Fa-f]{6}$/);
  return v!;
};

const FONDS = ['--v2-bg', '--v2-bg2', '--v2-surface', '--v2-surface2', '--v2-hover'];

describe('#2419 — le thème Mozaiklabs', () => {
  it('est dans la liste des thèmes, reconnu et nommé', () => {
    expect(V2_THEMES.map((t) => t.id)).toContain(ID);
    expect(isV2Theme(ID)).toBe(true);
    const t = V2_THEMES.find((x) => x.id === ID)!;
    expect(t.swatch).toEqual(['#1E1F22', '#F97316']);
    expect(v2ThemeLabel(t, (k) => `<${k}>`)).toBe('<settings.themeMozaiklabs>');
  });

  it('porte les mêmes jetons que Gris foncé, le thème sombre le plus récent', () => {
    const gris = jetons('dark-grey');
    const manquants = [...gris.keys()].filter((k) => k.startsWith('--v2-') && !J.has(k));
    expect(manquants, `jetons absents : ${manquants.join(', ')}`).toEqual([]);
  });

  it('peint aussi le fond du document', () => {
    const body = V2.find((r) => r.selecteurs.includes(`:root[data-v2-theme="${ID}"]`));
    expect(body?.decl.get('--v2-body-bg')).toBe(c('--v2-bg'));
  });

  it('a un fond anthracite (gris sombre) et un accent orange en dégradé', () => {
    expect(c('--v2-acc1').toUpperCase()).toBe('#F97316');
    expect(c('--v2-acc2').toUpperCase()).toBe('#EA580C');
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(c('--v2-bg').slice(i, i + 2), 16));
    expect(Math.max(r, g, b) - Math.min(r, g, b), 'le fond doit rester un gris').toBeLessThanOrEqual(8);
    expect(luminance(c('--v2-bg'))).toBeLessThan(0.03);
  });

  it.each(['--v2-txt', '--v2-txt2', '--v2-txt3', '--v2-acc1', '--v2-acc-tint', '--v2-danger'])(
    '🔴 %s ≥ 4,5:1 sur chaque fond',
    (texte) => {
      for (const f of FONDS) {
        const r = contraste(c(texte), c(f));
        expect(r, `${texte} ${c(texte)} sur ${f} ${c(f)} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it('🔴 l’extrémité sombre du dégradé tient 3:1 (remplissage et filet)', () => {
    for (const f of FONDS) {
      const r = contraste(c('--v2-acc2'), c(f));
      expect(r, `--v2-acc2 sur ${f} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });

  it('🔴 le texte posé sur le dégradé orange tient 4,5:1 aux deux extrémités', () => {
    for (const fond of ['--v2-acc1', '--v2-acc2']) {
      const r = contraste(c('--v2-on-acc'), c(fond));
      expect(r, `--v2-on-acc sur ${fond} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('la hiérarchie tient : principal > secondaire > atténué', () => {
    const f = c('--v2-surface2');
    expect(contraste(c('--v2-txt'), f)).toBeGreaterThan(contraste(c('--v2-txt2'), f));
    expect(contraste(c('--v2-txt2'), f)).toBeGreaterThan(contraste(c('--v2-txt3'), f));
  });

  it('garde l’ordre des trois plans : fond < surface de choix < surface flottante', () => {
    const choix = contraste(c('--v2-surface2'), c('--v2-bg'));
    const flottante = contraste(c('--v2-surface'), c('--v2-bg'));
    expect(choix).toBeGreaterThan(1.05);
    expect(flottante).toBeGreaterThan(choix);
  });

  it('son nom est traduit dans toutes les langues', () => {
    const dicos = Object.entries(LANGUES) as [string, Record<string, string>][];
    expect(dicos.length).toBeGreaterThanOrEqual(14);
    for (const [langue, d] of dicos) {
      const nom = d['settings.themeMozaiklabs'];
      expect(nom, `${langue} : nom du thème absent`).toBeTruthy();
      expect(nom, langue).toMatch(/^Mozaiklabs/);
    }
    expect(new Set(dicos.map(([, d]) => d['settings.themeMozaiklabs'])).size, 'le nom est le même partout : non traduit').toBeGreaterThan(10);
  });
});

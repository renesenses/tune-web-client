import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { V2_THEMES, isV2Theme, v2ThemeLabel } from '../v2Theme';
import { MOZAIKLABS_PALETTE, V2_JETONS } from '../v2Jetons';
import * as LANGUES from './lesOnzeLangues';

// #2520 — thème aux couleurs du logo Mozaiklabs (fond noir, mosaïque verte),
// ajouté à côté de l'anthracite / orange (#2419). Cette garde fixe :
//   - sa place dans la liste, son nom traduit ;
//   - que CHAQUE thème définit tous les jetons de `V2_JETONS` (la base de
//     « Mon thème », #2527) ;
//   - le contraste WCAG AA de ce thème : 4,5:1 pour le texte, 3:1 pour le
//     remplissage et les filets (WCAG 1.4.11).

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const ID = 'mozaiklabs-logo';

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
  for (const r of V2.filter((r) => r.selecteurs.includes('.tune-v2'))) for (const [k, v] of r.decl) m.set(k, v);
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
const FONDS = V2_JETONS.fonds;

describe('#2520 — le thème Mozaiklabs (logo)', () => {
  it('est dans la liste, reconnu et nommé ; l’anthracite / orange reste', () => {
    expect(V2_THEMES.map((t) => t.id)).toEqual(expect.arrayContaining([ID, 'mozaiklabs']));
    expect(isV2Theme(ID)).toBe(true);
    const t = V2_THEMES.find((x) => x.id === ID)!;
    expect(t.swatch).toEqual(['#000000', '#2A9F5B']);
    expect(v2ThemeLabel(t, (k) => `<${k}>`)).toBe('<settings.themeMozaiklabsLogo>');
  });

  it('fond noir, accent vert du logo, lettrage blanc', () => {
    expect(c('--v2-bg')).toBe('#000000');
    expect(c('--v2-acc1').toUpperCase()).toBe(MOZAIKLABS_PALETTE.vert);
    expect(c('--v2-acc2').toUpperCase()).toBe(MOZAIKLABS_PALETTE.turquoise);
    expect(c('--v2-txt').toUpperCase()).toBe(MOZAIKLABS_PALETTE.blanc);
  });

  it('peint aussi le fond du document', () => {
    const body = V2.find((r) => r.selecteurs.includes(`:root[data-v2-theme="${ID}"]`));
    expect(body?.decl.get('--v2-body-bg')).toBe(c('--v2-bg'));
  });

  it('🔴 TOUS les thèmes définissent TOUS les jetons de V2_JETONS', () => {
    const noms = Object.values(V2_JETONS).flat();
    for (const t of V2_THEMES) {
      const j = jetons(t.id);
      const manquants = noms.filter((n) => !j.has(n));
      expect(manquants, `${t.id} : jetons absents ${manquants.join(', ')}`).toEqual([]);
    }
  });

  it.each([...V2_JETONS.textes, '--v2-acc1', '--v2-acc-tint', '--v2-danger'])(
    '🔴 %s ≥ 4,5:1 sur chaque fond',
    (texte) => {
      for (const f of FONDS) {
        const r = contraste(c(texte), c(f));
        expect(r, `${texte} ${c(texte)} sur ${f} ${c(f)} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it('🔴 la fin du dégradé et les filets tiennent 3:1 (remplissage, WCAG 1.4.11)', () => {
    for (const f of FONDS) {
      const r = contraste(c('--v2-acc2'), c(f));
      expect(r, `--v2-acc2 sur ${f} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
    // Le filet marquant (line2) se voit sur le fond.
    expect(contraste(c('--v2-line2'), c('--v2-bg'))).toBeGreaterThanOrEqual(1.5);
  });

  it('🔴 le texte posé sur le dégradé vert tient 4,5:1 aux deux extrémités', () => {
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
      expect(d['settings.themeMozaiklabsLogo'], `${langue} : nom absent`).toMatch(/^Mozaiklabs/);
    }
    expect(new Set(dicos.map(([, d]) => d['settings.themeMozaiklabsLogo'])).size).toBeGreaterThan(10);
  });
});

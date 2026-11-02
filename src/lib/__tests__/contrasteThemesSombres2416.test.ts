import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { V2_THEMES } from '../v2Theme';

// #2416 — Réglages › Bibliothèque, carte « Scanner la bibliothèque »
// (testeur Alex, rc8). Dans le thème gris, le texte secondaire se lit. Dans
// les autres thèmes sombres (Noir/Vert, Noir/Bleu, Minuit/Orange, Brun), la
// description, « 25 035 sur 26 431 fichiers », « Toute la bibliothèque » et
// « Ajouté … » sont trop pâles : ils sont écrits en `--v2-txt3` (classe
// `.hint`), qui valait 2,3 à 2,9:1.
//
// La garde RÉSOUT les jetons comme le navigateur (bloc de base `.tune-v2`,
// puis bloc du thème) et calcule le rapport WCAG de CHAQUE thème, pour le
// texte atténué (`--v2-txt3`) et le secondaire (`--v2-txt2`), contre les fonds
// où ils se posent : fond, fond 2, surface, surface de choix (la carte) et
// survol. Seuil : 4,5:1, WCAG AA pour du texte normal.

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

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

function resoudre(theme: string, nom: string): string {
  const portee = [
    ...V2.filter((r) => r.selecteurs.includes('.tune-v2')),
    ...V2.filter((r) => r.selecteurs.includes(`:root[data-v2-theme="${theme}"] .tune-v2`)),
  ];
  let v: string | undefined;
  for (const r of portee) if (r.decl.has(nom)) v = r.decl.get(nom);
  expect(v, `${nom} n'est défini nulle part pour ${theme}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
  return v!;
}

const FONDS = ['--v2-bg', '--v2-bg2', '--v2-surface', '--v2-surface2', '--v2-hover'];
const TEXTES = ['--v2-txt2', '--v2-txt3'];
const SEUIL = 4.5;

describe('#2416 — le texte secondaire se lit dans CHAQUE thème', () => {
  it('la liste des thèmes est celle de l’application', () => {
    expect(V2_THEMES.map((t) => t.id)).toEqual(
      expect.arrayContaining(['black-green', 'black-blue', 'midnight-orange', 'brown', 'dark-grey', 'clear-white', 'clear-grey']),
    );
  });

  for (const theme of V2_THEMES.map((t) => t.id)) {
    for (const texte of TEXTES) {
      it(`🔴 ${theme} : ${texte} ≥ ${SEUIL}:1 sur chaque fond`, () => {
        const couleur = resoudre(theme, texte);
        for (const f of FONDS) {
          const c = contraste(couleur, resoudre(theme, f));
          expect(c, `${theme} ${texte} ${couleur} sur ${f} ${resoudre(theme, f)} = ${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(SEUIL);
        }
      });
    }
  }

  it('la hiérarchie tient : l’atténué reste moins contrasté que le secondaire', () => {
    for (const { id } of V2_THEMES) {
      const fond = resoudre(id, '--v2-surface2');
      expect(contraste(resoudre(id, '--v2-txt3'), fond), id).toBeLessThanOrEqual(
        contraste(resoudre(id, '--v2-txt2'), fond),
      );
    }
  });

  it('le thème gris, qui va bien, n’a pas bougé', () => {
    expect(resoudre('dark-grey', '--v2-txt3')).toBe('#A6A6A6');
    expect(resoudre('dark-grey', '--v2-txt2')).toBe('#C2C2C2');
  });
});

/**
 * Design v3 de Levente (§10.4) — décision de Bertrand du 22/11/2026 :
 * « le fond flou de la pochette dans Lecture en cours : le ramener, bien
 * visible derrière tout le panneau, en-tête compris », avec un voile issu des
 * jetons du thème sous le texte, pour un contraste WCAG AA d'au moins 4,5:1,
 * vérifié sur une pochette très claire et une très sombre.
 *
 * ## Ce que ce banc mesure
 *
 * Pour CHACUN des neuf thèmes du client v2 (dont `clear-white` et
 * `clear-grey`), le fond composité de l'écran — la pochette floutée à sa
 * luminosité naturelle, puis le voile `--v2-bg` à l'opacité que le composant
 * déclare pour ce thème — est calculé pour une pochette BLANCHE et une
 * pochette NOIRE. Le flou ne fait que moyenner des pixels : ces deux-là
 * bornent la luminance de toute pochette. Sur ce fond, le texte principal
 * (`--v2-txt`), secondaire (`--v2-txt2`), ATTÉNUÉ (`--v2-txt3`, le plus
 * faible de l'écran) et l'accent employé comme texte (`--v2-acc1`, ligne
 * active des paroles, « Voir la file ») doivent tous tenir 4,5:1.
 *
 * Il mesure aussi la promesse inverse : la pochette doit RESTER visible —
 * au moins le triple de l'ancienne recette sur les thèmes sombres.
 *
 * ## Ce qu'il ne mesure pas
 *
 * - Aucune couleur CALCULÉE par un navigateur : le CSS scopé de Svelte n'est
 *   pas injecté sous vitest. Le banc compose à la main les valeurs DÉCLARÉES
 *   (comme `fondClairLectureEnCours1144.test.ts`). Il prouve la règle CSS,
 *   pas le rendu.
 * - « Mon thème » (greffon) : ses jetons sont choisis par l'utilisateur. Le
 *   banc borne seulement son côté : un fond perso CLAIR prend le voile de
 *   `clear-white` (0,94), un fond sombre le défaut (0,92) — vérifié avec les
 *   jetons de `clear-white` et de `black-green` recopiés en thème perso.
 * - Une pochette très SATURÉE : `blur()` ne déplace pas la luminance, mais le
 *   banc ne raisonne qu'en luminance.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cssDuTheme, JETONS_MON_THEME } from '../monTheme';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const SOURCE = lire('src/components/partages/NowPlaying.svelte');
const THEMES_CSS = lire('src/styles/tune-v2.css');

const FEUILLE = (() => {
  const i = SOURCE.lastIndexOf('<style');
  return SOURCE.slice(SOURCE.indexOf('>', i) + 1, SOURCE.lastIndexOf('</style>'));
})();

const THEMES = [
  'black-green', 'black-blue', 'midnight-orange', 'mozaiklabs', 'mozaiklabs-logo',
  'brown', 'dark-grey', 'clear-white', 'clear-grey',
] as const;
type Theme = (typeof THEMES)[number];
const CLAIRS: readonly Theme[] = ['clear-white', 'clear-grey'];

type RVB = [number, number, number];
const hex = (s: string): RVB => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)) as RVB;
const canal = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]: RVB) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
function contraste(a: RVB, b: RVB): number {
  const [h, l] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (h + 0.05) / (l + 0.05);
}
const superposer = (dessous: RVB, dessus: RVB, o: number): RVB =>
  dessous.map((v, i) => v * (1 - o) + dessus[i] * o) as RVB;

function blocTheme(theme: Theme): string {
  // `black-green` est le défaut : ses jetons sont sur `.tune-v2{` nu.
  const ancre = theme === 'black-green' ? '\n.tune-v2{' : `:root[data-v2-theme="${theme}"] .tune-v2{`;
  const i = THEMES_CSS.indexOf(ancre);
  expect(i, `thème ${theme} introuvable dans tune-v2.css`).toBeGreaterThan(-1);
  return THEMES_CSS.slice(i, THEMES_CSS.indexOf('}', i));
}
function jeton(theme: Theme, nom: string): RVB {
  const m = blocTheme(theme).match(new RegExp(`${nom}:\\s*(#[0-9A-Fa-f]{6})`));
  expect(m, `${nom} introuvable pour ${theme}`).not.toBeNull();
  return hex(m![1]);
}

/** Les règles de la feuille qui visent `.classe`, avec leur thème éventuel. */
function regles(classe: string): { theme: string | null; corps: string; sel: string }[] {
  const out: { theme: string | null; corps: string; sel: string }[] = [];
  const re = new RegExp(`([^{}@;]*\\.${classe}\\b[^{}]*)\\{([^{}]*)\\}`, 'g');
  for (const m of FEUILLE.matchAll(re)) {
    for (const sel of m[1].split(',')) {
      if (!new RegExp(`\\.${classe}\\b`).test(sel) || sel.includes('data-kiosk')) continue;
      out.push({ theme: sel.match(/data-v2-theme="([a-z-]+)"/)?.[1] ?? null, corps: m[2], sel: sel.trim() });
    }
  }
  return out;
}

/** L'opacité du voile sous ce thème, par ordre de source. */
function voile(theme: Theme): number {
  let o: number | null = null;
  for (const r of regles('bg-teinte')) {
    if (r.theme !== null && r.theme !== theme) continue;
    const m = r.corps.match(/opacity:\s*([\d.]+)/);
    if (m) o = Number(m[1]);
  }
  expect(o, `.bg-teinte sans opacité pour ${theme}`).not.toBeNull();
  return o!;
}

const BLANCHE: RVB = [255, 255, 255];
const NOIRE: RVB = [0, 0, 0];
const AA = 4.5;
const TEXTES = ['--v2-txt', '--v2-txt2', '--v2-txt3', '--v2-acc1'] as const;

/** La part de la pochette dans le fond de l'ANCIENNE recette (#993 puis
 *  17/09) : `brightness(0.12)` sous un voile à 0,78. */
const PART_AVANT = 0.12 * (1 - 0.78);

describe('Lecture en cours v3 — le fond de pochette, visible ET lisible', () => {
  it('la pochette est à sa luminosité naturelle : plus de brightness() hors kiosque', () => {
    const base = regles('bg-blur').filter((r) => r.theme === null);
    expect(base.length).toBeGreaterThan(0);
    for (const r of base) expect(r.corps, r.sel).not.toMatch(/brightness\(/);
    expect(base.some((r) => /filter:\s*blur\(/.test(r.corps))).toBe(true);
  });

  it('le voile est le jeton du thème, et rien d’autre', () => {
    const base = regles('bg-teinte').find((r) => r.theme === null);
    expect(base!.corps).toContain('background: var(--v2-bg, transparent);');
    // Aucune couleur brute sous le texte.
    for (const r of regles('bg-teinte')) expect(r.corps, r.sel).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(/i);
  });

  it('le fond couvre tout le panneau, en-tête compris : il est AVANT le défileur', () => {
    const fond = SOURCE.indexOf('<div class="bg-blur"');
    const titre = SOURCE.indexOf('<h1 class="np-titre-ecran"');
    const defileur = SOURCE.indexOf('<div class="np-scroll">');
    expect(fond).toBeGreaterThan(-1);
    expect(titre).toBeGreaterThan(-1);
    // Frères dans `.now-playing`, posés en `inset` : le titre et le retour
    // sont peints par-dessus le même fond que le contenu.
    expect(fond).toBeLessThan(defileur);
    const bloc = regles('bg-blur').find((r) => r.theme === null)!.corps;
    expect(bloc).toMatch(/position:\s*absolute/);
    expect(bloc).toMatch(/inset:\s*-\d+px/);
  });

  it('fond FIXE sous prefers-reduced-motion', () => {
    const i = FEUILLE.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(i).toBeGreaterThan(-1);
    const bloc = FEUILLE.slice(i, FEUILLE.indexOf('}\n  }', i) + 5);
    expect(bloc).toMatch(/\.bg-blur\s*\{\s*transition:\s*none/);
  });

  for (const theme of THEMES) {
    it(`${theme} : AA (≥ 4,5:1) pour txt, txt2, txt3 et l’accent, pochette blanche ET noire`, () => {
      const o = voile(theme);
      const bg = jeton(theme, '--v2-bg');
      for (const [nom, pochette] of [['blanche', BLANCHE], ['noire', NOIRE]] as const) {
        const fond = superposer(pochette, bg, o);
        for (const t of TEXTES) {
          const r = contraste(fond, jeton(theme, t));
          expect(r, `${theme}, pochette ${nom}, ${t} : ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
        }
      }
    });
  }

  it('la pochette reste VISIBLE : au moins 3× l’ancienne recette sur les thèmes sombres', () => {
    for (const theme of THEMES) {
      const part = 1 - voile(theme);
      expect(part, `${theme} : voile opaque`).toBeGreaterThan(0);
      if (!CLAIRS.includes(theme)) {
        expect(part, `${theme} : la pochette n’est pas revenue`).toBeGreaterThanOrEqual(3 * PART_AVANT - 1e-9);
      }
    }
  });

  it('contre-épreuve : un voile trop fin (0,80) ferait tomber txt3 sous AA sur une pochette blanche', () => {
    const bg = jeton('brown', '--v2-bg');
    const fond = superposer(BLANCHE, bg, 0.8);
    expect(contraste(fond, jeton('brown', '--v2-txt3'))).toBeLessThan(AA);
    // … et la recette retenue pour Brun le garde.
    expect(contraste(superposer(BLANCHE, bg, voile('brown')), jeton('brown', '--v2-txt3'))).toBeGreaterThanOrEqual(AA);
  });
});

/**
 * « Mon thème » clair (23/11/2026) : le voile suivait `data-v2-theme`, le
 * thème de BASE, que le thème perso recouvre. Un fond perso clair posé sur une
 * base sombre gardait donc 0,92 — et sur une pochette noire, le texte atténué
 * de clear-white tombait à 4,35:1. Le voile suit désormais le côté du fond
 * perso, écrit par `cssDuTheme` dans `--v2-voile-lecture`.
 */
describe('Lecture en cours v3 — le voile sous « Mon thème »', () => {
  const perso = (theme: Theme) => {
    const colors: Record<string, string> = {};
    for (const j of JETONS_MON_THEME) {
      const m = blocTheme(theme).match(new RegExp(`${j}:\\s*(#[0-9A-Fa-f]{6})`));
      colors[j] = m ? m[1] : '#000000';
    }
    return colors;
  };
  const voilePerso = (colors: Record<string, string>) => {
    const m = cssDuTheme({ colors }).match(/--v2-voile-lecture:([\d.]+);/);
    expect(m, 'cssDuTheme ne pose pas --v2-voile-lecture').not.toBeNull();
    return Number(m![1]);
  };

  it('🔴 un fond perso CLAIR prend 0,94 (comme clear-white), un fond sombre 0,92', () => {
    expect(voilePerso(perso('clear-white'))).toBe(0.94);
    expect(voilePerso(perso('black-green'))).toBe(0.92);
  });

  it('🔴 la feuille applique ce voile sous « Mon thème », quel que soit le thème de base', () => {
    const r = regles('bg-teinte').find((x) => x.sel.includes('data-v2-mon-theme'));
    expect(r, 'aucune règle .bg-teinte sous [data-v2-mon-theme]').toBeDefined();
    expect(r!.corps).toMatch(/opacity:\s*var\(--v2-voile-lecture,\s*0\.92\)/);
    // Plus spécifique que `:root[data-v2-theme="clear-white"]` : deux attributs.
    expect(r!.sel).toContain(':root[data-v2-theme][data-v2-mon-theme]');
  });

  it('jetons de clear-white en thème perso : AA pochette blanche ET noire au voile retenu', () => {
    const colors = perso('clear-white');
    const o = voilePerso(colors);
    const bg = hex(colors['--v2-bg']);
    for (const pochette of [BLANCHE, NOIRE]) {
      for (const t of TEXTES) {
        const r = contraste(superposer(pochette, bg, o), hex(colors[t]));
        expect(r, `${t} : ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it('contre-épreuve : au voile par défaut (0,92), txt3 de clear-white tombe sous AA sur pochette noire', () => {
    const colors = perso('clear-white');
    const r = contraste(superposer(NOIRE, hex(colors['--v2-bg']), 0.92), hex(colors['--v2-txt3']));
    expect(r).toBeLessThan(AA);
  });
});

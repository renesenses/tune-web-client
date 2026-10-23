// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { V2_THEMES, isV2Theme, v2ThemeLabel } from '../v2Theme';

// #2364 (Sandro, fil 2405) : un thème intermédiaire « Gris foncé », fonds gris
// NEUTRES entre les thèmes très sombres et les thèmes clairs. Décision de
// Bertrand du 24/10/2026. Cette garde fixe :
//   - la palette complète (tous les jetons qu'un thème sombre définit) ;
//   - des fonds réellement neutres (R = V = B) ;
//   - le contraste WCAG ≥ 4,5:1 du texte principal, secondaire et atténué,
//     jetons RÉSOLUS comme le navigateur (thème → pont → tune-theme.css) ;
//   - le nom traduit dans les 12 langues et le choix mémorisé.

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const ID = 'dark-grey';
const SELECTEUR = `:root[data-v2-theme="${ID}"] .tune-v2`;

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
const RACINE = regles(lire('src/styles/tune-theme.css')).filter((r) => r.selecteurs.includes(':root'));

/** Jetons déclarés par le bloc propre d'un thème. */
function jetonsDuTheme(theme: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of V2.filter((r) => r.selecteurs.includes(`:root[data-v2-theme="${theme}"] .tune-v2`)))
    for (const [k, v] of r.decl) m.set(k, v);
  return m;
}

/** Valeur calculée d'un jeton sous `.tune-v2`, thème `theme`. */
function resoudre(theme: string, nom: string): string {
  const portee = [
    ...V2.filter((r) => r.selecteurs.includes('.tune-v2')),
    ...V2.filter((r) => r.selecteurs.includes(`:root[data-v2-theme="${theme}"] .tune-v2`)),
  ];
  const valeur = (n: string, prof = 0): string => {
    expect(prof, `boucle en résolvant ${n}`).toBeLessThan(10);
    let v: string | undefined;
    for (const r of portee) if (r.decl.has(n)) v = r.decl.get(n);
    if (v === undefined) for (const r of RACINE) if (r.decl.has(n)) v = r.decl.get(n);
    expect(v, `${n} n'est défini nulle part`).toBeDefined();
    const ref = /^var\((--[\w-]+)\)$/.exec(v!);
    return ref ? valeur(ref[1], prof + 1) : v!;
  };
  const v = valeur(nom);
  expect(v, `${nom} doit être une couleur #RRGGBB`).toMatch(/^#[0-9A-Fa-f]{6}$/);
  return v;
}

const SOMBRES = ['black-green', 'black-blue', 'midnight-orange', 'brown'];
const CLAIRS = ['clear-white', 'clear-grey'];

describe('#2364 — thème « Gris foncé » : palette complète', () => {
  it('est une palette connue du sélecteur, rangée entre les sombres et les clairs', () => {
    expect(isV2Theme(ID)).toBe(true);
    const ids = V2_THEMES.map((t) => t.id) as string[];
    expect(ids.indexOf(ID)).toBe(ids.indexOf('brown') + 1);
    expect(ids.indexOf(ID)).toBe(ids.indexOf('clear-white') - 1);
  });

  it('définit tous les jetons que définissent les autres thèmes sombres', () => {
    const siens = jetonsDuTheme(ID);
    for (const t of SOMBRES.slice(1)) {
      const manquants = [...jetonsDuTheme(t).keys()].filter((k) => !siens.has(k));
      expect(manquants, `jetons de ${t} absents de ${ID}`).toEqual([]);
    }
    expect(siens.size).toBeGreaterThanOrEqual(jetonsDuTheme('black-blue').size);
  });

  it('peint aussi le fond du document et ponte --tune-grey2', () => {
    const body = V2.find((r) => r.selecteurs.includes(`:root[data-v2-theme="${ID}"]`));
    expect(body?.decl.get('--v2-body-bg')).toBe(resoudre(ID, '--v2-bg'));
    // Le #2A2A2A historique se confondrait avec le fond #2B2B2B : les puces
    // doivent prendre la surface de choix, comme dans les thèmes clairs.
    expect(resoudre(ID, '--tune-grey2')).toBe(resoudre(ID, '--v2-surface2'));
    expect(contraste(resoudre(ID, '--tune-grey2'), resoudre(ID, '--v2-bg'))).toBeGreaterThan(1.05);
  });

  it('a des fonds gris NEUTRES : ni bleu ni brun (R = V = B)', () => {
    const fonds = ['--v2-bg', '--v2-bg2', '--v2-surface', '--v2-surface2', '--v2-line', '--v2-line2',
      '--v2-hover', '--v2-active1', '--v2-active2', '--v2-player1', '--v2-player2', '--v2-av1', '--v2-av2'];
    for (const f of fonds) {
      const v = resoudre(ID, f).slice(1).toUpperCase();
      expect([v.slice(2, 4), v.slice(4, 6)], `${f} = #${v}`).toEqual([v.slice(0, 2), v.slice(0, 2)]);
    }
  });

  it('est bien INTERMÉDIAIRE : plus clair que les sombres, plus sombre que les clairs', () => {
    const l = luminance(resoudre(ID, '--v2-bg'));
    for (const t of SOMBRES) expect(l, t).toBeGreaterThan(luminance(resoudre(t, '--v2-bg')));
    for (const t of CLAIRS) expect(l, t).toBeLessThan(luminance(resoudre(t, '--v2-bg')));
  });

  it('garde l’ordre des trois plans : fond < surface de choix < surface flottante', () => {
    const bg = resoudre(ID, '--v2-bg');
    const choix = contraste(resoudre(ID, '--v2-surface2'), bg);
    const flottante = contraste(resoudre(ID, '--v2-surface'), bg);
    expect(choix).toBeGreaterThanOrEqual(1.07);
    expect(choix).toBeLessThanOrEqual(1.13);
    expect(flottante).toBeGreaterThan(choix);
    expect(flottante).toBeGreaterThanOrEqual(1.19);
  });
});

describe('#2364 — thème « Gris foncé » : contraste ≥ 4,5:1', () => {
  const FONDS = ['--v2-bg', '--v2-bg2', '--tune-surface', '--v2-surface2', '--tune-grey2', '--v2-hover',
    '--v2-active1', '--v2-active2', '--v2-player1', '--v2-player2'];
  const TEXTES = ['--tune-text', '--tune-text-secondary', '--tune-text-muted', '--tune-text-dim'];

  it.each(TEXTES)('%s sur chaque fond', (texte) => {
    for (const f of FONDS) {
      const c = contraste(resoudre(ID, f), resoudre(ID, texte));
      expect(c, `${texte} sur ${f} = ${c.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('valeurs mesurées du texte principal et secondaire sur le fond', () => {
    const bg = resoudre(ID, '--v2-bg');
    expect(contraste(bg, resoudre(ID, '--v2-txt'))).toBeCloseTo(12.65, 1);
    expect(contraste(bg, resoudre(ID, '--v2-txt2'))).toBeCloseTo(7.95, 1);
  });

  it('accent, danger et texte sur accent restent lisibles', () => {
    for (const f of ['--v2-bg', '--v2-surface', '--v2-surface2']) {
      expect(contraste(resoudre(ID, f), resoudre(ID, '--v2-acc1')), f).toBeGreaterThanOrEqual(4.5);
      expect(contraste(resoudre(ID, f), resoudre(ID, '--v2-danger')), f).toBeGreaterThanOrEqual(4.5);
    }
    expect(contraste(resoudre(ID, '--v2-acc1'), resoudre(ID, '--v2-on-acc'))).toBeGreaterThanOrEqual(4.5);
  });

  it('la hiérarchie tient : principal > secondaire > atténué', () => {
    const f = resoudre(ID, '--tune-surface');
    const c = (n: string) => contraste(f, resoudre(ID, n));
    expect(c('--tune-text')).toBeGreaterThan(c('--tune-text-secondary'));
    expect(c('--tune-text-secondary')).toBeGreaterThan(c('--tune-text-muted'));
  });
});

describe('#2364 — nom traduit et choix mémorisé', () => {
  const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'hu', 'ja', 'ko', 'ro', 'sv', 'vi', 'zh'];

  it('le nom est traduit dans les 12 langues', () => {
    const th = V2_THEMES.find((t) => t.id === ID)!;
    expect('labelKey' in th && th.labelKey).toBe('settings.themeDarkGrey');
    for (const l of LANGUES) {
      const src = lire(`src/lib/locales/${l}.ts`);
      expect(src, l).toMatch(/"settings\.themeDarkGrey": "[^"]+"/);
      expect(src, `${l} : l'aide compte encore six palettes`).not.toMatch(/"settings\.themePalettesHint": "(Six|Sechs|Seis|Sei|Hat|Sex|Sáu|6 |六|여섯|Șase)/);
    }
    expect(v2ThemeLabel(th, (k) => `«${k}»`)).toBe('«settings.themeDarkGrey»');
    const brun = V2_THEMES.find((t) => t.id === 'brown')!;
    expect(v2ThemeLabel(brun, () => 'X')).toBe('Brun');
  });

  it('les deux sélecteurs affichent le nom traduit', () => {
    for (const f of ['src/components/v2/SettingsV2.svelte', 'src/components/v2/AvatarMenu.svelte']) {
      const src = lire(f);
      expect(src, f).toMatch(/aria-label=\{v2ThemeLabel\(th,/);
      expect(src, f).not.toMatch(/aria-label=\{(th|t)\.label\}/);
    }
  });

  it('le choix « Gris foncé » survit au rechargement des préférences', async () => {
    localStorage.setItem('tune-preferences', JSON.stringify({ v2Theme: ID }));
    vi.resetModules();
    const { preferences } = await import('../stores/preferences');
    expect(get(preferences).v2Theme).toBe(ID);
    localStorage.removeItem('tune-preferences');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Fil 2136 (Pierre, 04/10/2026) : « Code couleur à revoir ». Écran Ambiance,
// thème v2 « Clair / Gris ». Deux couleurs prévues pour un fond sombre :
//   - les puces d'exemples tirent leur fond de `--tune-grey2`, que le pont de
//     `tune-v2.css` ne redéfinissait pas : il restait #2A2A2A, et le texte
//     secondaire y tombait à 2,1:1 ;
//   - la carte d'analyse lisait `var(--surface, #1c1c22)`, variable définie
//     nulle part : carte noire, « Analyse en cours » à 2,5:1, pourcentage à
//     1,01:1 — invisible.
// La garde RÉSOUT les jetons comme le navigateur (thème clair → pont → repli
// de `tune-theme.css`) et calcule le contraste WCAG des paires réellement
// posées par les composants.

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

function contraste(a: string, b: string): number {
  const lum = (h: string) => {
    const v = h.replace('#', '');
    const c = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
    const f = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x);
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

/** Valeur calculée d'un jeton `--tune-*` / `--v2-*` sous `.tune-v2`, thème v2 `theme`. */
function resoudre(theme: string, nom: string): string {
  const v2 = regles(lire('src/styles/tune-v2.css'));
  const racine = regles(lire('src/styles/tune-theme.css')).filter((r) => r.selecteurs.includes(':root'));
  // Spécificité croissante : `.tune-v2` (1) puis `:root[data-v2-theme=…] .tune-v2` (3).
  const portee = [
    ...v2.filter((r) => r.selecteurs.includes('.tune-v2')),
    ...v2.filter((r) => r.selecteurs.includes(`:root[data-v2-theme="${theme}"] .tune-v2`)),
  ];
  const valeur = (n: string, prof = 0): string => {
    expect(prof, `boucle en résolvant ${n}`).toBeLessThan(10);
    let v: string | undefined;
    for (const r of portee) if (r.decl.has(n)) v = r.decl.get(n);
    // Pas défini sous .tune-v2 : la valeur HÉRITE de :root (tune-theme.css).
    if (v === undefined) for (const r of racine) if (r.decl.has(n)) v = r.decl.get(n);
    expect(v, `${n} n'est défini nulle part`).toBeDefined();
    const ref = /^var\((--[\w-]+)\)$/.exec(v!);
    return ref ? valeur(ref[1], prof + 1) : v!;
  };
  const v = valeur(nom);
  expect(v, `${nom} doit être une couleur #RRGGBB`).toMatch(/^#[0-9A-Fa-f]{6}$/);
  return v;
}

const THEMES_CLAIRS = ['clear-grey', 'clear-white'];

describe('Fil 2136 — contraste des thèmes v2 clairs', () => {
  const ambiance = sansCommentaires(lire('src/components/v2-heritage/AmbianceView.svelte'));
  const progres = sansCommentaires(lire('src/components/partages/AcousticProgress.svelte'));

  it('les deux thèmes clairs existent bien dans tune-v2.css', () => {
    for (const t of THEMES_CLAIRS) expect(contraste(resoudre(t, '--v2-bg'), '#000000')).toBeGreaterThan(15);
  });

  it('puces d’exemples d’Ambiance : texte ≥ 4,5:1 sur leur fond', () => {
    // Les jetons que la règle `.chip` pose réellement (ligne 629 et 632).
    const chip = /\.chip\s*\{([^}]*)\}/.exec(ambiance);
    expect(chip, 'règle .chip introuvable').not.toBeNull();
    expect(chip![1]).toContain('background: var(--tune-grey2)');
    expect(chip![1]).toContain('color: var(--tune-text-secondary)');
    for (const t of THEMES_CLAIRS) {
      const fond = resoudre(t, '--tune-grey2');
      for (const texte of ['--tune-text', '--tune-text-secondary']) {
        const c = contraste(fond, resoudre(t, texte));
        expect(c, `${t} : ${texte} sur --tune-grey2 (${fond}) = ${c.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('carte d’analyse : jetons du thème, plus de repli sombre codé en dur', () => {
    const carte = /\.acoustic-notice\s*\{([^}]*)\}/.exec(ambiance);
    expect(carte, 'règle .acoustic-notice introuvable').not.toBeNull();
    expect(carte![1]).toContain('background: var(--tune-surface)');
    expect(carte![1]).toContain('var(--tune-border)');
    // `--surface` et `--border` ne sont définies nulle part : seul le repli
    // sombre s'appliquait. Même défaut dans l'encart des Concerts.
    for (const f of ['v2-heritage/AmbianceView', 'v2-heritage/ConcertsView']) {
      const src = sansCommentaires(lire(`src/components/${f}.svelte`));
      expect(src, f).not.toMatch(/var\(--surface,/);
      expect(src, f).not.toMatch(/var\(--border,/);
    }
    // « Analyse en cours » (secondaire) et le pourcentage (texte) sur la carte.
    expect(progres).toMatch(/\.acx-label\s*\{[^}]*color: var\(--tune-text-secondary\)/);
    expect(progres).toMatch(/\.acx-pct\s*\{[^}]*color: var\(--tune-text\)/);
    for (const t of THEMES_CLAIRS) {
      const fond = resoudre(t, '--tune-surface');
      for (const texte of ['--tune-text', '--tune-text-secondary']) {
        const c = contraste(fond, resoudre(t, texte));
        expect(c, `${t} : ${texte} sur --tune-surface (${fond}) = ${c.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('les thèmes sombres gardent leur --tune-grey2 (rien ne change pour eux)', () => {
    for (const t of ['black-green', 'black-blue', 'midnight-orange', 'brown']) {
      expect(resoudre(t, '--tune-grey2'), t).toBe('#2A2A2A');
    }
  });
});

// Décision de Bertrand (04/10/2026) : le texte ATTÉNUÉ des thèmes clairs
// (`--v2-txt3`, ponté en `--tune-text-muted` et `--tune-text-dim`) était à
// 3,03:1 (Blanc) et 3,66:1 (Gris) sur la surface, 2,74 et 2,92 sur la surface
// de choix. Il doit tenir 4,5:1 sur tous les fonds où il est posé.
describe('Texte atténué des thèmes v2 clairs — ≥ 4,5:1', () => {
  const ambiance = sansCommentaires(lire('src/components/v2-heritage/AmbianceView.svelte'));
  const progres = sansCommentaires(lire('src/components/partages/AcousticProgress.svelte'));
  // Fond, fond 2, surface (et la carte d'analyse d'Ambiance, posée dessus),
  // surface de choix (`--tune-grey2` des puces y est pontée) et survol.
  const FONDS = ['--v2-bg', '--v2-bg2', '--tune-surface', '--v2-surface2', '--tune-grey2', '--v2-hover'];

  it('--tune-text-muted et --tune-text-dim ≥ 4,5:1 sur chaque fond', () => {
    for (const t of THEMES_CLAIRS) {
      for (const texte of ['--tune-text-muted', '--tune-text-dim']) {
        for (const f of FONDS) {
          const c = contraste(resoudre(t, f), resoudre(t, texte));
          expect(c, `${t} : ${texte} sur ${f} = ${c.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('la hiérarchie tient : l’atténué reste plus clair que le secondaire', () => {
    for (const t of THEMES_CLAIRS) {
      const fond = resoudre(t, '--tune-surface');
      const attenue = contraste(fond, resoudre(t, '--tune-text-muted'));
      const secondaire = contraste(fond, resoudre(t, '--tune-text-secondary'));
      expect(attenue, t).toBeLessThan(secondaire);
    }
  });

  it('carte d’analyse : son texte d’explication lit un jeton du thème', () => {
    const corps = /\.acoustic-notice-body\s*\{([^}]*)\}/.exec(ambiance);
    expect(corps, 'règle .acoustic-notice-body introuvable').not.toBeNull();
    // `--text-muted` n'existe nulle part : seul le repli #a0a0a8 s'appliquait,
    // à 2,6:1 sur la carte devenue blanche.
    expect(corps![1]).toContain('color: var(--tune-text-secondary)');
    expect(progres).toMatch(/\.acx-sub\s*\{[^}]*color: var\(--tune-text-muted\)/);
  });

  it('les thèmes sombres gardent leur --v2-txt3 (rien ne change pour eux)', () => {
    const attendu: Record<string, string> = {
      'black-green': '#4F5D6D',
      'black-blue': '#4D5B70',
      'midnight-orange': '#5D6788',
      brown: '#7A6753',
    };
    for (const [t, v] of Object.entries(attendu)) expect(resoudre(t, '--v2-txt3'), t).toBe(v);
  });
});

describe('SmartFolderPicker — jetons réels, plus de replis sombres', () => {
  const picker = sansCommentaires(lire('src/components/partages/SmartFolderPicker.svelte'));

  it('n’utilise plus --border, --bg-elev, --text-dim ni --accent', () => {
    expect(picker).not.toMatch(/var\(--(border|bg-elev|text-dim|accent)\b/);
  });

  it('chaque variable qu’il lit est définie, dans les six thèmes', () => {
    const noms = [...new Set([...picker.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))];
    expect(noms.length).toBeGreaterThan(0);
    for (const t of ['black-green', 'black-blue', 'midnight-orange', 'brown', ...THEMES_CLAIRS]) {
      for (const n of noms) resoudre(t, n);
    }
  });
});

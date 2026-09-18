/**
 * #1144 — « Lecture en cours : fond délavé et TEXTE ILLISIBLE ».
 *
 * ## Ce que #993 a réglé, et ce qu'il a laissé
 *
 * Le 13/09/2026, `.bg-blur` est passée de `brightness(0.3)` à `brightness(0.12)`
 * (« assombrir, pas remplacer »). Mesuré ici : sur la pochette BLANCHE de la
 * capture de Fabien, le fond passait de `#4D4D4D` à `#1F1F1F`, et la ligne
 * d'album (`--tune-text-muted`) de 2,40:1 à 4,67:1. Le symptôme d'origine —
 * texte clair sur pochette claire — est donc bien traité.
 *
 * Le 17/09, une couche `.bg-teinte` à la couleur du thème est venue par-dessus.
 * Elle a été ÉCARTÉE des deux thèmes clairs, avec ce motif en commentaire :
 * « un voile clair sur la pochette noircie ferait un gris moyen sous du texte
 * BLANC ». C'est là que le raisonnement dérape : sur `clear-white` et
 * `clear-grey`, le texte n'est PAS blanc. `tune-v2.css` y pose
 * `--v2-txt:#0C1620` et `#141C24` — quasi noir — et `ShellV2` monte
 * `NowPlaying` dans `.tune-v2`, qui ponte `--tune-text: var(--v2-txt)`.
 *
 * Sur ces deux thèmes, il ne reste donc que `.bg-blur` à `brightness(0.12)` :
 * un facteur multiplicatif qui PLAFONNE toute pochette à `#1F1F1F` et rend du
 * noir sur une pochette noire. Du texte quasi noir sur un fond quasi noir.
 *
 * ## La règle que cette garde tient
 *
 * Pour CHACUN des six thèmes, et pour les deux pochettes extrêmes (noire et
 * blanche — elles bornent la luminance de toutes les autres), le fond composité
 * de « Lecture en cours » doit garder le texte principal du thème au-dessus du
 * seuil WCAG AA de 4,5:1.
 *
 * ## Ce qu'elle ne tient PAS
 *
 * - Elle ne lit AUCUNE couleur calculée : le CSS scopé de Svelte n'est pas
 *   injecté sous vitest+jsdom. Elle compose à la main les valeurs DÉCLARÉES
 *   dans la feuille du composant. Elle prouve la règle CSS, pas le rendu.
 * - Elle applique la cascade par ORDRE DE SOURCE sur les seuls sélecteurs
 *   `.bg-blur` / `.bg-teinte`, sans calcul de spécificité.
 * - Elle mesure l'affichage ORDINAIRE : les règles portées par `[data-kiosk]`
 *   sont ignorées. Dans le navigateur, une règle de thème
 *   (`:root[data-v2-theme=…] .bg-blur`, spécificité 0-3-0) l'emporte de toute
 *   façon sur la règle kiosque (`[data-kiosk] .bg-blur`, 0-2-0), quel que soit
 *   leur ordre ; mais ce classement-là, cette garde ne le calcule pas.
 * - Elle borne par le noir et le blanc : elle ne dit rien d'une pochette
 *   très saturée, dont `saturate()` peut déplacer la teinte à luminance égale.
 * - Elle ne mesure pas `--v2-txt2` / `--v2-txt3`, qui n'atteignent déjà pas AA
 *   sur le fond PROPRE de certains thèmes : ce serait un autre sujet.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const SOURCE_NP = lire('src/components/partages/NowPlaying.svelte');
const THEMES_CSS = lire('src/styles/tune-v2.css');

/**
 * La FEUILLE du composant, et elle seule : le balisage Svelte contient des
 * accolades (`{#if …}`) qu'un lecteur de règles CSS prendrait pour des blocs.
 */
const NP = (() => {
  const i = SOURCE_NP.lastIndexOf('<style');
  const debut = SOURCE_NP.indexOf('>', i) + 1;
  const fin = SOURCE_NP.lastIndexOf('</style>');
  expect(i, 'NowPlaying.svelte n’a plus de <style>').toBeGreaterThan(-1);
  expect(fin, '<style> non refermé').toBeGreaterThan(debut);
  return SOURCE_NP.slice(debut, fin);
})();

const THEMES = [
  'black-green',
  'black-blue',
  'midnight-orange',
  'brown',
  'clear-white',
  'clear-grey',
] as const;
type Theme = (typeof THEMES)[number];

/* ── Couleur ────────────────────────────────────────────────────────────── */

type RVB = [number, number, number];
const hex = (s: string): RVB => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)) as RVB;
const enHex = (c: RVB) =>
  '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

const canal = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]: RVB) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);

/** Contraste WCAG 2.1 entre deux couleurs opaques. */
function contraste(a: RVB, b: RVB): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [haut, bas] = la > lb ? [la, lb] : [lb, la];
  return (haut + 0.05) / (bas + 0.05);
}

/** `filter: brightness(f)` — un facteur MULTIPLICATIF, borné à 255. */
const brightness = (c: RVB, f: number): RVB => c.map((v) => Math.min(255, v * f)) as RVB;

/** Une couche opaque `dessus` à l'opacité `o`, composée sur `dessous`. */
const superposer = (dessous: RVB, dessus: RVB, o: number): RVB =>
  dessous.map((v, i) => v * (1 - o) + dessus[i] * o) as RVB;

/* ── Lecture des jetons de thème ────────────────────────────────────────── */

/**
 * Le bloc de jetons d'un thème dans `tune-v2.css`.
 *
 * `black-green` est le thème PAR DÉFAUT de Levente : il n'a pas d'attribut,
 * ses jetons sont posés sur `.tune-v2{` tout court.
 */
function blocTheme(theme: Theme): string {
  const ancre =
    theme === 'black-green' ? '\n.tune-v2{' : `:root[data-v2-theme="${theme}"] .tune-v2{`;
  const i = THEMES_CSS.indexOf(ancre);
  expect(i, `le thème ${theme} a disparu de tune-v2.css`).toBeGreaterThan(-1);
  return THEMES_CSS.slice(i, THEMES_CSS.indexOf('}', i));
}

function jeton(theme: Theme, nom: string): RVB {
  const m = blocTheme(theme).match(new RegExp(`${nom}:\\s*(#[0-9A-Fa-f]{6})`));
  expect(m, `${nom} introuvable pour le thème ${theme}`).not.toBeNull();
  return hex(m![1]);
}

/* ── Lecture des règles du composant ────────────────────────────────────── */

/**
 * Les règles CSS de `NowPlaying.svelte` qui visent `classe`, dans l'ordre de
 * la source, avec le thème auquel chacune est conditionnée (`null` = toutes).
 *
 * On coupe les sélecteurs sur la virgule pour qu'une règle groupée
 * (`…clear-white…, …clear-grey…{ }`) compte pour chacun de ses thèmes.
 */
function reglesVisant(classe: string): { theme: Theme | null; corps: string }[] {
  const trouvees: { theme: Theme | null; corps: string }[] = [];
  const re = new RegExp(`([^{}@;]*\\.${classe}\\b[^{}]*)\\{([^{}]*)\\}`, 'g');
  for (const m of NP.matchAll(re)) {
    const corps = m[2];
    for (const sel of m[1].split(',')) {
      if (!new RegExp(`\\.${classe}\\b`).test(sel)) continue;
      if (sel.includes('data-kiosk')) continue; // affichage ordinaire — voir l'en-tête
      const t = sel.match(/data-v2-theme="([a-z-]+)"/);
      if (t && !THEMES.includes(t[1] as Theme)) continue;
      trouvees.push({ theme: (t?.[1] as Theme) ?? null, corps });
    }
  }
  expect(trouvees.length, `aucune règle ne vise .${classe}`).toBeGreaterThan(0);
  return trouvees;
}

/** Les règles applicables à un thème, dans l'ordre de la source. */
const pourLeTheme = (classe: string, theme: Theme) =>
  reglesVisant(classe).filter((r) => r.theme === null || r.theme === theme);

/** Le facteur `brightness()` de `.bg-blur` sous ce thème. */
function facteurPochette(theme: Theme): number {
  let f: number | null = null;
  for (const r of pourLeTheme('bg-blur', theme)) {
    const m = r.corps.match(/filter:[^;]*brightness\(([\d.]+)\)/);
    if (m) f = Number(m[1]);
  }
  expect(f, `.bg-blur sans brightness pour ${theme}`).not.toBeNull();
  return f!;
}

/** L'opacité effective du voile `.bg-teinte` sous ce thème (0 = écarté). */
function opaciteVoile(theme: Theme): number {
  let o = 0;
  for (const r of pourLeTheme('bg-teinte', theme)) {
    if (/display:\s*none/.test(r.corps)) o = 0;
    const m = r.corps.match(/opacity:\s*([\d.]+)/);
    if (m) o = Number(m[1]);
  }
  return o;
}

/** Le fond composité de l'écran, pour une pochette donnée. */
function fondCompose(theme: Theme, pochette: RVB): RVB {
  const assombrie = brightness(pochette, facteurPochette(theme));
  return superposer(assombrie, jeton(theme, '--v2-bg'), opaciteVoile(theme));
}

/* ── Les gardes ─────────────────────────────────────────────────────────── */

const NOIRE: RVB = [0, 0, 0];
const BLANCHE: RVB = [255, 255, 255];
const AA = 4.5;

describe('#1144 — le fond de Lecture en cours reste lisible sur les SIX thèmes', () => {
  it('le voile prend bien la couleur du thème (l’hypothèse de la mesure)', () => {
    const base = reglesVisant('bg-teinte').find((r) => r.theme === null);
    expect(base, '.bg-teinte n’a plus de règle de base').toBeDefined();
    expect(base!.corps).toContain('background: var(--v2-bg, transparent);');
  });

  /**
   * 🔴 LE DÉFAUT LUI-MÊME. Sur `clear-white` / `clear-grey`, le texte est
   * quasi NOIR ; `.bg-blur` à 0.12 plafonne toute pochette à `#1F1F1F` et
   * descend jusqu'au noir. Sans voile, c'est du noir sur du noir.
   */
  for (const theme of THEMES) {
    it(`${theme} : le texte principal garde AA sur toute pochette`, () => {
      const texte = jeton(theme, '--v2-txt');
      for (const [nom, pochette] of [['noire', NOIRE], ['blanche', BLANCHE]] as const) {
        const fond = fondCompose(theme, pochette);
        const r = contraste(fond, texte);
        expect(
          r,
          `${theme}, pochette ${nom} : fond ${enHex(fond)} sous ${enHex(texte)} => ${r.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA);
      }
    });
  }

  /**
   * L'arbitrage du 13/09 — « assombrir, pas REMPLACER ». Le voile ne doit
   * jamais être opaque : la pochette doit rester perceptible partout.
   */
  it('la pochette reste perceptible : le voile n’est jamais opaque', () => {
    for (const theme of THEMES) {
      expect(opaciteVoile(theme), `${theme}`).toBeLessThan(1);
      const ecart =
        fondCompose(theme, BLANCHE)[0] - fondCompose(theme, NOIRE)[0];
      expect(ecart, `${theme} : la pochette ne module plus le fond`).toBeGreaterThan(5);
    }
  });

  /**
   * Contre-épreuve du CALCULATEUR : sans ce cas, la garde pourrait être verte
   * parce qu'elle ne mesure rien.
   */
  it('le calculateur voit bien un noir sur noir et un noir sur blanc', () => {
    expect(contraste(hex('#1F1F1F'), hex('#0C1620'))).toBeLessThan(AA);
    expect(contraste(hex('#FFFFFF'), hex('#0C1620'))).toBeGreaterThan(AA);
    // `brightness` MULTIPLIE : il ne peut pas éclaircir du noir.
    expect(brightness(NOIRE, 0.12)).toEqual(NOIRE);
    expect(brightness(BLANCHE, 0.12)[0]).toBeCloseTo(30.6, 1);
  });
});

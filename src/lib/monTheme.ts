/**
 * « Mon thème » — #2527 (go de Bertrand du 30/10/2026, rc10).
 *
 * Toutes les couleurs de l'interface au choix, à partir des jetons `--v2-*`
 * de #2520 (`v2Jetons.ts`). Le thème est fourni par un GREFFON du catalogue
 * (`mon-theme`, tune-server-rust) : le client ne connaît pas son nom, il lit
 * `provides.web_theme` dans `GET /plugins` et applique le thème de tout
 * greffon actif qui en déclare un. Le serveur le range PAR PROFIL.
 *
 * Le format sert au rangement, à l'export et à l'import :
 *
 *   { "format": "tune-theme", "version": 1, "name": "…",
 *     "colors": { "--v2-bg": "#RRGGBB", … 20 jetons … } }
 *
 * Les règles de lisibilité (WCAG AA) sont celles de la garde de #2520
 * (`themeMozaiklabsLogo2520.test.ts`) et du greffon serveur
 * (`plugins/tune-mon-theme/src/theme.rs`) : un thème qui échoue n'est ni
 * enregistré ici, ni accepté là-bas.
 *
 * Rien en stockage navigateur : le thème vit sur le serveur.
 */
import { V2_JETONS } from './v2Jetons';
import { V2_THEME_DEFAULT, type V2Theme } from './v2Theme';

export const FORMAT_THEME = 'tune-theme';
export const VERSION_THEME = 1;
export const NOM_THEME_MAX = 60;

/** `--v2-danger-soft` est un `rgba` dérivé de `--v2-danger`, pas un choix. */
const DERIVES_DE_V2_JETONS = new Set<string>(['--v2-danger-soft']);

/** Les groupes du sélecteur, dans l'ordre de `V2_JETONS`. */
export const GROUPES_MON_THEME = (Object.entries(V2_JETONS) as [keyof typeof V2_JETONS, readonly string[]][])
  .map(([groupe, jetons]) => ({ groupe, jetons: jetons.filter((j) => !DERIVES_DE_V2_JETONS.has(j)) }));

/** Les 20 jetons qu'un thème choisit. */
export const JETONS_MON_THEME: readonly string[] = GROUPES_MON_THEME.flatMap((g) => g.jetons);

export type CouleursTheme = Record<string, string>;
export interface ThemePerso {
  format: typeof FORMAT_THEME;
  version: typeof VERSION_THEME;
  name: string;
  colors: CouleursTheme;
}

/** Ce que l'écran nomme : une clé de traduction LITTÉRALE par jeton et par groupe. */
export const LIBELLES_JETONS: Record<string, string> = {
  '--v2-bg': 'monTheme.jeton.bg',
  '--v2-bg2': 'monTheme.jeton.bg2',
  '--v2-surface': 'monTheme.jeton.surface',
  '--v2-surface2': 'monTheme.jeton.surface2',
  '--v2-hover': 'monTheme.jeton.hover',
  '--v2-txt': 'monTheme.jeton.txt',
  '--v2-txt2': 'monTheme.jeton.txt2',
  '--v2-txt3': 'monTheme.jeton.txt3',
  '--v2-acc1': 'monTheme.jeton.acc1',
  '--v2-acc2': 'monTheme.jeton.acc2',
  '--v2-acc-tint': 'monTheme.jeton.accTint',
  '--v2-on-acc': 'monTheme.jeton.onAcc',
  '--v2-line': 'monTheme.jeton.line',
  '--v2-line2': 'monTheme.jeton.line2',
  '--v2-active1': 'monTheme.jeton.active1',
  '--v2-active2': 'monTheme.jeton.active2',
  '--v2-player1': 'monTheme.jeton.player1',
  '--v2-player2': 'monTheme.jeton.player2',
  '--v2-danger': 'monTheme.jeton.danger',
  '--v2-danger-bd': 'monTheme.jeton.dangerBd',
};
export const LIBELLES_GROUPES: Record<string, string> = {
  fonds: 'monTheme.groupe.fonds',
  textes: 'monTheme.groupe.textes',
  accent: 'monTheme.groupe.accent',
  bordures: 'monTheme.groupe.bordures',
  etats: 'monTheme.groupe.etats',
};

// ── Couleurs et contraste ────────────────────────────────────────────────

/** `#rrggbb` → `#RRGGBB` ; toute autre forme → `null`. La valeur part dans une
 *  feuille de style : elle ne doit rien pouvoir y ajouter. */
export function couleurNormalisee(v: unknown): string | null {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null;
}

function luminance(h: string): number {
  const v = h.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const f = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

/** Le rapport de contraste WCAG entre deux `#RRGGBB`. */
export function contraste(a: string, b: string): number {
  const [h, l] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (h + 0.05) / (l + 0.05);
}

export const MIN_TEXTE = 4.5;
export const MIN_REMPLISSAGE = 3;
const FONDS = V2_JETONS.fonds;
const TEXTES = [...V2_JETONS.textes, '--v2-acc1', '--v2-acc-tint', '--v2-danger'];

export interface Paire { texte: string; fond: string; ratio: number; minimum: number }

/** Toutes les paires jugées, réussies ou non — l'écran les montre en direct. */
export function paires(c: CouleursTheme): Paire[] {
  const out: Paire[] = [];
  const juger = (texte: string, fond: string, minimum: number) => {
    const a = couleurNormalisee(c[texte]) ?? '#000000';
    const b = couleurNormalisee(c[fond]) ?? '#000000';
    out.push({ texte, fond, ratio: Math.floor(contraste(a, b) * 100) / 100, minimum });
  };
  for (const t of TEXTES) for (const f of FONDS) juger(t, f, MIN_TEXTE);
  for (const f of FONDS) juger('--v2-acc2', f, MIN_REMPLISSAGE);
  juger('--v2-on-acc', '--v2-acc1', MIN_TEXTE);
  juger('--v2-on-acc', '--v2-acc2', MIN_TEXTE);
  return out;
}

/** Les paires sous leur seuil. Vide : le thème se lit. Comparaison sur le
 *  rapport EXACT, comme le serveur (l'arrondi n'est que pour l'affichage). */
export function pairesIllisibles(c: CouleursTheme): Paire[] {
  return paires(c).filter((p) => {
    const a = couleurNormalisee(c[p.texte]) ?? '#000000';
    const b = couleurNormalisee(c[p.fond]) ?? '#000000';
    return contraste(a, b) < p.minimum;
  });
}

// ── Forme ─────────────────────────────────────────────────────────────────

export type Jugement =
  | { ok: true; theme: ThemePerso }
  | { ok: false; champ: string }
  | { ok: false; illisible: Paire[] };

function nomPropre(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\p{Cc}/gu, ' ').replace(/\s+/gu, ' ').trim();
  const n = Array.from(s).length;
  return n >= 1 && n <= NOM_THEME_MAX ? s : null;
}

/** La FORME seule (format, version, nom, 20 couleurs `#RRGGBB`) : un import
 *  illisible se charge quand même dans l'éditeur, pour être corrigé. */
export function formeDuTheme(v: unknown): { ok: true; theme: ThemePerso } | { ok: false; champ: string } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, champ: 'theme' };
  const o = v as Record<string, unknown>;
  if (o.format !== FORMAT_THEME) return { ok: false, champ: 'format' };
  if (o.version !== VERSION_THEME) return { ok: false, champ: 'version' };
  const name = nomPropre(o.name);
  if (name === null) return { ok: false, champ: 'name' };
  const brutes = o.colors;
  if (!brutes || typeof brutes !== 'object' || Array.isArray(brutes)) return { ok: false, champ: 'colors' };
  const inconnue = Object.keys(brutes).find((k) => !JETONS_MON_THEME.includes(k));
  if (inconnue) return { ok: false, champ: inconnue };
  const colors: CouleursTheme = {};
  for (const j of JETONS_MON_THEME) {
    const c = couleurNormalisee((brutes as Record<string, unknown>)[j]);
    if (c === null) return { ok: false, champ: j };
    colors[j] = c;
  }
  return { ok: true, theme: { format: FORMAT_THEME, version: VERSION_THEME, name, colors } };
}

/** Juge un thème (importé, reçu, saisi) : la forme d'abord, la lisibilité ensuite. */
export function jugerTheme(v: unknown): Jugement {
  const f = formeDuTheme(v);
  if (!f.ok) return f;
  const illisible = pairesIllisibles(f.theme.colors);
  if (illisible.length > 0) return { ok: false, illisible };
  return f;
}

// ── Application ───────────────────────────────────────────────────────────

/** La famille dont le thème hérite ce qu'il ne choisit pas (VU-mètre,
 *  crête-mètre, ombres) : claire si le fond est clair. */
export function familleDuTheme(t: Pick<ThemePerso, 'colors'>): V2Theme {
  const bg = couleurNormalisee(t.colors['--v2-bg']);
  if (bg === null) return V2_THEME_DEFAULT;
  return luminance(bg) > 0.4 ? 'clear-white' : 'black-green';
}

function rgba(hex: string, a: number): string {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
}

/** Tous les jetons qu'un thème pose : ses 20 couleurs et leurs dérivés. */
export function jetonsDuTheme(c: CouleursTheme): Record<string, string> {
  const n = (j: string) => couleurNormalisee(c[j]) ?? '#000000';
  const out: Record<string, string> = {};
  for (const j of JETONS_MON_THEME) out[j] = n(j);
  out['--v2-danger-soft'] = rgba(n('--v2-danger'), 0.12);
  out['--v2-knob'] = n('--v2-txt');
  out['--v2-av1'] = n('--v2-surface');
  out['--v2-av2'] = n('--v2-line2');
  out['--v2-glow'] = rgba(n('--v2-acc1'), 0.22);
  out['--v2-glow-strong'] = rgba(n('--v2-acc1'), 0.3);
  out['--v2-acc-soft'] = rgba(n('--v2-acc2'), 0.1);
  out['--v2-focus'] = rgba(n('--v2-acc2'), 0.18);
  out['--v2-scrim'] = rgba(n('--v2-bg'), 0.8);
  return out;
}

/** Déclarations `--x:v;` d'un ensemble de jetons. */
export const declarations = (j: Record<string, string>) =>
  Object.entries(j).map(([k, v]) => `${k}:${v};`).join('');

export const ATTRIBUT_MON_THEME = 'data-v2-mon-theme';
const ID_STYLE = 'tune-mon-theme';

/**
 * La feuille du thème. Le sélecteur `:root[data-v2-theme][data-v2-mon-theme]
 * .tune-v2` (0,4,0) l'emporte sur `:root[data-v2-theme=…] .tune-v2` (0,3,0) :
 * il s'applique à toutes les racines `.tune-v2`, imbriquées comprises. Les
 * valeurs sont des `#RRGGBB` validés et des `rgba()` construits ici.
 */
export function cssDuTheme(t: Pick<ThemePerso, 'colors'>): string {
  const j = jetonsDuTheme(t.colors);
  return `:root[data-v2-theme][${ATTRIBUT_MON_THEME}] .tune-v2{${declarations(j)}}`
    + `:root[data-v2-theme][${ATTRIBUT_MON_THEME}]{--v2-body-bg:${j['--v2-bg']};}`;
}

/** Pose (ou retire, avec `null`) le thème sur le document. */
export function appliquerMonTheme(t: ThemePerso | null, doc: Document | undefined = globalThis.document): void {
  if (!doc) return;
  try {
    let style = doc.getElementById(ID_STYLE) as HTMLStyleElement | null;
    if (t === null) {
      style?.remove();
      doc.documentElement.removeAttribute(ATTRIBUT_MON_THEME);
      return;
    }
    if (!style) {
      style = doc.createElement('style');
      style.id = ID_STYLE;
      doc.head.appendChild(style);
    }
    style.textContent = cssDuTheme(t);
    doc.documentElement.setAttribute(ATTRIBUT_MON_THEME, '');
  } catch { /* environnement sans DOM */ }
}

/** `rgb(1, 2, 3)` / `#abc` / `#aabbcc` → `#AABBCC`, sinon `null`. Pour
 *  « Partir du thème actuel » (valeurs calculées du navigateur). */
export function versHex(v: string): string | null {
  const s = v.trim();
  const court = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  if (court) return `#${court[1]}${court[1]}${court[2]}${court[2]}${court[3]}${court[3]}`.toUpperCase();
  if (couleurNormalisee(s)) return s.toUpperCase();
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
  if (!m) return null;
  return '#' + [m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Les couleurs du thème actuellement peint, lues sur un élément `.tune-v2`. */
export function couleursCalculees(el: Element): CouleursTheme {
  const st = getComputedStyle(el);
  const out: CouleursTheme = {};
  for (const j of JETONS_MON_THEME) out[j] = versHex(st.getPropertyValue(j)) ?? '#000000';
  return out;
}

// ── Découverte du greffon ─────────────────────────────────────────────────

export const ID_GREFFON_MON_THEME = 'mon-theme';

export interface FicheGreffonTheme {
  name?: unknown;
  installed?: unknown;
  enabled?: unknown;
  loaded?: unknown;
  status?: unknown;
  provides?: unknown;
}

/** La route du thème déclarée par un greffon actif, la première trouvée. */
export function routeThemeWeb(liste: readonly FicheGreffonTheme[] | null | undefined): string | null {
  if (!Array.isArray(liste)) return null;
  for (const p of liste) {
    if (!p || p.enabled === false || p.loaded === false) continue;
    const r = (p.provides as { web_theme?: unknown } | undefined)?.web_theme;
    if (typeof r === 'string' && /^\/api\/v1\/ext\/[a-z0-9-]+(\/[a-z0-9_-]+)+$/.test(r)) return r;
  }
  return null;
}

export type EtatGreffonMonTheme = 'inconnu' | 'absent' | 'a_installer' | 'a_redemarrer' | 'actif';

export function etatGreffonMonTheme(liste: readonly FicheGreffonTheme[] | null | undefined): EtatGreffonMonTheme {
  if (!Array.isArray(liste)) return 'inconnu';
  const f = liste.find((p) => p && p.name === ID_GREFFON_MON_THEME);
  if (!f) return 'absent';
  if (f.installed !== true) return 'a_installer';
  if (f.status === 'error') return 'actif';
  if (f.enabled === false || f.loaded === false) return 'a_redemarrer';
  return 'actif';
}

// ── Export / import ───────────────────────────────────────────────────────

export function texteExport(t: ThemePerso): string {
  return JSON.stringify({ format: FORMAT_THEME, version: VERSION_THEME, name: t.name, colors: t.colors }, null, 2) + '\n';
}

export function nomDeFichier(t: Pick<ThemePerso, 'name'>): string {
  const base = t.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `tune-theme-${base || 'perso'}.json`;
}

/** Un fichier importé, jugé sur sa FORME : JSON illisible = `champ: 'json'`.
 *  La lisibilité se juge ensuite dans l'éditeur, en direct. */
export function lireTheme(texte: string): ReturnType<typeof formeDuTheme> {
  let v: unknown;
  try { v = JSON.parse(texte); } catch { return { ok: false, champ: 'json' }; }
  return formeDuTheme(v);
}

/** Taille maximale d'un fichier importé (un thème fait moins de 1 Kio). */
export const IMPORT_MAX_OCTETS = 16 * 1024;

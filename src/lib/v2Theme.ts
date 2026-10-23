/**
 * Thèmes du nouveau client (direction Levente) — sept palettes.
 *
 * Le choix est posé en attribut `data-v2-theme` sur <html> ; les tokens
 * correspondants vivent dans `styles/tune-v2.css` sous
 * `:root[data-v2-theme=…] .tune-v2`. Le thème par défaut (Noir / Vert) est le
 * bloc de base, donc aucun attribut n'est nécessaire pour lui — mais on le
 * pose quand même, pour que l'état soit lisible dans l'inspecteur.
 *
 * Réglage distinct de `preferences.theme` (le thème de l'app historique) :
 * les deux clients cohabitent, chacun garde le sien.
 */
export const V2_THEMES = [
  { id: 'black-green',     label: 'Noir / Vert',     swatch: ['#071418', '#00D4AA'] },
  { id: 'black-blue',      label: 'Noir / Bleu',     swatch: ['#06111A', '#00BCD4'] },
  { id: 'midnight-orange', label: 'Minuit / Orange', swatch: ['#0B1020', '#FF8A3D'] },
  { id: 'brown',           label: 'Brun',            swatch: ['#17110D', '#D89A63'] },
  // #2364 (Sandro, fil 2405) : un palier gris neutre entre les sombres et les
  // clairs, rangé entre les deux. Son nom est traduit (`labelKey`) ; `label`
  // reste le repli français, comme pour les six autres.
  { id: 'dark-grey',       label: 'Gris foncé',      swatch: ['#2B2B2B', '#3DD6B0'], labelKey: 'settings.themeDarkGrey' },
  { id: 'clear-white',     label: 'Clair / Blanc',   swatch: ['#FFFFFF', '#00A88A'] },
  { id: 'clear-grey',      label: 'Clair / Gris',    swatch: ['#EDEFF2', '#37718E'] },
] as const;

export type V2Theme = (typeof V2_THEMES)[number]['id'];

export const V2_THEME_DEFAULT: V2Theme = 'black-green';

/** Nom affiché d'une palette : sa clé de traduction si elle en a une, sinon
 *  son libellé (les six palettes d'origine n'en ont pas encore). */
export function v2ThemeLabel(
  theme: (typeof V2_THEMES)[number],
  tr: (key: string) => string,
): string {
  return 'labelKey' in theme ? tr(theme.labelKey) : theme.label;
}

const IDS = V2_THEMES.map((t) => t.id) as readonly string[];

export function isV2Theme(v: unknown): v is V2Theme {
  return typeof v === 'string' && IDS.includes(v);
}

/** Pose le thème sur <html>. Une valeur inconnue retombe sur le défaut plutôt
 *  que de laisser l'interface dans un état à moitié peint. */
export function applyV2Theme(theme: unknown): void {
  const t = isV2Theme(theme) ? theme : V2_THEME_DEFAULT;
  try {
    document.documentElement.setAttribute('data-v2-theme', t);
  } catch { /* SSR / environnement sans DOM */ }
}

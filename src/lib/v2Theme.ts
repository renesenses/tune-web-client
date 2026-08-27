/**
 * Thèmes du nouveau client (direction Levente) — six palettes.
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
  { id: 'clear-white',     label: 'Clair / Blanc',   swatch: ['#FFFFFF', '#00A88A'] },
  { id: 'clear-grey',      label: 'Clair / Gris',    swatch: ['#EDEFF2', '#37718E'] },
] as const;

export type V2Theme = (typeof V2_THEMES)[number]['id'];

export const V2_THEME_DEFAULT: V2Theme = 'black-green';

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

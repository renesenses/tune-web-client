/**
 * web#3232 (fil 2934, rc12) — la couleur du TEXTE des puces de source
 * (`ServiceBadge`), par famille de thème.
 *
 * Les couleurs d'origine sont pensées pour un fond sombre : `LOCAL` en
 * `#B4BCC8` ne donnait que 1,3:1 sur « Clair / Gris », TIDAL 1,1:1. La puce lit
 * désormais `--v2-puce-<source>`, avec la valeur SOMBRE en repli ; les thèmes
 * clairs (`tune-v2.css`) et « Mon thème » (`cssDuTheme`) posent la valeur
 * CLAIRE. Chaque valeur claire tient 4,5:1 (WCAG AA) sur le fond teinté de la
 * puce posée sur `#FFFFFF`, `#EDEFF2` et `#E2E6EB` (garde :
 * `pucesSourceThemesClairs3232.svelte.test.ts`).
 */
export const PUCES_SOURCES = ['tidal', 'qobuz', 'deezer', 'spotify', 'youtube', 'amazon', 'bandcamp', 'upnp', 'local'] as const;
export type PuceSource = (typeof PUCES_SOURCES)[number];

/** Fond sombre : les couleurs d'origine, inchangées. */
export const PUCES_SOMBRE: Record<PuceSource, string> = {
  tidal: '#00FFFF',
  qobuz: '#6B9FFF',
  deezer: '#C98FFF',
  spotify: '#1DB954',
  youtube: '#FF6B6B',
  amazon: '#00C8FF',
  bandcamp: '#4FC3E0',
  upnp: '#F5B942',
  local: '#B4BCC8',
};

/** Fond clair : la même teinte, assombrie jusqu'à 4,5:1 au moins. */
export const PUCES_CLAIR: Record<PuceSource, string> = {
  tidal: '#006A6E',
  qobuz: '#264E9C',
  deezer: '#7329B8',
  spotify: '#0D6230',
  youtube: '#A3221B',
  amazon: '#005A7D',
  bandcamp: '#0D5B70',
  upnp: '#7D4A00',
  local: '#434C57',
};

/** Le teint de fond de chaque puce (`rgba`), tel que `ServiceBadge` le pose. */
export const FOND_PUCES: Record<PuceSource, [number, number, number, number]> = {
  tidal: [0, 255, 255, 0.10],
  qobuz: [44, 84, 165, 0.15],
  deezer: [162, 56, 255, 0.12],
  spotify: [29, 185, 84, 0.12],
  youtube: [255, 0, 0, 0.10],
  amazon: [0, 168, 225, 0.12],
  bandcamp: [29, 160, 195, 0.12],
  upnp: [217, 119, 6, 0.14],
  local: [75, 85, 99, 0.18],
};

/** `--v2-puce-local:#434C57;…` — les déclarations d'une famille. */
export function declarationsPuces(clair: boolean): string {
  const p = clair ? PUCES_CLAIR : PUCES_SOMBRE;
  return PUCES_SOURCES.map((s) => `--v2-puce-${s}:${p[s]};`).join('');
}

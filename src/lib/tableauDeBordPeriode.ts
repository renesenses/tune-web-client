/**
 * LA PÉRIODE DU TABLEAU DE BORD — maquette « My listening » de Levente
 * (rc12, 15/11/2026, Figma 615:5809 : « Last 7 days ▾ » à côté de « Edit »).
 *
 * La route `GET /library/history/dashboard` prend déjà `period` (aujourd'hui,
 * 7 j, 30 j, tout) : c'est elle que servait le sélecteur de l'ancien écran
 * (`v2-heritage/DashboardView.svelte`). Aucune donnée n'est inventée ici, on
 * redonne au nouvel écran le geste que son en-tête de fichier déclarait
 * « reliquat assumé ».
 *
 * Module à part, sans composant : les blocs (pour leur message vide) ET le
 * catalogue (pour ses requêtes) le lisent, et le catalogue importe les blocs —
 * le mettre dans `tableauDeBordWidgets` ferait une boucle d'imports.
 *
 * L'écran se remonte entier à chaque changement de période (`{#key}` dans
 * `TableauDeBordV2`) : les blocs lisent donc une valeur stable pendant tout
 * leur rendu.
 */
import type { DashboardPeriod } from './api';

/** Les périodes proposées, dans l'ordre du menu. */
export const PERIODES: readonly DashboardPeriod[] = ['today', '7d', '30d', 'all'];

/** Sept jours à l'ouverture : la requête partagée avec l'accueil (voir
 *  `tableauDeBordWidgets`, « SEPT JOURS, ET NON TRENTE »). */
export const PERIODE_DEFAUT: DashboardPeriod = '7d';

let active: DashboardPeriod = PERIODE_DEFAUT;

export function periodeActive(): DashboardPeriod {
  return active;
}

export function choisirPeriode(p: DashboardPeriod): void {
  if (PERIODES.includes(p)) active = p;
}

/** Le libellé du menu, déjà traduit dans les quinze langues. */
export function clePeriode(p: DashboardPeriod): string {
  return `dashboard.period.${p}`;
}

/**
 * #1781 — le message d'un bloc vide NOMME la période qu'il a lue : une semaine
 * vide ne dit rien de l'historique plus ancien, et « les 7 derniers jours »
 * sous « 30 jours » serait faux.
 */
export function cleVide(p: DashboardPeriod = active): string {
  switch (p) {
    case 'today': return 'dashboard.emptyToday';
    case '30d': return 'dashboard.emptyLast30Days';
    case 'all': return 'dashboard.emptyAllTime';
    default: return 'dashboard.emptyLast7Days';
  }
}

/** Combien de jours la tendance dessine — repris de `visibleTrend` de
 *  l'ancien écran : tout l'historique s'arrête à 90 jours de barres. */
export function joursTendance(p: DashboardPeriod, joursServis: number): number {
  if (p === 'today') return 1;
  if (p === '7d') return 7;
  if (p === '30d') return 30;
  return Math.min(Math.max(joursServis, 1), 90);
}

/**
 * Le délai de garde de `PageWidgets` (8 s par défaut). Sur 30 jours la route
 * dépasse ce budget (mesure écrite dans `accueilWidgets`) : sans délai plus
 * long, le choix « 30 jours » afficherait douze blocs en « (délai) ».
 * `undefined` garde le défaut de `PageWidgets`.
 */
export function delaiPour(p: DashboardPeriod): number | undefined {
  return p === '30d' || p === 'all' ? 30_000 : undefined;
}

/**
 * Les icônes des en-têtes de blocs — trait 24 × 24, `currentColor`. Le
 * contenu d'un `<svg>`, pas de couleur : le thème la donne.
 */
export const ICONES = {
  albums: '<path d="M12 3 2 8l10 5 10-5-10-5z"/><path d="m2 13 10 5 10-5"/>',
  artistes: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  titres: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  genres: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 8l8 8M16 8l-8 8"/>',
  zones: '<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  sources: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/>',
  radios: '<path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"/>',
  ceJourLa: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  serie: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 2 1.5 3 2.5 3 0-3-1-5 0-8z"/>',
  durees: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  barres: '<path d="M5 20V11M12 20V5M19 20v-6"/>',
} as const;

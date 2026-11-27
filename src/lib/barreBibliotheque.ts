/**
 * Harmonisation de l'interface (rc14, maquette `bibliotheque.html` validée par
 * Bertrand le 26/11/2026) — la barre de la Bibliothèque ramenée à sept
 * commandes : Tout, Filtres, tri, Affichage, Lire, Aléatoire et « … ».
 *
 * Ce module ne fait que des REGROUPEMENTS et des correspondances : aucun
 * filtre ne change de sens. Source, Qualité, Favoris, Compilations et
 * Incomplets quittent la rangée pour le panneau « Filtres » ; les autres
 * filtres (fréquence, format, DR…) gardent leur mécanisme d'épinglage
 * (`filtresEpinglesBibliotheque`).
 */
import type { FiltreEpinglable } from './filtresEpinglesBibliotheque';
import type { ModeAnnee } from './anneeAlbum';

/** Les filtres qui vivent DANS le panneau « Filtres », dans l'ordre de la maquette. */
export const FILTRES_DU_PANNEAU = ['provenance', 'quality', 'favoris', 'compilations', 'incomplets'] as const;
export type FiltreDuPanneau = (typeof FILTRES_DU_PANNEAU)[number];

export function estDuPanneau(f: FiltreEpinglable): f is FiltreDuPanneau {
  return (FILTRES_DU_PANNEAU as readonly string[]).includes(f);
}

/**
 * Les filtres que l'on peut encore épingler dans la rangée : tous ceux qui
 * sont disponibles, SAUF ceux du panneau (ils y sont déjà, toujours visibles).
 */
export function epinglablesHorsPanneau<T extends { id: FiltreEpinglable }>(disponibles: readonly T[]): T[] {
  return disponibles.filter((f) => !estDuPanneau(f.id));
}

export interface EtatPanneauFiltres {
  provenance: string | null;
  qualites: readonly string[];
  favoris: boolean;
  compilation: boolean | null;
  incomplets: boolean;
}

/** Combien de filtres du panneau sont posés : le bouton « Filtres » l'affiche. */
export function nombreFiltresDuPanneau(e: EtatPanneauFiltres): number {
  return (e.provenance != null ? 1 : 0)
    + e.qualites.length
    + (e.favoris ? 1 : 0)
    + (e.compilation != null ? 1 : 0)
    + (e.incomplets ? 1 : 0);
}

/** L'état vide du panneau, que pose « Réinitialiser ». Les autres filtres ne bougent pas. */
export const PANNEAU_VIDE: EtatPanneauFiltres = Object.freeze({
  provenance: null, qualites: [], favoris: false, compilation: null, incomplets: false,
});

/** Clé i18n du libellé de chaque façon de retenir l'année. */
export const LIBELLE_MODE_ANNEE: Record<ModeAnnee, string> = {
  auto: 'v2.lib.yearAuto',
  edition: 'v2.lib.yearEdition',
  origine: 'v2.lib.yearOrigin',
};

export type SensAnnees = 'asc' | 'desc';

/** Le bouton de sens bascule entre « plus récent d'abord » et « plus ancien d'abord ». */
export function sensInverse(s: SensAnnees): SensAnnees {
  return s === 'desc' ? 'asc' : 'desc';
}

/** Clé i18n qui dit le sens COURANT (libellé accessible et infobulle). */
export function libelleSens(s: SensAnnees): string {
  return s === 'desc' ? 'v2.lib.yearNewestFirst' : 'v2.lib.yearOldestFirst';
}

export interface ContexteLigneAnnees {
  tab: string;
  /** Niveau Intermédiaire et onglet d'albums (`showTimeline`). */
  frise: boolean;
  navMode: 'alpha' | 'years';
  /** Ajouts récents, coffrets : leur ordre est le leur. */
  sourcePropre: boolean;
}

/**
 * La deuxième ligne (« Année retenue », période, frise, sens) n'apparaît QUE
 * quand les années sont la navigation en cours : mode Années actif, ou onglet
 * Années. En A–Z, elle disparaît.
 */
export function ligneAnneesVisible(c: ContexteLigneAnnees): boolean {
  if (c.sourcePropre) return false;
  return c.tab === 'years' || (c.frise && c.navMode === 'years');
}

/**
 * Le segment A–Z / Années : dans le panneau « Affichage » toujours, et en tête
 * de la deuxième ligne quand elle est là (pour en sortir sans rouvrir un
 * panneau).
 */
export function segmentNavigationOffert(c: ContexteLigneAnnees): boolean {
  return c.frise && !c.sourcePropre;
}

/** Libellés courts des mises en page, pour le panneau « Affichage ». */
export const LIBELLE_COURT_AFFICHAGE: Record<'grid' | 'list' | 'carousel', string> = {
  grid: 'v2.lib.layout.grid',
  list: 'v2.lib.layout.list',
  carousel: 'v2.lib.layout.carousel',
};

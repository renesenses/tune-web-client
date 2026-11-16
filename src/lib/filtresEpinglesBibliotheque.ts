/**
 * Les filtres AFFICHÉS dans la rangée de la Bibliothèque — maquette de
 * Levente (Figma 616:5818, 15/11/2026) : « All, Recently added, Source..etc.
 * — treat it as a filtering option, where by default we don't show them all,
 * just the ones the user is interested in, so the user interface is not so
 * busy. »
 *
 * Trois règles :
 *  1. « Tout (n) » n'en fait pas partie : il est TOUJOURS là, il porte le
 *     compte (#8625) et le retour à zéro.
 *  2. Un filtre ACTIF est toujours affiché, épinglé ou non : un filtre posé
 *     mais invisible amputerait la grille sans le dire.
 *  3. Aucun filtre ne disparaît : le bouton « Filtres » les liste tous et
 *     permet d'en épingler d'autres. Le choix est retenu dans ce navigateur
 *     (`preferencesEcran`, comme le tri et la forme d'affichage).
 */
import { ecrireChoix, lireTexte } from './preferencesEcran';

export const FILTRES_EPINGLABLES = [
  'recent', 'provenance', 'favoris', 'repertoire', 'pays',
  'quality', 'rate', 'dr', 'format', 'compilations', 'incomplets', 'depth',
] as const;
export type FiltreEpinglable = (typeof FILTRES_EPINGLABLES)[number];

/** Par défaut, la maquette (biblio-1) : « Source » et « Qualité ». */
export const FILTRES_PAR_DEFAUT: readonly FiltreEpinglable[] = ['provenance', 'quality'];

export const CLE_FILTRES_EPINGLES = 'lib.filtres';

function estEpinglable(x: string): x is FiltreEpinglable {
  return (FILTRES_EPINGLABLES as readonly string[]).includes(x);
}

/** Le choix retenu ; jamais choisi (ou illisible) : le défaut. Une liste vide est un choix. */
export function lireFiltresEpingles(): FiltreEpinglable[] {
  const brut = lireTexte(CLE_FILTRES_EPINGLES);
  if (brut == null) return [...FILTRES_PAR_DEFAUT];
  return brut.split(',').map((x) => x.trim()).filter(estEpinglable);
}

export function ecrireFiltresEpingles(liste: readonly FiltreEpinglable[]): void {
  ecrireChoix(CLE_FILTRES_EPINGLES, FILTRES_EPINGLABLES.filter((f) => liste.includes(f)).join(','));
}

/** Épingle ou retire un filtre ; l'ordre reste celui de la rangée. */
export function basculerEpingle(liste: readonly FiltreEpinglable[], f: FiltreEpinglable): FiltreEpinglable[] {
  const avec = liste.includes(f) ? liste.filter((x) => x !== f) : [...liste, f];
  return FILTRES_EPINGLABLES.filter((x) => avec.includes(x));
}

export function estParDefaut(liste: readonly FiltreEpinglable[]): boolean {
  return liste.length === FILTRES_PAR_DEFAUT.length && FILTRES_PAR_DEFAUT.every((f) => liste.includes(f));
}

/** Clé i18n du libellé de chaque filtre, celle de sa puce. */
export const LIBELLE_FILTRE: Record<FiltreEpinglable, string> = {
  recent: 'v2.lib.recent',
  provenance: 'v2.lib.source',
  favoris: 'v2.lib.onlyFavorites',
  repertoire: 'v2.lib.folder',
  pays: 'v2.lib.map.chip',
  quality: 'v2.tcol.quality',
  rate: 'v2.tcol.sampleRate',
  dr: 'library.drRange',
  format: 'v2.tcol.format',
  compilations: 'v2.lib.compilations',
  incomplets: 'v2.lib.incomplete',
  depth: 'v2.tcol.bitDepth',
};

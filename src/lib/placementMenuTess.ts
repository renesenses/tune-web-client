/**
 * rc14, refonte de l'ergonomie de TESS — LOT 1 : LA PLACE DES ENTRÉES DU MENU
 * QUAND LE SERVEUR ANNONCE TESS (spécification § 2.1 ; décision de Bertrand
 * du 25/11/2026 pour les outils).
 *
 * Tout le classement tient dans ce module, pour se changer en un endroit :
 *
 *   - la section « Studio » DISPARAÎT ;
 *   - TESS entre dans le NOYAU, juste après « File d'attente » ;
 *   - les écrans des greffons de la chaîne sortent du menu
 *     (`VUES_REMPLACEES_PAR_TESS`, #3411) — leurs routes restent ;
 *   - les outils HORS CHAÎNE (sur fichiers, sur la bibliothèque, réveils)
 *     passent dans « Avancé › Outils », au même niveau d'interface qu'avant
 *     (Expert) ;
 *   - « État du serveur » passe dans le menu de l'avatar.
 *
 * Sans TESS (`non` ou `inconnue`, serveur rc13) : rien ne change, Studio est
 * complet (règle de #3411 prolongée, pas refaite).
 */
import { VUES_REMPLACEES_PAR_TESS, type CapaciteTess } from './stores/tess';

/** TESS est rangé dans le noyau, juste APRÈS cette entrée. */
export const TESS_APRES_DANS_LE_NOYAU = 'queue';

/**
 * « Avancé › Outils », dans cet ordre. Dé-ploc est l'outil sur FICHIERS
 * (`declick`) ; le Dé-ploc temps réel (`declick-live`) est un greffon de TESS.
 */
export const OUTILS_HORS_CHAINE: readonly string[] = ['converter', 'declick', 'metadata', 'alarms'];

/** Les entrées qui quittent la barre pour le menu de l'avatar. */
export const VUES_DANS_LE_MENU_AVATAR: readonly string[] = ['diagnostics'];

export interface MenuAvecTess<T> {
  /** Le noyau, TESS inséré à sa place. */
  noyau: T[];
  /** « Avancé › Outils ». */
  outils: T[];
  /** Ce qui reste de Studio (vide avec TESS : la section disparaît). */
  studio: T[];
}

/**
 * Le classement des entrées. `studio` est la liste Studio DÉJÀ filtrée par
 * l'état des greffons (convertisseur et dé-ploc désactivés n'y sont pas) ;
 * `tess` est l'entrée TESS.
 */
export function classerMenu<T extends { view: string }>(
  capacite: CapaciteTess,
  noyau: T[],
  studio: T[],
): MenuAvecTess<T> {
  if (capacite !== 'oui') {
    return { noyau, outils: [], studio: studio.filter((it) => it.view !== 'tess') };
  }
  const tess = studio.find((it) => it.view === 'tess');
  const i = noyau.findIndex((it) => it.view === TESS_APRES_DANS_LE_NOYAU);
  const noyauAvecTess = !tess ? noyau
    : i === -1 ? [...noyau, tess]
    : [...noyau.slice(0, i + 1), tess, ...noyau.slice(i + 1)];
  const outils = OUTILS_HORS_CHAINE
    .map((v) => studio.find((it) => it.view === v))
    .filter((it): it is T => !!it);
  return { noyau: noyauAvecTess, outils, studio: [] };
}

/** L'entrée quitte-t-elle la barre avec TESS (écran de greffon, ou menu de l'avatar) ? */
export function sortDeLaBarreAvecTess(vue: string): boolean {
  return VUES_REMPLACEES_PAR_TESS.includes(vue) || VUES_DANS_LE_MENU_AVATAR.includes(vue);
}

/** Le groupe d'une entrée avec TESS : 0 noyau/Avancé, 1 Sélections, 2 Outils. */
export function groupeAvecTess(vue: string, groupeLivre: number): number {
  if (vue === 'tess') return 0;
  return groupeLivre;
}

/**
 * Liste libre (ordre choisi dans Réglages › Interface) : avec TESS, `tess` se
 * place juste après « File d'attente », quel que soit l'ordre enregistré —
 * sinon, chez qui avait déjà réordonné sa barre, TESS (nouvelle venue)
 * tombait en fin de « Sélections » et disparaissait avec le groupe replié. Le
 * reste de l'ordre enregistré est gardé tel quel.
 *
 * Recette rc14 de Bertrand (.18, rc13.91) : sa barre commence par Oxygen,
 * Streaming… et sa File d'attente est MASQUÉE, descendue sous les Sélections.
 * Rangée derrière elle, TESS tombait au fond de la barre, sous les Raccourcis
 * et « Outils » : on ne la voyait pas. `affichee` dit si une entrée est
 * réellement montrée (niveau, greffon, masquées) : quand la File ne l'est
 * pas, TESS prend la TÊTE de la liste — la première place du noyau, qui ne
 * se replie jamais. Une TESS masquée par l'utilisateur reste masquée : c'est
 * l'appelant qui la filtre, ici on ne fait que la placer.
 */
export function placerTessApresLaFile<T extends { view: string }>(
  liste: T[],
  affichee: (it: T) => boolean = () => true,
): T[] {
  const tess = liste.find((it) => it.view === 'tess');
  if (!tess) return liste;
  const sans = liste.filter((it) => it !== tess);
  const i = sans.findIndex((it) => it.view === TESS_APRES_DANS_LE_NOYAU && affichee(it));
  return i === -1 ? [tess, ...sans] : [...sans.slice(0, i + 1), tess, ...sans.slice(i + 1)];
}

/**
 * Réglages › Interface ne montre que les entrées visibles ; un déplacement
 * parmi elles doit garder la place des entrées cachées dans l'ordre complet
 * (elles reviennent à leur place si TESS disparaît). On remplit les places
 * des visibles, dans leur nouvel ordre, sans toucher aux autres.
 */
export function remplirLesPlaces<T>(complete: T[], visiblesReordonnees: T[], visible: (it: T) => boolean): T[] {
  let k = 0;
  return complete.map((it) => (visible(it) ? visiblesReordonnees[k++] ?? it : it));
}

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

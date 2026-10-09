/**
 * #1892 (Sandro, fil 2114) — « masquer ces icônes d'action rapide et ne
 * conserver que les trois points ».
 *
 * Les icônes restent visibles PAR DÉFAUT : c'est la décision du 05/09/2026
 * (« PAs de boutons au survol !! »), et FabienM les défend comme raccourcis
 * (fil 2114, réponse 7495). Une OPTION, défaut inchangé, est la seule forme
 * qui contente les deux.
 *
 * Ce que l'option masque : les raccourcis que le menu « … » reprend mot pour
 * mot — lire ensuite, ajouter à la file, ajouter à une playlist, étiquettes.
 * Ce qu'elle garde :
 *  - « Lire » et « Lire à partir d'ici » : le second n'a pas d'entrée au menu ;
 *  - le CŒUR : il est aussi un indicateur d'état (quels titres sont en
 *    favori), et le menu n'a pas d'entrée « favori » ;
 *  - le « … » lui-même.
 *
 * La barre garde ses HUIT cases (`LARGEUR_ACTIONS`, fil 1906) : les quatre
 * masquées deviennent des cases vides EN TÊTE, si bien que ce qui reste reste
 * calé à droite, à la même place d'une ligne à l'autre — et la ligne d'objet
 * de l'Historique, qui compose sa grille avec cette largeur, ne bouge pas.
 */

/** Les clés i18n des entrées du menu « … » qui reprennent les icônes masquées. */
export const ACTIONS_MASQUABLES = [
  'v2.pa.next',
  'queue.addToQueue',
  'nowplaying.addToPlaylist',
  'v2.cover.tags',
] as const;

/** Les cases laissées vides en tête quand l'option est active. */
export const CASES_MASQUEES = ACTIONS_MASQUABLES.length;

export function actionsReduites(prefs: { v2ActionsReduites?: boolean } | null | undefined): boolean {
  return prefs?.v2ActionsReduites === true;
}

/**
 * web#2303 (Thierry, forum, fil 2377) — « Enregistrer » et « Enregistrer
 * sous » disparaissaient par moments de l'Égaliseur, l'écran revenant à
 * « + Enregistrer ce réglage » sans aucun geste.
 *
 * L'effet de chargement de `EqualizerV2` remettait le préréglage en cours à
 * zéro À CHAQUE relance. Or il se relançait pour bien d'autres raisons qu'un
 * changement de zone : `$t` lu dans son corps (il réémet chaque fois qu'un
 * dictionnaire arrive), « Réessayer », l'installation du greffon. web#1750
 * ne voulait l'effacer que sur un changement de zone : c'est ce que dit
 * cette règle.
 *
 * `avant === undefined` : premier chargement de l'écran, rien à effacer.
 */
export function zoneChangee<Z>(avant: Z | undefined, apres: Z): boolean {
  return avant !== undefined && avant !== apres;
}

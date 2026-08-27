/**
 * Paliers d'affichage de l'écran « Lecture en cours » sur très grands écrans.
 *
 * Alain Bonnel, forum fil 1077 — renesenses/tune-server-rust#2249. Il utilise
 * une TV 4K comme écran de son PC musique. On lui a répondu le 19/07/2026 que
 * l'écran « Lecture en cours » agrandirait « nettement la pochette ET la
 * largeur du contenu, la colonne titres compris ». Les deux paliers qui le
 * faisaient (`2400px` / `3200px`) ont disparu de `origin/main` à une
 * résolution de fusion vers la ligne v0.9.
 *
 * Le sujet est du CSS pur : rien à exécuter, donc rien qu'un test de
 * rendu pourrait observer sous jsdom, qui n'applique ni les requêtes de
 * média ni la cascade. Ce module rend malgré tout la promesse VÉRIFIABLE en
 * résolvant, à partir de la feuille de styles RÉELLE du composant, la
 * `max-width` effective d'un élément à une largeur d'écran donnée — c'est
 * exactement la grandeur dont Alain se plaint.
 *
 * On n'y déclare AUCUN palier en dur : tout est lu dans le fichier. Un test
 * fondé sur ce module devient donc rouge dès que les paliers repartent.
 *
 * Le moteur de cascade lui-même vit maintenant dans `cascadeCss.ts`, partagé
 * avec les propriétés d'interaction (`opacity`, `pointer-events`). Ce module
 * n'en garde que la spécialisation `max-width`.
 */

import {
  type Ecran,
  type RegleCss,
  regleEffective,
  releverDeclarations,
} from './cascadeCss';

export {
  extraireFeuilleDeStyle,
  mediaSatisfait,
  specificite,
  type Ecran,
} from './cascadeCss';

/** Une déclaration `max-width` trouvée dans la feuille. */
export type RegleLargeur = RegleCss;

/**
 * Relève toutes les déclarations `max-width` de la feuille, au premier niveau
 * comme à l'intérieur des requêtes de média.
 */
export function releverReglesLargeur(css: string): RegleLargeur[] {
  return releverDeclarations(css, ['max-width']);
}

/**
 * `max-width` effective, en pixels, d'un élément décrit par la liste EXHAUSTIVE
 * des sélecteurs de la feuille qui le visent, à l'écran donné.
 *
 * Cascade appliquée : on écarte les règles dont la requête de média ne
 * s'applique pas, on garde la spécificité la plus forte, et l'ordre de la
 * feuille départage à égalité. Rend `null` si aucune règle ne s'applique ou si
 * la valeur retenue n'est pas exprimée en pixels.
 *
 * Le survol est réputé ACTIF ici : aucun palier de « Lecture en cours » n'est
 * conditionné à `:hover`, et l'exclure changerait le sens du calcul.
 */
export function largeurMaxEffective(
  regles: readonly RegleLargeur[],
  selecteursApplicables: readonly string[],
  ecran: Ecran,
): number | null {
  const gagnante = regleEffective(regles, selecteursApplicables, 'max-width', {
    ecran,
    survol: true,
  });
  if (gagnante === null) return null;
  const pixels = /^(-?\d+(?:\.\d+)?)px$/.exec(gagnante.valeur);
  return pixels ? Number(pixels[1]) : null;
}

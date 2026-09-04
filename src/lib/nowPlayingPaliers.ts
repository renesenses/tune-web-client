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
  // `--np-art` est relevée AVEC `max-width` parce qu'elle en porte désormais la
  // valeur : la feuille écrit `max-width: min(var(--np-art), 62vh)`, et seuls
  // les paliers changent la variable. Sans elle, la cascade se résoudrait sur
  // une expression dont un terme manquerait.
  return releverDeclarations(css, ['max-width', '--np-art']);
}

/** Une longueur CSS en pixels, `vh` converti pour l'écran donné. */
function enPixels(valeur: string, ecran: Ecran): number | null {
  const px = /^(-?\d+(?:\.\d+)?)px$/.exec(valeur.trim());
  if (px) return Number(px[1]);
  const vh = /^(-?\d+(?:\.\d+)?)vh$/.exec(valeur.trim());
  if (vh) return (Number(vh[1]) * ecran.hauteur) / 100;
  return null;
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

  const direct = enPixels(gagnante.valeur, ecran);
  if (direct !== null) return direct;

  // `min(var(--np-art), 62vh)` — la forme qu'a prise la feuille le 04/09/2026
  // pour qu'une pochette ne puisse plus dépasser la hauteur de la fenêtre.
  //
  // Elle donne EXACTEMENT les mêmes tailles que les `max-width` en dur qu'elle
  // remplace sur les trois écrans de ce test — le plafond en hauteur ne mord
  // qu'en fenêtre basse. Mais l'analyseur ne lisait qu'un `Npx` nu et rendait
  // `null`, ce qui faisait rougir la promesse faite à Alain alors qu'elle
  // était tenue. On lit donc la CSS réelle plutôt qu'un dialecte plus étroit.
  const min = /^min\(([^,]+),([^)]+)\)$/.exec(gagnante.valeur.trim());
  if (!min) return null;

  const termes = [min[1], min[2]].map((terme) => {
    const t = terme.trim();
    const variable = /^var\((--[\w-]+)\)$/.exec(t);
    if (!variable) return enPixels(t, ecran);
    // La variable traverse la MÊME cascade que la propriété : ce sont les
    // paliers qui la redéfinissent, et c'est tout l'intérêt de la forme.
    const v = regleEffective(regles, selecteursApplicables, variable[1], { ecran, survol: true });
    return v === null ? null : enPixels(v.valeur, ecran);
  });

  if (termes.some((t) => t === null)) return null;
  return Math.min(...(termes as number[]));
}

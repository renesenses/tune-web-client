/**
 * Le périmètre de sources de l'écran Recherche, quand la requête change.
 *
 * ## La règle, et son exception
 *
 * RÈGLE (Bertrand, 05/09/2026) : changer de requête remet le périmètre à zéro.
 * Un filtre hérité d'une recherche précédente masquerait des résultats sans
 * qu'on sache pourquoi.
 *
 * EXCEPTION (Bertrand, 07/09/2026) : le MONTAGE n'est pas un changement de
 * requête. Cliquer l'artiste d'une piste de service depuis la lecture en cours
 * ouvre la recherche AVEC ce service coché ; l'effet de remise à zéro
 * s'exécutant aussi au premier passage, il effaçait ce périmètre avant même le
 * premier rendu et le geste paraissait sans effet.
 *
 * ## Pourquoi une fonction et pas un `$effect` dans le composant
 *
 * La garde d'origine vérifiait la présence LITTÉRALE de la ligne
 * `$effect(() => { void q; sourcesActives = new Set(); })` dans le fichier. Une
 * garde qui épingle une ligne source casse au premier remaniement sans rien
 * protéger : elle a rougi ici pour un changement qui PRÉSERVE la règle qu'elle
 * prétendait tenir. La règle vit donc ici, et la garde l'appelle.
 */

/**
 * 🔴 ELLE REND UNE DÉCISION, PAS UN PÉRIMÈTRE — et c'est vital.
 *
 * La première version prenait le périmètre courant et rendait le suivant.
 * L'effet appelant LISAIT donc `sourcesActives` pour l'ÉCRIRE, et lisait de
 * même la requête précédente qu'il écrivait. Svelte 5 y a vu une boucle :
 *
 *     Error: https://svelte.dev/e/effect_update_depth_exceeded
 *
 * Et il n'avorte pas que cet effet-là : il abandonne la PASSE entière. L'effet
 * de recherche ne partait donc jamais — la requête arrivait dans le champ,
 * l'écran restait à zéro résultat (constaté dans le navigateur sur le .18 le
 * 07/09/2026, `assets/index-DGS4KomS.js`, en cherchant « Brigitte Fontaine »
 * qui rend pourtant 50 albums Qobuz et 50 Tidal).
 *
 * `npm test` était VERT : aucune garde de source ne voit une boucle d'effets.
 * Seul le navigateur le dit.
 *
 * En rendant un booléen, l'appelant n'a plus rien à lire de ce qu'il écrit.
 *
 * @param precedente La requête du passage précédent, ou `null` au montage.
 * @param actuelle   La requête maintenant.
 * @returns `true` si le périmètre doit être vidé.
 */
export function doitViderLePerimetre(precedente: string | null, actuelle: string): boolean {
  return precedente !== null && precedente !== actuelle;
}

/* ------------------------------------------------------------------ */
/* LA RÈGLE DES PASTILLES — #1145                                      */
/* ------------------------------------------------------------------ */

/**
 * 🔴 UNE SEULE RÈGLE POUR LES DEUX RANGÉES.
 *
 * FabienM, fil 1774, point 7 (v0.9.147) :
 *
 *   « le clic sur la ligne "où" et "afficher" n'a pas le même comportement.
 *     Si on clique sur un critère de "Afficher" ça sélectionne/déselectionne le
 *     critère. En revanche si on clique sur un critère de "Où" ça
 *     sélectionne/déselectionne tous les autres critères sauf celui
 *     sélectionné. »
 *
 * Ce n'était pas un défaut d'affichage : c'étaient DEUX MODÈLES DE DONNÉES
 * incompatibles sous deux rangées identiques à l'œil.
 *
 *   « OÙ »       un ENSEMBLE où VIDE VAUT TOUT. Vide au départ, donc les quatre
 *                pastilles s'allumaient (`sourcesActives.size === 0 || …`), et
 *                le premier clic en éteignait trois d'un coup — le « saut » que
 *                FabienM décrit. Le FILTRE, lui, était bien cumulatif.
 *   « AFFICHER » un CHOIX UNIQUE (`typeRecherche`), depuis le point 8 d'Yves
 *                Corbat (17/09/2026) : une pastille allumée à la fois, « Tout »
 *                au départ, et UN clic pour ne garder que les albums.
 *
 * Aucune des deux ne peut se comporter comme l'autre sans qu'on tranche, et
 * c'est un arbitrage de produit, pas une correction. La règle retenue, unique,
 * est celle-ci :
 *
 *   • une pastille « Tout » / « Toutes les sources » EXPLICITE ouvre chaque
 *     rangée. Elle est allumée quand rien n'est restreint — et elle est la
 *     SEULE allumée dans ce cas ;
 *   • un clic sur une pastille alors que rien n'est restreint RESTREINT à
 *     celle-là : un clic pour « ne garder que les albums », ce qu'Yves
 *     demandait, et pour « ne garder que Qobuz » ;
 *   • un clic sur une autre pastille l'AJOUTE — le cumul, dans les deux
 *     rangées, qui existait côté sources et que le choix unique avait retiré
 *     aux types ;
 *   • un clic sur une pastille allumée la RETIRE ; retirer la dernière rallume
 *     « Tout ».
 *
 * L'ensemble VIDE reste la représentation de « tout » — c'est ce que le filtre
 * lit (`dansLePerimetreDe`) et ce qui évite un état « rien de coché » qui ne
 * rendrait aucun résultat. Ce qui change, c'est qu'il est désormais DIT par une
 * pastille au lieu d'être peint sur les quatre autres : plus rien ne s'éteint
 * tout seul au premier clic.
 *
 * ⚠️ CE QUE L'UTILISATEUR VOIT CHANGER, et qu'il faut assumer : au départ, les
 * quatre pastilles de source ne sont plus allumées. « Toutes les sources » l'est
 * à leur place.
 */

/** Rien n'est restreint : la rangée porte tout ce qu'elle a trouvé. */
export function sansRestriction(selection: ReadonlySet<string>): boolean {
  return selection.size === 0;
}

/**
 * La pastille est-elle ALLUMÉE ?
 *
 * 🔴 `has`, et RIEN d'autre. C'est ici que vivait le défaut : le « ou
 * `size === 0` » de l'affichage allumait les quatre pastilles quand aucune
 * n'était choisie, et le premier clic paraissait en éteindre trois.
 */
export function pastilleAllumee(selection: ReadonlySet<string>, cle: string): boolean {
  return selection.has(cle);
}

/**
 * L'élément est-il dans le périmètre ? VIDE VAUT TOUT — la règle du FILTRE,
 * qui, elle, ne change pas.
 */
export function dansLePerimetreDe(selection: ReadonlySet<string>, cle: string): boolean {
  return selection.size === 0 || selection.has(cle);
}

/**
 * Basculer une pastille. Rend un ENSEMBLE NEUF : sous les runes, muter celui
 * qu'on lit ne redéclenche rien.
 */
export function basculerPastille<T extends string>(selection: ReadonlySet<T>, cle: T): Set<T> {
  const suivant = new Set<T>(selection);
  if (suivant.has(cle)) suivant.delete(cle);
  else suivant.add(cle);
  return suivant;
}

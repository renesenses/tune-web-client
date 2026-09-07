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

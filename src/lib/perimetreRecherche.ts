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
 * @param precedente La requête du passage précédent, ou `null` au montage.
 * @param actuelle   La requête maintenant.
 * @param perimetre  Le périmètre courant.
 * @returns Le périmètre à appliquer — vidé si, et seulement si, la requête a
 *          réellement changé.
 */
export function perimetreApresRequete(
  precedente: string | null,
  actuelle: string,
  perimetre: ReadonlySet<string>,
): Set<string> {
  if (precedente !== null && precedente !== actuelle) return new Set<string>();
  return new Set(perimetre);
}

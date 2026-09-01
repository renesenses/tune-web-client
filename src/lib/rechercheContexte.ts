/**
 * Ce que la vue Recherche affiche à son montage.
 *
 * Sandro, forum fil 1553, second parcours : partir de la recherche GLOBALE (la
 * loupe), taper « Leprous », choisir le résultat Qobuz, descendre dans la
 * discographie, ouvrir un album, puis « Retour ». Il retombe sur la racine de
 * Qobuz et, dit-il, « les résultats de la recherche globale ont complètement
 * disparu ».
 *
 * Ils ont disparu littéralement. `App.svelte` monte les vues dans une chaîne
 * `{#if $activeView === …}` : ouvrir un résultat Qobuz bascule `activeView` sur
 * `streaming` et DÉTRUIT `SearchView`. Sa requête et sa grille de résultats
 * sont du `$state` local — elles meurent avec le composant, et y revenir
 * remonte une vue vierge. `StreamingView` s'était déjà vu offrir la parade
 * (`saveViewContext` / `loadViewContext`, PR #583) ; la vue Recherche, non.
 *
 * D'où l'instantané, et d'où cette décision : au montage, trois sources
 * peuvent vouloir remplir la barre de recherche, et leur ORDRE est le seul
 * endroit où quelque chose se décide. On l'isole ici pour le prouver sans
 * monter la vue.
 */

/**
 * La requête à replacer dans la barre au montage de la vue Recherche.
 *
 * @param pending  Requête déposée par un AUTRE écran (`pendingSearchQuery`) —
 *   la loupe, la fiche du lecteur, un nom d'artiste cliqué en bibliothèque.
 * @param contexte Requête du dernier passage dans la vue, conservée par
 *   `saveViewContext('search', …)`.
 *
 * @returns La requête à jouer, ou `null` pour laisser la vue à son écran de
 *   découverte.
 */
export function requeteAuMontage(
  pending: string | null | undefined,
  contexte: string | null | undefined,
): string | null {
  // Une demande explicite venue d'un autre écran prime TOUJOURS : c'est un
  // geste que l'utilisateur vient de faire. La servir après le contexte
  // rouvrirait la recherche précédente par-dessus celle qu'il demande.
  const demande = pending?.trim() ?? '';
  if (demande) return demande;

  // Sinon, et seulement sinon, on rétablit là où il en était.
  const repris = contexte?.trim() ?? '';
  if (repris) return repris;

  return null;
}

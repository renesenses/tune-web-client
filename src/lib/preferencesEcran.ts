/**
 * Les choix d'AFFICHAGE d'un écran, retenus d'une visite à l'autre.
 *
 * Lulu, forum, 05/09/2026 : « figer le choix de l'organisation de la
 * bibliothèque : à chaque retour sur cette fenêtre, celle-ci est figée sur le
 * choix "Titre", même si celui-ci a été modifié précédemment ».
 *
 * Le tri, l'onglet, le mode de navigation et la forme d'affichage sont des
 * préférences de CONFORT, pas des données : elles vivent donc dans le
 * navigateur, pas sur le serveur. Deux raisons de ne pas les mettre dans le
 * profil :
 *
 *  - la place à l'écran dépend de l'écran — un même profil n'a pas les mêmes
 *    besoins sur un portable et sur une télévision ;
 *  - le repli de la barre latérale suit déjà cette règle, et la mêler à des
 *    préférences serveur donnerait deux endroits pour la même famille de
 *    choix.
 *
 * Tout accès est protégé : un navigateur en navigation privée, un quota plein
 * ou un stockage désactivé ne doivent pas empêcher l'écran de s'afficher — il
 * repart alors simplement sur ses valeurs par défaut.
 */

const PREFIXE = 'tune_v2_ecran_';

/** Lit un choix, en refusant toute valeur hors de la liste permise. */
export function lireChoix<T extends string>(
  cle: string,
  permis: readonly T[],
  defaut: T,
): T {
  try {
    const v = localStorage.getItem(PREFIXE + cle);
    // ⚠️ On VALIDE : une valeur écrite par une version antérieure — un onglet
    // supprimé depuis, par exemple — laisserait l'écran sur un état qu'il ne
    // sait plus rendre.
    return permis.includes(v as T) ? (v as T) : defaut;
  } catch {
    return defaut;
  }
}

export function ecrireChoix(cle: string, valeur: string): void {
  try {
    localStorage.setItem(PREFIXE + cle, valeur);
  } catch { /* stockage indisponible : le choix ne dure que la session */ }
}

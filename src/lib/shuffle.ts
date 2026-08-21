/**
 * Mélanger une liste, sans biais et sans toucher à l'originale.
 *
 * Fisher-Yates, et non le `sort(() => Math.random() - 0.5)` qu'on écrit
 * spontanément : ce dernier n'est pas un mélange uniforme — la position finale
 * d'un élément dépend de l'algorithme de tri du moteur — et il modifie le
 * tableau reçu. Sur une liste de lecture, un biais se remarque : les mêmes
 * titres reviennent en tête.
 *
 * Extrait de `FavoritesView`, qui en portait la seule copie, le jour où les
 * listes de lecture en ont eu besoin à leur tour.
 */
export function melangee<T>(liste: readonly T[]): T[] {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

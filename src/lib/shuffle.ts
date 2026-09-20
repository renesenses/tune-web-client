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

/**
 * Un tirage REPRODUCTIBLE : le rang d'un élément pour une graine donnée.
 *
 * #4558 — Steve Taylor, fil 1671 : le tri « Aléatoire » des albums est parti
 * avec l'ancienne interface (`d5ed7deb`, phase 5) et la v2 ne l'avait jamais
 * repris. `melangee()` ci-dessus ne peut pas le rendre : la grille de la v2
 * recalcule son ordre (`$derived.by`) à chaque frappe de recherche, à chaque
 * filtre, et à l'arrivée de la seconde page d'albums. Un Fisher-Yates sur
 * `Math.random()` appelé là RE-TIRERAIT l'ordre à chaque fois — la grille
 * danserait sous le doigt.
 *
 * On dérive donc le rang de l'IDENTIFIANT de l'élément et d'une graine tenue
 * par l'écran. Trois conséquences :
 *
 *  - même graine ⇒ même ordre, quel que soit le nombre de recalculs, et quel
 *    que soit le sous-ensemble filtré : l'ordre relatif de deux albums ne
 *    dépend jamais des autres. C'est ce qui tient une pagination — la page 2
 *    ne peut pas rendre un album déjà vu en page 1 ;
 *  - un album qui ARRIVE (seconde page du chargement, nouveau scan) se range
 *    à sa place sans déplacer les autres ;
 *  - « re-tirer au hasard » n'est rien d'autre que « nouvelle graine ».
 *
 * C'est la même règle que le serveur applique à `sort=random&seed=`
 * (`AlbumRepo::melange_aleatoire_sql`), transposée côté client — la v2 tient
 * toute sa bibliothèque en mémoire et trie elle-même.
 */
export function rangAleatoire(id: number | string, graine: number): number {
  // FNV-1a sur l'identifiant, amorcé par la graine, puis finaliseur de
  // mélange : sans ce dernier, des identifiants consécutifs (1, 2, 3…) rendent
  // des rangs consécutifs, et le « tirage » conserve l'ordre de la base.
  let h = graine >>> 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0xd35a2d97) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

/** Une graine de tirage. Jamais 0 : elle sert aussi de témoin « pas de tirage ». */
export function graineAleatoire(): number {
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}

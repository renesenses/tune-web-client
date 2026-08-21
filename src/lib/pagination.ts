/**
 * Ajouter une page à une liste déjà affichée, et dire s'il en reste.
 *
 * Sorti du composant parce que c'est la partie qui peut se tromper en silence
 * dans les deux sens : un « voir plus » qui ne s'arrête jamais et resert
 * indéfiniment la même page, ou un bouton qui disparaît alors qu'il restait
 * des albums.
 *
 * La règle d'arrêt ne s'appuie **pas** sur un total : les services de musique
 * ne le donnent pas toujours, et quand ils le donnent il ment parfois. On
 * s'arrête sur ce qu'on observe — une page plus courte qu'une page pleine, ou
 * une page qui n'apporte rien de neuf.
 */
export interface PageFusionnee<T> {
  liste: T[];
  encore: boolean;
}

/**
 * @param actuelle   ce qui est déjà affiché
 * @param page       ce que le service vient de rendre
 * @param taille     la taille d'une page pleine
 * @param cle        l'identité d'un élément, pour écarter les doublons
 */
export function fusionnerPage<T>(
  actuelle: readonly T[],
  page: readonly T[],
  taille: number,
  cle: (x: T) => string,
): PageFusionnee<T> {
  const vus = new Set(actuelle.map(cle));
  const neufs = page.filter((x) => !vus.has(cle(x)));
  return {
    liste: [...actuelle, ...neufs],
    // Deux conditions, et il faut les deux :
    //   — une page pleine laisse supposer une suite ; une page courte dit que
    //     c'est fini ;
    //   — une page pleine mais entièrement composée de doublons signifie que
    //     le service tourne en rond (typiquement : il ignore l'offset et
    //     resert la première page). Continuer boucherait à l'infini.
    encore: page.length >= taille && neufs.length > 0,
  };
}

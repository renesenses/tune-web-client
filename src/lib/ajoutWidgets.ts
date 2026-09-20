/**
 * Répartir un catalogue de widgets face à une disposition enregistrée —
 * #1059.
 *
 * ## Ce qui a fait perdre une heure à FabienM
 *
 * Fil 1812, point 6 : « il manque le widget des playlist Qobuz "Humeurs" ».
 * Puis, quatre-vingts minutes plus tard, le testeur tranche lui-même
 * (réponse 6277) :
 *
 * > « je me suis aperçu que le widget "Humeurs" était **déjà sélectionné**,
 * > si je le retire il apparaît bien dans la liste des widgets disponibles »
 *
 * L'écran d'ajout ne propose que ce qui n'est pas déjà placé — c'est juste, et
 * il faut le garder. Mais il ne DIT pas pourquoi un widget n'y est pas : un
 * widget déjà posé et un widget absent du catalogue y sont exactement aussi
 * invisibles l'un que l'autre. Fabien a cherché dans cette liste ce qu'il
 * croyait manquant, et ne l'a compris qu'en le retirant.
 *
 * ## Le troisième cas, et c'est le vrai défaut
 *
 * Un identifiant peut être dans la disposition SANS être dans le catalogue :
 * `/streaming/qobuz/featured-playlists/by-tag` perd une catégorie en silence
 * dès qu'un appel à Qobuz échoue ou revient vide (`.ok()?`, côté serveur), et
 * la copie `dispositionEnregistree` de #987 garde — à raison — l'identifiant
 * inconnu pour ne pas l'effacer.
 *
 * Un tel identifiant est alors **invisible des deux côtés** : `parId` ne le
 * trouve pas, donc aucune rangée n'est rendue ; et il n'est pas dans le
 * catalogue, donc l'écran d'ajout ne peut pas le proposer. L'utilisateur n'a
 * plus aucun geste : ni le voir, ni le retirer, ni le remettre.
 *
 * Cette fonction nomme les trois populations pour que l'écran puisse les
 * traiter différemment. Elle ne décide de rien d'autre.
 */

/** Le strict minimum qu'on lit d'un widget ici. */
export interface WidgetIdentifiable {
  id: string;
}

export interface RepartitionWidgets<T extends WidgetIdentifiable> {
  /** Ce que l'écran d'ajout propose vraiment. */
  disponibles: T[];
  /** Déjà sur la page : à montrer GRISÉS, pas à cacher. */
  places: T[];
  /**
   * Dans la disposition, inconnus du catalogue — les fantômes. Rendus dans
   * l'ORDRE DE LA DISPOSITION, parce que c'est là que l'utilisateur les
   * cherchera.
   */
  inconnus: string[];
}

/**
 * 🔴 La disposition passe par un `Set` : elle peut porter des dizaines
 * d'identifiants (treize catégories Qobuz à elle seule), et un `includes` par
 * widget de catalogue est quadratique sur un chemin qui se recalcule à chaque
 * ajout.
 *
 * 🔴 Un identifiant en double dans la disposition ne rend pas deux fantômes :
 * l'écran en ferait deux cartes portant la même clé `{#each}`.
 */
export function repartirWidgets<T extends WidgetIdentifiable>(
  catalogue: readonly T[],
  disposition: readonly string[],
): RepartitionWidgets<T> {
  const posee = new Set(disposition);
  const connus = new Set(catalogue.map((w) => w.id));
  const disponibles: T[] = [];
  const places: T[] = [];
  for (const w of catalogue) (posee.has(w.id) ? places : disponibles).push(w);
  const inconnus: string[] = [];
  const vus = new Set<string>();
  for (const id of disposition) {
    if (connus.has(id) || vus.has(id)) continue;
    vus.add(id);
    inconnus.push(id);
  }
  return { disponibles, places, inconnus };
}

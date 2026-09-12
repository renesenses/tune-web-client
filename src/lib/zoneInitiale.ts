/**
 * Quelle zone l'interface doit sélectionner au chargement.
 *
 * ## Pourquoi cette règle vit ici et pas dans deux écrans
 *
 * Elle existait en DEUX exemplaires, et les deux ne disaient pas la même
 * chose. L'interface actuelle (`App.svelte`) préférait, dans l'ordre : la zone
 * par défaut du serveur, celle préférée sur cet appareil, **celle qui joue**,
 * puis la première. La coquille V1 (`v2Bootstrap.ts`) prenait **la première de
 * la liste**, point.
 *
 * Ce que ça produit, sur un appareil qui n'a encore rien mémorisé : les deux
 * interfaces du même serveur se posent sur deux zones différentes. Et comme
 * `audioLevels` ne rend que les niveaux de la zone SÉLECTIONNÉE, l'une montre
 * des aiguilles vivantes pendant que l'autre reste à zéro — sur la même
 * écoute, au même instant.
 *
 * Le cas n'est pas théorique. Sur une installation à sept zones où la première
 * de la liste est un AirPlay **hors ligne** et où la lecture se fait sur la
 * quatrième, la V1 se pose sur la zone muette.
 *
 * ⚠️ Ce module ne prétend PAS expliquer le signalement de Dominique COMET
 * (tune-server-rust#3807) : la zone mémorisée est partagée entre les deux
 * coquilles — même origine, même `localStorage` — donc l'écart ne mord que sur
 * un profil neuf ou après la disparition d'une zone. C'est une divergence
 * réelle, corrigée pour elle-même.
 *
 * ## L'ordre, et ce qu'il dit
 *
 * 1. **La zone mémorisée**, si elle existe ENCORE. Un choix explicite de
 *    l'utilisateur ne se révoque pas tout seul ; mais une zone supprimée
 *    depuis la dernière session laisserait l'interface pointer dans le vide,
 *    avec des boutons Lire silencieusement inertes.
 * 2. **Le défaut du serveur** (`is_default`), puis **le défaut local**. Ce
 *    sont des choix, eux aussi : ils passent avant une constatation.
 * 3. **La zone qui joue.** À défaut de choix, se raccrocher à ce qui sort des
 *    enceintes est le seul comportement qui ne surprenne personne.
 * 4. **La première de la liste**, faute de mieux — et seulement faute de mieux.
 */

/** Le strict nécessaire pour choisir : le reste de la zone ne nous regarde pas. */
export interface ZoneChoisissable {
  id?: number | null;
  is_default?: boolean | null;
  state?: string | null;
}

/**
 * Rend l'identifiant de zone à sélectionner, ou `null` si la liste est vide.
 *
 * PURE : ni store, ni réseau, ni `localStorage`. Les deux coquilles lui
 * passent ce qu'elles ont déjà en main.
 *
 * @param liste       les zones telles que `/zones` les rend, dans son ordre
 * @param memorisee   la zone actuellement sélectionnée, ou `null`
 * @param defautLocal la préférence d'appareil (`preferences.defaultZoneId`)
 */
export function zoneInitiale(
  liste: readonly ZoneChoisissable[],
  memorisee: number | null | undefined,
  defautLocal: number | null | undefined,
): number | null {
  // Un choix encore valable ne se touche pas.
  if (memorisee != null && liste.some((z) => z.id === memorisee)) return memorisee;
  if (liste.length === 0) return null;

  const defautServeur = liste.find((z) => z.is_default === true);
  const prefereeIci = defautLocal != null ? liste.find((z) => z.id === defautLocal) : undefined;
  const quiJoue = liste.find((z) => z.state === 'playing');

  const cible = defautServeur ?? prefereeIci ?? quiJoue ?? liste[0];
  return cible?.id ?? null;
}

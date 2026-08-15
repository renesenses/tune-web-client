/** Appareils favoris de la sidebar (#1622).
 *
 *  La liste APPAREILS peut compter une douzaine d'entrées découvertes chez
 *  certains testeurs : les favoris remontent en tête, le reste garde l'ordre
 *  de découverte (Array.prototype.sort est stable). Mêmes identifiants
 *  préfixés (`audio:`/`net:`) et même persistance (ui_preferences synchronisé
 *  serveur) que le masquage d'appareils (hiddenDeviceIds). */

export type DeviceFavPrefix = 'audio' | 'net';

/** Trie une liste d'appareils : favoris d'abord, ordre d'origine préservé. */
export function favoritesFirst<T extends { id: string }>(
  list: T[],
  prefix: DeviceFavPrefix,
  favoriteIds: string[],
): T[] {
  if (favoriteIds.length === 0) return list;
  return [...list].sort(
    (a, b) =>
      Number(favoriteIds.includes(`${prefix}:${b.id}`)) -
      Number(favoriteIds.includes(`${prefix}:${a.id}`)),
  );
}

/** Ajoute ou retire une clé préfixée de la liste des favoris. */
export function toggleFavoriteId(favoriteIds: string[], key: string): string[] {
  return favoriteIds.includes(key)
    ? favoriteIds.filter((k) => k !== key)
    : [...favoriteIds, key];
}

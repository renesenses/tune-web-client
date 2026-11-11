/**
 * tune-server-rust#8040 — les favoris d'un service s'affichent par pages, la
 * première tout de suite.
 *
 * L'écran attendait que TOUS les favoris aient été lus chez le service avant
 * d'afficher quoi que ce soit : plusieurs secondes sur « Chargement… » pour
 * une longue liste ou un service lent. Désormais, pour chacune des trois
 * natures :
 *
 * 1. la première page (`?limit=&offset=0`) part, et s'affiche dès qu'elle
 *    arrive — `pret()` est appelé quand les trois premières pages ont répondu,
 *    bonnes ou mauvaises ;
 * 2. si le serveur annonce qu'il en reste (`total` au-delà de la page), la
 *    liste entière est demandée ensuite, sans geste, et remplace la page.
 *
 * Un serveur antérieur ignore `limit`/`offset` et rend la liste entière sans
 * `total` : elle est prise telle quelle, et rien de plus n'est demandé.
 */

export type NatureFavori = 'albums' | 'artists' | 'tracks';

export const NATURES: readonly NatureFavori[] = ['albums', 'artists', 'tracks'];

/** Taille de la première page. */
export const PREMIERE_PAGE = 50;

export type Page = { limit: number; offset: number };

/** `getStreamingFavorites` sans le service : la réponse brute du serveur. */
export type LectureFavoris = (nature: NatureFavori, page?: Page) => Promise<unknown>;

/** Les éléments d'une réponse `{ albums: [...] }` / `{ tracks: [...] }`. */
export function elementsDe(reponse: unknown, nature: NatureFavori): unknown[] {
  const liste = (reponse as Record<string, unknown> | null | undefined)?.[nature];
  return Array.isArray(liste) ? liste : [];
}

/**
 * La réponse à une première page contient-elle TOUT ?
 *
 * - pas de clé `total` : serveur antérieur, qui a rendu la liste entière ;
 * - `total` numérique : tout, si la page le couvre ;
 * - `total` nul (service qui ne l'annonce pas) : tout, si la page n'est pas
 *   pleine.
 */
export function pageComplete(reponse: unknown, nature: NatureFavori, limit: number): boolean {
  const objet = reponse as Record<string, unknown> | null | undefined;
  if (!objet || typeof objet !== 'object' || !('total' in objet)) return true;
  const n = elementsDe(reponse, nature).length;
  return typeof objet.total === 'number' ? n >= objet.total : n < limit;
}

/**
 * Charge les trois natures : la première page, affichée dès réception, puis
 * la suite. `afficher` reçoit chaque liste au moment où elle est connue ;
 * `pret` est appelé une fois, quand les trois premières pages ont répondu.
 * La promesse rendue se résout quand tout — suite comprise — est terminé.
 */
export async function chargerFavorisProgressifs(
  lire: LectureFavoris,
  afficher: (nature: NatureFavori, items: unknown[]) => void,
  pret: () => void,
  limit = PREMIERE_PAGE,
): Promise<void> {
  let restantes = NATURES.length;
  const premierePageVue = () => { if (--restantes === 0) pret(); };

  await Promise.all(NATURES.map(async (nature) => {
    let complete = true;
    try {
      const reponse = await lire(nature, { limit, offset: 0 });
      afficher(nature, elementsDe(reponse, nature));
      complete = pageComplete(reponse, nature, limit);
    } catch {
      afficher(nature, []);
    } finally {
      premierePageVue();
    }
    if (complete) return;
    try {
      const entiere = await lire(nature);
      afficher(nature, elementsDe(entiere, nature));
    } catch {
      // La première page reste affichée : mieux vaut 50 favoris que rien.
    }
  }));
}

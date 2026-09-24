/**
 * LES ALBUMS D'UNE PORTÉE DOSSIER, EN ENTIER — fil 1880 (jfpaquet).
 *
 * 🔴 Le défaut : l'écran demandait 5 000, le serveur en rend 2 000.
 *
 * `LibraryV2` réduit sa grille à un dossier en demandant à
 * `/library/albums-detailed?folder=…` les albums de ce dossier, dont il ne
 * garde que les IDENTIFIANTS (`idsPortee`), puis filtre la bibliothèque déjà
 * chargée. L'appel était UNIQUE : `getAlbumsDetailed({folder}, 5000, 0)`.
 *
 * Or la route BORNE ce qu'elle rend — `q.limit.unwrap_or(500).clamp(1, 2000)`
 * dans `tune-server/src/routes/library/albums_detailed.rs`. Demander 5 000 en
 * rend donc 2 000, sans erreur, sans en-tête, sans rien qui le dise : la
 * réponse d'une portée de 3 200 albums a exactement la forme de celle d'une
 * portée de 2 000. L'écran prenait ces 2 000 identifiants pour la portée
 * ENTIÈRE et retirait silencieusement de la grille tout le reste.
 *
 * 🔴 Et ce n'est pas une coupe au hasard. La route ordonne par
 * `MAX(ARTISTE_DE_CARTE), MAX(al.title)` — l'artiste de la carte d'abord.
 * Les compilations portent le leur (`Various Artists`, « VA »…), donc tout ce
 * qui se range sous V ou au-delà part EN DERNIER, et c'est précisément ce
 * qu'une coupe à 2 000 emporte. jfpaquet, fil 1880, 6 599 albums : « dans la
 * liste des albums (Library) ceux dénommés "VA-xxx" ont disparu ».
 *
 * La réponse portait pourtant déjà de quoi le savoir : `total`, le nombre
 * d'albums DISTINCTS de la portée, que l'appelant n'a jamais lu. Ce module le
 * lit et redemande la suite par `offset` jusqu'à l'avoir tout. `MetadataV2`
 * pagine déjà cette même route de cette façon — c'était le seul appel à ne pas
 * le faire.
 */
import type { AlbumDetailed } from './api';

/** Le plafond de la route (`clamp(1, 2000)`). Demander plus n'en rend pas
 *  plus ; demander CE nombre évite un aller-retour de plus par page. */
export const PAGE_PORTEE = 2000;

/**
 * Garde-fou : jamais plus de tours que ça, quoi que dise le serveur.
 *
 * `total` vient d'un `COUNT(DISTINCT …)` fait dans une AUTRE requête que la
 * page ; rien ne garantit qu'il reste cohérent si la bibliothèque bouge entre
 * les deux (un scan en cours). Un `total` trop grand ferait tourner la boucle
 * sans fin — sauf qu'une page vide l'arrête déjà. Ce plafond est la seconde
 * garde : 100 000 albums de portée, très au-delà de toute bibliothèque vue.
 */
const TOURS_MAX = 50;

/** Une page de la route, telle que `api.getAlbumsDetailed` la rend. */
export type PageDetaillee = { items: AlbumDetailed[]; total: number } | null | undefined;

/**
 * Tous les identifiants d'album de la portée, page après page.
 *
 * `page(limite, rang)` fait UN appel. Une erreur n'est PAS rattrapée ici :
 * l'écran préfère dire qu'il ne sait pas plutôt que montrer une portée
 * amputée — c'est déjà sa règle, et une troncature muette est exactement le
 * défaut qu'on corrige.
 */
export async function idsAlbumsDeLaPortee(
  page: (limite: number, rang: number) => Promise<PageDetaillee>,
): Promise<Set<number>> {
  const ids = new Set<number>();
  let rang = 0;
  for (let tour = 0; tour < TOURS_MAX; tour++) {
    const reponse = await page(PAGE_PORTEE, rang);
    const recues = reponse?.items ?? [];
    for (const a of recues) {
      const id = (a as { album_id?: unknown } | null)?.album_id;
      if (typeof id === 'number') ids.add(id);
    }
    // Une page VIDE arrête tout : il n'y a plus rien à prendre, quel que soit
    // ce que `total` prétend.
    if (recues.length === 0) return ids;
    rang += recues.length;
    // `total` = le nombre d'albums DISTINCTS de la portée, sur le même
    // prédicat que la page. Sans lui (serveur qui ne le rend pas), c'est la
    // forme de la page qui parle : une page NON pleine est la dernière.
    const total = reponse?.total;
    if (typeof total === 'number' ? rang >= total : recues.length < PAGE_PORTEE) return ids;
  }
  return ids;
}

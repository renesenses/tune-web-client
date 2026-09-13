/**
 * Combien de résultats une page de recherche de service rapporte.
 *
 * ## 🔴 `renesenses/tune-web-client#922`, et le point 5 du fil 1691
 *
 * FabienM, fil 1691 : « La recherche globale depuis le menu principal ne
 * retourne pas tous les résultats du streaming (ex : recherche titre
 * "Somebody" sur Qobuz → retourne seulement 50 résultats) ».
 *
 * ## Le commentaire du code affirmait le contraire, et il avait tort
 *
 * `api.ts` déclarait, au-dessus de `SEARCH_PAGE_LIMIT` :
 *
 *   « 50 est le plafond de page de l'API Qobuz — demander davantage ne rend
 *     pas davantage. Au-delà, il faut paginer, pas augmenter ce nombre. »
 *
 * MESURÉ le 12/09/2026 sur la .18 en v0.9.147, requête « somebody » :
 *
 *   GET /streaming/qobuz/search?q=somebody&limit=50   → 50 albums, 50 titres
 *                                               100   → 100, 100
 *                                               200   → 200, 200
 *                                               500   → 500, 500
 *   totals : albums 1000 · titres 1000 · artistes 135 · playlists 173
 *
 * Demander davantage rend donc bien davantage, jusqu'à 500 au moins. Le
 * plafond de 50 n'était pas celui du service : c'était celui qu'on
 * s'imposait, sur la foi d'un commentaire que personne n'avait revérifié.
 *
 * ⚠️ La pagination, elle, marche : `offset` est honoré sur cette route
 * (mesuré : deux pages de 5 rendent dix identifiants distincts). Le bouton
 * « voir plus » n'est donc pas cassé — il est simplement lent quand chaque
 * page ne vaut que cinquante lignes sur mille.
 *
 * 🔴 À ne pas confondre avec la route FÉDÉRÉE `/search?q=…&sources=qobuz`,
 * qui accepte `limit` jusqu'à 500 mais **ignore `offset`** pour un service —
 * mesuré le même jour, deux pages consécutives y rendent les mêmes lignes.
 * C'est pourquoi ce réglage ne vaut que pour la recherche SERVICE PAR
 * SERVICE, la seule qui pagine.
 */

/** Les tailles offertes. « Tous » n'existe pas : ce serait un mensonge. */
export const TAILLES_PAGE = [50, 100, 200, 500] as const;
export type TaillePage = (typeof TAILLES_PAGE)[number];

/**
 * Le plafond dur, mesuré. Au-delà de 500 le serveur rend 500 : proposer
 * davantage annoncerait ce qu'on ne peut pas tenir.
 */
export const TAILLE_MAX = 500;

/** La taille par défaut — celle d'avant ce réglage, pour ne surprendre personne. */
export const TAILLE_DEFAUT: TaillePage = 50;

const CLE = 'tune_taille_page_recherche';

/** Une valeur venue d'ailleurs n'est retenue que si elle est offerte. */
export function normaliserTaille(v: unknown): TaillePage {
  const n = typeof v === 'string' ? Number(v) : v;
  return (TAILLES_PAGE as readonly number[]).includes(n as number)
    ? (n as TaillePage)
    : TAILLE_DEFAUT;
}

/**
 * La taille retenue par l'utilisateur.
 *
 * Le rangement local peut lever — navigation privée, stockage refusé — et une
 * préférence d'affichage ne doit jamais empêcher l'écran de s'ouvrir.
 */
export function chargerTaillePage(): TaillePage {
  try {
    return normaliserTaille(localStorage.getItem(CLE));
  } catch {
    return TAILLE_DEFAUT;
  }
}

export function retenirTaillePage(v: unknown): TaillePage {
  const t = normaliserTaille(v);
  try {
    localStorage.setItem(CLE, String(t));
  } catch { /* voir ci-dessus */ }
  return t;
}

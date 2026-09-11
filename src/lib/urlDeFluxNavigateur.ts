/**
 * Quelle adresse poser dans la balise `<audio>` de la zone navigateur.
 *
 * # Le défaut, et pourquoi il ne se voyait pas
 *
 * `browserPlay` réécrivait **toute** URL absolue en chemin relatif
 * (`u.pathname + u.search`), sans regarder d'où elle venait. La règle est
 * juste pour une URL de Tune : le serveur annonce son IP de LAN, que le
 * navigateur ne joint pas forcément derrière un proxy ou un NAT, et le chemin
 * relatif le ramène sur l'hôte qu'il a su joindre.
 *
 * Appliquée à une URL TIERCE, elle jette le domaine. L'onglet demande alors
 * `bcbits.com/stream/…` **à Tune**, qui ne connaît pas ce chemin et répond par
 * son repli SPA (`ServeDir(…).fallback(index.html)`) : `200 text/html`. Le
 * navigateur reçoit une page web au lieu du son et dit exactement cela —
 * « Aucun décodeur pour les formats nécessaires : text/html », `MediaError
 * code 4` (Bilou, fil 1509, console du 22/08/2026, #2076 / #2158).
 *
 * Le serveur a été corrigé source par source depuis : Bandcamp (#2076/#2158,
 * `resolve_direct.rs:375-378`, `|| is_browser_output`) puis la radio (#2670,
 * dont le commentaire de `servir_la_radio_au_reseau` nomme ce fichier-ci :
 * « Le client web reecrit toute URL absolue en chemin relatif […] C'est la
 * MEME cause que #2076 / #2158 »). Le dernier bras de `resolve_direct` —
 * podcast et serveur multimédia — rend toujours l'URL amont telle quelle, sans
 * garde `is_browser_output` : la même panne y attend, sur une zone navigateur.
 *
 * # La règle, et pourquoi elle est exacte plutôt qu'heuristique
 *
 * Tune n'a qu'une forme d'adresse de flux, et elle est construite à un seul
 * endroit — `tune-core/src/http/streamer.rs:1181` :
 *
 *     format!("http://{server_ip}:{}/stream/{stream_id}.{ext}", self.port)
 *
 * Un **seul** segment après `/stream/`. La route qui la sert ne dit pas autre
 * chose : `/stream/{stream_id}`. L'URL Bandcamp qui a produit le `text/html`
 * en avait trois (`/stream/<hash>/mp3-128/<id>`), et c'est justement ce qui la
 * faisait tomber dans le repli SPA.
 *
 * On réécrit donc en relatif exactement ce que Tune sert, et rien d'autre :
 *
 * - même origine que la page : le relatif est la même adresse, on la garde ;
 * - chemin `/stream/<un-seul-segment>` : c'est une adresse de Tune, on
 *   réécrit — c'est le cas que la règle d'origine servait ;
 * - tout le reste : **le domaine est conservé**.
 *
 * ⚠️ Conserver le domaine ne garantit pas le son : l'élément audio porte
 * `crossOrigin = 'anonymous'`, donc un hôte tiers sans en-tête CORS refusera
 * encore. Mais l'échec est alors NOMMÉ dans la console, au lieu d'un
 * `text/html` qui échouait à tous les coups en accusant le format.
 */

/** La route de flux de Tune : `/stream/<identifiant>`, un seul segment. */
const ROUTE_DE_FLUX_TUNE = /^\/stream\/[^/]+$/;

/**
 * L'adresse à poser dans `audio.src`.
 *
 * @param urlDeFlux   ce que le serveur a rendu dans `stream_url`
 * @param origineCourante `location.origin` de la page, quand il est connu
 */
export function sourceDuLecteur(urlDeFlux: string, origineCourante?: string | null): string {
  let u: URL;
  try {
    u = new URL(urlDeFlux);
  } catch {
    // Déjà relative, ou pas une URL : rien à décider.
    return urlDeFlux;
  }
  if (origineCourante && u.origin === origineCourante) return u.pathname + u.search;
  if (ROUTE_DE_FLUX_TUNE.test(u.pathname)) return u.pathname + u.search;
  return urlDeFlux;
}

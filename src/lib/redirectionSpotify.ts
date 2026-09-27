/**
 * URI de redirection Spotify — renesenses/tune-server-rust#2680 (fil 221).
 *
 * Règle Spotify (« Redirect URIs », en vigueur depuis le 9 avril 2025) :
 * HTTPS obligatoire, SAUF un littéral de boucle locale explicite
 * `http://127.0.0.1:<port>` ou `http://[::1]:<port>` ; `localhost` est refusé.
 * Un `http://` vers une IP du réseau local est refusé comme « Insecure ».
 *
 * Le serveur calcule l'URI qu'il enverra et, le cas échéant, le motif du
 * refus (`GET /system/env` → `spotify_redirect_uri`, `spotify_redirect_uri_refus`).
 * Ce module ne décide que de l'AFFICHAGE : quelle phrase montrer, et s'il faut
 * proposer de coller l'adresse de rappel.
 */

export type RefusRedirection = 'localhost' | 'http_hors_bouclage';

/** L'URI vise-t-elle la boucle locale du SERVEUR (127.0.0.1 ou [::1]) ? */
export function rappelEnBouclage(uri: string | null | undefined): boolean {
  if (!uri) return false;
  const u = uri.trim().toLowerCase();
  return u.startsWith('http://127.0.0.1') || u.startsWith('http://[::1]');
}

function hoteLocal(hote: string): boolean {
  const h = hote.toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]';
}

/**
 * Le rappel peut-il aboutir SEUL dans ce navigateur ?
 *
 * Une URI en boucle locale renvoie le navigateur vers LUI-MÊME. Si la page
 * de Tune est ouverte depuis une autre machine (`http://192.168.1.20:8888`),
 * Spotify l'enverra vers une page qui ne s'ouvre pas : il faut alors coller
 * l'adresse de cette page dans Tune, qui en extrait le code.
 */
export function rappelAboutitIci(uri: string | null | undefined, hotePage: string): boolean {
  if (!rappelEnBouclage(uri)) return true;
  return hoteLocal(hotePage);
}

/** La clé de traduction qui explique un refus, ou `null`. */
export function cleDuRefus(refus: string | null | undefined): string | null {
  if (refus === 'localhost') return 'v2.set.spotifyRedirectLocalhost';
  if (refus === 'http_hors_bouclage') return 'v2.set.spotifyRedirectInsecure';
  return null;
}

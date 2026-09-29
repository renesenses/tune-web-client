/**
 * L'onglet « Doublons » de l'écran Métadonnées attend trois listes du
 * serveur : albums éclatés (BIB-A2), artistes en double (BIB-C1) et paires de
 * pistes (BIB-B3). tune-web-client#1788, tune-server-rust#5455.
 *
 * Avant : un `Promise.all` sans délai d'abandon, et un `.catch(() => [])` par
 * requête. Une seule route qui ne répondait pas laissait « Chargement » à
 * l'écran pour toujours, et une route en erreur devenait une liste vide, que
 * l'écran annonçait comme « rien à regrouper ».
 *
 * Ici : un délai d'abandon commun aux trois requêtes. À l'échéance, ce qui
 * n'a pas répondu est abandonné (la connexion est rendue au navigateur). Les
 * listes qui ont répondu sont gardées, et `echec` dit ce qui s'est passé pour
 * que l'écran le dise à son tour, avec un bouton pour réessayer.
 */
import * as api from './api';
import type { GroupeAlbumsEclates, GroupeArtistes, PaireDoublonNommee } from './api';

/** Une minute : bien au-delà de ce que les trois routes coûtent sur une grande bibliothèque. */
export const DELAI_DOUBLONS_MS = 60_000;

/** `delai` : au moins une route n'a pas répondu à temps ; `erreur` : au moins une a échoué. */
export type EchecDoublons = null | 'delai' | 'erreur';

export interface ListesDoublons {
  albums: GroupeAlbumsEclates[];
  artistes: GroupeArtistes[];
  paires: PaireDoublonNommee[];
  echec: EchecDoublons;
}

export async function chargerLesDoublons(delaiMs: number = DELAI_DOUBLONS_MS): Promise<ListesDoublons> {
  const controle = new AbortController();
  let expire = false;
  let echoue = false;
  const minuterie = setTimeout(() => {
    expire = true;
    controle.abort();
  }, delaiMs);
  // L'abandon ne compte pas sur `fetch` seul : une requête qui ignorerait le
  // signal ne doit pas pouvoir retenir l'écran.
  const abandon = new Promise<never>((_, rejeter) => {
    controle.signal.addEventListener('abort', () => rejeter(new DOMException('délai dépassé', 'AbortError')));
  });
  abandon.catch(() => {});
  const garder = <T>(requete: Promise<T>, vide: T): Promise<T> =>
    Promise.race([requete, abandon]).catch(() => {
      echoue = true;
      return vide;
    });
  try {
    const [albums, artistes, paires] = await Promise.all([
      garder(api.getAlbumsEclates(controle.signal), [] as GroupeAlbumsEclates[]),
      garder(api.getArtistsDoublons(controle.signal), [] as GroupeArtistes[]),
      garder(api.getPairesDoublons(undefined, controle.signal), [] as PaireDoublonNommee[]),
    ]);
    return { albums, artistes, paires, echec: expire ? 'delai' : echoue ? 'erreur' : null };
  } finally {
    clearTimeout(minuterie);
  }
}

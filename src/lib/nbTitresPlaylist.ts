/**
 * Le nombre de titres d'une playlist, en sous-titre de sa vignette — web#2750
 * points 6 et 7 (FabienM, fil 2723 : « Favoris, onglet Playlists » et
 * « Accueil, widgets sur les playlists » : « afficher en sous-titre le nombre
 * de titres de chaque playlist »). Go de Bertrand du 12/11/2026 (rc12).
 *
 * Deux origines :
 *  - l'objet le PORTE : une playlist de la bibliothèque (`GET /playlists/{id}`)
 *    et les listes de playlists d'un service (`StreamingPlaylist.track_count`) ;
 *  - il ne le porte pas : un favori de service (`streaming_favorites` ne garde
 *    que le titre et la pochette). On le demande alors À LA PLAYLIST,
 *    `GET /streaming/{service}/playlists/{id}`, qui rend `track_count`.
 *
 * Jamais de chiffre inventé : sans valeur lue, rien n'est affiché.
 */
import * as api from './api';

/** Le nombre de titres que porte l'objet, ou `null`. */
export function nbTitresDe(o: any): number | null {
  for (const k of ['track_count', 'tracks_count', 'nb_tracks', 'trackCount']) {
    const v = o?.[k];
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return null;
}

/** « 1 titre » / « 12 titres », dans la langue de l'interface. */
export function libelleNbTitres(n: number, tn: (cle: string, n: number) => string): string {
  return tn('v2.common.trackCountN', n);
}

/**
 * Le nombre de titres d'une playlist DE SERVICE, demandé au service. `null`
 * si la route échoue (playlist retirée, service déconnecté) : le sous-titre
 * reste vide plutôt que de dire « 0 titre ».
 */
export async function compterTitresDeService(service: string, id: string): Promise<number | null> {
  try {
    return nbTitresDe(await api.getStreamingPlaylist(service, id));
  } catch {
    return null;
  }
}

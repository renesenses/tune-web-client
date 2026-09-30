/**
 * « Plus comme ça » sur un titre de SERVICE — fil forum 1906 (FabienM,
 * point 3).
 *
 * Un titre de bibliothèque lit `GET /library/tracks/{id}/similar` (voisins
 * acoustiques, un `i64`). Un titre Qobuz passe désormais par
 * `GET /streaming/qobuz/tracks/{id}/similar`, qui reprend côté serveur la
 * logique de la reprise automatique de fin de file : artiste du titre →
 * artistes similaires SELON QOBUZ → un titre phare par voisin.
 *
 * La RÈGLE — quel titre y a droit — et le GESTE vivent ici, une fois, pour les
 * deux menus (`v2/PisteActions`, `partages/MenuPisteV1`) : c'est la leçon de
 * `routageAlbum.albumDeServiceDe`, dont les deux copies avaient divergé.
 */
import * as api from './api';
import { pisteDeServiceDe, type PisteDeService } from './champsPisteService';
import { lireListe, type GestesLecture } from './lectureEnMasse';

/**
 * Les services dont le serveur sait rendre les titres voisins.
 *
 * Qobuz (`artist/getSimilarArtists`), et depuis tune-server-rust#5395 TIDAL
 * (`/artists/{id}/similar`) et Deezer (`/artist/{id}/related`) — décision de
 * Bertrand du 29/09/2026. Spotify, YouTube, Amazon, Bandcamp n'ont pas de
 * similarité d'artiste — le serveur leur répond 501, et l'entrée leur reste
 * ABSENTE, pas grisée.
 *
 * ⚠️ Un serveur plus ancien répond encore 501 pour TIDAL et Deezer : le geste
 * le traite comme « aucun voisin » (`library.noSimilarService`), pas comme une
 * panne.
 */
export const SERVICES_PLUS_COMME_CA: ReadonlySet<string> = new Set(['qobuz', 'tidal', 'deezer']);

/** Le titre de service qui a droit à « Plus comme ça », ou `null`. */
export function plusCommeCaDeServiceDe(piste: unknown): PisteDeService | null {
  const p = pisteDeServiceDe(piste);
  return p && SERVICES_PLUS_COMME_CA.has(p.service) ? p : null;
}

/**
 * Le geste : les voisins, puis la lecture — la file est REMPLACÉE, comme pour
 * un titre de bibliothèque (`playAndSync` avec `track_ids`). Une liste de
 * service n'a pas de `track_ids` : c'est le plan « tête et reste » de
 * `lectureEnMasse` (la tête lance et remplace la file, le reste s'enfile).
 *
 * Rend le nombre de titres lancés — zéro veut dire « aucun voisin », et c'est
 * à l'écran de le dire (`library.noSimilarService`), comme la bibliothèque dit
 * `library.noSimilar`.
 */
export async function lirePlusCommeCaDeService(
  p: PisteDeService,
  gestes: GestesLecture,
): Promise<number> {
  let pistes;
  try {
    pistes = await api.similairesDeService(p.service, p.sourceId);
  } catch (e: any) {
    // 501 : le serveur (plus ancien) ne sait pas encore les voisins de ce
    // service. Pour l'auditeur, c'est « aucun titre voisin ».
    if (e?.status === 501) return 0;
    throw e;
  }
  return lireListe(pistes, gestes);
}

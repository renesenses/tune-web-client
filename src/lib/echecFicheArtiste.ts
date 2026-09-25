/**
 * Pourquoi la fiche d'un artiste de SERVICE n'a pas pu être chargée —
 * renesenses/tune-web-client#992.
 *
 * FabienM, fil 1774, point 14 (v0.9.147) : « Menu lecture en cours : quand je
 * clique sur l'artiste, erreur 502 ». La cause de ce jour-là était côté
 * serveur (`extra=biography`, refusé par Qobuz, corrigé en 0.9.149 par
 * tune-server-rust#4049). Ce qui restait vrai sur la 0.9.164, mesuré sur la
 * .18 le 24/09/2026 :
 *
 *     GET /streaming/qobuz/artists/999999999999 → 502
 *         qobuz /artist/get: 404 {"status":"error","code":404,…}
 *     GET /streaming/youtube/artists/UCxxxx992  → 502
 *         Not found: youtube artist UCxxxx992 not found
 *     GET /streaming/spotify/artists/x          → 502  not authenticated
 *
 * et chacun de ces échecs peignait, par-dessus la page, un bandeau rouge
 * « Server error: » suivi du texte BRUT du service. La page, elle, ne disait
 * rien : l'en-tête restait sans image ni biographie.
 *
 * Deux motifs seulement, parce que l'auditeur n'a que deux choses à savoir :
 * - `introuvable` — le service ne connaît pas cet artiste (404) ; réessayer
 *   n'y changera rien ;
 * - `indisponible` — tout le reste : panne d'amont, session expirée, réseau.
 *   Réessayer peut suffire.
 *
 * Le statut est lu sur l'erreur (`ApiError.status`), jamais sur son texte :
 * « qobuz /artist/get: 404 … » contient « 404 » alors que le statut rendu est
 * 502 — c'est justement ce que la route serveur corrige de son côté.
 */
import { libelleDeSource } from './utils';

export type MotifEchecFiche = 'introuvable' | 'indisponible';

export function motifEchecFiche(raison: unknown): MotifEchecFiche {
  const statut = (raison as { status?: unknown } | null | undefined)?.status;
  return statut === 404 ? 'introuvable' : 'indisponible';
}

/** La clé de traduction du message affiché dans la page. */
export function cleMessageEchecFiche(motif: MotifEchecFiche): string {
  return motif === 'introuvable' ? 'v2.fas.artistNotFound' : 'v2.fas.artistUnavailable';
}

/** La phrase affichée dans la page, le nom du service mis en forme. */
export function messageEchecFiche(
  motif: MotifEchecFiche,
  service: string | null | undefined,
  traduire: (cle: string) => string,
): string {
  return traduire(cleMessageEchecFiche(motif)).replace('{service}', libelleDeSource(service));
}

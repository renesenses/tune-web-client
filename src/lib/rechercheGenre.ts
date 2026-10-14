/**
 * tune-server-rust#6231 (Didier, fil 2128) — la saisie dans l'onglet Genres.
 *
 * Jusqu'ici elle filtrait en TEXTE les albums affichés du genre, c'est-à-dire,
 * chez Qobuz, ses seules nouveautés : « Roxy Music » n'y était presque jamais.
 * Désormais elle interroge le catalogue du service, restreint au genre
 * (`GET /streaming/{svc}/genres/{id}/search`). Le serveur garde, parmi les
 * résultats de la recherche du service, les albums du genre : ni Qobuz ni
 * Deezer n'acceptent de filtre de genre, mais tous deux donnent le genre de
 * chaque album.
 *
 * Un service qui ne le permet pas (501, ou 404 d'un serveur antérieur) : l'écran
 * le DIT et garde le filtre des albums affichés — jamais de filtre en silence.
 */
import { searchStreamingGenre, type RechercheDansUnGenre } from './api';
import type { Album } from './types';

export type EtatRechercheGenre =
  | { etat: 'inactive' }
  | { etat: 'chargement' }
  | { etat: 'catalogue'; albums: Album[]; examined: number }
  | { etat: 'nonPrise' }
  | { etat: 'erreur' };

/** Une saisie assez longue pour partir au catalogue (même seuil que l'Éditorial). */
export const SAISIE_MIN = 2;

/** Le refus « pas de recherche par genre ici » : 501, ou route absente (404/405). */
export function estRefusRechercheGenre(e: unknown): boolean {
  const statut = (e as { status?: number } | null)?.status;
  return statut === 501 || statut === 404 || statut === 405;
}

export async function chercherDansLeGenre(
  service: string,
  genreId: string,
  saisie: string,
  appel: typeof searchStreamingGenre = searchStreamingGenre,
): Promise<EtatRechercheGenre> {
  const q = saisie.trim();
  if (!service || !genreId || q.length < SAISIE_MIN) return { etat: 'inactive' };
  try {
    const r: RechercheDansUnGenre = await appel(service, genreId, q, 50);
    return { etat: 'catalogue', albums: Array.isArray(r?.albums) ? r.albums : [], examined: r?.examined ?? 0 };
  } catch (e) {
    return estRefusRechercheGenre(e) ? { etat: 'nonPrise' } : { etat: 'erreur' };
  }
}

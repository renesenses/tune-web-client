/**
 * tune-server-rust#6198 — réserver l'analyse acoustique (CLAP, la recherche
 * par ambiance) à certains genres, ou en écarter. Le serveur publie deux
 * tableaux, vides par défaut : `audio_embedding_genres_included` (vide : tous
 * les genres) et `audio_embedding_genres_excluded` (vide : aucun). Il refuse
 * toute autre forme.
 */
export const CLE_GENRES_CLAP_INCLUS = 'audio_embedding_genres_included';
export const CLE_GENRES_CLAP_EXCLUS = 'audio_embedding_genres_excluded';

/** La liste publiée, ou `null` si le serveur ne connaît pas le réglage. */
export function genresDepuisConfig(v: unknown): string[] | null {
  return Array.isArray(v) ? v.filter((g): g is string => typeof g === 'string') : null;
}

/** Une saisie « Jazz, Classique; Blues » → `['Jazz', 'Classique', 'Blues']`,
 *  sans vide ni doublon (casse ignorée, la première écriture gagne). */
export function lireSaisieDeGenres(texte: string): string[] {
  const vus = new Set<string>();
  const sortie: string[] = [];
  for (const brut of texte.split(/[,;]/)) {
    const g = brut.trim();
    if (!g || vus.has(g.toLowerCase())) continue;
    vus.add(g.toLowerCase());
    sortie.push(g);
  }
  return sortie;
}

export function afficherGenres(genres: string[]): string {
  return genres.join(', ');
}

/**
 * Le tag « compilation », côté client : réparer l'existant et dire ce qui a
 * été édité à la main.
 *
 * Serveur : `tune-server-rust` #4244 (chantier « gestion du tag compilation »,
 * phases 2 à 4).
 *
 *   - `GET|POST /library/compilations/reparation` relit les fichiers de chaque
 *     album et remet le drapeau `is_compilation` d'accord avec eux (règles C1
 *     et C2). Elle **ne touche jamais** un album dont le champ a été édité à la
 *     main ;
 *   - ce marqueur vit dans `album_metadata`, clé `edition_manuelle` : un
 *     tableau JSON trié de noms de champs (`["artist","is_compilation"]`).
 *
 * Ce module lit ces deux formes, sans DOM.
 */

/** Le dernier état de la passe de réparation, tel que le serveur le rend. */
export interface ReparationCompilations {
  status: 'idle' | 'running' | 'done';
  total?: number;
  repaired?: number;
  unchanged?: number;
  manual_skipped?: number;
  unreadable?: number;
  errors?: number;
}

/** La clé du marqueur d'édition manuelle dans `album_metadata`. */
export const CLE_EDITION_MANUELLE = 'edition_manuelle';

/**
 * Les champs qu'on a édités à la main, lus dans la réponse de
 * `GET /library/albums/{id}/metadata`. Toute valeur illisible donne `[]` :
 * mieux vaut ne pas afficher la mention qu'afficher une mention fausse.
 */
export function champsEditesALaMain(meta: Record<string, string> | null | undefined): string[] {
  const brut = meta?.[CLE_EDITION_MANUELLE];
  if (!brut) return [];
  try {
    const v = JSON.parse(brut);
    return Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string' && c.trim() !== '') : [];
  } catch {
    return [];
  }
}

/** Nombre d'albums traités, quel qu'en soit le sort, pour la progression. */
export function traites(r: ReparationCompilations): number {
  return (r.repaired ?? 0) + (r.unchanged ?? 0) + (r.manual_skipped ?? 0) + (r.unreadable ?? 0) + (r.errors ?? 0);
}

/** Tant que la passe tourne, on relit son état. */
export function fautSuivreReparation(r: ReparationCompilations | null): boolean {
  return r?.status === 'running';
}

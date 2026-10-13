/**
 * Chantier artistes multiples (tune-server-rust,
 * `docs/chantier-artistes-multiples.md`, « Reste » n°4) — l'affichage.
 *
 * Le serveur découpe un crédit ARTIST sur des séparateurs sûrs (« The Beatles
 * & Genesis » compte pour les deux) et range les artistes dans
 * `track_artists`. Il les rend :
 * - sur la fiche d'une piste (`GET /library/tracks/{id}`), en `artists` ;
 * - sur la page d'un artiste (`GET /library/artists/{id}/tracks`), en
 *   marquant `relie: true` les pistes où il n'est pas l'artiste principal.
 */
import type { ArtisteRelie, Track } from './types';

/** Les artistes d'une piste à montrer un par un : ceux du crédit découpé,
 *  dans l'ordre. Vide quand la piste n'en a qu'un — l'écran garde alors son
 *  affichage d'avant (le nom de `artist_name`). */
export function artistesDuCredit(t: Pick<Track, 'artists'> | null | undefined): ArtisteRelie[] {
  const a = (t?.artists ?? []).filter(
    (x): x is ArtisteRelie => !!x && typeof x.id === 'number' && typeof x.name === 'string' && x.name.trim() !== '',
  );
  return a.length > 1 ? a : [];
}

/** Les pistes de la page d'un artiste où il est RELIÉ, pas principal : la
 *  section « Apparaît aussi sur ». */
export function pistesReliees(pistes: Track[] | null | undefined): Track[] {
  return (pistes ?? []).filter((p) => p?.relie === true);
}

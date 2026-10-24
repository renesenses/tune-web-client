/**
 * tune-server-rust#6463 — « Détacher l'identité » sur la fiche artiste.
 *
 * « Ange » (fil 2394) portait l'identifiant MusicBrainz d'une chanteuse
 * homonyme, et son portrait avec. Le geste retire l'identifiant ; le serveur
 * le marque `manuel` et plus aucune passe ne le réattache.
 */
import type { Artist } from './types';

/** Le geste a un sens : un artiste de la bibliothèque, porteur d'un MBID. */
export function peutDetacherIdentite(a: Pick<Artist, 'id' | 'musicbrainz_id'> | null | undefined): boolean {
  return a?.id != null && !!a.musicbrainz_id?.trim();
}

/** L'identité a été détachée par l'utilisateur : `manuel`, sans MBID. */
export function identiteDetachee(a: Pick<Artist, 'musicbrainz_id' | 'musicbrainz_id_source'> | null | undefined): boolean {
  return a?.musicbrainz_id_source === 'manuel' && !a.musicbrainz_id?.trim();
}

/**
 * L'artiste de la fiche après le geste : la réponse du serveur (relue en
 * base) prime, l'identifiant et ce qu'il a rapporté sont partis.
 */
export function apresDetachement(avant: Artist, reponse: Partial<Artist> | null | undefined): Artist {
  return {
    ...avant,
    ...(reponse ?? {}),
    musicbrainz_id: null,
    musicbrainz_id_source: 'manuel',
  };
}

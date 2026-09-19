/**
 * Métadonnées d'un artiste — lecture et enrichissement, portés de l'ancienne
 * Bibliothèque (`LibraryView`), seule à les montrer.
 *
 * Le serveur rend tantôt `{data: {...}, enrichment_status}`, tantôt l'objet à
 * plat, et la bio sous trois noms (`bio_fr`, `bio`, `bio_summary`). La
 * normalisation vit ici, pour qu'un test l'APPELLE au lieu de relire un écran.
 */
import type { ArtistMetadata } from './types';

export function normaliserMetadonnees(reponse: unknown): ArtistMetadata {
  const r = (reponse ?? {}) as any;
  const brut: any = { ...(r.data ?? r) };
  if (brut.bio_fr) brut.bio = brut.bio_fr;
  if (!brut.bio && brut.bio_summary) brut.bio = brut.bio_summary;
  if (!brut.enrichment_status && r.enrichment_status) brut.enrichment_status = r.enrichment_status;
  if (brut.tags && !brut.genres) brut.genres = brut.tags;
  return brut as ArtistMetadata;
}

/** La bio à montrer : celle de la langue quand elle existe. */
export function bioDans(m: ArtistMetadata | null | undefined, langue: string): string | null {
  if (!m) return null;
  if (langue === 'en' && m.bio_en) return m.bio_en;
  return m.bio || m.bio_en || null;
}

/** Ce qu'un enrichissement a rapporté — pour le DIRE, y compris « rien ». */
export function bilanEnrichissement(m: ArtistMetadata): 'library.bioEnriched' | 'library.similarAndTagsFound' | 'library.noInfoFound' {
  if (m.bio) return 'library.bioEnriched';
  if ((m.similar_artists?.length ?? 0) > 0 || ((m as any).genres?.length ?? 0) > 0) return 'library.similarAndTagsFound';
  return 'library.noInfoFound';
}

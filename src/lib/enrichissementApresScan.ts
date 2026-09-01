export interface EnrichissementApresScan {
  started?: boolean;
  skipped_reason?: string | null;
}

export type CleBanniereEnrichissementApresScan =
  | 'app.scanArtistImagesPremiumSkipped'
  | 'app.scanArtistImagesDisabled';

/**
 * Traduit uniquement les motifs stables publiés par le serveur depuis la
 * v0.9.125. L'absence de contrat (ancien serveur) et les motifs futurs restent
 * silencieux : le client ne doit jamais inventer pourquoi une passe a sauté.
 */
export function cleBanniereEnrichissementApresScan(
  enrichissement: EnrichissementApresScan | null | undefined,
): CleBanniereEnrichissementApresScan | null {
  if (enrichissement?.started !== false) return null;

  if (enrichissement.skipped_reason === 'premium_required') {
    return 'app.scanArtistImagesPremiumSkipped';
  }
  if (enrichissement.skipped_reason === 'disabled_by_setting') {
    return 'app.scanArtistImagesDisabled';
  }
  return null;
}

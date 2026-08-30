/**
 * Ce qui compte comme un NIVEAU dans la vue streaming.
 *
 * La vue tient un instantané continu de sa position (`ContexteStreaming`) : il
 * suit tout, y compris la frappe dans le champ de recherche. L'historique, lui,
 * ne doit retenir que les niveaux — service, artiste, album, playlist, fil de
 * genres. Sans ce filtre, chaque lettre tapée empilerait une entrée et le
 * bouton retour deviendrait inutilisable : il faudrait autant d'appuis que de
 * caractères pour sortir d'une recherche.
 *
 * Isolé ici, hors du composant, parce que c'est la seule partie où quelque
 * chose se DÉCIDE — et que ça se prouve sans monter la vue.
 */

/**
 * Ce qui identifie une fiche.
 *
 * 🔴 Mesuré dans Chrome : un album de streaming n'a **pas** d'`id` — la
 * recherche Qobuz rend `artist_id, artist_name, cover_path, quality,
 * source_id, title, track_count, year`. Ne lire que `id` rendait donc `null`
 * pour tout album de service : ouvrir un album depuis une discographie ne
 * changeait pas de niveau, et son entrée d'historique n'était jamais écrite.
 * Le défaut ne se voyait qu'en ouvrant un vrai album Qobuz.
 */
/** Une fiche porte bien d'autres champs (titre, pochette, qualité...) : seule
 *  son identité nous intéresse ici. */
export type FicheIdentifiable = {
  id?: string | number | null;
  source_id?: string | null;
};

function identite(fiche?: FicheIdentifiable | null): string | null {
  if (!fiche) return null;
  const brut = fiche.id ?? fiche.source_id ?? null;
  return brut === null ? null : String(brut);
}

/** La part de l'instantané qui définit un niveau. */
export interface PositionStreaming {
  service: string | null;
  searchQuery?: string;
  tab?: string;
  selectedAlbum?: FicheIdentifiable | null;
  selectedArtist?: FicheIdentifiable | null;
  selectedStreamingPlaylist?: FicheIdentifiable | null;
  genreBreadcrumb?: Array<{ id: string | null }> | null;
}

/**
 * Deux positions ont la même clé quand elles sont le même niveau. La frappe
 * dans la recherche et le changement d'onglet n'en font pas partie.
 */
export function cleDeNiveau(ctx: PositionStreaming): string {
  return JSON.stringify([
    ctx.service ?? null,
    identite(ctx.selectedAlbum),
    identite(ctx.selectedArtist),
    identite(ctx.selectedStreamingPlaylist),
    ctx.genreBreadcrumb?.map(g => g.id) ?? null,
  ]);
}

/**
 * La racine du service : rien d'ouvert. Y arriver n'est pas une descente — le
 * montage de la vue ne doit écrire aucune entrée.
 */
export function auNiveauZero(ctx: PositionStreaming): boolean {
  return (
    ctx.selectedAlbum == null &&
    ctx.selectedArtist == null &&
    ctx.selectedStreamingPlaylist == null &&
    (ctx.genreBreadcrumb?.length ?? 0) === 0
  );
}

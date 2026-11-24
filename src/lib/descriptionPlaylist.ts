/**
 * La DESCRIPTION d'une playlist, telle que sa fiche l'affiche — fil 3009,
 * point 8 (FabienM, rc13). `null` quand il n'y en a pas : une chaîne vide ou
 * faite d'espaces ne fait pas de ligne, et rien n'est inventé.
 */
export function descriptionDePlaylist(pl: { description?: unknown } | null | undefined): string | null {
  const d = pl?.description;
  return typeof d === 'string' && d.trim() ? d.trim() : null;
}

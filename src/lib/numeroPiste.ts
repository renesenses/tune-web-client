/**
 * Le numéro de piste tel qu'une liste l'affiche.
 *
 * Une piste sans balise TRACKNUMBER arrive avec `track_number` absent, nul…
 * ou à 0 : c'est le cas des pistes indexées depuis un serveur UPnP qui ne
 * sert pas `upnp:originalTrackNumber`. La colonne « # » d'Oxygen affichait
 * alors « 0 » sur chaque ligne de l'album (recette de Bertrand sur le .18,
 * 14/11/2026, « MIRRORS OF TIME - Tribute Reflections »). Aucun disque n'a
 * de piste 0 : un numéro absent, nul ou négatif s'affiche comme une case vide.
 */

/** Le numéro, s'il en est un vrai (entier ≥ 1) ; sinon `null`. */
export function numeroPisteValide(n: number | string | null | undefined): number | null {
  if (n == null || n === '') return null;
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) && v >= 1 ? v : null;
}

/** Le texte de la case « # » : vide quand la piste n'a pas de vrai numéro. */
export function numeroPisteAffiche(n: number | string | null | undefined): string {
  const v = numeroPisteValide(n);
  return v == null ? '' : String(v);
}

/**
 * Ordre des pistes d'un disque : les numérotées d'abord, par numéro croissant,
 * puis celles sans numéro. À égalité, 0 : un tri stable garde l'ordre servi.
 */
export function comparerNumeroPiste(
  a: number | string | null | undefined,
  b: number | string | null | undefined,
): number {
  const va = numeroPisteValide(a);
  const vb = numeroPisteValide(b);
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  return va - vb;
}

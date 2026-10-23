/**
 * Écoutes de la communauté entre parenthèses (#2298) : « So What (128) ».
 *
 * Le serveur (renesenses/tune-server-rust#6738) pose `community_listens` sur
 * une piste, un album ou un artiste quand le site lui a rendu un nombre — à
 * partir de trois comptes distincts. Sous ce seuil, pour un élément inconnu,
 * sans compte relié ou avec l'envoi des écoutes coupé, le champ est ABSENT :
 * rien n'est alors affiché, ni « (0) », ni parenthèses vides.
 */

/** Ce qui porte le champ (piste, album, artiste). */
export interface PorteEcoutes {
  community_listens?: number | null;
}

/** Le nombre à afficher, ou `null` quand il n'y a rien à afficher. */
export function ecoutesDe(objet: PorteEcoutes | null | undefined): number | null {
  const n = objet?.community_listens;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/** « (1 240) », dans la langue de l'interface. */
export function texteEcoutes(n: number, langue: string): string {
  let chiffre: string;
  try {
    chiffre = new Intl.NumberFormat(langue).format(n);
  } catch {
    chiffre = String(n);
  }
  return `(${chiffre})`;
}

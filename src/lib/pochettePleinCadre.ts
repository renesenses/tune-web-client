/**
 * rc14 (retour de Rémi, go de Bertrand du 25/11/2026) — la pochette agrandie
 * de « Lecture en cours » prend la TAILLE MAXIMALE de la fenêtre.
 *
 * La visionneuse posait l'image à sa résolution d'origine, bornée par
 * `max-width: min(90vw, 800px)` et `max-height: 75vh` : une pochette de radio
 * de 300 px restait à 300 px au milieu d'un écran noir. Désormais l'image est
 * DIMENSIONNÉE (et non seulement bornée) : la plus grande boîte qui tient dans
 * la fenêtre, moins la marge de la croix et la légende, au RATIO de l'image —
 * agrandie s'il le faut. La même visionneuse sert la radio, l'album et la
 * piste : une seule règle pour toutes les pochettes.
 *
 * Le ratio est lu sur l'image chargée (`naturalWidth / naturalHeight`) et
 * passé à la feuille de style par `--ratio-pochette` ; avant le chargement,
 * une pochette est supposée carrée.
 */

/** Le ratio largeur / hauteur d'une image, `1` (carré) s'il est illisible. */
export function ratioPochette(largeur: number | null | undefined, hauteur: number | null | undefined): number {
  if (!Number.isFinite(largeur) || !Number.isFinite(hauteur)) return 1;
  if ((largeur as number) <= 0 || (hauteur as number) <= 0) return 1;
  return (largeur as number) / (hauteur as number);
}

/** La marge horizontale totale laissée autour de l'image (px). */
export const MARGE_LARGEUR_PX = 32;
/** La hauteur réservée à la croix (en haut) et à la légende (en bas), en px. */
export const RESERVE_HAUTEUR_PX = 170;

/**
 * La taille affichée (px) dans une fenêtre donnée — la règle que la feuille
 * de style applique (`.lightbox-img`), écrite ici pour être éprouvée.
 */
export function taillePleinCadre(ratio: number, fenetreL: number, fenetreH: number): { largeur: number; hauteur: number } {
  const r = ratio > 0 && Number.isFinite(ratio) ? ratio : 1;
  const dispoL = Math.max(0, fenetreL - MARGE_LARGEUR_PX);
  const dispoH = Math.max(0, fenetreH - RESERVE_HAUTEUR_PX);
  const largeur = Math.min(dispoL, dispoH * r);
  return { largeur, hauteur: largeur / r };
}

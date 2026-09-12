/**
 * La réserve que les écrans laissent à la grappe du coin haut-droit.
 *
 * `.av-tr` — recherche globale, signet, avatar, et selon le contexte le bouton
 * de tiroir ou celui du mode TV — est en position ABSOLUE : elle flotte
 * au-dessus des écrans, qui doivent lui garder la place eux-mêmes.
 *
 * Ce fichier existe parce que ce calcul a été faux deux fois, écrit à la main
 * dans vingt-quatre en-têtes puis dans une feuille de style :
 *
 *   - `96px` décrivait la grappe AVANT que la recherche globale ne la rejoigne
 *     (#3629). « Le bouton Modifier est trop proche de l'icône rechercher »,
 *     08/09/2026 ;
 *   - `172px` décrivait la loupe REPLIÉE (36 px). Dépliée elle en fait 320, et
 *     « Ajouter un widget » repassait dessous, 09/09/2026.
 *
 * Un nombre écrit à la main décrit un ÉTAT ; la grappe en a plusieurs. La
 * coquille MESURE donc sa largeur et applique cette fonction.
 */

/** L'écart entre le bord droit de la fenêtre et la grappe (`.av-tr { right }`). */
export const MARGE_DROITE = 30;

/** L'air entre la grappe et le contenu de l'en-tête, pour qu'ils ne se touchent pas. */
export const AIR = 14;

/**
 * La réserve, à partir de la largeur mesurée de la grappe.
 *
 * Arrondie au pixel SUPÉRIEUR : une largeur fractionnaire arrondie vers le bas
 * laisse le dernier pixel du bouton sous la loupe, ce qui est exactement le
 * défaut qu'on corrige.
 *
 * Un plancher au repli connu : si la mesure arrive avant que les polices ne
 * soient chargées, la grappe peut être annoncée plus étroite qu'elle ne le
 * sera, et l'en-tête se retrouverait dessous le temps d'une image.
 *
 * ⚠️ CE PLANCHER SUIT LA GRAPPE. Il valait 172 quand elle portait loupe,
 * signet et avatar (36 + 10 + 32 + 10 + 40 = 128, plus la marge et l'air). Le
 * chevron du menu du compte l'a rejointe le 12/09/2026 — la bulle ouvre
 * désormais l'explorateur de photo, le menu a donc sa propre porte (#893) —
 * soit 6 + 24 de plus : 158 + 30 + 14 = 202. Laisser 172 aurait reproduit,
 * en plus discret, les deux défauts racontés plus haut : un nombre qui décrit
 * une grappe qui n'existe plus.
 */
export const RESERVE_MINIMALE = 202;

export function reserveDeLaGrappe(largeurMesuree: number): number {
  if (!Number.isFinite(largeurMesuree) || largeurMesuree <= 0) return RESERVE_MINIMALE;
  return Math.max(RESERVE_MINIMALE, Math.ceil(largeurMesuree) + MARGE_DROITE + AIR);
}

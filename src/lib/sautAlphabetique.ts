/**
 * LE SAUT DU RAIL A–Z, SUR UNE GRILLE QUI N'EST PAS ENCORE MESURÉE.
 *
 * #1487 — FabienM, fil « v0.9.162 : divers bugs », 23/09/2026, Windows :
 *
 * > « Menu bibliothèque : signet des lettres fonctionne mal la première fois.
 * >   J'ouvre le menu Bibliothèque, je clique sur la lettre N et j'accède aux
 * >   albums commençant par P. En revanche, si je clique une 2ᵉ fois sur N, ça
 * >   me renvoie bien aux albums commençant par N. »
 *
 * ## La cause, et pourquoi elle ne frappe QUE la première fois
 *
 * La grille des albums porte `content-visibility:auto` avec
 * `contain-intrinsic-size:auto 210px` (`LibraryV2.svelte`, règle `.card`) : une
 * vignette hors du cadre ne coûte ni style, ni disposition, ni peinture, et le
 * navigateur la compte pour 210 px tant qu'il ne l'a jamais rendue. Le mot-clé
 * `auto` lui fait retenir la taille RÉELLE — mais seulement après un premier
 * rendu, et donc seulement pour ce qui est déjà passé sous les yeux.
 *
 * Écran frais, six mille albums : tout ce qui est sous le cadre vaut 210 px
 * d'estimation, alors qu'une vignette en mesure ~193 sur une fenêtre étroite
 * (colonne de 148 px + les deux lignes de texte). Le saut, lui, était un
 * `scrollIntoView({ behavior: 'smooth' })` : le navigateur calcule sa cible AU
 * DÉPART, en position de défilement, puis anime. Or l'animation TRAVERSE toutes
 * les rangées intermédiaires : chacune est rendue au passage et rétrécit de
 * 210 à 193. À l'arrivée, le chiffre visé ne désigne plus la même rangée — il
 * pointe environ 9 % plus loin dans la liste. De « N », on atterrit sur « P ».
 *
 * Au second clic, tout ce qui précède a déjà été rendu une fois et garde sa
 * taille réelle : plus rien ne rétrécit pendant le trajet, et le saut tombe
 * juste. C'est mot pour mot le « faux la première fois, juste la seconde ».
 *
 * ## Le remède : viser, puis VÉRIFIER
 *
 * Aucune mesure prise avant le déplacement ne peut être tenue pour acquise :
 * le déplacement lui-même change la mise en page. On ne calcule donc plus une
 * position une bonne fois — on rapproche l'ancre du haut du cadre, on laisse le
 * navigateur remettre en page, et on RELIT l'écart. Deux à trois passes
 * suffisent en pratique ; la boucle s'arrête d'elle-même dès que l'écart est
 * tenu, ou dès que le conteneur refuse d'aller plus loin (fin de liste).
 *
 * Le déplacement est INSTANTANÉ, et c'est volontaire : c'est l'animation qui
 * faisait rendre les six mille vignettes traversées — celles-là même dont le
 * rétrécissement décalait la cible. Un rail alphabétique se comporte comme un
 * signet, pas comme un défilement.
 */

/** En deçà, l'écart n'est plus qu'un arrondi de pixel : on s'arrête. */
export const TOLERANCE_SAUT = 1;

/** Assez de passes pour que la mise en page se stabilise, pas assez pour boucler. */
export const PASSES_SAUT = 6;

/** Par défaut on repasse à la trame suivante : c'est là que la mise en page est refaite. */
const planifierParDefaut = (suite: () => void): void => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(suite);
  else setTimeout(suite, 16);
};

/**
 * Amène au bord du cadre la première ancre qui réponde à `selecteur`.
 *
 * @param defilant  le conteneur QUI DÉFILE — c'est aussi la racine de la
 *                  recherche : les ancres vivent dedans.
 * @param selecteur le sélecteur de l'ancre, p. ex. `[data-letter="N"]`.
 * @param planifier injectable pour les témoins : jsdom n'a pas de trame.
 * @param passes    le nombre maximum de corrections.
 */
export function sauterVersAncre(
  defilant: HTMLElement | null | undefined,
  selecteur: string,
  planifier: (suite: () => void) => void = planifierParDefaut,
  passes: number = PASSES_SAUT,
): void {
  if (!defilant) return;

  const viser = (restantes: number): void => {
    const ancre = defilant.querySelector<HTMLElement>(selecteur);
    if (!ancre) return;

    // On relit la géométrie À CHAQUE passe : c'est tout l'objet du correctif.
    const cadre = defilant.getBoundingClientRect();
    const cible = ancre.getBoundingClientRect();
    const dy = cible.top - cadre.top;
    const dx = cible.left - cadre.left;
    if (Math.abs(dy) <= TOLERANCE_SAUT && Math.abs(dx) <= TOLERANCE_SAUT) return;

    const avantY = defilant.scrollTop;
    const avantX = defilant.scrollLeft;
    defilant.scrollTop = avantY + dy;
    // #929 : en carrousel, la lettre se rejoint en LARGEUR. Sur une grille qui
    // ne déborde pas horizontalement, le navigateur ramène la valeur à zéro —
    // l'affectation ne coûte rien et ne déplace rien.
    defilant.scrollLeft = avantX + dx;

    // Rien n'a bougé : on est en butée (haut ou bas de liste). Insister
    // relancerait la boucle pour rien.
    const abouti = defilant.scrollTop !== avantY || defilant.scrollLeft !== avantX;
    if (abouti && restantes > 1) planifier(() => viser(restantes - 1));
  };

  viser(passes);
}

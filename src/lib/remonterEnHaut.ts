/**
 * « Remonter en haut » — web#2798, Michel (fil 2748, 11/11/2026).
 *
 * Michel souffre de tremblements : remonter une longue liste en tirant
 * l'ascenseur lui est pénible. Un gros bouton apparaît dès qu'on a défilé
 * dans une LONGUE liste (bibliothèque, albums, titres, artistes, recherche,
 * Oxygen…) et la ramène en haut d'un clic.
 *
 * Plutôt que de câbler chaque vue (et d'en oublier), la coquille écoute les
 * défilements en phase de CAPTURE sur le document — `scroll` ne remonte pas,
 * mais la capture le voit passer pour tout élément. Ce module ne garde que la
 * décision, pure et testable.
 */

/** Défilement (px) à partir duquel le bouton apparaît. */
export const SEUIL_AFFICHAGE_PX = 400;
/** Hauteur visible minimale d'une « liste » : écarte menus et petites boîtes. */
export const HAUTEUR_MIN_PX = 240;
/** Taille du bouton (px) : cible généreuse pour une main qui tremble. */
export const TAILLE_BOUTON_PX = 60;
/** Écart au bord du conteneur ; laisse la place d'un ascenseur large (20 px). */
export const MARGE_PX = 32;

/** Le conteneur vertical que vise un événement `scroll`, ou `null`. */
export function conteneurVise(cible: EventTarget | null): Element | null {
  if (typeof Document !== 'undefined' && cible instanceof Document) {
    return cible.scrollingElement;
  }
  if (typeof Element !== 'undefined' && cible instanceof Element) return cible;
  return null;
}

/** Une longue liste verticale : assez haute, et beaucoup plus longue que sa fenêtre. */
export function estLongueListe(el: Element): boolean {
  return el.clientHeight >= HAUTEUR_MIN_PX
    && el.scrollHeight - el.clientHeight > SEUIL_AFFICHAGE_PX;
}

/** Le bouton se montre pour ce conteneur. */
export function doitAfficher(el: Element): boolean {
  return el.isConnected && estLongueListe(el) && el.scrollTop > SEUIL_AFFICHAGE_PX;
}

/** Position fixe du bouton : en bas à droite DU CONTENEUR, jamais sur la barre de transport. */
export function positionBouton(
  rect: { right: number; bottom: number; top: number; left: number },
  fenetre: { largeur: number; hauteur: number },
): { droite: number; bas: number } {
  const droite = Math.max(8, fenetre.largeur - rect.right + MARGE_PX);
  const bas = Math.max(8, fenetre.hauteur - rect.bottom + 16);
  return { droite, bas };
}

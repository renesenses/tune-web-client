/**
 * Clic droit sur une ligne de piste : ouvre le menu « … » QUI EXISTE déjà sur
 * cette ligne (`PisteActions`), au lieu du menu du navigateur.
 *
 * Itération 12 du thème Néomorphique (28/11/2026) : sur l'écran Morceaux, un
 * clic droit n'ouvrait rien — le défaut vaut pour toutes les interfaces, le
 * raccord est donc fait dans `ListePistesV2`. Aucun menu nouveau : c'est le
 * même bouton, les mêmes entrées, la même position (sous le « … »).
 *
 * Rend `true` quand un menu a été ouvert ; le menu du navigateur n'est alors
 * pas montré. Sans « … » sur la ligne (piste qu'on ne sait pas désigner), le
 * navigateur garde son menu : rien n'est confisqué pour rien.
 */
export const SELECTEUR_MENU_LIGNE = 'button.pa[aria-haspopup="menu"]';

export function ouvrirMenuDeLaLigne(e: Pick<MouseEvent, 'currentTarget' | 'target' | 'preventDefault'>): boolean {
  const ligne = e.currentTarget as Element | null;
  if (!ligne || typeof (ligne as Element).querySelector !== 'function') return false;
  // Un clic droit DANS un champ (renommage) garde le menu du navigateur.
  const cible = e.target as Element | null;
  if (cible && typeof cible.closest === 'function' && cible.closest('input, textarea, [contenteditable="true"]')) return false;
  const bouton = ligne.querySelector<HTMLButtonElement>(SELECTEUR_MENU_LIGNE);
  if (!bouton || bouton.disabled) return false;
  e.preventDefault();
  if (bouton.getAttribute('aria-expanded') !== 'true') bouton.click();
  return true;
}

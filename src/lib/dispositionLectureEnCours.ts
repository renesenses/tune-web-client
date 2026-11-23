/**
 * Design v3 de Levente (§10.3) — Lecture en cours en deux colonnes 44/56
 * (pochette / détails) sur grand écran ; décision de Bertrand du 23/11/2026.
 *
 * Le seuil porte sur la largeur INTÉRIEURE de l'écran (`clientWidth` de
 * `.now-playing`), pas sur la fenêtre : la barre latérale et la file en
 * colonne la réduisent. 900 px laisse hors de la bascule toute tablette en
 * portrait (768, 820, 834 px de fenêtre) et tout téléphone : ils gardent la
 * disposition actuelle. Le kiosque garde la sienne (règle CSS dédiée).
 */
export const SEUIL_44_56 = 900;

export function disposition44_56(largeurInterieure: number): boolean {
  return largeurInterieure >= SEUIL_44_56;
}

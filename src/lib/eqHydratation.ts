import type { EqBand } from './api';

/** Une courbe n'est graphique que si l'éditeur peut la réémettre sans perte. */
export function estCourbeGraphique(bandes: EqBand[], grille: number[], q: number): boolean {
  if (bandes.length !== grille.length && bandes.length !== 2 * grille.length) return false;
  return bandes.every((b, i) =>
    b.freq === grille[i % grille.length]
    && b.q === q
    && (b.type === undefined || b.type === 'peak')
    && (bandes.length === grille.length
      ? b.channel === undefined
      : b.channel === (i < grille.length ? 0 : 1)));
}

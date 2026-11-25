/**
 * rc14 (retour de Rémi, go de Bertrand du 25/11/2026) — OÙ vivent les flèches
 * Précédent / Suivant de l'interface (web#3275).
 *
 * Elles étaient en tête de la grappe haut-droite, en 32 px, juste à côté de
 * la loupe : « on ripe ». Elles vont EN HAUT À GAUCHE, comme dans un
 * navigateur, avec une cible de 40 px au moins :
 *
 *   - paliers `large` et `etroit` : en tête de la barre latérale (côte à côte
 *     dans la barre large, empilées dans la barre en icônes) ;
 *   - palier `tiroir` (téléphone) : la barre est hors champ, la coquille pose
 *     la flèche Précédent dans son coin haut-gauche (`.av-tl`) — sauf sur
 *     « Lecture en cours », qui a son propre bouton de retour à cet endroit,
 *     en mode sans distraction et dans la vue mini (qui a sa propre barre).
 */
import type { FormatEcran } from './largeurEcran';

/** La cible minimale d'une flèche, en pixels (côté du bouton). */
export const CIBLE_FLECHE_PX = 40;

/** Les flèches sont-elles dans la barre latérale ? */
export function flechesDansLaBarre(format: FormatEcran): boolean {
  return format !== 'tiroir';
}

/** Les flèches sont-elles dans le coin haut-gauche de la coquille ? */
export function flechesDansLeCoin(format: FormatEcran, o: { vueMini: boolean; focus: boolean; vue: string }): boolean {
  return format === 'tiroir' && !o.vueMini && !o.focus && o.vue !== 'nowplaying';
}

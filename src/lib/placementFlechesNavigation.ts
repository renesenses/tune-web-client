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
 *     dans la vue mini (qui a sa propre barre), et quand une FICHE à bouton
 *     « Retour » est ouverte (album, label : leur `.close` collant est à cet
 *     endroit, la flèche le recouvrait — relecture de web#3424) ;
 *   - mode SANS DISTRACTION (barre latérale masquée) : les flèches restent
 *     visibles, dans la grappe haut-droite comme avant (`flechesDansLaGrappe`)
 *     — l'écran plein n'a pas d'autre coin libre, et Oxygène tient le haut
 *     gauche avec sa propre barre.
 */
import { writable, type Readable } from 'svelte/store';
import type { FormatEcran } from './largeurEcran';

/**
 * Le nombre de fiches à bouton « Retour » montées (fiche d'album, fiche de
 * label). Chacune le signale à son montage (`signalerFicheAvecRetour`) et
 * le rend à son démontage : elles s'ouvrent en calque depuis une douzaine
 * d'écrans, la vue courante ne suffit pas à le savoir.
 */
const fiches = writable(0);
export const fichesAvecRetour: Readable<number> = { subscribe: fiches.subscribe };

/** À appeler au montage d'une fiche à bouton Retour ; rend le démontage. */
export function signalerFicheAvecRetour(): () => void {
  fiches.update((n) => n + 1);
  let rendu = false;
  return () => {
    if (rendu) return;
    rendu = true;
    fiches.update((n) => Math.max(0, n - 1));
  };
}

/** La cible minimale d'une flèche, en pixels (côté du bouton). */
export const CIBLE_FLECHE_PX = 40;

/** Les flèches sont-elles dans la barre latérale ? */
export function flechesDansLaBarre(format: FormatEcran): boolean {
  return format !== 'tiroir';
}

/** Les flèches sont-elles dans le coin haut-gauche de la coquille ? */
export function flechesDansLeCoin(
  format: FormatEcran,
  o: { vueMini: boolean; focus: boolean; vue: string; ficheAvecRetour?: boolean },
): boolean {
  return format === 'tiroir' && !o.vueMini && !o.focus && o.vue !== 'nowplaying' && !o.ficheAvecRetour;
}

/** Mode sans distraction : les flèches restent dans la grappe haut-droite. */
export function flechesDansLaGrappe(o: { vueMini: boolean; focus: boolean }): boolean {
  return o.focus && !o.vueMini;
}

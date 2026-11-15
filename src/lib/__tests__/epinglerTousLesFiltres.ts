/**
 * Maquette de Levente (Figma 616:5818, 15/11/2026) — la rangée de filtres de
 * la Bibliothèque ne montre par défaut que « Source » et « Qualité ». Les bancs
 * écrits avant cliquent les autres puces : ils les épinglent toutes, comme le
 * ferait l'utilisateur par le bouton « Filtres ».
 */
import { ecrireFiltresEpingles, FILTRES_EPINGLABLES } from '../filtresEpinglesBibliotheque';

export function epinglerTousLesFiltres(): void {
  ecrireFiltresEpingles(FILTRES_EPINGLABLES);
}

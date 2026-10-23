/**
 * web#2299 — REVENIR AUX SIMILAIRES DE L'ARTISTE DE DÉPART.
 *
 * Fil forum 2341 (Scordia, rc7) : « quand on tombe sur un artiste absent de
 * la bibliothèque […] après éventuelle écoute de cet artiste, pourrait-on
 * remonter à la liste des similaires initiale ? »
 *
 * Suivre un similaire REMPLACE la fiche (voisin de la bibliothèque) ou mène
 * à la Recherche (voisin absent). Le Retour de la fiche suit `vueDeRetour`,
 * qui ne porte qu'une vue : rien ne se souvenait de l'artiste dont on lisait
 * les similaires. Ce dépôt-ci s'en souvient.
 *
 *  - Posé par le PREMIER clic sur un similaire : en enchaînant les voisins, on
 *    garde l'artiste de DÉPART, celui de la liste « initiale ».
 *  - Consommé par `revenirAuxSimilaires`, qui rouvre sa fiche et demande à la
 *    page de descendre jusqu'aux similaires.
 *  - Effacé par un clic dans la barre latérale (`requestListReset`) : on a
 *    quitté le parcours.
 */
import { get, writable } from 'svelte/store';
import { activeView, listResetNonce, vueDeRetour, type View } from './stores/navigation';
import { ficheAlbumDeRetour, ficheArtisteService } from './stores/streaming';

export interface DepartSimilaires {
  /** Identifiant de BIBLIOTHÈQUE de l'artiste de départ. */
  id: string;
  nom: string;
  /** Où le Retour de sa fiche menait quand on l'a quittée. */
  depuis: View | null;
  provenance?: string | null;
}

export const departSimilaires = writable<DepartSimilaires | null>(null);

/** Une fois rouverte, la fiche de départ descend jusqu'à ses similaires. */
export const defilerVersSimilaires = writable(false);

listResetNonce.subscribe(() => departSimilaires.set(null));

/** Retient l'artiste de départ, sauf si un parcours est déjà en cours. */
export function retenirDepartSimilaires(depart: DepartSimilaires): void {
  if (get(departSimilaires)) return;
  departSimilaires.set({ ...depart });
}

/** Le bouton « Retour aux similaires de X » a-t-il lieu d'être ici ? */
export function retourAuxSimilairesVisible(
  depart: DepartSimilaires | null,
  ficheAffichee: { service: string | null; id: string } | null,
): boolean {
  if (!depart) return false;
  // Sur la fiche de départ elle-même, les similaires sont sous les yeux.
  return !(ficheAffichee && ficheAffichee.service == null && ficheAffichee.id === depart.id);
}

/** Rouvre la fiche de départ, prête à montrer ses similaires. */
export function revenirAuxSimilaires(): boolean {
  const d = get(departSimilaires);
  if (!d) return false;
  departSimilaires.set(null);
  ficheAlbumDeRetour.set(null);
  vueDeRetour.set(d.depuis);
  ficheArtisteService.set({
    service: null,
    id: d.id,
    nom: d.nom,
    ...(d.provenance != null ? { provenance: d.provenance } : {}),
  });
  defilerVersSimilaires.set(true);
  activeView.set('streamingartist');
  return true;
}

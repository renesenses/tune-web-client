/**
 * Le filtre « Répertoire » de la Bibliothèque — tune-server-rust#7597 (suite,
 * demande de Bertrand du 31/10/2026).
 *
 * La Bibliothèque savait déjà se limiter à un dossier et à ses sous-dossiers
 * (`libraryFolderScope`, pastille de répertoire, #882 / #3101), mais seul
 * Répertoires › « Voir en bibliothèque » posait ce filtre. Le bouton
 * « Répertoire » de la barre de filtres le pose désormais lui-même, avec le
 * MÊME magasin : rien de ce qui lit la portée ne change.
 *
 * Le dernier dossier choisi ainsi est retenu par profil (`ui_preferences`,
 * champ `bibliothequeDossier`) et restauré au retour dans la Bibliothèque.
 * Une portée DÉJÀ posée au montage — l'arrivée depuis Répertoires — prime : on
 * ne l'écrase jamais.
 */
import { get } from 'svelte/store';
import { libraryFolderScope } from './stores/library';
import { preferences } from './stores/preferences';

/** Le bouton « Répertoire » : pose la portée et la retient pour ce profil. */
export function choisirDossierBibliotheque(dossier: string): void {
  if (!dossier) return;
  libraryFolderScope.set(dossier);
  preferences.update((p) => ({ ...p, bibliothequeDossier: dossier }));
}

/** Oublier le dossier retenu, sans toucher à la portée affichée. */
export function oublierDossierBibliotheque(): void {
  if (get(preferences).bibliothequeDossier != null) {
    preferences.update((p) => ({ ...p, bibliothequeDossier: null }));
  }
}

/**
 * Pendant que la Bibliothèque est montée : quand la portée RETENUE est retirée
 * (la croix de la pastille, qui ne fait que `libraryFolderScope.set(null)`),
 * elle est aussi oubliée — un filtre retiré ne doit pas revenir au prochain
 * passage. Rend la fonction de désabonnement, pour un `$effect`.
 */
export function suivreLeRetraitDeLaPortee(): () => void {
  let avant = get(libraryFolderScope);
  return libraryFolderScope.subscribe((d) => {
    if (avant && !d && get(preferences).bibliothequeDossier === avant) oublierDossierBibliotheque();
    avant = d;
  });
}

/** La portée à appliquer au montage : celle qui est déjà posée (arrivée depuis
 *  Répertoires), sinon le dernier dossier retenu, sinon aucune. */
export function porteeAuMontage(posee: string | null, retenue: string | null | undefined): string | null {
  if (posee) return posee;
  return typeof retenue === 'string' && retenue ? retenue : null;
}

/** Au montage de la Bibliothèque. */
export function restaurerDossierBibliotheque(): void {
  const posee = get(libraryFolderScope);
  const voulue = porteeAuMontage(posee, get(preferences).bibliothequeDossier);
  if (voulue !== posee) libraryFolderScope.set(voulue);
}

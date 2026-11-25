/**
 * Contrat entre la coquille (lot 1) et l'écran TESS (lot 2), rc14.
 * Contenu figé par la spécification du 25/11 : ne pas modifier dans un lot.
 */
import { writable } from 'svelte/store';
import { activeView, type View } from './navigation';

/** Le greffon (ou l'étage fixe) à sélectionner à l'ouverture de TESS ; consommé par l'écran. */
export const greffonTessDemande = writable<string | null>(null);

/** Ouvre l'écran TESS entier, avec `id` sélectionné à droite s'il est dans la chaîne. */
export function ouvrirTess(id: string | null = null): void {
  greffonTessDemande.set(id);
  activeView.set('tess' as View);
}

/** La vue montée dans la popup de configuration (à droite du menu), ou `null`. */
export const popupConfiguration = writable<{ vue: string; zoneId: number | null } | null>(null);

export function ouvrirPopupConfiguration(vue: string, zoneId: number | null = null): void {
  popupConfiguration.set({ vue, zoneId });
}

export function fermerPopupConfiguration(): void {
  popupConfiguration.set(null);
}

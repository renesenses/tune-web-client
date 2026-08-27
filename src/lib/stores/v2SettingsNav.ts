/**
 * Cible de navigation dans les Réglages v2.
 *
 * Permet à la recherche du menu avatar d'ouvrir l'écran Réglages DIRECTEMENT
 * sur le bon onglet et la bonne section, plutôt que de déposer l'utilisateur
 * en haut d'un écran où il devra re-chercher à l'œil ce qu'il vient de taper.
 *
 * Consommé une seule fois par SettingsV2 (remis à null après application) :
 * sans cela, revenir sur les Réglages plus tard rejouerait l'ancienne cible.
 */
import { writable } from 'svelte/store';
import type { V2SettingsTabId } from '../v2Settings';

export interface V2SettingsTarget {
  tab: V2SettingsTabId;
  /** Section à mettre en avant, si la navigation vient d'une recherche. */
  section?: string;
}

export const v2SettingsTarget = writable<V2SettingsTarget | null>(null);

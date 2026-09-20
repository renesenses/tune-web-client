import { writable } from 'svelte/store';
import type { TacheDeFond } from '../tachesDeFond';

/**
 * Tâches de fond du serveur (pochettes, images d'artistes, biographies…), telles
 * que `system.background_tasks` les publie. Porté d'`App.svelte`, que la
 * coquille v2 ne monte pas : un enrichissement de plusieurs minutes y était
 * invisible (#2227). Écrit par `v2Live`, lu par la barre latérale.
 */
export const tachesDeFond = writable<TacheDeFond[]>([]);

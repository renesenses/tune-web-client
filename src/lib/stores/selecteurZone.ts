/**
 * Le sélecteur de zone de la barre de lecture, ouvrable de PARTOUT.
 *
 * 🔴 Essai en 5G du 09/10/2026 (iPhone, par le pont) : aucun moyen de choisir
 * la zone sur un téléphone. Le sélecteur vivait dans `.transport-right`, que
 * la barre masque sous 768 px, et la puce de zone des cartes de l'accueil ne
 * faisait que commuter vers SA zone — qui était déjà la zone pilotée. On ne
 * pouvait donc pas passer sur « Cet ordinateur » pour faire jouer le
 * téléphone lui-même.
 *
 * Un état partagé plutôt qu'un état local : la puce d'une carte de l'accueil
 * ouvre le même sélecteur que la pastille de la barre.
 */
import { writable } from 'svelte/store';

export const selecteurZoneOuvert = writable(false);

export function ouvrirSelecteurZone(): void {
  selecteurZoneOuvert.set(true);
}

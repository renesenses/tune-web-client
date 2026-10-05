/**
 * Supprimer une zone — le geste confirmé, en UN seul endroit.
 *
 * FabienM, fil 2013, point 9 (0.9.167) : « si je supprime une zone, elle reste
 * toujours visible dans la liste des zones ». Le serveur a été corrigé
 * (#5322, v1.0.0-rc1 : une zone en lecture ou en pause est arrêtée, puis
 * masquée). Restait un chemin où le DELETE ne partait JAMAIS : la fenêtre de
 * réglages ouverte depuis la barre de lecture (clic droit sur la zone,
 * `ZoneConfigModal`) recevait `onDelete={() => { configZone = null; }}`. Le
 * bouton « Supprimer cette zone », puis la confirmation, ne faisaient que
 * refermer la fenêtre : aucune requête, aucune ligne au journal, et la zone
 * toujours là au rechargement.
 *
 * Les deux écrans qui suppriment une zone passent désormais par cette
 * fonction : la page Zones et la barre de lecture ne peuvent plus diverger.
 * Une erreur du serveur est relancée à l'appelant, qui l'affiche.
 */
import { get } from 'svelte/store';
import * as api from './api';
import { currentZoneId, zones } from './stores/zones';

export async function supprimerZoneConfirmee(id: number): Promise<void> {
  await api.deleteZone(id);
  // Sans attendre l'événement `zone.deleted` : la ligne disparaît tout de
  // suite de tous les écrans qui lisent le magasin.
  zones.update((liste) => liste.filter((z) => z.id !== id));
  // La zone active vient d'être supprimée : on ne laisse pas l'interface
  // pointer sur un identifiant mort.
  if (get(currentZoneId) === id) currentZoneId.set(null);
}

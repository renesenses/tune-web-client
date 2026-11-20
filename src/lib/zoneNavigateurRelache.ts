/**
 * web#3180 — « Ne plus jouer ici » (menu de la zone, écran Zones).
 *
 * FabienM, fil 2864 (rc12) : le Firefox du PC jouait la zone navigateur de
 * son téléphone, qu'il avait retenue un jour, et rien ne permettait de la
 * relâcher. Ce geste la relâche pour cet onglet et coupe sa lecture locale si
 * c'est elle que l'élément joue. Le flux reste au serveur : l'appareil à qui
 * la zone appartient le reprend.
 *
 * Module à part : `zoneNavigateurRevendication` est lu par `stores/zones`, et
 * un import statique de `stores/browserAudio` y bouclerait (zones →
 * browserAudio → nowPlaying → zones).
 */
import { relacherZoneDeCetAppareil } from './zoneNavigateurProprietaire';
import { browserStopForZone } from './stores/browserAudio';

export function nePlusJouerZoneIci(zone: { id?: number | null; name?: string | null }): void {
  if (typeof zone.id !== 'number') return;
  relacherZoneDeCetAppareil(zone.id, zone.name);
  browserStopForZone(zone.id);
}

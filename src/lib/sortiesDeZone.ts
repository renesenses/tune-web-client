/**
 * Vers quels appareils une zone peut-elle basculer sa sortie ?
 *
 * Règle reprise de l'ancien gestionnaire de zones (`ZoneManagerView`,
 * `getPickerDevices`), seul écran qui offrait de changer la sortie d'une zone.
 * Elle vit ici pour qu'un test l'APPELLE, au lieu de relire un écran.
 *
 *  - une zone réseau ne propose que des appareils de SON type : basculer un
 *    renderer DLNA sur un Chromecast, c'est une autre zone, pas une autre
 *    sortie ;
 *  - une zone locale (ou sans type) propose tous les types ;
 *  - l'appareil déjà branché sur la zone reste proposé ;
 *  - un appareil déjà branché sur une AUTRE zone ne l'est pas : deux zones sur
 *    une même sortie se disputeraient le flux.
 */
import type { DiscoveredDevice, Zone } from './types';

type ZoneMinimale = Pick<Zone, 'id' | 'output_type' | 'output_device_id'>;

export function sortiesProposees(
  zone: ZoneMinimale,
  appareils: readonly DiscoveredDevice[],
  zones: readonly ZoneMinimale[],
): DiscoveredDevice[] {
  return appareils.filter((d) => {
    if (zone.output_type && zone.output_type !== 'local' && d.type !== zone.output_type) return false;
    if (zone.output_device_id === d.id) return true;
    return !zones.some((z) => z.id !== zone.id && z.output_device_id === d.id);
  });
}

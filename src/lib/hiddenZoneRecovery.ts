import type { DiscoveredDevice } from './types';

export function deviceZoneActionKey(device: Pick<DiscoveredDevice, 'zone_hidden'>): string {
  return device.zone_hidden ? 'zone.restoreDeletedZone' : 'zone.createZone';
}

export function deviceZoneSuccessKey(device: Pick<DiscoveredDevice, 'zone_hidden'>): string {
  return device.zone_hidden ? 'zone.zoneRestored' : 'zone.zoneCreated';
}

export function deviceZoneTargetId(
  device: Pick<DiscoveredDevice, 'id' | 'zone_hidden' | 'hidden_zone_device_id'>,
): string {
  return device.zone_hidden && device.hidden_zone_device_id
    ? device.hidden_zone_device_id
    : device.id;
}

export function deviceZoneCandidateIds(
  device: Pick<DiscoveredDevice, 'id' | 'capabilities'>,
): string[] {
  const alternatives = Array.isArray(device.capabilities?.alternatives)
    ? device.capabilities.alternatives
        .map((alternative: unknown) => {
          if (!alternative || typeof alternative !== 'object') return undefined;
          const id = (alternative as { id?: unknown }).id;
          return typeof id === 'string' ? id : undefined;
        })
        .filter((id: string | undefined): id is string => Boolean(id))
    : [];
  return [device.id, ...alternatives];
}

export function deviceHasBoundZone(
  device: Pick<DiscoveredDevice, 'id' | 'capabilities'>,
  boundDeviceIds: ReadonlySet<string>,
): boolean {
  return deviceZoneCandidateIds(device).some((id) => boundDeviceIds.has(id));
}

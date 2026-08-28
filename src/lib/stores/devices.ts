import { writable, derived } from 'svelte/store';
import type { DiscoveredDevice } from '../types';
import { deviceHasBoundZone } from '../hiddenZoneRecovery';
import { zones } from './zones';

export const devices = writable<DiscoveredDevice[]>([]);

/** Devices that don't have a zone already bound to them */
export const unboundDevices = derived(
  [devices, zones],
  ([$devices, $zones]) => {
    const boundDeviceIds = new Set<string>(
      $zones
        .map((z) => z.output_device_id)
        .filter((id): id is string => typeof id === 'string')
    );
    return $devices.filter((d) => d.available && !deviceHasBoundZone(d, boundDeviceIds));
  }
);

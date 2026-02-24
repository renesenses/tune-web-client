import { writable, derived } from 'svelte/store';
import type { DiscoveredDevice } from '../types';
import { zones } from './zones';

export const devices = writable<DiscoveredDevice[]>([]);

/** Devices that don't have a zone already bound to them */
export const unboundDevices = derived(
  [devices, zones],
  ([$devices, $zones]) => {
    const boundDeviceIds = new Set(
      $zones
        .filter((z) => z.output_device_id)
        .map((z) => z.output_device_id)
    );
    return $devices.filter((d) => d.available && !boundDeviceIds.has(d.id));
  }
);

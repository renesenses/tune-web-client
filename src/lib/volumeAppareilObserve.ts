import type { DeviceVolumeObservation, Zone } from './types';

/** Un relevé d'un ancien appareil ne doit pas être affiché sous le nouveau. */
export function volumeAppareilObserve(zone: Partial<Zone> | null | undefined): DeviceVolumeObservation | null {
  const o = zone?.device_volume_observation;
  if (zone?.output_type !== 'devialet_air' || !o || typeof o !== 'object'
    || o.device_id !== zone.output_device_id
    || !Number.isFinite(o.volume) || o.volume < 0 || o.volume > 1
    || !Number.isFinite(o.volume_db) || typeof o.muted !== 'boolean') return null;
  return o;
}

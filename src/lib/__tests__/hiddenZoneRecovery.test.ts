import { describe, expect, it } from 'vitest';
import {
  deviceZoneActionKey,
  deviceHasBoundZone,
  deviceZoneSuccessKey,
  deviceZoneTargetId,
} from '../hiddenZoneRecovery';

describe('restauration explicite des zones masquées', () => {
  it('annonce une restauration et vise exactement l’identité masquée', () => {
    const device = {
      id: 'openhome-primary',
      zone_hidden: true,
      hidden_zone_device_id: 'airplay-hidden-alternative',
    };

    expect(deviceZoneActionKey(device)).toBe('zone.restoreDeletedZone');
    expect(deviceZoneSuccessKey(device)).toBe('zone.zoneRestored');
    expect(deviceZoneTargetId(device)).toBe('airplay-hidden-alternative');
    expect(
      deviceHasBoundZone(
        { ...device, capabilities: { alternatives: [{ id: 'airplay-hidden-alternative' }] } },
        new Set(['airplay-hidden-alternative']),
      ),
    ).toBe(true);
  });

  it('garde la création normale pour un appareil sans zone masquée', () => {
    const device = { id: 'dlna-new', zone_hidden: false };

    expect(deviceZoneActionKey(device)).toBe('zone.createZone');
    expect(deviceZoneSuccessKey(device)).toBe('zone.zoneCreated');
    expect(deviceZoneTargetId(device)).toBe('dlna-new');
  });
});

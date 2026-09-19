import { describe, expect, it } from 'vitest';
import { sortiesProposees } from '../sortiesDeZone';
import type { DiscoveredDevice } from '../types';

const app = (id: string, type: string): DiscoveredDevice =>
  ({ id, name: id, type, host: 'h', port: 1 }) as DiscoveredDevice;

const DLNA_A = app('dlna-a', 'dlna');
const DLNA_B = app('dlna-b', 'dlna');
const CAST = app('cast', 'chromecast');
const TOUS = [DLNA_A, DLNA_B, CAST];

describe('sortiesProposees — vers quoi une zone peut basculer', () => {
  it('une zone réseau ne propose que son propre type', () => {
    const z = { id: 1, output_type: 'dlna', output_device_id: 'dlna-a' } as any;
    expect(sortiesProposees(z, TOUS, [z]).map((d) => d.id)).toEqual(['dlna-a', 'dlna-b']);
  });

  it('une zone locale propose tous les types', () => {
    const z = { id: 1, output_type: 'local', output_device_id: null } as any;
    expect(sortiesProposees(z, TOUS, [z]).map((d) => d.id)).toEqual(['dlna-a', 'dlna-b', 'cast']);
  });

  it('un appareil branché sur une AUTRE zone n’est pas proposé', () => {
    const z1 = { id: 1, output_type: 'dlna', output_device_id: 'dlna-a' } as any;
    const z2 = { id: 2, output_type: 'dlna', output_device_id: 'dlna-b' } as any;
    expect(sortiesProposees(z1, TOUS, [z1, z2]).map((d) => d.id)).toEqual(['dlna-a']);
  });

  it('l’appareil déjà branché sur la zone reste proposé', () => {
    const z1 = { id: 1, output_type: 'dlna', output_device_id: 'dlna-a' } as any;
    expect(sortiesProposees(z1, TOUS, [z1]).map((d) => d.id)).toContain('dlna-a');
  });
});

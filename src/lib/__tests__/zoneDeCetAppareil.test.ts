// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { zoneDeCetAppareil } from '../zoneDeCetAppareil';
import { retenirZoneDeCetAppareil, zonesRetenues } from '../zoneNavigateurProprietaire';

const Z = [
  { id: 15, name: 'Cet ordinateur', output_type: 'browser' },
  { id: 10, name: 'Eversolo', output_type: 'dlna', output_device_id: 'uuid:x' },
];

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('zone navigateur de cet appareil', () => {
  it('crée et retient quand rien ne la désigne', async () => {
    const creer = vi.fn(async () => ({ id: 42 }));
    expect(await zoneDeCetAppareil(Z, 'Ce téléphone', creer)).toBe(42);
    expect(creer).toHaveBeenCalledWith('Ce téléphone');
    expect(zonesRetenues()).toEqual([42]);
  });

  it('reprend la zone retenue sans créer', async () => {
    retenirZoneDeCetAppareil(15);
    const creer = vi.fn();
    expect(await zoneDeCetAppareil(Z, 'Ce téléphone', creer)).toBe(15);
    expect(creer).not.toHaveBeenCalled();
  });

  it("une zone retenue disparue, ou qui n'est plus navigateur, ne compte pas", async () => {
    retenirZoneDeCetAppareil(10);
    const creer = vi.fn(async () => ({ id: 43 }));
    expect(await zoneDeCetAppareil(Z, 'Ce téléphone', creer)).toBe(43);
  });

  it('retrouve son homonyme suffixé par le serveur (stockage effacé)', async () => {
    const creer = vi.fn();
    const zs = [...Z, { id: 44, name: 'Ce téléphone (127.0.0.1)', output_type: 'browser' }];
    expect(await zoneDeCetAppareil(zs, 'Ce téléphone', creer)).toBe(44);
    expect(creer).not.toHaveBeenCalled();
  });
});

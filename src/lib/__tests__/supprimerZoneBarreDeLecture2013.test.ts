// @vitest-environment jsdom
// Fil forum 2013, point 9 (FabienM, 0.9.167) : « si je supprime une zone, elle
// reste toujours visible dans la liste des zones ».
//
// La fenêtre de réglages ouverte depuis la barre de lecture (clic droit sur la
// zone) recevait un `onDelete` qui ne faisait que se refermer : « Supprimer
// cette zone », confirmé, n'envoyait AUCUNE requête.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import * as api from '../api';
import { currentZoneId, zones } from '../stores/zones';
import { supprimerZoneConfirmee } from '../suppressionDeZone';

vi.mock('../api', async (original) => ({
  ...await original<typeof import('../api')>(),
  deleteZone: vi.fn(),
}));

const deleteZone = vi.mocked(api.deleteZone);

beforeEach(() => {
  deleteZone.mockReset();
  zones.set([
    { id: 3, name: 'Parents', output_type: 'chromecast' },
    { id: 9, name: 'Parents', output_type: 'dlna' },
  ] as any);
  currentZoneId.set(9);
});
afterEach(() => {
  zones.set([]);
  currentZoneId.set(null);
});

describe('supprimerZoneConfirmee (fil 2013, point 9)', () => {
  it('envoie le DELETE, retire la zone du magasin et lâche la zone active', async () => {
    deleteZone.mockResolvedValue(undefined);
    await supprimerZoneConfirmee(9);
    expect(deleteZone).toHaveBeenCalledWith(9);
    expect(get(zones).map((z) => z.id)).toEqual([3]);
    expect(get(currentZoneId)).toBeNull();
  });

  it('une autre zone active reste active', async () => {
    deleteZone.mockResolvedValue(undefined);
    currentZoneId.set(3);
    await supprimerZoneConfirmee(9);
    expect(get(currentZoneId)).toBe(3);
  });

  it('un refus du serveur remonte à la fenêtre, et la zone reste affichée', async () => {
    deleteZone.mockRejectedValue(new Error('zone_introuvable'));
    await expect(supprimerZoneConfirmee(9)).rejects.toThrow('zone_introuvable');
    expect(get(zones).map((z) => z.id)).toEqual([3, 9]);
    expect(get(currentZoneId)).toBe(9);
  });
});

describe('les deux écrans qui suppriment une zone passent par le même geste', () => {
  const lire = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

  it('barre de lecture : « Supprimer cette zone » supprime vraiment', () => {
    const src = lire('../../components/partages/TransportBar.svelte');
    const modale = src.slice(src.indexOf('<ZoneConfigModal'), src.indexOf('/>', src.indexOf('<ZoneConfigModal')));
    expect(modale).toMatch(/onDelete=\{async \(id\) => \{ await supprimerZoneConfirmee\(id\);/);
  });

  it('page Zones : même fonction', () => {
    expect(lire('../../components/v2/ZonesV2.svelte')).toMatch(/act\(\(\) => supprimerZoneConfirmee\(z\.id as number\)\)/);
  });
});

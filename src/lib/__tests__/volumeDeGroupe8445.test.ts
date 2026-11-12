import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * tune-server-rust#8445 (Jon, fil 2760) — le volume d'une zone groupée ne
 * valait que pour elle : `api.setGroupVolume` existait sans aucun appelant, le
 * curseur n'envoyait que `api.setVolume(zone.id, …)`.
 *
 * Contre-épreuve : faire rendre `null` à `groupeDeLaZone` (ou rebrancher les
 * curseurs sur `api.setVolume`) fait tomber les tests « zone groupée ».
 */
vi.mock('../api', () => ({
  setVolume: vi.fn(async () => undefined),
  setVolumeDb: vi.fn(async () => undefined),
  setGroupVolume: vi.fn(async () => ({})),
  listGroups: vi.fn(async () => []),
}));

import * as api from '../api';
import {
  _reinitialiserSuivi,
  groupeDeLaZone,
  groupesDeZones,
  maitrePourLaZone,
  reglerVolume,
  reglerVolumeDb,
  suivreGroupesDeZones,
  zoneGroupee,
} from '../volumeDeGroupe';
import type { ZoneGroupResponse } from '../types';

const SALON: ZoneGroupResponse = {
  id: 3,
  group_id: '3',
  leader_id: 1,
  zone_ids: [1, 2, 5],
  auto_synced: false,
  group_manufacturer: '',
  offsets: { '2': -0.1 },
};

beforeEach(() => {
  vi.mocked(api.setVolume).mockClear();
  vi.mocked(api.setVolumeDb).mockClear();
  vi.mocked(api.setGroupVolume).mockClear();
  groupesDeZones.set([SALON]);
});

describe('#8445 — le curseur d’une zone groupée règle le volume maître', () => {
  it('trouve le groupe de la zone, et rien pour une zone seule', () => {
    expect(groupeDeLaZone(2, [SALON])?.group_id).toBe('3');
    expect(groupeDeLaZone(9, [SALON])).toBeNull();
    expect(groupeDeLaZone(null, [SALON])).toBeNull();
    // Un « groupe » d'une seule zone n'en est pas un.
    expect(groupeDeLaZone(4, [{ ...SALON, zone_ids: [4] }])).toBeNull();
  });

  it('zone groupée : la consigne part en volume maître, pas sur la zone', async () => {
    await reglerVolume(1, 0.42);
    expect(api.setGroupVolume).toHaveBeenCalledWith('3', 0.42);
    expect(api.setVolume).not.toHaveBeenCalled();
  });

  it('le maître tient compte du décalage de la zone sélectionnée', async () => {
    // B (zone 2) a −10 points : pour qu'elle arrive à 0,42, le maître vaut 0,52.
    await reglerVolume(2, 0.42);
    const [, maitre] = vi.mocked(api.setGroupVolume).mock.calls[0];
    expect(maitre).toBeCloseTo(0.52, 9);
    expect(maitrePourLaZone(SALON, 2, 0.95)).toBe(1);
  });

  it('la saisie en dB d’une zone groupée part aussi en maître', async () => {
    await reglerVolumeDb(5, -20);
    const [id, maitre] = vi.mocked(api.setGroupVolume).mock.calls[0];
    expect(id).toBe('3');
    expect(maitre).toBeCloseTo(0.1, 9);
    expect(api.setVolumeDb).not.toHaveBeenCalled();
  });

  it('la zone sélectionnée refusée par le serveur (PURE…) : le curseur le sait', async () => {
    vi.mocked(api.setGroupVolume).mockResolvedValueOnce({ zones_refusees: [2] });
    await expect(reglerVolume(2, 0.3)).rejects.toThrow();
    vi.mocked(api.setGroupVolume).mockResolvedValueOnce({ zones_refusees: [5] });
    await expect(reglerVolume(1, 0.3)).resolves.toBeTruthy();
  });

  it('zone hors groupe : inchangé, `setVolume` / `setVolumeDb` de la zone', async () => {
    await reglerVolume(9, 0.3);
    await reglerVolumeDb(9, -12);
    expect(api.setVolume).toHaveBeenCalledWith(9, 0.3);
    expect(api.setVolumeDb).toHaveBeenCalledWith(9, -12);
    expect(api.setGroupVolume).not.toHaveBeenCalled();
    expect(zoneGroupee(9)).toBe(false);
    expect(zoneGroupee(5)).toBe(true);
  });

  it('les groupes se relisent à chaque événement `group.*`, une seule fois abonnés', async () => {
    _reinitialiserSuivi();
    groupesDeZones.set([]);
    const handlers: ((e: { type: string; data: unknown }) => void)[] = [];
    const abonner = vi.fn((h: (e: { type: string; data: unknown }) => void) => {
      handlers.push(h);
      return () => {};
    });
    const lister = vi.fn(async () => [SALON]);
    suivreGroupesDeZones(abonner, lister);
    suivreGroupesDeZones(abonner, lister);
    expect(abonner).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(zoneGroupee(1)).toBe(true));

    lister.mockResolvedValueOnce([]);
    handlers[0]({ type: 'zone.updated', data: {} });
    expect(lister).toHaveBeenCalledTimes(1);
    handlers[0]({ type: 'group.deleted', data: {} });
    await vi.waitFor(() => expect(zoneGroupee(1)).toBe(false));
  });
});

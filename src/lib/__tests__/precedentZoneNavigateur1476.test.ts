/**
 * Fil 1476 (FabienM, rc2) — sur « Cet ordinateur », « précédent » doit
 * relancer la piste au premier appui (#1929). Le serveur ne relève pas la
 * position d'une zone navigateur : le client la lui envoie, et applique
 * lui-même la relance à l'élément audio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const previous = vi.fn();
const getZone = vi.fn();
vi.mock('../api', () => ({
  previous: (...a: unknown[]) => previous(...a),
  getZone: (...a: unknown[]) => getZone(...a),
}));

const browserSeek = vi.fn();
const browserPositionMsPour = vi.fn();
vi.mock('../stores/browserAudio', () => ({
  browserSeek: (...a: unknown[]) => browserSeek(...a),
  browserPositionMsPour: (...a: unknown[]) => browserPositionMsPour(...a),
  browserPlay: vi.fn(),
  isBrowserZone: (z: { output_type?: string } | null) => z?.output_type === 'browser',
}));

import { zones, previousAndSync } from '../stores/zones';

beforeEach(() => {
  previous.mockReset();
  getZone.mockReset();
  browserSeek.mockReset();
  browserPositionMsPour.mockReset();
});

describe('précédent sur une zone navigateur (fil 1476)', () => {
  it('envoie la position jouée par l’onglet et relance localement', async () => {
    zones.set([{ id: 7, name: 'Cet ordinateur', output_type: 'browser' } as never]);
    browserPositionMsPour.mockReturnValue(45_000);
    previous.mockResolvedValue({ status: 'restarted' });
    getZone.mockResolvedValue({ id: 7, name: 'Cet ordinateur', output_type: 'browser' });

    await previousAndSync(7);

    expect(previous).toHaveBeenCalledWith(7, 45_000);
    expect(browserSeek).toHaveBeenCalledWith(0);
  });

  it('un recul ne touche pas à l’élément audio', async () => {
    zones.set([{ id: 7, name: 'Cet ordinateur', output_type: 'browser' } as never]);
    browserPositionMsPour.mockReturnValue(1_000);
    previous.mockResolvedValue({ status: 'playing', queue_position: 0 });
    getZone.mockResolvedValue({ id: 7, name: 'Cet ordinateur', output_type: 'browser' });

    await previousAndSync(7);

    expect(previous).toHaveBeenCalledWith(7, 1_000);
    expect(browserSeek).not.toHaveBeenCalled();
  });

  it('une zone avec sortie n’envoie aucune position', async () => {
    zones.set([{ id: 3, name: 'Salon', output_type: 'upnp' } as never]);
    previous.mockResolvedValue({ status: 'restarted' });
    getZone.mockResolvedValue({ id: 3, name: 'Salon', output_type: 'upnp' });

    await previousAndSync(3);

    expect(previous).toHaveBeenCalledWith(3, null);
    expect(browserPositionMsPour).not.toHaveBeenCalled();
    expect(browserSeek).not.toHaveBeenCalled();
  });
});

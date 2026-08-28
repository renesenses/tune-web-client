import { describe, it, expect, vi, beforeEach } from 'vitest';

const playAndSync = vi.fn(async (..._a: any[]) => ({}) as any);
let zone: any = { id: 7 };

vi.mock('./stores/zones', () => ({
  playAndSync: (...a: any[]) => playAndSync(...a),
  currentZone: { subscribe: (run: any) => { run(zone); return () => {}; } },
}));

const addToQueue = vi.fn(async (..._a: any[]) => ({ queue_length: 0 }));
const getQueue = vi.fn(async (..._a: any[]) => ({ tracks: [] as any[], position: 0 }));
vi.mock('./api', () => ({
  addToQueue: (...a: any[]) => addToQueue(...a),
  getQueue: (...a: any[]) => getQueue(...a),
}));

const erreur = vi.fn();
vi.mock('./stores/notifications', () => ({
  notifications: { error: (...a: any[]) => erreur(...a), success: vi.fn(), info: vi.fn() },
}));

vi.mock('./i18n', () => ({
  t: { subscribe: (run: any) => { run((k: string) => k); return () => {}; } },
}));

import { playFromHere } from './playback';

const local = (id: number) => ({ id, title: `t${id}` });
const flux = (sid: string) => ({ id: null, source: 'qobuz', source_id: sid, title: sid });

describe('playFromHere', () => {
  beforeEach(() => {
    zone = { id: 7 };
    playAndSync.mockClear(); addToQueue.mockClear(); getQueue.mockClear(); erreur.mockClear();
  });

  it('liste 100 % locale : un seul appel, la file entière, départ au rang cliqué', async () => {
    await playFromHere([local(1), local(2), local(3)], 2);
    expect(playAndSync).toHaveBeenCalledTimes(1);
    expect(playAndSync).toHaveBeenCalledWith(7, { track_ids: [1, 2, 3], start_index: 2 });
    expect(addToQueue).not.toHaveBeenCalled();
  });

  it('doublon local : on démarre au rang cliqué, pas à la première occurrence', async () => {
    await playFromHere([local(5), local(9), local(5)], 2);
    expect(playAndSync).toHaveBeenCalledWith(7, { track_ids: [5, 9, 5], start_index: 2 });
  });

  // #1488 — le cœur du défaut : la piste distante cliquée était jetée du filtre,
  // et la lecture démarrait sur ids[0], le HAUT de la liste.
  it('liste mixte : démarre bien sur la piste distante cliquée', async () => {
    await playFromHere([local(1), flux('bowie-lazarus'), flux('abc')], 1);
    expect(playAndSync).toHaveBeenCalledTimes(1);
    expect(playAndSync.mock.calls[0][1]).toMatchObject({ source: 'qobuz', source_id: 'bowie-lazarus' });
  });

  it('liste mixte : la suite est enfilée dans l’ordre, le début ne l’est pas', async () => {
    await playFromHere([local(1), flux('a'), local(2), flux('b')], 1);
    expect(addToQueue).toHaveBeenCalledTimes(2);
    expect(addToQueue.mock.calls[0][1]).toMatchObject({ track_id: 2 });
    expect(addToQueue.mock.calls[1][1]).toMatchObject({ source: 'qobuz', source_id: 'b' });
    expect(getQueue).toHaveBeenCalledWith(7);
  });

  it('liste 100 % distante : ne retourne plus en silence', async () => {
    await playFromHere([flux('x'), flux('y'), flux('z')], 0);
    expect(playAndSync).toHaveBeenCalledTimes(1);
    expect(playAndSync.mock.calls[0][1]).toMatchObject({ source_id: 'x' });
    expect(addToQueue).toHaveBeenCalledTimes(1);
    expect(addToQueue).toHaveBeenCalledWith(7, {
      tracks: [
        expect.objectContaining({ source: 'qobuz', source_id: 'y' }),
        expect.objectContaining({ source: 'qobuz', source_id: 'z' }),
      ],
    });
    expect(erreur).not.toHaveBeenCalled();
  });

  it('favoris de service : propage la source de la liste aux pistes qui l omettent', async () => {
    await playFromHere(
      [
        { id: null, source_id: 'fav-a', title: 'A' },
        { id: null, source_id: 'fav-b', title: 'B' },
      ],
      0,
      'qobuz',
    );

    expect(playAndSync).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ source: 'qobuz', source_id: 'fav-a' }),
    );
    expect(addToQueue).toHaveBeenCalledWith(7, {
      tracks: [expect.objectContaining({ source: 'qobuz', source_id: 'fav-b' })],
    });
  });

  it('aucune zone : on prévient au lieu de ne rien faire', async () => {
    zone = null;
    await playFromHere([local(1)], 0);
    expect(playAndSync).not.toHaveBeenCalled();
    expect(erreur).toHaveBeenCalledWith('library.noZoneSelectedSelectZone');
  });

  it('rang injouable : on prévient au lieu de ne rien faire', async () => {
    await playFromHere([{ id: null } as any], 0);
    expect(playAndSync).not.toHaveBeenCalled();
    expect(erreur).toHaveBeenCalledWith('library.playbackError');
  });

  it('rang hors bornes : on prévient au lieu de démarrer autre chose', async () => {
    await playFromHere([local(1), local(2)], 9);
    expect(playAndSync).not.toHaveBeenCalled();
    expect(erreur).toHaveBeenCalledWith('library.playbackError');
  });

  it('échec de lecture : notifié, pas avalé', async () => {
    playAndSync.mockRejectedValueOnce(new Error('boom'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await playFromHere([local(1)], 0);
    expect(erreur).toHaveBeenCalledWith('library.playbackError');
    log.mockRestore();
  });

  it('file illisible après coup : la lecture démarrée n’est pas signalée en échec', async () => {
    getQueue.mockRejectedValueOnce(new Error('hs'));
    await playFromHere([flux('a'), flux('b')], 0);
    expect(erreur).not.toHaveBeenCalled();
  });
});

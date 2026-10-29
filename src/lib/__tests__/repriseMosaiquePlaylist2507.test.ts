// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getContinueListening: vi.fn(), getPlaylistTracks: vi.fn(),
  resumeListening: vi.fn(), play: vi.fn(),
}));
vi.mock('../api', async (original) => ({ ...await original<typeof import('../api')>(), ...mocks }));
import { widgetParId } from '../accueilWidgets';

const ctx: any = { zones: [], albums: [], limite: 50 };
const entree = (extra: Record<string, unknown> = {}) => ({
  id: 0, context_type: 'playlist', context_id: '17', source: 'local',
  title: 'Ma playlist', last_track_title: 'Dernier titre', cover_path: null,
  resume_key: 'cle-opaque', ...extra,
});
async function carte(extra: Record<string, unknown> = {}) {
  mocks.getContinueListening.mockResolvedValue([entree(extra)]);
  return (await widgetParId('reprendre')!.charger(ctx))[0];
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPlaylistTracks.mockResolvedValue([
    { cover_path: 'a.jpg' }, { cover_path: 'a.jpg' }, { cover_path: null },
    { cover_path: 'b.jpg' }, { cover_path: 'c.jpg' }, { cover_path: 'd.jpg' }, { cover_path: 'e.jpg' },
  ]);
  mocks.resumeListening.mockResolvedValue({ id: 27, state: 'playing' });
});

describe('Reprise : mosaïque de playlist locale #2507', () => {
  it.each(['local', null])('%s : charge les quatre pochettes distinctes depuis context_id, après la carte', async (source) => {
    const c = await carte({ source });
    expect(c.mosaique, 'la reprise locale doit proposer la mosaïque de sa playlist').toBeTypeOf('function');
    expect(mocks.getPlaylistTracks).not.toHaveBeenCalled();
    expect(await c.mosaique!()).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
    expect(mocks.getPlaylistTracks).toHaveBeenCalledExactlyOnceWith(17);
    expect(c.titre).toBe('Dernier titre');
    await c.jouer!(27);
    expect(mocks.resumeListening).toHaveBeenCalledExactlyOnceWith(27, 'cle-opaque');
    expect(mocks.play).not.toHaveBeenCalled();
  });
  it('garde la pochette explicite sans demander une mosaïque', async () => {
    const c = await carte({ cover_path: 'choisie.jpg' });
    expect(c.cover).toBe('choisie.jpg');
    expect(c.mosaique).toBeUndefined();
    expect(mocks.getPlaylistTracks).not.toHaveBeenCalled();
  });
  it.each(['qobuz', 'tidal'])('%s numérique ne devient jamais une playlist locale', async (source) => {
    const c = await carte({ source });
    expect(c.mosaique).toBeUndefined();
    expect(mocks.getPlaylistTracks).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', 'invalide', '17.5', 'Infinity', '9007199254740992'])('ignore le context_id local invalide %s', async (context_id) => {
    const c = await carte({ context_id });
    expect(c.mosaique).toBeUndefined();
    expect(mocks.getPlaylistTracks).not.toHaveBeenCalled();
  });
  it.each(['album', 'track', 'podcast'])('%s ne demande pas les pistes d’une playlist', async (context_type) => {
    const c = await carte({ context_type });
    expect(c.mosaique).toBeUndefined();
    expect(mocks.getPlaylistTracks).not.toHaveBeenCalled();
  });
});

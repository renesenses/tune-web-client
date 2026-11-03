// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getContinueListening: vi.fn(), resumeListening: vi.fn(), play: vi.fn() }));
vi.mock('../api', async (original) => ({ ...await original<typeof import('../api')>(), ...mocks }));
import { widgetParId } from '../accueilWidgets';
import { reprisesUtiles } from '../reprendreEcoute';
const ctx: any = { zones: [], albums: [], limite: 50 };
beforeEach(() => { mocks.resumeListening.mockResolvedValue({ id: 27, state: 'playing' }); });

describe('Reprise de lecture de Fabien #7280', () => {
  it.each(['album', 'playlist', 'track', 'podcast'])('%s : reprend le contexte sur la zone active', async (type) => {
    mocks.getContinueListening.mockResolvedValue([{ context_type: type, context_id: 'objet', source: 'qobuz', title: 'Conteneur', last_track_title: 'Dernier titre', cover_path: 'podcast.jpg', resume_key: 'opaque' }]);
    const rows = await widgetParId('reprendre')!.charger(ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0].titre).toBe(['album', 'playlist', 'podcast'].includes(type) ? 'Dernier titre' : 'Conteneur');
    expect(rows[0].cover).toBe('podcast.jpg');
    await rows[0].jouer!(27);
    expect(mocks.resumeListening).toHaveBeenLastCalledWith(27, 'opaque');
  });
  it.each(['qobuz', 'tidal'])('%s : album, playlist et titre seul gardent vignette et clé serveur', async (source) => {
    mocks.play.mockClear();
    for (const type of ['album', 'playlist', 'track']) {
      const key = `${source}-${type}`;
      mocks.getContinueListening.mockResolvedValue([{ context_type: type, context_id: 'non-numerique', source, title: 'Titre seul', last_track_title: 'Dernier titre', cover_path: `https://${source}.invalid/contexte.jpg`, position_ms: 42000, resume_key: key }]);
      const rows = await widgetParId('reprendre')!.charger(ctx);
      expect(rows).toHaveLength(1);
      expect(rows[0].cover).toBe(`https://${source}.invalid/contexte.jpg`);
      await rows[0].jouer!(27);
      expect(mocks.resumeListening).toHaveBeenLastCalledWith(27, key);
    }
    expect(mocks.play).not.toHaveBeenCalled();
  });
  it('propage un refus de reprise sans lancer un autre album', async () => {
    mocks.resumeListening.mockRejectedValueOnce(new Error('reprise périmée'));
    mocks.getContinueListening.mockResolvedValue([{ context_type: 'album', title: 'Album', resume_key: 'absente', cover_path: 'x' }]);
    const rows = await widgetParId('reprendre')!.charger(ctx);
    await expect(rows[0].jouer!(1)).rejects.toThrow('reprise périmée');
  });
  it('conserve les titres seuls nouveaux même si leur album est proposé', () => {
    expect(reprisesUtiles([{ context_type: 'album', album_id: 3 }, { context_type: 'track', album_id: 3, resume_key: 'titre-seul' }])).toHaveLength(2);
  });
  it('garde le chemin de lecture d’un ancien serveur', async () => {
    mocks.getContinueListening.mockResolvedValue([{ context_type: 'album', context_id: 'a', source: 'qobuz', title: 'Album', cover_path: 'x' }]);
    const rows = await widgetParId('reprendre')!.charger(ctx);
    await rows[0].jouer!(4);
    expect(mocks.play).toHaveBeenLastCalledWith(4, { source: 'qobuz', streaming_album_id: 'a' });
  });
});

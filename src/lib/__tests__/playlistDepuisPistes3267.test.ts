// web#3267 — créer une playlist Tune pleine, dans l'ORDRE, même quand
// bibliothèque et service alternent (le serveur range `track_ids` avant
// `streaming_tracks` dans un même appel).
import { describe, expect, it, vi } from 'vitest';
import { creerPlaylistAvecPistes, tronconsParFamille, corpsAjoutPlaylist } from '../playlistDepuisPistes';
import type { Track } from '../types';

const L = (id: number) => ({ id, title: `L${id}`, source: 'local' }) as unknown as Track;
const Q = (sid: string) => ({ id: null, title: sid, source: 'qobuz', source_id: sid }) as unknown as Track;

function faux(totaux: (number | Error)[]) {
  let i = 0;
  return {
    createPlaylist: vi.fn(async () => ({ id: 9, name: 'n', track_count: 0 }) as any),
    addPlaylistTracks: vi.fn(async () => {
      const r = totaux[i++];
      if (r instanceof Error) throw r;
      return { id: 9, track_count: r } as any;
    }),
    deletePlaylist: vi.fn(async () => undefined as any),
  };
}

describe('playlistDepuisPistes (web#3267)', () => {
  it('🔴 tronçons contigus : L1 L2 Q-a L3 → trois envois, dans l’ordre', async () => {
    const d = faux([2, 3, 4]);
    const r = await creerPlaylistAvecPistes('Jazz', [L(1), L(2), Q('a'), L(3)], d);
    expect(d.createPlaylist).toHaveBeenCalledWith('Jazz');
    const envois = d.addPlaylistTracks.mock.calls.map((c: any[]) => [c[1], (c[3] ?? []).map((s: any) => s.source_id)]);
    expect(envois).toEqual([[[1, 2], []], [[], ['a']], [[3], []]]);
    expect(r).toEqual({ id: 9, nom: 'Jazz', ajoutees: 4 });
  });

  it('un tronçon refusé ne coûte que ses titres', async () => {
    const d = faux([1, new Error('422'), 2]);
    const r = await creerPlaylistAvecPistes('X', [L(1), Q('a'), L(2)], d);
    expect(r.ajoutees).toBe(2);
    expect(d.deletePlaylist).not.toHaveBeenCalled();
  });

  it('🔴 rien d’enregistré → la playlist vide est retirée et l’erreur remonte', async () => {
    const d = faux([new Error('422')]);
    await expect(creerPlaylistAvecPistes('X', [Q('a')], d)).rejects.toThrow('422');
    expect(d.deletePlaylist).toHaveBeenCalledWith(9);
  });

  it('les titres non rangeables (service sans id) ne partent pas', async () => {
    const d = faux([1]);
    await creerPlaylistAvecPistes('X', [L(1), { id: null, title: 'radio', source: 'qobuz' } as any], d);
    expect(d.addPlaylistTracks).toHaveBeenCalledTimes(1);
    expect(d.addPlaylistTracks.mock.calls[0][1]).toEqual([1]);
    const c = corpsAjoutPlaylist([L(1), Q('b')]);
    expect(c.trackIds).toEqual([1]);
    expect(c.streamingTracks?.[0]).toMatchObject({ source: 'qobuz', source_id: 'b' });
    expect(tronconsParFamille([])).toEqual([]);
  });
});

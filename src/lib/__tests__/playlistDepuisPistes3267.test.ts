// web#3267 — créer une playlist Tune pleine, dans l'ORDRE, même quand
// bibliothèque et service alternent (le serveur range `track_ids` avant
// `streaming_tracks` dans un même appel).
import { describe, expect, it, vi } from 'vitest';
import { creerPlaylistAvecPistes, tronconsParFamille, corpsAjoutPlaylist, envoisOrdonnes, AucunTitreRangeable } from '../playlistDepuisPistes';
import type { Track } from '../types';

const L = (id: number) => ({ id, title: `L${id}`, source: 'local' }) as unknown as Track;
const Q = (sid: string) => ({ id: null, title: sid, source: 'qobuz', source_id: sid }) as unknown as Track;

function faux(totaux: (number | Error)[]) {
  let i = 0;
  return {
    createPlaylist: vi.fn(async () => ({ id: 9, name: 'n', track_count: 0 }) as any),
    addPlaylistTracks: vi.fn(async (..._a: any[]) => {
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
    expect(r).toEqual({ id: 9, nom: 'Jazz', ajoutees: 4, demandees: 4 });
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

  it('🔴 aucun titre rangeable : rien n’est créé', async () => {
    const d = faux([]);
    await expect(creerPlaylistAvecPistes('X', [{ id: null, source: 'qobuz' } as any], d)).rejects.toBeInstanceOf(AucunTitreRangeable);
    expect(d.createPlaylist).not.toHaveBeenCalled();
  });

  it('playlist créée sans id : erreur explicite, aucun envoi', async () => {
    const d = faux([1]);
    d.createPlaylist.mockResolvedValueOnce({} as any);
    await expect(creerPlaylistAvecPistes('X', [L(1)], d)).rejects.toThrow('created playlist has no id');
    expect(d.addPlaylistTracks).not.toHaveBeenCalled();
  });

  it('🔴 long tronçon coupé à 200, avancement « k / n »', async () => {
    const lot = Array.from({ length: 450 }, (_, i) => L(i + 1));
    expect(envoisOrdonnes(lot).map((m) => m.length)).toEqual([200, 200, 50]);
    const d = faux([200, 400, 450]);
    const vus: string[] = [];
    const r = await creerPlaylistAvecPistes('X', lot, d, (k, n) => vus.push(`${k} / ${n}`));
    expect(vus).toEqual(['200 / 450', '400 / 450', '450 / 450']);
    expect(r.ajoutees).toBe(450);
  });

  it('les titres non rangeables (service sans id) ne partent pas, mais comptent dans le total', async () => {
    const d = faux([1]);
    const r = await creerPlaylistAvecPistes('X', [L(1), { id: null, title: 'radio', source: 'qobuz' } as any], d);
    expect(r).toMatchObject({ ajoutees: 1, demandees: 2 });
    expect(d.addPlaylistTracks).toHaveBeenCalledTimes(1);
    expect(d.addPlaylistTracks.mock.calls[0][1]).toEqual([1]);
    const c = corpsAjoutPlaylist([L(1), Q('b')]);
    expect(c.trackIds).toEqual([1]);
    expect(c.streamingTracks?.[0]).toMatchObject({ source: 'qobuz', source_id: 'b' });
    expect(tronconsParFamille([])).toEqual([]);
  });
});

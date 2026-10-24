/**
 * web#2286 (part web de tune-server-rust#6687, PR #6690 ; Bertrand, 21/10 :
 * « la suppression de pistes n'est pas fiable ») — la × désigne la LIGNE,
 * un retrait à la fois, et l'écran relit ce que le serveur a vraiment fait.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cibleDuRetrait, creerRetraitPlaylist } from '../retraitPlaylist';
import type { Track } from '../types';

const piste = (titre: string, entry_id?: number): Track =>
  ({ id: null, title: titre, source: 'qobuz', ...(entry_id != null ? { entry_id } : {}) }) as unknown as Track;

/** Un faux serveur à la #6690 : efface par `entry_id`, ou par rang ; 404 sinon. */
function serveur(lignes: Track[]) {
  let etat = [...lignes];
  const retirer = vi.fn(async (_id: number, cible: { entry_id?: number; position?: number }) => {
    const i = cible.entry_id != null
      ? etat.findIndex((p) => (p as any).entry_id === cible.entry_id)
      : (cible.position ?? -1);
    if (i < 0 || i >= etat.length) throw Object.assign(new Error('404'), { status: 404 });
    etat = etat.filter((_, k) => k !== i);
  });
  const relire = vi.fn(async () => [...etat]);
  return { retirer, relire, etat: () => etat };
}

describe('web#2286 — la cible du retrait', () => {
  it('`entry_id` quand la ligne le porte, le rang sinon (serveur plus ancien)', () => {
    expect(cibleDuRetrait(piste('A', 17), 3)).toEqual({ entry_id: 17 });
    expect(cibleDuRetrait(piste('A'), 3)).toEqual({ position: 3 });
    expect(cibleDuRetrait({ entry_id: '17' } as any, 2)).toEqual({ position: 2 });
  });
});

describe('web#2286 — un retrait à la fois, puis relecture', () => {
  it('🔴 deux × rapprochées : la seconde n’émet rien tant que la première court', async () => {
    const s = serveur([piste('A', 1), piste('B', 2), piste('C', 3)]);
    let liberer: () => void = () => {};
    const retirer = vi.fn((id: number, c: any) => new Promise<void>((r) => { liberer = () => { void s.retirer(id, c).then(r); }; }));
    const retrait = creerRetraitPlaylist({ retirer, relire: s.relire });
    const pistes = s.etat();
    const premier = retrait.retirer(9, pistes, 1);
    expect(await retrait.retirer(9, pistes, 1), 'second clic pendant le premier').toBeNull();
    expect(retirer).toHaveBeenCalledTimes(1);
    liberer();
    const issue = await premier;
    expect(issue!.pistes.map((p) => p.title)).toEqual(['A', 'C']);
    expect(retrait.enCours).toBe(false);
  });

  it('🔴 la ligne envoyée est celle de `entry_id`, et la liste vient du serveur', async () => {
    const s = serveur([piste('A', 1), piste('B', 2), piste('C', 3), piste('D', 4)]);
    const retrait = creerRetraitPlaylist({ retirer: s.retirer, relire: s.relire });
    let pistes = s.etat();
    pistes = (await retrait.retirer(9, pistes, 1))!.pistes;
    pistes = (await retrait.retirer(9, pistes, 1))!.pistes;
    expect(s.retirer.mock.calls.map((c) => c[1])).toEqual([{ entry_id: 2 }, { entry_id: 3 }]);
    expect(pistes.map((p) => p.title)).toEqual(['A', 'D']);
    expect(s.relire).toHaveBeenCalledTimes(2);
  });

  it('🔴 un 404 : la liste est relue et la ligne reste affichée', async () => {
    const s = serveur([piste('A', 1), piste('B', 2)]);
    const retirer = vi.fn(async () => { throw Object.assign(new Error('404'), { status: 404 }); });
    const retrait = creerRetraitPlaylist({ retirer, relire: s.relire });
    const issue = await retrait.retirer(9, s.etat(), 1);
    expect(issue!.ok).toBe(false);
    expect(s.relire).toHaveBeenCalledTimes(1);
    expect(issue!.pistes.map((p) => p.title)).toEqual(['A', 'B']);
  });

  it('relecture impossible : seul un retrait confirmé disparaît de l’écran', async () => {
    const ko = async () => { throw new Error('réseau'); };
    const ok = creerRetraitPlaylist({ retirer: async () => {}, relire: ko });
    expect((await ok.retirer(9, [piste('A', 1), piste('B', 2)], 0))!.pistes.map((p) => p.title)).toEqual(['B']);
    const refus = creerRetraitPlaylist({ retirer: ko, relire: ko });
    expect((await refus.retirer(9, [piste('A', 1), piste('B', 2)], 0))!.pistes.map((p) => p.title)).toEqual(['A', 'B']);
  });

  it('rang invalide : rien ne part', async () => {
    const s = serveur([piste('A', 1)]);
    const retrait = creerRetraitPlaylist({ retirer: s.retirer, relire: s.relire });
    expect(await retrait.retirer(9, s.etat(), 5)).toBeNull();
    expect(await retrait.retirer(9, s.etat(), -1)).toBeNull();
    expect(s.retirer).not.toHaveBeenCalled();
  });
});

describe('web#2286 — les deux écrans passent par la même règle', () => {
  const lire = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8');
  it('PlaylistManagerView et PlaylistDetailV2 : `creerRetraitPlaylist`, plus de retrait par rang sans relecture', () => {
    for (const f of ['src/components/v2-heritage/PlaylistManagerView.svelte', 'src/components/v2/PlaylistDetailV2.svelte']) {
      const src = lire(f);
      expect(src, f).toContain('creerRetraitPlaylist({');
      expect(src, f).toContain('api.removePlaylistEntry(id, cible)');
      expect(src, f).toContain('relire: (id) => api.getPlaylistTracks(id)');
      expect(src, f).not.toContain('removePlaylistTrackAt(');
      expect(src, f).toMatch(/disabled=\{retraitEnCours\}/);
    }
  });
});

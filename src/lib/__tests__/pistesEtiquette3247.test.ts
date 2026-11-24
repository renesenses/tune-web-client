// web#3247 (Patatorz, fil 2912) — les titres d'une étiquette, pour « Tout
// lire » et « Ajouter tout à une playlist » : ordre, doublons, échecs.
import { describe, expect, it } from 'vitest';
import { cleDePiste, pistesDeLEtiquette } from '../pistesEtiquette';
import type { ObjetMenu } from '../gestesObjet';

const p = (id: number | null, extra: Record<string, unknown> = {}) => ({ id, title: `t${id}`, ...extra }) as any;

/** Un résolveur factice : les pistes de chaque objet, par sa désignation. */
function resolveur(table: Record<string, any[] | Error>, vus: string[] = []) {
  return async (o: ObjetMenu) => {
    const k = `${o.type}:${o.id ?? `${o.service}:${o.sourceId}`}`;
    vus.push(k);
    const r = table[k];
    if (r instanceof Error) throw r;
    return r ?? [];
  };
}

describe('pistesDeLEtiquette', () => {
  it('albums (ordre affiché), puis titres, puis artistes, puis playlists', async () => {
    const r = await pistesDeLEtiquette({
      albums: [{ id: 2, source: 'local' }, { id: null, source: 'qobuz', source_id: 'q1' }],
      pistes: [p(30)],
      artistes: [{ id: 5, source: 'local' }],
      listes: [{ id: 8, name: 'L' }, { id: 9, name: 'R', smart: true }],
    }, resolveur({
      'album:2': [p(1), p(2)],
      'album:qobuz:q1': [p(null, { source: 'qobuz', source_id: 's1' })],
      'artiste:5': [p(50)],
      'playlist:8': [p(80)],
      'playlistIntelligente:9': [p(90)],
    }));
    expect(r.echecs).toBe(0);
    expect(r.pistes.map((x) => cleDePiste(x))).toEqual(['id:1', 'id:2', 'qobuz:s1', 'id:30', 'id:50', 'id:80', 'id:90']);
  });

  it('🔴 un titre étiqueté ET dans un album étiqueté ne compte qu’une fois, à sa première place', async () => {
    const r = await pistesDeLEtiquette({
      albums: [{ id: 2, source: 'local' }], pistes: [p(2), p(3)], artistes: [], listes: [],
    }, resolveur({ 'album:2': [p(1), p(2)] }));
    expect(r.pistes.map((x) => x.id)).toEqual([1, 2, 3]);
  });

  it('un objet en échec ne coûte que ses pistes, et il est compté', async () => {
    const r = await pistesDeLEtiquette({
      albums: [{ id: 2, source: 'local' }, { id: 3, source: 'local' }], pistes: [], artistes: [], listes: [],
    }, resolveur({ 'album:2': new Error('500'), 'album:3': [p(7)] }));
    expect(r.echecs).toBe(1);
    expect(r.pistes.map((x) => x.id)).toEqual([7]);
  });

  it('étiquette vide : aucune piste, aucune requête', async () => {
    const vus: string[] = [];
    const r = await pistesDeLEtiquette({ albums: [], pistes: [], artistes: [], listes: [] }, resolveur({}, vus));
    expect(r).toEqual({ pistes: [], echecs: 0 });
    expect(vus).toEqual([]);
  });

  it('concurrence bornée à 5', async () => {
    let enCours = 0;
    let max = 0;
    const albums = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, source: 'local' }));
    await pistesDeLEtiquette({ albums, pistes: [], artistes: [], listes: [] }, async (o) => {
      enCours++; max = Math.max(max, enCours);
      await new Promise((r) => setTimeout(r, 2));
      enCours--;
      return [p(o.id as number)];
    });
    expect(max).toBeLessThanOrEqual(5);
    expect(max).toBeGreaterThan(1);
  });
});

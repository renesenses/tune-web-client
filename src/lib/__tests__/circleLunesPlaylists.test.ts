import { describe, expect, it } from 'vitest';
import { lunesParPlanete, planetesDePlaylist, positionLune } from '../champCercle/lunes';
import type { PlaylistCercleResume } from '../circlePlaylists';

/**
 * Tune Circle T5 dans la scène (24/10/2026) — les playlists partagées en
 * petites lunes sur l'anneau de leur cercle (24/10 au soir).
 */
const pl = (o: Partial<PlaylistCercleResume>): PlaylistCercleResume => ({
  id: 'p', name: 'P', owner: null, count: 0, version: 1, updated_at: null, mine: false, circle_id: null, ...o,
});

describe('à quelle planète s\'accroche une playlist', () => {
  it('la mienne : la planète de SON cercle', () => {
    expect(planetesDePlaylist(pl({ mine: true, circle_id: 7 }))).toEqual(['k:7', 'ks:7']);
  });
  it('celle d\'un contact : la planète de son propriétaire (le cloud ne me dit pas son cercle)', () => {
    expect(planetesDePlaylist(pl({ mine: false, owner: { user_id: 40, name: 'Élise' } }))).toEqual(['c:40']);
  });
  it('sans cercle ni propriétaire connus : aucune', () => {
    expect(planetesDePlaylist(pl({ mine: true, circle_id: null }))).toEqual([]);
    expect(planetesDePlaylist(pl({ mine: false, owner: { user_id: null, name: '' } }))).toEqual([]);
  });
});

describe('les lunes de chaque planète', () => {
  it('seulement pour les planètes que la scène montre, dans l\'ordre du cloud', () => {
    const m = lunesParPlanete([
      pl({ id: 1, name: 'Noël', mine: true, circle_id: 7, count: 3 }),
      pl({ id: 2, name: 'Dimanche', owner: { user_id: 40, name: 'Élise' } }),
      pl({ id: 3, name: 'Ailleurs', mine: true, circle_id: 99 }),
      pl({ id: 4, name: 'Été', mine: true, circle_id: 7 }),
    ], new Set(['self', 'k:7', 'c:40']));
    expect(m.get('k:7')!.lunes.map((l) => l.nom)).toEqual(['Noël', 'Été']);
    expect(m.get('k:7')!.lunes[0]).toEqual({ id: 1, nom: 'Noël', count: 3 });
    expect(m.get('c:40')!.lunes.map((l) => l.id)).toEqual([2]);
    expect(m.has('k:99')).toBe(false);
  });

  it('mon cercle en vue Solo (`ks:`) porte aussi ses lunes', () => {
    const m = lunesParPlanete([pl({ id: 1, name: 'Noël', mine: true, circle_id: 7 })], new Set(['k:7', 'ks:7']));
    expect(m.get('ks:7')!.lunes.map((l) => l.nom)).toEqual(['Noël']);
    expect(m.get('k:7')!.lunes.map((l) => l.nom)).toEqual(['Noël']);
  });

  it('au-delà du plafond : le reste est compté, pas dessiné', () => {
    const ps = Array.from({ length: 8 }, (_, i) => pl({ id: i, mine: true, circle_id: 7 }));
    const e = lunesParPlanete(ps, new Set(['k:7']), 5).get('k:7')!;
    expect(e.lunes).toHaveLength(5);
    expect(e.reste).toBe(3);
  });
});

describe('où poser une lune', () => {
  it('hors de la planète, à distance égale du centre ; deux lunes ne se superposent pas', () => {
    const planete = { x: 100, y: 100, r: 30 };
    const a = positionLune(planete, 0, 3);
    const b = positionLune(planete, 1, 3);
    const d = (p: { x: number; y: number }) => Math.hypot(p.x - 100, p.y - 100);
    expect(d(a)).toBeCloseTo(44);
    expect(d(b)).toBeCloseTo(44);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(20);
  });
  it('une petite planète garde une orbite lisible', () => {
    const p = positionLune({ x: 0, y: 0, r: 2 }, 0, 1);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(26);
  });
});

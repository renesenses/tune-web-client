// Rubriques PLAYLISTS et COLLECTIONS de la barre latérale Néomorphique (28/11) :
// cinq éléments au plus, les plus utilisés ou les plus récents d'abord.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { premiersDeRubrique, MAX_RUBRIQUE } from '../rubriquesBarre';

const ids = (l: { id?: unknown }[]) => l.map((e) => e.id);

describe('rubriques de la barre latérale', () => {
  it('cinq éléments au plus', () => {
    const l = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `L${i + 1}` }));
    expect(MAX_RUBRIQUE).toBe(5);
    expect(premiersDeRubrique(l)).toHaveLength(5);
    expect(premiersDeRubrique(l.slice(0, 3))).toHaveLength(3);
    expect(premiersDeRubrique([])).toEqual([]);
    expect(premiersDeRubrique(null)).toEqual([]);
  });
  it('playlists telles que le serveur les rend (id, nom) : les plus récemment créées d’abord', () => {
    const l = [{ id: 3, name: 'C' }, { id: 12, name: 'L' }, { id: 7, name: 'G' }, { id: 1, name: 'A' }, { id: 9, name: 'I' }, { id: 5, name: 'E' }];
    expect(ids(premiersDeRubrique(l))).toEqual([12, 9, 7, 5, 3]);
  });
  it('collections avec created_at : les plus récentes d’abord', () => {
    const l = [
      { id: 1, created_at: '2026-10-01T10:00:00Z' }, { id: 2, created_at: '2026-11-20T10:00:00Z' },
      { id: 3, created_at: '2026-09-01T10:00:00Z' }, { id: 4, created_at: '2026-11-27T10:00:00Z' },
      { id: 5, created_at: '2026-11-01T10:00:00Z' }, { id: 6, created_at: '2026-08-01T10:00:00Z' },
    ];
    expect(ids(premiersDeRubrique(l))).toEqual([4, 2, 5, 1, 3]);
  });
  it('préférence : dernière écoute, puis nombre d’écoutes, puis date, puis identifiant', () => {
    const l = [
      { id: 50, created_at: '2026-11-28T10:00:00Z' },
      { id: 2, play_count: 3 },
      { id: 3, last_played_at: '2026-11-01T10:00:00Z' },
      { id: 4, play_count: 40 },
      { id: 60 },
      { id: 6, last_played_at: '2026-11-25T10:00:00Z' },
    ];
    expect(ids(premiersDeRubrique(l))).toEqual([6, 3, 4, 2, 50]);
  });
  it('la barre latérale emploie la limite pour les deux rubriques, et « Tout voir »', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'components', 'salon', 'BarreLateraleSalon.svelte'), 'utf8');
    expect(src).toContain('premiersDeRubrique(listes)');
    expect(src).toContain('premiersDeRubrique(collections)');
    expect(src).toContain("'artist.page.seeAll'");
  });
});

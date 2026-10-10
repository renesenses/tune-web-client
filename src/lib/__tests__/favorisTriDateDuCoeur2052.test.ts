/**
 * web#2052 — FabienM, fil 2199 point 3 (09/10/2026, 1.0.0-rc3) :
 *
 * > « Menu Favoris, Pistes favorites, le tri ajout récent fonctionne mal :
 * >   j'ai mis un favori depuis l'historique, il s'est mis à la fin, puis j'ai
 * >   mis un autre titre de la bibliothèque en favori, il s'est mis au début. »
 *
 * Cause : `getFavorites` reporte la date du CŒUR (`favorites.created_at`) sous
 * `favorite_added_at` sur chaque objet local, mais `dateDe` ne la lisait pas.
 * Une piste locale se rangeait donc d'après le jour où elle est ENTRÉE dans la
 * bibliothèque (`added_at`) : un titre ancien, aimé à l'instant depuis
 * l'Historique, partait en fin de « Ajout récent ».
 *
 * Ce témoin passe par le vrai `getFavorites` (fetch simulé, réponses du
 * serveur) puis par le vrai `trierEtFiltrer` de l'écran Favoris.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k),
});

import { getFavorites } from '../api';
import { dateDe, trierEtFiltrer } from '../favorisTriFiltre';

// Pistes LOCALES telles que `GET /library/tracks/{id}` les rend : `added_at`
// en secondes, date d'entrée dans la bibliothèque.
const PISTES: Record<number, Record<string, unknown>> = {
  // Entrée en bibliothèque en 2014, aimée À L'INSTANT depuis l'Historique.
  11: { id: 11, title: 'Ancienne aimée maintenant', artist_name: 'A', added_at: 1418673220 },
  // Entrée en bibliothèque en octobre 2025, aimée en septembre 2026.
  22: { id: 22, title: 'Récente aimée en septembre', artist_name: 'B', added_at: 1759900000 },
};

function repondre(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}


describe('#2052 — « Ajout récent » range une piste locale à la date de son CŒUR', () => {
  it('dateDe préfère la date du favori à celle de l’entrée en bibliothèque', () => {
    const o = { id: 11, title: 'x', added_at: 1418673220, favorite_added_at: '2026-10-09T15:45:00Z' };
    expect(dateDe(o as any)).toBe(Date.parse('2026-10-09T15:45:00Z'));
  });

  it('le favori posé en dernier ouvre la liste, quel que soit l’âge de la piste', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/profiles/1/favorites')) {
        return repondre([
          { item_type: 'track', item_id: 22, created_at: '2026-09-15T10:00:00Z' },
          { item_type: 'track', item_id: 11, created_at: '2026-10-09T15:45:00Z' },
        ]);
      }
      const m = u.match(/\/library\/tracks\/(\d+)/);
      if (m) return repondre(PISTES[Number(m[1])]);
      return repondre({});
    }));

    const f = await getFavorites(1);
    expect(f.tracks).toHaveLength(2);

    // Un favori de service posé entre les deux, daté par Tune.
    const qobuz = {
      id: null, title: 'Qobuz du 1er octobre', source: 'qobuz',
      created_at: '2026-10-01T08:00:00Z', first_seen_at: '2026-10-01T08:00:00Z',
    };

    const recent = trierEtFiltrer([...f.tracks, qobuz] as any[], null, 'recent').map((t) => t.title);
    expect(recent).toEqual([
      'Ancienne aimée maintenant',
      'Qobuz du 1er octobre',
      'Récente aimée en septembre',
    ]);

    const ancien = trierEtFiltrer([...f.tracks, qobuz] as any[], null, 'ancien').map((t) => t.title);
    expect(ancien).toEqual([
      'Récente aimée en septembre',
      'Qobuz du 1er octobre',
      'Ancienne aimée maintenant',
    ]);
  });

  it('sans date de favori (serveur ancien), la piste garde le repli sur `added_at`', () => {
    const vieux = { id: 1, title: 'v', added_at: 1418673220 };
    const neuf = { id: 2, title: 'n', added_at: 1759900000 };
    expect(trierEtFiltrer([vieux, neuf] as any[], null, 'recent').map((t) => t.title)).toEqual(['n', 'v']);
  });
});

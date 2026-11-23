// tune-server-rust#8255 (fil 2600) — Bibliothèque + Qobuz, « Derniers ajouts » :
// les favoris Qobuz passaient TOUS avant les albums locaux. Leur date était
// celle où Tune les avait vus (`first_seen_at`, le jour de l'import), pas
// celle de leur mise en favori chez Qobuz (`created_at`, rempli par le miroir
// avec `favorited_at`). Décision de Bertrand du 22/11 : la date du service.
import { describe, expect, it } from 'vitest';
import { albumsDesFavorisDeService, albumsEtendus } from '../bibliothequeEtendue';
import type { Album } from '../types';

const s = (iso: string) => Date.parse(iso) / 1000;
/** L'import des favoris par le miroir : le même jour pour tous. */
const IMPORT = '2026-11-20T08:00:00Z';

const locaux = [
  { id: 1, title: 'Local 2019', artist_name: 'A', source: 'local', added_at: s('2019-05-01T10:00:00Z') },
  { id: 2, title: 'Local 2024', artist_name: 'B', source: 'local', added_at: s('2024-03-01T10:00:00Z') },
  { id: 3, title: 'Local 2026', artist_name: 'C', source: 'local', added_at: s('2026-11-21T10:00:00Z') },
] as unknown as Album[];

const favoris = [
  { item_type: 'album', service: 'qobuz', service_id: 'q2017', title: 'Qobuz 2017', created_at: '2017-02-01T10:00:00Z', first_seen_at: IMPORT },
  { item_type: 'album', service: 'qobuz', service_id: 'q2022', title: 'Qobuz 2022', created_at: '2022-06-01T10:00:00Z', first_seen_at: IMPORT },
  { item_type: 'album', service: 'qobuz', service_id: 'q2025', title: 'Qobuz 2025', created_at: '2025-09-01T10:00:00Z', first_seen_at: IMPORT },
  // Sans date du service : repli sur la date où Tune l'a vu.
  { item_type: 'album', service: 'qobuz', service_id: 'qvu', title: 'Qobuz sans date', created_at: null, first_seen_at: '2023-01-01T10:00:00Z' },
];

/** Le tri « Derniers ajouts » de LibraryV2 (`sortKey === 'added'`). */
const derniersAjouts = (l: Album[]) =>
  [...l].sort((a, b) => (b.added_at ?? 0) - (a.added_at ?? 0) || String(a.title).localeCompare(String(b.title)));

describe('#8255 — Derniers ajouts, Bibliothèque + Qobuz', () => {
  it('locaux et favoris se rangent ENSEMBLE, sur la date de mise en favori', () => {
    const grille = albumsEtendus(locaux, albumsDesFavorisDeService(favoris as any), true);
    expect(derniersAjouts(grille).map((a) => a.title)).toEqual([
      'Local 2026',
      'Qobuz 2025',
      'Local 2024',
      'Qobuz sans date',
      'Qobuz 2022',
      'Local 2019',
      'Qobuz 2017',
    ]);
  });

  it('sans date du service, la date où Tune a vu le favori', () => {
    const [a] = albumsDesFavorisDeService([favoris[3]] as any);
    expect(a.added_at).toBe(s('2023-01-01T10:00:00Z'));
  });
});

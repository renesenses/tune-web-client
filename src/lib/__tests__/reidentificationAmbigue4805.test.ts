/**
 * #4805 D (décision de Bertrand du 05/10/2026) — « Ré-identifier » suit la
 * règle du choix sûr. Quand plusieurs éditions se valent, le serveur rend
 * `verdict: "ambiguous"`, n'écrit RIEN et liste les `candidates`.
 *
 * Avant : le geste ne connaissait pas ce verdict et tombait dans la branche
 * du succès — « identifié comme  (0/2 pistes) », un mensonge. Trois témoins :
 *  1. l'ambiguïté se DIT, sans message de succès ;
 *  2. chaque candidat (trois au plus) offre « Choisir », qui relance avec
 *     `release_id` ;
 *  3. les clés existent dans les onze langues.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const reidentifyAlbum = vi.fn<(id: number, release?: string) => Promise<any>>();
const success = vi.fn<(m: string) => void>();
const info = vi.fn<(m: string, d?: number) => number>(() => 1);
const withAction = vi.fn<(m: string, l: string, run: () => void, d?: number) => void>();

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  reidentifyAlbum: (id: number, release?: string) => reidentifyAlbum(id, release),
}));
vi.mock('../stores/notifications', () => ({
  notifications: {
    success: (m: string) => success(m),
    error: () => {},
    info: (m: string, d?: number) => info(m, d),
    withAction: (m: string, l: string, run: () => void, d?: number) => withAction(m, l, run, d),
    dismiss: () => {},
  },
}));

import { reidentifierAlbum } from '../gestesObjet';

const candidat = (release_id: string, title: string, year: number, track_count: number) => ({
  release_id,
  title,
  artist: 'Various Artists',
  score: 100,
  year,
  country: 'FR',
  track_count,
});

describe('Ré-identifier : verdict ambiguous (#4805 D)', () => {
  beforeEach(() => {
    reidentifyAlbum.mockReset();
    success.mockReset();
    info.mockClear();
    withAction.mockReset();
  });

  it('le dit, propose les éditions, et le choix relance avec release_id', async () => {
    reidentifyAlbum.mockResolvedValueOnce({
      album_id: 2,
      verdict: 'ambiguous',
      reason: 'albums_concurrents',
      tracks_total: 26,
      searched_title: 'Buddha-Bar',
      candidates: [
        candidat('id-xxiv', 'Buddha‐Bar XXIV', 2022, 31),
        candidat('id-ocean', 'Buddha-Bar: Ocean', 2008, 12),
        candidat('id-perc', 'Buddha-Bar: Perception', 2007, 10),
        candidat('id-4', 'Buddha-Bar XXIII', 2021, 31),
      ],
    });

    const change = await reidentifierAlbum(2);

    expect(change).toBe(false);
    expect(success).not.toHaveBeenCalled();
    expect(info.mock.calls.some(([m]) => m.includes('Buddha-Bar'))).toBe(true);
    // Trois au plus.
    expect(withAction).toHaveBeenCalledTimes(3);
    expect(withAction.mock.calls[1][0]).toContain('Buddha-Bar: Ocean');
    expect(withAction.mock.calls[1][0]).toContain('2008');

    reidentifyAlbum.mockResolvedValueOnce({
      album_id: 2,
      verdict: 'reidentified',
      source: 'choix_utilisateur',
      release_title: 'Buddha-Bar: Ocean',
      tracks_total: 12,
      tracks_matched: 12,
    });
    withAction.mock.calls[1][2]();
    await vi.waitFor(() => expect(reidentifyAlbum).toHaveBeenLastCalledWith(2, 'id-ocean'));
    await vi.waitFor(() => expect(success).toHaveBeenCalledTimes(1));
  });

  it('les clés existent dans les onze langues', () => {
    const dossier = new URL('../locales/', import.meta.url);
    const langues = readdirSync(dossier).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    expect(langues.length).toBe(11);
    for (const f of langues) {
      const texte = readFileSync(new URL(f, dossier), 'utf8');
      for (const cle of ['library.reidentifyAmbiguous', 'library.reidentifyChoose', 'library.reidentifyTracks']) {
        expect(texte, `${cle} absente de ${f}`).toContain(`"${cle}"`);
      }
    }
  });
});

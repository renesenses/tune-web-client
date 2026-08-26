import { describe, it, expect } from 'vitest';
import { deriveRecentlyPlayed, RECENTLY_PLAYED_LIMIT } from './recentlyPlayed';
import type { HistoryEntry } from '../stores/history';
import type { Track } from '../types';

function piste(t: Partial<Track>): Track {
  return { id: null, title: 'Sans titre', ...t } as Track;
}

function ecoute(t: Partial<Track>, playedAt = '2026-08-26T10:00:00Z'): HistoryEntry {
  return { track: piste(t), playedAt, zoneName: 'Salon' };
}

describe('deriveRecentlyPlayed — regroupement par album (comportement existant)', () => {
  it('ne garde qu une tuile pour deux pistes du meme album local', () => {
    const tuiles = deriveRecentlyPlayed([
      ecoute({ id: 2, title: 'Come Together', album_id: 7, album_title: 'Abbey Road' }),
      ecoute({ id: 1, title: 'Something', album_id: 7, album_title: 'Abbey Road' }),
    ]);
    expect(tuiles).toHaveLength(1);
    expect(tuiles[0].id).toBe(7);
    expect(tuiles[0].title).toBe('Abbey Road');
  });

  it('applique le plafond APRES dedoublonnage', () => {
    const historique = Array.from({ length: RECENTLY_PLAYED_LIMIT + 5 }, (_, i) =>
      ecoute({ id: i, title: `Piste ${i}`, album_id: i, album_title: `Album ${i}` }),
    );
    expect(deriveRecentlyPlayed(historique)).toHaveLength(RECENTLY_PLAYED_LIMIT);
  });
});

describe('deriveRecentlyPlayed — le titre reellement ecoute (#2336)', () => {
  it('expose le titre de la piste jouee, en plus du titre de l album', () => {
    // Le reproche de FabienM, fil 1535 : « c'est toujours l'album qui est
    // affiché et non le titre joué ». `title` reste l'album — le regroupement
    // n'est pas remis en cause — mais la piste écoutée doit être récupérable.
    const [tuile] = deriveRecentlyPlayed([
      ecoute({ id: 1, title: 'Something', album_id: 7, album_title: 'Abbey Road' }),
    ]);
    expect(tuile.title).toBe('Abbey Road');
    expect(tuile.playedTitle).toBe('Something');
  });

  it('retient la lecture la plus recente quand plusieurs pistes d un album ont ete jouees', () => {
    // L'historique est du plus récent au plus ancien.
    const [tuile] = deriveRecentlyPlayed([
      ecoute({ id: 2, title: 'Come Together', album_id: 7, album_title: 'Abbey Road' }),
      ecoute({ id: 1, title: 'Something', album_id: 7, album_title: 'Abbey Road' }),
    ]);
    expect(tuile.playedTitle).toBe('Come Together');
  });

  it('ne repete pas le libelle quand la piste n a pas d album — radio, flux', () => {
    // Sans `album_title`, `title` porte déjà le nom de la piste (ou la
    // métadonnée ICY d'une radio) : l'afficher deux fois n'apprend rien.
    const [tuile] = deriveRecentlyPlayed([
      ecoute({ title: 'FIP', source: 'radio', source_id: '42' }),
    ]);
    expect(tuile.title).toBe('FIP');
    expect(tuile.playedTitle).toBeNull();
  });

  it('ne repete pas le libelle quand la piste porte le nom de son album', () => {
    const [tuile] = deriveRecentlyPlayed([
      ecoute({ id: 1, title: 'Tubular Bells', album_id: 3, album_title: 'Tubular Bells' }),
    ]);
    expect(tuile.playedTitle).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { estLaPisteEnLecture } from '../stores/nowPlaying';
import type { NowPlaying } from '../types';

const np = (o: Partial<NowPlaying>): NowPlaying => ({ title: 'x', ...o }) as NowPlaying;

describe('estLaPisteEnLecture', () => {
  it('reconnait la piste de bibliotheque par son identifiant', () => {
    expect(estLaPisteEnLecture({ id: 42 }, 42, np({ track_id: 42 }))).toBe(true);
    expect(estLaPisteEnLecture({ id: 43 }, 42, np({ track_id: 42 }))).toBe(false);
  });

  // Le garde qui evite le defaut le plus visible : sans lui, TOUTES les lignes
  // sans identifiant s'allument en meme temps.
  it('ne surligne aucune piste sans identifiant quand rien ne joue', () => {
    expect(estLaPisteEnLecture({ id: null }, null, null)).toBe(false);
    expect(estLaPisteEnLecture({}, null, np({}))).toBe(false);
  });

  it('reconnait une piste en streaming par sa source', () => {
    const t = { source: 'qobuz' as const, source_id: '1234' };
    expect(estLaPisteEnLecture(t, null, np({ source: 'qobuz', source_id: '1234' }))).toBe(true);
  });

  // Deux services peuvent numeroter une piste pareil : la source doit concorder.
  it('ne confond pas deux services au meme identifiant de piste', () => {
    const t = { source: 'qobuz' as const, source_id: '1234' };
    expect(estLaPisteEnLecture(t, null, np({ source: 'tidal', source_id: '1234' }))).toBe(false);
  });

  it('ne surligne rien quand la lecture ne porte ni identifiant ni source', () => {
    const t = { source: 'qobuz' as const, source_id: '1234' };
    expect(estLaPisteEnLecture(t, null, np({ title: 'radio' }))).toBe(false);
    expect(estLaPisteEnLecture(t, null, null)).toBe(false);
  });
});

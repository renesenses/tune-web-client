// @vitest-environment jsdom
/**
 * rc15 — fil 3009 (Fabien) : sur un épisode de podcast, Précédent et Suivant
 * deviennent Reculer et Avancer (15 s et 30 s par défaut, 1 à 99 s réglables),
 * par `POST /zones/{id}/seek/relative`.
 *
 * Témoin rouge sur `main` : `skipNext` / `skipPrevious` appellent
 * `api.next` / `api.previous` quel que soit le contenu, et jamais
 * `api.seekRelative`.
 *
 * Contre-épreuve : un titre de musique garde Précédent et Suivant.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const next = vi.fn();
const previous = vi.fn();
const getZone = vi.fn();
const seekRelative = vi.fn();
vi.mock('../api', () => ({
  next: (...a: unknown[]) => next(...a),
  previous: (...a: unknown[]) => previous(...a),
  getZone: (...a: unknown[]) => getZone(...a),
  seekRelative: (...a: unknown[]) => seekRelative(...a),
}));

const browserSeek = vi.fn();
const browserPositionMsPour = vi.fn();
vi.mock('../stores/browserAudio', () => ({
  browserSeek: (...a: unknown[]) => browserSeek(...a),
  browserPositionMsPour: (...a: unknown[]) => browserPositionMsPour(...a),
  browserPlay: vi.fn(),
  browserPause: vi.fn(),
  isBrowserZone: (z: { output_type?: string } | null) => z?.output_type === 'browser',
}));

import { zones } from '../stores/zones';
import { preferences } from '../stores/preferences';
import { skipNext, skipPrevious } from '../playback-controls';

const EPISODE = { title: 'Épisode 42', source: 'podcast', source_id: 'https://cdn.example/ep42.mp3', duration_ms: 3_600_000 };
const MORCEAU = { title: 'So What', source: 'local', track_id: 12, duration_ms: 545_000 };

function zone(id: number, output_type: string, current_track: unknown) {
  return { id, name: `Zone ${id}`, output_type, state: 'playing', current_track } as never;
}

beforeEach(() => {
  for (const f of [next, previous, getZone, seekRelative, browserSeek, browserPositionMsPour]) f.mockReset();
  next.mockResolvedValue({ status: 'playing' });
  previous.mockResolvedValue({ status: 'playing' });
  seekRelative.mockResolvedValue({ position_ms: 0 });
  preferences.update((p) => {
    const q = { ...p } as Record<string, unknown>;
    delete q.podcastReculerS;
    delete q.podcastAvancerS;
    return q as never;
  });
});

describe('épisode de podcast : Reculer / Avancer (fil 3009)', () => {
  it('Suivant avance de 30 s et Précédent recule de 15 s par défaut', async () => {
    const z = zone(3, 'upnp', EPISODE);
    zones.set([z]);
    getZone.mockResolvedValue(z);

    await skipNext(z);
    expect(seekRelative).toHaveBeenCalledWith(3, 30_000, null);
    expect(next).not.toHaveBeenCalled();

    await skipPrevious(z);
    expect(seekRelative).toHaveBeenLastCalledWith(3, -15_000, null);
    expect(previous).not.toHaveBeenCalled();
  });

  it('suit les secondes réglées dans le profil', async () => {
    const z = zone(3, 'upnp', EPISODE);
    zones.set([z]);
    preferences.update((p) => ({ ...p, podcastReculerS: 10, podcastAvancerS: 45 }) as never);

    await skipPrevious(z);
    expect(seekRelative).toHaveBeenCalledWith(3, -10_000, null);
    await skipNext(z);
    expect(seekRelative).toHaveBeenLastCalledWith(3, 45_000, null);
  });

  it('une zone navigateur part de la position de l’onglet et s’y déplace', async () => {
    const z = zone(7, 'browser', EPISODE);
    zones.set([z]);
    browserPositionMsPour.mockReturnValue(120_000);
    seekRelative.mockResolvedValue({ position_ms: 150_000 });

    await skipNext(z);
    expect(seekRelative).toHaveBeenCalledWith(7, 30_000, 120_000);
    expect(browserSeek).toHaveBeenCalledWith(150_000);
  });
});

describe('contre-épreuve : la musique garde Précédent et Suivant', () => {
  it('un titre de musique passe au suivant et au précédent, sans saut relatif', async () => {
    const z = zone(3, 'upnp', MORCEAU);
    zones.set([z]);
    getZone.mockResolvedValue(z);

    await skipNext(z);
    expect(next).toHaveBeenCalledWith(3);
    await skipPrevious(z);
    expect(previous).toHaveBeenCalled();
    expect(seekRelative).not.toHaveBeenCalled();
  });
});

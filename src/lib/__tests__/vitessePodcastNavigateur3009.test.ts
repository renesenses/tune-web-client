// @vitest-environment jsdom
/**
 * rc15 — fil 3009 : la vitesse de lecture d'un épisode de podcast sur la
 * sortie NAVIGATEUR. L'élément `<audio>` étire le temps en gardant la hauteur
 * (`preservesPitch`) ; un titre de musique reste à 1.
 *
 * Témoin rouge sur `main` : l'élément reste à `playbackRate = 1` quel que
 * soit le réglage.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

class FauxAudio extends EventTarget {
  src = '';
  muted = false;
  volume = 1;
  currentTime = 0;
  readyState = 0;
  playbackRate = 1;
  defaultPlaybackRate = 1;
  preservesPitch = false;
  crossOrigin: string | null = null;
  preload = '';
  load() {}
  play() { return Promise.resolve(); }
  pause() {}
}
let element: FauxAudio | null = null;

beforeAll(() => {
  vi.stubGlobal('Audio', function () {
    element = new FauxAudio();
    return element;
  });
});

import { zones } from '../stores/zones';
import { preferences } from '../stores/preferences';
import { browserPlay } from '../stores/browserAudio';

const EPISODE = { title: 'Épisode 42', source: 'podcast', duration_ms: 3_600_000 };
const MORCEAU = { title: 'So What', source: 'local', track_id: 12, duration_ms: 545_000 };

describe('vitesse de lecture sur la sortie navigateur (fil 3009)', () => {
  it('un épisode joue à la vitesse du profil, hauteur conservée ; la musique reste à 1', async () => {
    preferences.update((p) => ({ ...p, podcastVitesse: 1.3 }) as never);
    zones.set([{ id: 7, name: 'Cet ordinateur', output_type: 'browser', state: 'playing', current_track: EPISODE } as never]);

    browserPlay('/stream/abc.mp3', true, 7);
    expect(element).not.toBeNull();
    // Le magasin des préférences est chargé à la demande par l'élément.
    await vi.waitFor(() => expect(element!.playbackRate).toBe(1.3));
    expect(element!.defaultPlaybackRate).toBe(1.3);
    expect(element!.preservesPitch).toBe(true);

    // Réglage changé en cours d'écoute : appliqué tout de suite.
    preferences.update((p) => ({ ...p, podcastVitesse: 0.8 }) as never);
    expect(element!.playbackRate).toBe(0.8);

    // Contre-épreuve : la zone passe à un titre de musique.
    zones.set([{ id: 7, name: 'Cet ordinateur', output_type: 'browser', state: 'playing', current_track: MORCEAU } as never]);
    expect(element!.playbackRate).toBe(1);
  });
});

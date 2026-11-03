// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api';
import { zones, currentZoneId, resumeListeningAndSync } from '../stores/zones';
import { browserPlay, browserAudioDestroy } from '../stores/browserAudio';
import { stopSeekTimer } from '../stores/nowPlaying';
vi.mock('../api', async (original) => ({ ...await original<typeof import('../api')>(), resumeListening: vi.fn() }));
class AudioTemoin extends EventTarget {
  static instances: AudioTemoin[] = [];
  src = ''; crossOrigin = ''; preload = ''; volume = 1; muted = false;
  currentTime = 0; duration = 300; readyState = 4; paused = true;
  constructor() { super(); AudioTemoin.instances.push(this); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() { this.currentTime = 0; }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
}
const zone = { id: 27, name: 'Cet ordinateur', output_type: 'browser', state: 'playing', position_ms: 42000, stream_url: '/stream/reprise', output_sent: false };
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  vi.stubGlobal('Audio', AudioTemoin); AudioTemoin.instances = [];
  zones.set([zone] as any); currentZoneId.set(27);
  vi.mocked(api.resumeListening).mockResolvedValue(zone);
});
afterEach(() => { browserAudioDestroy(); stopSeekTimer(); vi.unstubAllGlobals(); });
describe('reprise à la position sur la sortie navigateur #7280', () => {
  it('déplace réellement l’élément après ses métadonnées, par la seule clé opaque', async () => {
    await resumeListeningAndSync(27, 'titre-seul');
    expect(api.resumeListening).toHaveBeenCalledExactlyOnceWith(27, 'titre-seul');
    const audio = AudioTemoin.instances.at(-1)!;
    expect(audio).toBeDefined();
    expect(audio.currentTime).toBe(0);
    audio.dispatchEvent(new Event('loadedmetadata'));
    expect(audio.currentTime, 'le titre seul doit repartir à 42 s, pas à zéro').toBe(42);
  });
  it('une autre lecture rend caduc le déplacement en attente', async () => {
    await resumeListeningAndSync(27, 'titre-seul');
    const audio = AudioTemoin.instances.at(-1)!;
    browserPlay('/stream/titre-suivant', true, 27);
    audio.dispatchEvent(new Event('loadedmetadata'));
    expect(audio.currentTime).toBe(0);
  });
  it('ne lit jamais ici la sortie navigateur d’un autre appareil', async () => {
    vi.mocked(api.resumeListening).mockResolvedValue({ ...zone, name: 'Ce téléphone' });
    await resumeListeningAndSync(27, 'titre-seul');
    expect(AudioTemoin.instances).toHaveLength(0);
  });
});

// @vitest-environment jsdom
// tune-server-rust#5975 — Alex Campbell, fils forum 2178 et 2246 (Safari 18.6,
// Docker, zone « This computer ») : « Tourist » et la première piste d'une
// playlist ne jouent pas. La cause (`MediaError` 4 ? 2 ? `play()` refusé ?)
// ne vivait que dans la console de Safari : le journal joint au rapport ne
// montrait que la demande du flux, puis le saut à la suivante.
//
// Le lecteur la dit maintenant au serveur (`POST /zones/{id}/browser-error`),
// qui l'écrit à côté de ce qu'il a servi. Vrai lecteur navigateur ; seules
// les frontières HTTP et HTMLAudioElement sont simulées.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api';
import { zones } from '../stores/zones';
import { stopSeekTimer } from '../stores/nowPlaying';
import { browserPlay, browserStop, browserAudioDestroy } from '../stores/browserAudio';
import { oublierErreursSignalees } from '../erreurMediaNavigateur';

vi.mock('../api', async (original) => ({
  ...await original<typeof import('../api')>(),
  getZone: vi.fn(), next: vi.fn(), signalerErreurMediaNavigateur: vi.fn(),
  signalerLectureNavigateur: vi.fn(),
}));

let refusDeLecture: unknown = null;

class AudioTemoin extends EventTarget {
  static instances: AudioTemoin[] = [];
  src = ''; crossOrigin = ''; preload = ''; volume = 1; muted = false;
  currentTime = 0; duration = 300; readyState = 4; paused = true;
  error: { code: number; message?: string } | null = null;
  constructor() { super(); AudioTemoin.instances.push(this); }
  play() {
    if (refusDeLecture) return Promise.reject(refusDeLecture);
    this.paused = false;
    return Promise.resolve();
  }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  load() { this.error = null; }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  echouer(code: number, message = '') {
    this.error = { code, message };
    this.dispatchEvent(new Event('error'));
  }
}

const NAVIGATEUR = {
  id: 12, name: 'This computer', output_type: 'browser', state: 'playing',
  volume: 50, stream_url: '/stream/7d78b538-tourist.m4a', current_track: { id: 1, title: 'Tourist' },
};
const audio = () => AudioTemoin.instances.at(-1)!;
const vider = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const signal = () => vi.mocked(api.signalerErreurMediaNavigateur);

beforeEach(() => {
  vi.clearAllMocks();
  refusDeLecture = null;
  oublierErreursSignalees();
  vi.stubGlobal('Audio', AudioTemoin);
  AudioTemoin.instances = [];
  zones.set([NAVIGATEUR] as any);
  vi.mocked(api.next).mockResolvedValue({ status: 'stopped' } as any);
  vi.mocked(api.getZone).mockResolvedValue(NAVIGATEUR as any);
  signal().mockResolvedValue({ status: 'logged' } as any);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  browserAudioDestroy(); stopSeekTimer();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('#5975 — la cause d’un échec du lecteur navigateur part au journal du serveur', () => {
  it('MediaError 4 : le code, le flux et la zone sont envoyés au serveur', async () => {
    browserPlay(NAVIGATEUR.stream_url, false, NAVIGATEUR.id);
    await vider();
    audio().echouer(4, 'MEDIA_ELEMENT_ERROR: Format error');
    await vider();
    expect(
      signal(),
      'une erreur média sur la zone navigateur ne laisse aucune trace côté serveur : la cause reste dans la console de Safari',
    ).toHaveBeenCalledTimes(1);
    const [zoneId, corps] = signal().mock.calls[0];
    expect(zoneId).toBe(NAVIGATEUR.id);
    expect(corps).toMatchObject({
      stream_id: '7d78b538-tourist', kind: 'media_error', code: 4,
      message: 'MEDIA_ELEMENT_ERROR: Format error',
    });
  });

  it('une rafale d’erreurs sur la même source n’envoie qu’une ligne', async () => {
    browserPlay(NAVIGATEUR.stream_url, false, NAVIGATEUR.id);
    audio().echouer(2);
    audio().echouer(2);
    await vider();
    expect(signal()).toHaveBeenCalledTimes(1);
    expect(signal().mock.calls[0][1]).toMatchObject({ code: 2 });
  });

  it('un play() refusé est envoyé avec son nom (NotAllowedError)', async () => {
    refusDeLecture = Object.assign(new Error('The request is not allowed by the user agent'), {
      name: 'NotAllowedError',
    });
    browserPlay(NAVIGATEUR.stream_url, false, NAVIGATEUR.id);
    await vider();
    expect(signal()).toHaveBeenCalledTimes(1);
    expect(signal().mock.calls[0][1]).toMatchObject({
      kind: 'play_rejected', code: null, stream_id: '7d78b538-tourist',
    });
    expect(signal().mock.calls[0][1].message).toContain('NotAllowedError');
  });

  it('un play() interrompu par un changement de source (AbortError) n’est pas un refus', async () => {
    refusDeLecture = Object.assign(new Error('interrupted by a new load request'), { name: 'AbortError' });
    browserPlay(NAVIGATEUR.stream_url, false, NAVIGATEUR.id);
    await vider();
    expect(signal()).not.toHaveBeenCalled();
  });

  it('une erreur après un arrêt (source vidée) n’envoie rien', async () => {
    browserPlay(NAVIGATEUR.stream_url, false, NAVIGATEUR.id);
    browserStop();
    audio().echouer(4);
    await vider();
    expect(signal()).not.toHaveBeenCalled();
  });

  it('un serveur ancien (rejet) ne gêne pas le saut à la suivante', async () => {
    signal().mockRejectedValue(new Error('404'));
    browserPlay(NAVIGATEUR.stream_url, false, NAVIGATEUR.id);
    audio().echouer(4);
    await vider();
    expect(api.next).toHaveBeenCalledWith(NAVIGATEUR.id);
  });
});

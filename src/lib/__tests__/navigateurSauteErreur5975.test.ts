// @vitest-environment jsdom
// tune-server-rust#5975 — Alex Campbell, fil forum 2178 (1.0.0-rc2 Docker,
// Safari 18.6, zone « This computer ») : « 'tttroys playlist' still fails to
// either player the first track or skip to the next available working track ».
//
// Sur la zone navigateur, une erreur `<audio>` arrêtait la file : le
// gestionnaire `error` ne demandait jamais la piste suivante. Vrai lecteur
// navigateur ; seules les frontières HTTP et HTMLAudioElement sont simulées.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api';
import { zones } from '../stores/zones';
import { stopSeekTimer } from '../stores/nowPlaying';
import {
  browserPlay,
  browserStop,
  browserAudioDestroy,
  MAX_ECHECS_CONSECUTIFS,
} from '../stores/browserAudio';

vi.mock('../api', async (original) => ({
  ...await original<typeof import('../api')>(),
  getZone: vi.fn(), next: vi.fn(),
}));

class AudioTemoin extends EventTarget {
  static instances: AudioTemoin[] = [];
  src = ''; crossOrigin = ''; preload = ''; volume = 1;
  currentTime = 0; duration = 300; readyState = 4; paused = true;
  error: { code: number } | null = null;
  chargements = 0;
  constructor() { super(); AudioTemoin.instances.push(this); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  load() { this.chargements += 1; this.error = null; }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  /** Le navigateur refuse de décoder la source (MEDIA_ERR_SRC_NOT_SUPPORTED). */
  echouer() { this.error = { code: 4 }; this.dispatchEvent(new Event('error')); }
  jouer() { this.dispatchEvent(new Event('playing')); }
}

const NAVIGATEUR = {
  id: 12, name: 'This computer', output_type: 'browser', state: 'playing',
  volume: 50, stream_url: '/stream/session-12', current_track: { id: 1, title: 'Piste 1' },
};
const audio = () => AudioTemoin.instances.at(-1)!;
// Le saut enchaîne deux requêtes : on laisse filer les microtâches.
const vider = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('Audio', AudioTemoin);
  AudioTemoin.instances = [];
  zones.set([NAVIGATEUR] as any);
  vi.mocked(api.next).mockResolvedValue({ status: 'ok' } as any);
  vi.mocked(api.getZone).mockResolvedValue(NAVIGATEUR as any);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  browserPlay(NAVIGATEUR.stream_url, false, NAVIGATEUR.id);
});
afterEach(() => {
  browserAudioDestroy(); stopSeekTimer();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('#5975 — zone navigateur : une piste en échec est sautée', () => {
  it('une erreur de lecture demande la suivante et la charge', async () => {
    const avant = audio().chargements;
    audio().echouer();
    await vider();
    expect(api.next).toHaveBeenCalledWith(NAVIGATEUR.id);
    expect(api.getZone).toHaveBeenCalledWith(NAVIGATEUR.id);
    // Même URL par zone : rechargement forcé, cache-bust compris.
    expect(audio().chargements).toBe(avant + 1);
    expect(audio().src).toContain('_t=');
  });

  it('garde-fou : toutes les pistes en échec, on s’arrête après N sauts', async () => {
    for (let i = 0; i < MAX_ECHECS_CONSECUTIFS + 3; i++) {
      audio().echouer();
      await vider();
    }
    expect(api.next).toHaveBeenCalledTimes(MAX_ECHECS_CONSECUTIFS);
    // L'élément est vidé : plus rien ne relance la série.
    expect(audio().src).toBe('');
  });

  it('une piste qui joue remet le compteur à zéro', async () => {
    for (let i = 0; i < MAX_ECHECS_CONSECUTIFS; i++) {
      audio().echouer();
      await vider();
    }
    audio().jouer();
    audio().echouer();
    await vider();
    expect(api.next).toHaveBeenCalledTimes(MAX_ECHECS_CONSECUTIFS + 1);
  });

  it('fin de file : le serveur s’arrête, on ne recharge rien', async () => {
    vi.mocked(api.next).mockResolvedValue({ status: 'stopped', reason: 'end_of_queue' } as any);
    const avant = audio().chargements;
    audio().echouer();
    await vider();
    expect(api.next).toHaveBeenCalledTimes(1);
    expect(api.getZone).not.toHaveBeenCalled();
    expect(audio().chargements).toBe(avant);
  });

  it('une erreur sans source (après un arrêt) ne fait pas avancer la file', async () => {
    browserStop();
    audio().echouer();
    await vider();
    expect(api.next).not.toHaveBeenCalled();
  });
});

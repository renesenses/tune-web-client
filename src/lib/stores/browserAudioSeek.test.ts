import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';

/**
 * « Le saut déplace vraiment la lecture » : `browserSeek` jetait le saut quand
 * `duration` n'était pas finie (flux continu), et un `playback.seek` venu d'un
 * autre appareil ne touchait pas l'élément <audio>.
 */

type Plage = [number, number];

function fauxAudio() {
  const el: any = {
    src: '',
    currentTime: 0,
    duration: Infinity,
    volume: 1,
    muted: false,
    crossOrigin: '',
    preload: '',
    plages: [] as Plage[],
    addEventListener: vi.fn(),
    removeAttribute: vi.fn(),
    load: vi.fn(),
    pause: vi.fn(),
    play: vi.fn(() => Promise.resolve()),
  };
  Object.defineProperty(el, 'seekable', {
    get() {
      const p: Plage[] = el.plages;
      return { length: p.length, start: (i: number) => p[i][0], end: (i: number) => p[i][1] };
    },
  });
  return el;
}

describe('saut dans le lecteur du navigateur', () => {
  let audio: any;
  let mod: typeof import('./browserAudio');
  let np: typeof import('./nowPlaying');

  beforeEach(async () => {
    vi.resetModules();
    audio = fauxAudio();
    vi.stubGlobal('Audio', function () { return audio; });
    mod = await import('./browserAudio');
    np = await import('./nowPlaying');
    mod.browserPlay('/stream/zone-7.flac', false, 7);
    np.seekPositionMs.set(0);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('saute sur un flux seekable, même à durée infinie', () => {
    audio.plages = [[0, 600]];
    expect(mod.browserSeek(120_000, 7)).toBe(120_000);
    expect(audio.currentTime).toBe(120);
    expect(get(np.seekPositionMs)).toBe(120_000);
  });

  it('sur un flux non seekable : pas de position fausse, position réelle rendue', () => {
    audio.plages = [];
    audio.currentTime = 42;
    expect(mod.browserSeek(120_000, 7)).toBe(42_000);
    expect(audio.currentTime).toBe(42);
    expect(get(np.seekPositionMs)).toBe(42_000);
  });

  it('cible hors des plages : la barre revient à la position réelle', () => {
    audio.plages = [[0, 60]];
    audio.currentTime = 10;
    expect(mod.browserSeek(300_000, 7)).toBe(10_000);
    expect(get(np.seekPositionMs)).toBe(10_000);
  });

  it('ne touche pas l’élément d’une autre zone', () => {
    audio.plages = [[0, 600]];
    expect(mod.browserSeek(120_000, 99)).toBeNull();
    expect(audio.currentTime).toBe(0);
  });

  it('applique un playback.seek venu d’ailleurs', () => {
    audio.plages = [[0, 600]];
    audio.currentTime = 10;
    expect(mod.browserSeekDistant(7, 200_000)).toBe(200_000);
    expect(audio.currentTime).toBe(200);
  });

  it('ignore l’écho (écart < 1,5 s)', () => {
    audio.plages = [[0, 600]];
    audio.currentTime = 100;
    expect(mod.browserSeekDistant(7, 100_900)).toBeNull();
    expect(audio.currentTime).toBe(100);
  });

  it('ignore un playback.seek d’une zone non jouée ici', () => {
    audio.plages = [[0, 600]];
    expect(mod.browserSeekDistant(8, 200_000)).toBeNull();
    expect(audio.currentTime).toBe(0);
  });

  it('playback.seek hors plage : position tenue rendue', () => {
    audio.plages = [];
    audio.currentTime = 30;
    expect(mod.browserSeekDistant(7, 200_000)).toBe(30_000);
    expect(audio.currentTime).toBe(30);
  });
});

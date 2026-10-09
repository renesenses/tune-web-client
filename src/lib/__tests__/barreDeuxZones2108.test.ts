// @vitest-environment jsdom
// Fil forum 2108 (Levente Toth, 1.0.0-rc1 Linux) : « If two zones are playing
// at the same time, Zone 1's play bar is jumping every second forward and
// back ». Zone 1 sort en local, zone 2 sur le navigateur.
//
// Vrai transport V2, vrais stores, vrai lecteur navigateur ; seules les
// frontières WebSocket, HTTP et HTMLAudioElement sont simulées.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import * as api from '../api';
import { demarrerTransportV2 } from '../v2Live';
import { tuneWS } from '../websocket';
import { currentZoneId, zones } from '../stores/zones';
import { seekPositionMs, stopSeekTimer } from '../stores/nowPlaying';
import { browserPlay, browserStopForZone, browserAudioDestroy } from '../stores/browserAudio';

vi.mock('../api', async (original) => ({
  ...await original<typeof import('../api')>(),
  getZones: vi.fn(), getQueue: vi.fn(), getZone: vi.fn(), next: vi.fn(),
}));

class AudioTemoin extends EventTarget {
  static instances: AudioTemoin[] = [];
  src = ''; crossOrigin = ''; preload = ''; volume = 1;
  currentTime = 0; duration = 300; readyState = 4; error = null; paused = true;
  constructor() { super(); AudioTemoin.instances.push(this); }
  play() { this.paused = false; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  load() {}
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  avancer(secondes: number) { this.currentTime = secondes; this.dispatchEvent(new Event('timeupdate')); }
}
class SocketTemoin {
  static OPEN = 1;
  static instances: SocketTemoin[] = [];
  readyState = 1;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor() { SocketTemoin.instances.push(this); }
  send() {} close() {}
  recevoir(type: string, data: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify({ type, data }) });
  }
}

const piste = (id: number) => ({ id, title: `Piste ${id}`, duration_ms: 300_000 });
const LOCALE = { id: 1, name: 'Zone 1', output_type: 'local', state: 'playing', volume: 50, position_ms: 30_000, current_track: piste(101) };
const NAVIGATEUR = { id: 2, name: 'Zone 2', output_type: 'browser', state: 'playing', volume: 50, position_ms: 70_000, stream_url: '/stream/session-2', current_track: piste(202) };

let arreter: (() => void) | undefined;
const audio = () => AudioTemoin.instances.at(-1)!;
const ws = () => SocketTemoin.instances.at(-1)!;
const position = (zoneId: number, ms: number) => ws().recevoir('playback.position', { zone_id: zoneId, position_ms: ms });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('Audio', AudioTemoin);
  vi.stubGlobal('WebSocket', SocketTemoin);
  AudioTemoin.instances = []; SocketTemoin.instances = [];
  zones.set([LOCALE, NAVIGATEUR] as any);
  seekPositionMs.set(0);
  vi.mocked(api.getZones).mockResolvedValue([LOCALE, NAVIGATEUR] as any);
  vi.mocked(api.getQueue).mockResolvedValue({ tracks: [], position: 0, length: 0 } as any);
  vi.mocked(api.next).mockResolvedValue({ status: 'ok' } as any);
  vi.mocked(api.getZone).mockResolvedValue(NAVIGATEUR as any);
  // La zone 2 est lancée dans ce navigateur, puis on regarde la zone 1.
  currentZoneId.set(NAVIGATEUR.id);
  arreter = demarrerTransportV2();
  browserPlay(NAVIGATEUR.stream_url, false, NAVIGATEUR.id);
  currentZoneId.set(LOCALE.id);
  seekPositionMs.set(30_000);
});
afterEach(() => {
  arreter?.(); arreter = undefined;
  tuneWS.disconnect(); browserAudioDestroy(); stopSeekTimer();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('#2108 — deux zones en lecture, la barre de la zone 1 ne suit que la zone 1', () => {
  it('le temps de l’élément audio de la zone 2 n’atteint pas la barre de la zone 1', () => {
    const vues: number[] = [];
    const desabonner = seekPositionMs.subscribe((v) => vues.push(v));
    // Six secondes de lecture simultanée : le serveur annonce la zone 1 chaque
    // seconde, l'élément de la zone 2 publie son temps entre deux.
    for (let s = 1; s <= 6; s++) {
      vi.advanceTimersByTime(500);
      audio().avancer(70 + s);          // zone 2, ~4 fois par seconde en vrai
      vi.advanceTimersByTime(500);
      position(LOCALE.id, 30_000 + s * 1000);
      position(NAVIGATEUR.id, 70_000 + s * 1000);
    }
    desabonner();
    // Jamais la moindre valeur de la zone 2 dans la barre de la zone 1…
    expect(vues.filter((v) => v >= 60_000)).toEqual([]);
    // … et une barre qui n'a fait qu'avancer.
    for (let i = 1; i < vues.length; i++) expect(vues[i]).toBeGreaterThanOrEqual(vues[i - 1]);
    expect(get(seekPositionMs)).toBeGreaterThanOrEqual(35_000);
    expect(get(seekPositionMs)).toBeLessThan(40_000);
  });

  it('la pause de la zone 2 ne fige pas le minuteur de la zone 1', () => {
    position(LOCALE.id, 30_000);
    // Relève de zone : la zone 1 joue, son minuteur tourne.
    ws().recevoir('zone.updated', { zones: [LOCALE, NAVIGATEUR] });
    const avant = get(seekPositionMs);
    audio().pause();
    vi.advanceTimersByTime(2000);
    expect(get(seekPositionMs)).toBeGreaterThanOrEqual(avant + 2000);
  });

  it('l’arrêt de la zone 2 ne fige pas non plus la zone 1', () => {
    ws().recevoir('zone.updated', { zones: [LOCALE, NAVIGATEUR] });
    const avant = get(seekPositionMs);
    expect(browserStopForZone(NAVIGATEUR.id)).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(get(seekPositionMs)).toBeGreaterThanOrEqual(avant + 2000);
  });

  it('la fin de morceau de la zone 2 fait avancer la zone 2, pas la zone affichée', async () => {
    audio().dispatchEvent(new Event('ended'));
    await vi.waitFor(() => expect(api.next).toHaveBeenCalled());
    expect(api.next).toHaveBeenCalledWith(NAVIGATEUR.id);
    expect(api.next).not.toHaveBeenCalledWith(LOCALE.id);
  });

  it('non-régression : la zone navigateur affichée suit toujours son élément audio', () => {
    currentZoneId.set(NAVIGATEUR.id);
    audio().avancer(123);
    expect(get(seekPositionMs)).toBe(123_000);
  });
});

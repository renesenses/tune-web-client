// @vitest-environment jsdom
// Vrai transport V2, vrais stores et vrai lecteur ; seules les frontières
// WebSocket, HTTP et HTMLAudioElement sont simulées (#1171 / serveur #4090).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import * as api from '../api';
import { demarrerTransportV2 } from '../v2Live';
import { tuneWS } from '../websocket';
import { currentZoneId, zones, playAndSync, resumeAndSync } from '../stores/zones';
import { seekPositionMs, stopSeekTimer } from '../stores/nowPlaying';
import {
  browserPlay, browserStop, browserAudioDestroy, browserStopForZone,
  browserStreamUrl, browserAudioPlaying,
} from '../stores/browserAudio';

vi.mock('../api', async (original) => ({
  ...await original<typeof import('../api')>(),
  getZones: vi.fn(), getQueue: vi.fn(), play: vi.fn(), resume: vi.fn(),
  getRadios: vi.fn(), playRadio: vi.fn(),
}));

class AudioTemoin extends EventTarget {
  static instances: AudioTemoin[] = [];
  src = ''; crossOrigin = ''; preload = ''; volume = 1;
  currentTime = 0; duration = 200; readyState = 4; error = null;
  paused = true; pauses = 0; loads = 0;
  constructor() { super(); AudioTemoin.instances.push(this); }
  play() { this.paused = false; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() { this.paused = true; this.pauses++; this.dispatchEvent(new Event('pause')); }
  load() { this.loads++; }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
}
class SocketTemoin {
  static OPEN = 1;
  static instances: SocketTemoin[] = [];
  readyState = 1;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor() { SocketTemoin.instances.push(this); }
  send() {} close() {}
  recevoir(type: string, zoneId?: number) {
    this.onmessage?.({ data: JSON.stringify({ type, data: { zone_id: zoneId } }) });
  }
}
const A = { id: 11, name: 'Navigateur A', output_type: 'browser', state: 'playing', volume: 50, stream_url: '/stream/session-a' };
const B = { ...A, id: 12, name: 'Navigateur B', stream_url: '/stream/session-b' };
const DLNA = { ...A, id: 13, name: 'Salon', output_type: 'dlna', stream_url: undefined };
let arreterTransport: (() => void) | undefined;
let ecran: ReturnType<typeof mount> | undefined;
const audio = () => AudioTemoin.instances.at(-1)!;
const envoyer = (id?: number, type = 'playback.stopped') => SocketTemoin.instances.at(-1)!.recevoir(type, id);
const attendreAudio = () => vi.waitFor(() => expect(get(browserAudioPlaying)).toBe(true));
function demarrer() { arreterTransport = demarrerTransportV2(); }
function differee<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('Audio', AudioTemoin);
  vi.stubGlobal('WebSocket', SocketTemoin);
  AudioTemoin.instances = []; SocketTemoin.instances = [];
  zones.set([A, B, DLNA] as any); currentZoneId.set(A.id); seekPositionMs.set(0);
  // L'arrêt ne doit dépendre ni du succès ni de la fin d'une relecture HTTP.
  vi.mocked(api.getZones).mockRejectedValue(new Error('relecture indisponible'));
  vi.mocked(api.getQueue).mockResolvedValue({ tracks: [], position: 0, length: 0 } as any);
  vi.mocked(api.getRadios).mockResolvedValue([{ id: 71, name: 'Radio témoin', stream_url: 'https://radio.invalid/live', favorite: false }] as any);
});
afterEach(async () => {
  if (ecran) { await unmount(ecran); ecran = undefined; }
  arreterTransport?.(); arreterTransport = undefined;
  tuneWS.disconnect(); browserAudioDestroy(); stopSeekTimer();
  vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = '';
});

describe('arrêt navigateur sous le transport V2', () => {
  it('arrête immédiatement le média, libère sa source et son minuteur malgré une relecture refusée', async () => {
    vi.useFakeTimers(); demarrer(); browserPlay(A.stream_url, false, A.id);
    vi.advanceTimersByTime(1000); expect(get(seekPositionMs)).toBe(1000);
    const lecteur = audio(); const charges = lecteur.loads;
    envoyer(A.id);
    expect(lecteur.paused).toBe(true); expect(lecteur.pauses).toBe(1);
    expect(lecteur.src).toBe(''); expect(lecteur.loads).toBe(charges + 1);
    expect(get(browserStreamUrl)).toBeNull(); expect(get(browserAudioPlaying)).toBe(false);
    await Promise.resolve(); vi.advanceTimersByTime(1000);
    expect(get(seekPositionMs)).toBe(1000);
    expect(api.getZones).toHaveBeenCalled();
    expect(browserStopForZone(A.id)).toBe(false);
  });

  it('suit le propriétaire A même lorsque B est sélectionnée, sans arrêter A pour B ou DLNA', () => {
    demarrer(); browserPlay(A.stream_url, false, A.id); currentZoneId.set(B.id);
    envoyer(B.id); envoyer(DLNA.id); envoyer();
    expect(audio().paused).toBe(false); expect(audio().pauses).toBe(0);
    expect(get(browserStreamUrl)).toBe(A.stream_url);
    envoyer(A.id); expect(audio().paused).toBe(true); expect(get(browserStreamUrl)).toBeNull();
  });

  it('ne traite pas queue.cleared comme un arrêt et ne reçoit plus après démontage', () => {
    demarrer(); browserPlay(A.stream_url, false, A.id);
    envoyer(A.id, 'queue.cleared'); expect(audio().paused).toBe(false);
    arreterTransport!(); arreterTransport = undefined;
    envoyer(A.id); expect(audio().paused).toBe(false); expect(audio().pauses).toBe(0);
  });

  it('ne devine pas le propriétaire après un chargement sans zone, un stop ou une destruction', () => {
    demarrer(); browserPlay(A.stream_url, false, A.id);
    browserPlay('/stream/inconnu'); envoyer(A.id);
    expect(audio().paused).toBe(false);
    browserStop(); browserPlay('/stream/encore-inconnu'); envoyer(A.id);
    expect(audio().paused).toBe(false);
    browserAudioDestroy(); browserPlay('/stream/apres-destruction'); envoyer(A.id);
    expect(audio().paused).toBe(false);
  });

  it('conserve le propriétaire si la source ne change pas, et le remplace sur rechargement forcé', () => {
    demarrer(); browserPlay(A.stream_url, false, A.id);
    const charges = audio().loads;
    browserPlay(A.stream_url, false, B.id);
    expect(audio().loads).toBe(charges);
    envoyer(B.id); expect(audio().paused).toBe(false);
    envoyer(A.id); expect(audio().paused).toBe(true);
    browserPlay(A.stream_url, false, A.id);
    browserPlay(A.stream_url, true, B.id);
    envoyer(A.id); expect(audio().paused).toBe(false);
    envoyer(B.id); expect(audio().paused).toBe(true);
  });

  it('le vrai playAndSync rattache la réponse à A malgré la sélection de B pendant HTTP', async () => {
    const reponse = differee<any>(); vi.mocked(api.play).mockReturnValue(reponse.promise);
    demarrer(); const lecture = playAndSync(A.id);
    currentZoneId.set(B.id); reponse.resolve(A); await lecture; await attendreAudio();
    envoyer(B.id); expect(audio().paused).toBe(false);
    envoyer(A.id); expect(audio().paused).toBe(true);
  });

  it('le vrai resumeAndSync transmet la zone de la source rechargée', async () => {
    vi.mocked(api.resume).mockResolvedValue(B as any);
    demarrer(); browserPlay(A.stream_url, false, A.id); audio().readyState = 0;
    await resumeAndSync(B.id);
    envoyer(A.id); expect(audio().paused).toBe(false);
    envoyer(B.id); expect(audio().paused).toBe(true);
  });

  it('le bouton réel RadiosV2 conserve A capturée avant la réponse lorsque B est sélectionnée', async () => {
    const reponse = differee<any>(); vi.mocked(api.playRadio).mockReturnValue(reponse.promise);
    demarrer(); const cible = document.createElement('div'); document.body.append(cible);
    ecran = mount(RadiosV2, { target: cible }); flushSync();
    await vi.waitFor(() => expect(cible.querySelector('button.ouvrir')).not.toBeNull());
    (cible.querySelector('button.ouvrir') as HTMLButtonElement).click();
    expect(api.playRadio).toHaveBeenCalledWith(71, A.id);
    currentZoneId.set(B.id); flushSync(); reponse.resolve({ stream_url: A.stream_url });
    await attendreAudio();
    envoyer(B.id); expect(audio().paused).toBe(false);
    envoyer(A.id); expect(audio().paused).toBe(true);
  });
});

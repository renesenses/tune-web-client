// @vitest-environment jsdom
// rc4 — une zone navigateur ne se joue que sur l'appareil qui l'a créée.
// 10/10/2026, .18 : la zone « Ce téléphone » de l'app iOS (zone 25) était
// affichée par un Safari du réseau local, qui l'a jouée lui-même et a vidé le
// flux en 337 ms ; l'iPhone, arrivé 2 s plus tard, n'a rien reçu.
// Vrai transport V2, vrais stores, vrai lecteur ; seules les frontières
// WebSocket, HTTP et HTMLAudioElement sont simulées.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import * as api from '../api';
import { demarrerTransportV2 } from '../v2Live';
import { tuneWS } from '../websocket';
import { currentZoneId, zones, playAndSync, resumeAndSync } from '../stores/zones';
import { stopSeekTimer } from '../stores/nowPlaying';
import { browserAudioDestroy, browserStreamUrl } from '../stores/browserAudio';
import {
  estZoneDeCetAppareil, estZoneJouableIci, retenirZoneDeCetAppareil, zonesRetenues,
} from '../zoneNavigateurProprietaire';

vi.mock('../api', async (original) => ({
  ...await original<typeof import('../api')>(),
  getZones: vi.fn(), getQueue: vi.fn(), play: vi.fn(), resume: vi.fn(),
}));

class AudioTemoin extends EventTarget {
  static instances: AudioTemoin[] = [];
  src = ''; crossOrigin = ''; preload = ''; volume = 1;
  currentTime = 0; duration = 200; readyState = 4; error = null;
  paused = true; loads = 0;
  constructor() { super(); AudioTemoin.instances.push(this); }
  play() { this.paused = false; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
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

// La zone de l'iPhone, telle que le .18 la sert (renommée, sans propriétaire).
const TELEPHONE = {
  id: 25, name: 'iPhone', output_type: 'browser', output_device_id: null,
  state: 'playing', volume: 50, stream_url: '/stream/session-telephone.flac',
};
// La zone que CE navigateur a créée.
const MIENNE = { ...TELEPHONE, id: 15, name: 'Safari', stream_url: '/stream/session-mienne.flac' };

let arreterTransport: (() => void) | undefined;
const envoyer = (id: number, type: string) => SocketTemoin.instances.at(-1)!.recevoir(type, id);
const rienNeJoue = () => AudioTemoin.instances.every((a) => a.paused && a.loads === 0);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal('Audio', AudioTemoin);
  vi.stubGlobal('WebSocket', SocketTemoin);
  AudioTemoin.instances = []; SocketTemoin.instances = [];
  zones.set([MIENNE, TELEPHONE] as any);
  currentZoneId.set(TELEPHONE.id);
  vi.mocked(api.getZones).mockResolvedValue([MIENNE, TELEPHONE] as any);
  vi.mocked(api.getQueue).mockResolvedValue({ tracks: [], position: 0, length: 0 } as any);
});
afterEach(() => {
  arreterTransport?.(); arreterTransport = undefined;
  tuneWS.disconnect(); browserAudioDestroy(); stopSeekTimer();
  vi.unstubAllGlobals(); localStorage.clear();
});

describe('zone navigateur d\'un autre appareil : affichée, pilotée, jamais jouée ici', () => {
  it('un playback.started du serveur sur la zone du téléphone ne charge rien dans ce navigateur', async () => {
    retenirZoneDeCetAppareil(MIENNE.id);
    arreterTransport = demarrerTransportV2();
    envoyer(TELEPHONE.id, 'playback.started');
    await vi.waitFor(() => expect(api.getZones).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(rienNeJoue()).toBe(true);
    expect(get(browserStreamUrl)).toBeNull();
  });

  it('la même annonce sur la zone de CE navigateur la joue toujours', async () => {
    retenirZoneDeCetAppareil(MIENNE.id);
    currentZoneId.set(MIENNE.id);
    arreterTransport = demarrerTransportV2();
    envoyer(MIENNE.id, 'playback.started');
    await vi.waitFor(() => expect(get(browserStreamUrl)).toBe(MIENNE.stream_url));
  });

  it('piloter la zone du téléphone (Lecture, Reprise) depuis ce navigateur ne la joue pas ici', async () => {
    retenirZoneDeCetAppareil(MIENNE.id);
    vi.mocked(api.play).mockResolvedValue(TELEPHONE as any);
    vi.mocked(api.resume).mockResolvedValue(TELEPHONE as any);
    await playAndSync(TELEPHONE.id);
    await resumeAndSync(TELEPHONE.id);
    await new Promise((r) => setTimeout(r, 20));
    expect(api.play).toHaveBeenCalled();
    expect(api.resume).toHaveBeenCalled();
    expect(rienNeJoue()).toBe(true);
  });

  it('piloter SA zone depuis ce navigateur la joue', async () => {
    retenirZoneDeCetAppareil(MIENNE.id);
    vi.mocked(api.play).mockResolvedValue(MIENNE as any);
    await playAndSync(MIENNE.id);
    await vi.waitFor(() => expect(get(browserStreamUrl)).toBe(MIENNE.stream_url));
  });
});

describe('à qui appartient une zone navigateur', () => {
  it('retient les zones créées ici, et elles seules', () => {
    expect(zonesRetenues()).toBeNull();
    retenirZoneDeCetAppareil(MIENNE.id);
    retenirZoneDeCetAppareil(MIENNE.id);
    expect(zonesRetenues()).toEqual([MIENNE.id]);
    expect(estZoneDeCetAppareil(MIENNE)).toBe(true);
    expect(estZoneDeCetAppareil(TELEPHONE)).toBe(false);
  });

  it('une zone qui ne sort pas sur le navigateur n\'est jamais jouable ici', () => {
    retenirZoneDeCetAppareil(8);
    expect(estZoneJouableIci({ id: 8, name: 'Salon', output_type: 'dlna' })).toBe(false);
    expect(estZoneJouableIci(null)).toBe(false);
  });

  it('avant toute retenue, seule la zone au nom du web reste jouable (suffixe d\'IP compris)', () => {
    expect(estZoneJouableIci({ id: 15, name: 'Cet ordinateur', output_type: 'browser' })).toBe(true);
    expect(estZoneJouableIci({ id: 16, name: 'This computer (192.168.1.20)', output_type: 'browser' })).toBe(true);
    expect(estZoneJouableIci({ id: 17, name: 'Dieser Computer', output_type: 'browser' })).toBe(true);
    expect(estZoneJouableIci(TELEPHONE)).toBe(false);
    expect(estZoneJouableIci({ ...TELEPHONE, name: 'Ce téléphone (192.168.1.40)' })).toBe(false);
  });

  it('dès qu\'une zone est retenue, le repli par le nom cesse', () => {
    retenirZoneDeCetAppareil(MIENNE.id);
    expect(estZoneJouableIci({ id: 99, name: 'Cet ordinateur', output_type: 'browser' })).toBe(false);
  });

  it('un stockage illisible ne fait pas planter : on retombe sur le repli', () => {
    localStorage.setItem('tune.zonesNavigateurDeCetAppareil', '{pas du json');
    expect(zonesRetenues()).toBeNull();
    expect(estZoneJouableIci({ id: 15, name: 'Cet ordinateur', output_type: 'browser' })).toBe(true);
  });
});

// @vitest-environment jsdom
// web#2144 — Bilou, fil 2252 (rc4, Windows) : une zone navigateur créée avant
// la rc4 ne jouait plus rien, sans un mot. Depuis cdf7e978, ce navigateur ne lit
// que les zones qu'il a retenues, ou, s'il n'en a retenu aucune, celles au nom
// du web (« Cet ordinateur »). Une zone RENOMMÉE devenait muette.
// La correction ne rejoue pas toute zone navigateur (le vol du flux d'un
// téléphone que cdf7e978 empêchait reste empêché) : elle le DIT et propose
// « La jouer sur cet appareil », qui revendique la zone et lance le flux.
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
import { notifications } from '../stores/notifications';
import { estZoneJouableIci, retenirZoneDeCetAppareil, zonesRetenues } from '../zoneNavigateurProprietaire';
import { oublierMessagesZoneAilleurs } from '../zoneNavigateurRevendication';

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

// La zone de Bilou : créée avant la rc4 (« Cet ordinateur »), puis renommée.
const RENOMMEE = {
  id: 18, name: 'Bureau', output_type: 'browser', output_device_id: null,
  state: 'playing', volume: 50, stream_url: '/stream/session-bureau.flac',
};
// Une zone d'un autre appareil, que ce navigateur affiche aussi.
const TELEPHONE = { ...RENOMMEE, id: 25, name: 'iPhone', stream_url: '/stream/session-telephone.flac' };

let arreterTransport: (() => void) | undefined;
const envoyer = (id: number, type: string) => SocketTemoin.instances.at(-1)!.recevoir(type, id);
const rienNeJoue = () => AudioTemoin.instances.every((a) => a.paused && a.loads === 0);
const messages = () => get(notifications);
const messageDeRevendication = () => messages().find((n) => n.action);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  oublierMessagesZoneAilleurs();
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.stubGlobal('Audio', AudioTemoin);
  vi.stubGlobal('WebSocket', SocketTemoin);
  AudioTemoin.instances = []; SocketTemoin.instances = [];
  zones.set([RENOMMEE, TELEPHONE] as any);
  currentZoneId.set(RENOMMEE.id);
  vi.mocked(api.getZones).mockResolvedValue([RENOMMEE, TELEPHONE] as any);
  vi.mocked(api.getQueue).mockResolvedValue({ tracks: [], position: 0, length: 0 } as any);
  vi.mocked(api.play).mockResolvedValue(RENOMMEE as any);
  vi.mocked(api.resume).mockResolvedValue(RENOMMEE as any);
});
afterEach(() => {
  arreterTransport?.(); arreterTransport = undefined;
  tuneWS.disconnect(); browserAudioDestroy(); stopSeekTimer();
  vi.unstubAllGlobals(); localStorage.clear();
});

describe('web#2144 : une zone navigateur renommée avant la rc4 n\'est plus muette en silence', () => {
  it('témoin : renommée, rien de retenu → la lecture le DIT et propose de la jouer ici', async () => {
    expect(zonesRetenues()).toBeNull();
    expect(estZoneJouableIci(RENOMMEE)).toBe(false);
    await playAndSync(RENOMMEE.id);
    const m = messageDeRevendication();
    expect(m).toBeDefined();
    expect(m!.message).toContain('Bureau');
    // Rien n'a été joué d'office.
    expect(rienNeJoue()).toBe(true);
  });

  it('« La jouer sur cet appareil » revendique la zone et lance son flux', async () => {
    await playAndSync(RENOMMEE.id);
    messageDeRevendication()!.action!.run();
    expect(zonesRetenues()).toEqual([RENOMMEE.id]);
    expect(estZoneJouableIci(RENOMMEE)).toBe(true);
    await vi.waitFor(() => expect(get(browserStreamUrl)).toBe(RENOMMEE.stream_url));
  });

  it('une fois revendiquée, la lecture suivante joue ici sans rien demander', async () => {
    retenirZoneDeCetAppareil(RENOMMEE.id);
    await playAndSync(RENOMMEE.id);
    await vi.waitFor(() => expect(get(browserStreamUrl)).toBe(RENOMMEE.stream_url));
    expect(messageDeRevendication()).toBeUndefined();
  });

  it('la Reprise le dit aussi', async () => {
    await resumeAndSync(RENOMMEE.id);
    expect(messageDeRevendication()).toBeDefined();
    expect(rienNeJoue()).toBe(true);
  });

  it('un même lancement (API puis playback.started) ne montre qu\'un message', async () => {
    arreterTransport = demarrerTransportV2();
    await playAndSync(RENOMMEE.id);
    envoyer(RENOMMEE.id, 'playback.started');
    await vi.waitFor(() => expect(api.getZones).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(messages().filter((n) => n.action)).toHaveLength(1);
  });

  it('un playback.started sur la zone choisie ici, non jouée ici, le dit', async () => {
    arreterTransport = demarrerTransportV2();
    envoyer(RENOMMEE.id, 'playback.started');
    await vi.waitFor(() => expect(messageDeRevendication()).toBeDefined());
    expect(rienNeJoue()).toBe(true);
  });
});

describe('web#2144 : le téléphone n\'est toujours pas volé (cdf7e978)', () => {
  it('une zone d\'un autre appareil n\'est jamais jouée d\'office, même avec le message', async () => {
    retenirZoneDeCetAppareil(99);
    vi.mocked(api.play).mockResolvedValue(TELEPHONE as any);
    await playAndSync(TELEPHONE.id);
    await new Promise((r) => setTimeout(r, 20));
    expect(rienNeJoue()).toBe(true);
    expect(get(browserStreamUrl)).toBeNull();
  });

  it('un playback.started sur une zone affichée mais NON choisie ici ne dit rien', async () => {
    retenirZoneDeCetAppareil(99);
    arreterTransport = demarrerTransportV2();
    envoyer(TELEPHONE.id, 'playback.started');
    await vi.waitFor(() => expect(api.getZones).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(messageDeRevendication()).toBeUndefined();
    expect(rienNeJoue()).toBe(true);
  });

  it('une zone qui n\'est pas navigateur ne déclenche aucun message', async () => {
    const salon = { ...RENOMMEE, id: 7, name: 'Salon', output_type: 'dlna' };
    vi.mocked(api.play).mockResolvedValue(salon as any);
    await playAndSync(salon.id);
    expect(messageDeRevendication()).toBeUndefined();
  });
});

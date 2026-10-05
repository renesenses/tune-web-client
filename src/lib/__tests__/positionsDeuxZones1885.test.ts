// @vitest-environment jsdom
// web#1885 (Levente Toth, 1.0.0-rc1 Linux, fil 2108, ticket 219) : deux zones
// jouent, la carte de la zone COURANTE et la barre du bas sautent « en avant
// et en arrière chaque seconde ». Captures : 0:13 puis 0:47 en 4 s sur la zone
// Fosi (locale, zone 5), pendant que la zone « Mac » (navigateur, zone 17)
// avance normalement, 0:12 puis 0:16.
//
// Ce banc établit la cause sur les DEUX horloges de l'Accueil :
//  - la carte de la zone courante lit `seekPositionMs` (celle de la barre) ;
//  - les cartes des autres zones lisent `positionsZones` (lib/positionsZones).
// Il rejoue le geste du testeur — l'onglet est aussi le lecteur de la zone
// navigateur — avec ses chiffres, et mesure ce que chaque carte afficherait.
//
// Cause : l'élément <audio> de la zone navigateur publiait son `currentTime`
// dans `seekPositionMs` quelle que soit la zone affichée ; le `playback.position`
// de la zone courante la ramenait (seuil de dérive 2 s). Correctif livré par
// web#1887 (fil 2108), contenu dans v1.0.0-rc2. Contre-épreuve : avec le
// `stores/browserAudio.ts` de la rc1, le premier test échoue.
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
import { browserPlay, browserAudioDestroy } from '../stores/browserAudio';
import { positionsZones } from '../positionsZones';

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

const LOCALE = {
  id: 5, name: 'Fosi Audio SK02, USB Audio', output_type: 'local', state: 'playing', volume: 50,
  position_ms: 13_000, current_track: { id: 2436, title: 'Hands', duration_ms: 235_000 },
};
const NAVIGATEUR = {
  id: 17, name: 'Mac', output_type: 'browser', state: 'playing', volume: 50, position_ms: 12_000,
  stream_url: '/stream/session-17', current_track: { id: 1717, title: 'Fugitive', duration_ms: 223_000 },
};

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
  seekPositionMs.set(13_000);
});
afterEach(() => {
  arreter?.(); arreter = undefined;
  tuneWS.disconnect(); browserAudioDestroy(); stopSeekTimer();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('#1885 — deux zones en lecture : chaque carte de l’Accueil ne suit que sa zone', () => {
  it('le temps de l’élément audio de la zone Mac n’atteint ni la carte courante ni la barre', () => {
    const courante: number[] = [];
    const autres: Record<number, number>[] = [];
    const d1 = seekPositionMs.subscribe((v) => courante.push(v));
    const d2 = positionsZones.subscribe((t) => autres.push({ ...t }));
    // Quatre secondes, comme entre les deux captures. L'élément de l'onglet
    // publie un temps qui n'est pas celui de la zone 5 (47 s) ; le serveur
    // annonce chaque zone une fois par seconde.
    for (let s = 1; s <= 4; s++) {
      vi.advanceTimersByTime(500);
      audio().avancer(46 + s);
      vi.advanceTimersByTime(500);
      position(LOCALE.id, 13_000 + s * 1000);
      position(NAVIGATEUR.id, 12_000 + s * 1000);
    }
    d1(); d2();
    // Carte de la zone courante (= barre du bas) : jamais une valeur de l'onglet…
    expect(courante.filter((v) => v >= 40_000)).toEqual([]);
    // … et une progression qui ne recule jamais.
    for (let i = 1; i < courante.length; i++) expect(courante[i]).toBeGreaterThanOrEqual(courante[i - 1]);
    expect(get(seekPositionMs)).toBeGreaterThanOrEqual(16_000);
    expect(get(seekPositionMs)).toBeLessThan(19_000);
    // Carte de la zone Mac : son horloge vient du serveur, pas de l'onglet.
    const mac = autres.map((t) => t[NAVIGATEUR.id]).filter((v) => v != null);
    expect(mac.length, 'positionsZones n’a rien publié pour la zone Mac — témoin sans objet').toBeGreaterThan(0);
    expect(mac.filter((v) => v >= 40_000)).toEqual([]);
  });

  it('positionsZones : la position annoncée d’une zone ne s’écrit pas dans l’autre', () => {
    const tables: Record<number, number>[] = [];
    const d = positionsZones.subscribe((t) => tables.push({ ...t }));
    position(NAVIGATEUR.id, 47_000);
    position(LOCALE.id, 14_000);
    d();
    const derniere = tables.at(-1)!;
    expect(derniere[NAVIGATEUR.id]).toBe(47_000);
    expect(derniere[LOCALE.id]).toBe(14_000);
    // Et la barre de la zone courante n'a pas pris la position de la zone Mac.
    expect(get(seekPositionMs)).toBeLessThan(40_000);
  });
});

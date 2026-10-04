// @vitest-environment jsdom
//
// Fil forum 2129 (Pierre, 04/10/2026, Safari 27, serveur sur NAS Synology) :
// « when on play screen, moving the sound bar up & down is creating
// instability ».
//
// Le serveur Rust émet `playback.volume` avec `{ volume, zone_id }`
// (`tune-core/src/playback/mod.rs`, `set_volume` ; `routes/ws.rs` ajoute
// `zone_id`). Le client n'avait de branche que pour `zone.volume_changed`, que
// le serveur n'émet jamais : chaque pas de curseur tombait dans la branche
// générique `playback.*` et relisait TOUTES les zones (`GET /zones`).
//
// Ces témoins passent par les frontières réelles : un vrai WebSocket simulé,
// un vrai `fetch` simulé, et on compte les requêtes parties.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { demarrerTransportV2 } from '../v2Live';
import { tuneWS } from '../websocket';
import { zones, currentZoneId } from '../stores/zones';
import { stopSeekTimer } from '../stores/nowPlaying';
import { queueTracks, queuePosition } from '../stores/queue';
import { creerLimiteurVolume } from '../limiteurVolume';

class SocketTemoin {
  static OPEN = 1;
  static instances: SocketTemoin[] = [];
  readyState = 1;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor() { SocketTemoin.instances.push(this); }
  send() {} close() {} addEventListener() {} removeEventListener() {}
  recevoir(type: string, data: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify({ type, data }) });
  }
}

const SALON = { id: 1, name: 'Salon', state: 'playing', online: true, volume: 0.4,
  current_track: { track_id: 42, title: 'Time', source: 'local' } };
const CHAMBRE = { id: 2, name: 'Chambre', state: 'stopped', online: true, volume: 0.3 };

let appels: { url: string; method: string }[] = [];
const relecturesDeZones = () =>
  appels.filter((a) => a.method === 'GET' && /\/zones(\?|$)/.test(a.url)).length;
const envoisDeVolume = () =>
  appels.filter((a) => a.method === 'PUT' && /\/zones\/\d+\/volume/.test(a.url));
const respirer = () => new Promise((r) => setTimeout(r, 0));

let arreterTransport: (() => void) | undefined;
let monte: Record<string, any> | null = null;
let hote: HTMLDivElement | null = null;

beforeEach(() => {
  appels = [];
  SocketTemoin.instances = [];
  vi.stubGlobal('WebSocket', SocketTemoin);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    appels.push({ url: String(url), method: (init?.method ?? 'GET').toUpperCase() });
    const u = String(url);
    const corps = /\/zones(\?|$)/.test(u) ? [SALON, CHAMBRE]
      : /\/queue/.test(u) ? { tracks: [], position: 0, length: 0 } : {};
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  zones.set([SALON, CHAMBRE] as any);
  currentZoneId.set(SALON.id);
  queueTracks.set([]);
  queuePosition.set(0);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  arreterTransport?.();
  arreterTransport = undefined;
  tuneWS.disconnect();
  stopSeekTimer();
  zones.set([]);
  currentZoneId.set(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fil 2129 — `playback.volume` met à jour la zone sans relire /zones', () => {
  it('pose le volume de la BONNE zone et ne part aucun GET /zones', async () => {
    arreterTransport = demarrerTransportV2();
    await respirer();
    const socket = SocketTemoin.instances.at(-1);
    expect(socket, 'le transport v2 n’a ouvert aucun WebSocket').toBeDefined();
    appels = [];
    const avant = (get(zones) as any[]).find((z) => z.id === SALON.id);

    // Un glissement : une douzaine d'événements, comme le serveur les relaie.
    for (let i = 1; i <= 12; i++) {
      socket!.recevoir('playback.volume', { volume: 0.4 + i / 100, zone_id: SALON.id });
    }
    await respirer();
    await respirer();

    const liste = get(zones) as any[];
    expect(liste.find((z) => z.id === SALON.id).volume).toBeCloseTo(0.52);
    expect(liste.find((z) => z.id === CHAMBRE.id).volume).toBe(0.3);
    expect(relecturesDeZones(), 'chaque pas de volume relit encore toutes les zones').toBe(0);
    // La piste en cours garde son IDENTITÉ d'objet : rien ne doit croire
    // qu'elle a changé et recharger DR, canaux ou écoutes.
    expect(liste.find((z) => z.id === SALON.id).current_track).toBe(avant.current_track);
  });

  it('`zone.volume_changed` reste accepté', async () => {
    arreterTransport = demarrerTransportV2();
    await respirer();
    appels = [];
    SocketTemoin.instances.at(-1)!.recevoir('zone.volume_changed', { volume: 0.7, zone_id: CHAMBRE.id });
    await respirer();
    expect((get(zones) as any[]).find((z) => z.id === CHAMBRE.id).volume).toBe(0.7);
    expect(relecturesDeZones()).toBe(0);
  });

  it('témoin : un vrai changement de lecture relit toujours les zones', async () => {
    arreterTransport = demarrerTransportV2();
    await respirer();
    appels = [];
    SocketTemoin.instances.at(-1)!.recevoir('playback.paused', { zone_id: SALON.id });
    await vi.waitFor(() => expect(relecturesDeZones()).toBeGreaterThan(0));
  });
});

describe('fil 2129 — le curseur mobile est limité comme le curseur principal', () => {
  it('le limiteur envoie tout de suite, puis la DERNIÈRE valeur après le délai', () => {
    vi.useFakeTimers();
    const envois: number[] = [];
    const limiter = creerLimiteurVolume(80);
    for (let v = 1; v <= 10; v++) limiter(() => envois.push(v));
    expect(envois).toEqual([1]);
    vi.advanceTimersByTime(80);
    expect(envois).toEqual([1, 10]);
  });

  it('dix événements `input` sur le curseur mobile ne font pas dix PUT', async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(TransportBar, { target: hote });
    flushSync();
    (hote.querySelector('.mobile-volume-btn') as HTMLButtonElement).click();
    flushSync();
    const curseur = hote.querySelector('.mobile-volume-slider') as HTMLInputElement;
    expect(curseur, 'le curseur mobile a disparu').not.toBeNull();
    await respirer();
    appels = [];

    for (let i = 1; i <= 10; i++) {
      curseur.value = String(0.4 + i / 100);
      curseur.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await respirer();
    expect(envoisDeVolume().length, 'chaque événement input part en PUT').toBe(1);

    // La dernière valeur finit bien par partir.
    await new Promise((r) => setTimeout(r, 120));
    const envois = envoisDeVolume();
    expect(envois.length).toBe(2);
  });
});

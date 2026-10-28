// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setImmediate as finDuTour } from 'node:timers/promises';
import { flushSync, mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { volumeAppareilObserve } from '../volumeAppareilObserve';
import { demarrerTransportV2 } from '../v2Live';
import { tuneWS } from '../websocket';
import { zones, currentZoneId } from '../stores/zones';
import { zoneVolume, stopSeekTimer } from '../stores/nowPlaying';
import { queueTracks, queuePosition } from '../stores/queue';

const AMPLI = 'devialet-air:02:00:5e:00:00:01';
const AIR = { id: 1, name: 'AIR simulé', output_type: 'devialet_air', output_device_id: AMPLI,
  state: 'stopped', online: true, volume: 0.4, volume_curve: 'linear', muted: false } as const;
const OBS = { device_id: AMPLI, volume: 0.8, volume_db: -24, muted: true };
class SocketTemoin {
  static OPEN = 1;
  static instances: SocketTemoin[] = [];
  readyState = 1;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor() { SocketTemoin.instances.push(this); }
  send() {} close() {} addEventListener() {} removeEventListener() {}
  recevoir(type: string, data: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify({ type, data }) }); }
}
let appels: { url: string; method: string }[];
let arreter: (() => void) | undefined;
let composant: Record<string, any> | null;
let hote: HTMLDivElement | null;
const ecritures = () => appels.filter(a => a.method !== 'GET');
const relectures = () => appels.filter(a => a.method === 'GET' && /\/zones(\?|$)/.test(a.url));
async function stabiliser() { await finDuTour(); await tick(); flushSync(() => {}); }
async function ouvrir() {
  arreter = demarrerTransportV2();
  await stabiliser();
  hote = document.createElement('div'); document.body.appendChild(hote);
  flushSync(() => { composant = mount(TransportBar, { target: hote! }); });
  await stabiliser();
  appels = [];
  const socket = SocketTemoin.instances.at(-1);
  expect(socket, 'le WebSocket réel du transport doit être ouvert').toBeDefined();
  return socket!;
}
beforeEach(() => {
  appels = []; composant = null; hote = null; arreter = undefined; SocketTemoin.instances = [];
  vi.stubGlobal('WebSocket', SocketTemoin);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    appels.push({ url: String(url), method: (init?.method ?? 'GET').toUpperCase() });
    const u = String(url);
    const corps = /\/zones(\?|$)/.test(u) ? [AIR]
      : /\/queue/.test(u) ? { tracks: [], position: 0, length: 0 } : {};
    return { ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps) } as unknown as Response;
  }));
  zones.set([{ ...AIR }] as any); currentZoneId.set(AIR.id); zoneVolume.set(0.4);
  queueTracks.set([]); queuePosition.set(0);
});
afterEach(async () => {
  arreter?.(); if (composant) await unmount(composant); hote?.remove();
  tuneWS.disconnect(); stopSeekTimer(); zones.set([]); currentZoneId.set(null);
  vi.unstubAllGlobals();
});

describe('observation AIR en lecture seule (#2457 / serveur #6912)', () => {
  it('affiche la hausse dans la barre et le panneau mobile sans déplacer le curseur ni commander', async () => {
    const socket = await ouvrir();
    socket.recevoir('playback.device_volume_observation', { zone_id: AIR.id, device_volume_observation: OBS, volume: 0.95, muted: true });
    await stabiliser();
    const zone = (get(zones) as any[]).find(z => z.id === AIR.id);
    expect(zone.volume, 'une hausse observée ne doit jamais devenir la consigne web').toBe(0.4);
    expect(zone.muted, 'une observation ne doit pas devenir une commande de sourdine').toBe(false);
    expect(hote!.querySelector('.device-volume-observation')?.textContent, 'les dB reçus doivent être visibles séparément').toContain('-24');
    expect((hote!.querySelector('.volume-slider') as HTMLInputElement).value).toBe('0.4');
    flushSync(() => (hote!.querySelector('.mobile-volume-btn') as HTMLButtonElement).click());
    await stabiliser();
    expect(hote!.querySelector('.mobile-volume-popup .device-volume-observation')?.textContent).toContain('-24');
    expect((hote!.querySelector('.mobile-volume-popup input[type="range"]') as HTMLInputElement).value).toBe('0.4');
    expect(ecritures(), 'recevoir une observation AIR ne doit envoyer aucune commande').toEqual([]);
    expect(relectures(), 'une observation AIR ne doit pas relire toutes les zones').toEqual([]);
    expect(appels.filter(a => a.method === 'GET' && /\/queue/.test(a.url)), 'un relevé AIR ne doit pas recharger la file').toEqual([]);
  });

  it('retire un relevé expiré et garde la consigne', async () => {
    const socket = await ouvrir();
    socket.recevoir('playback.device_volume_observation', { zone_id: AIR.id, device_volume_observation: OBS });
    await stabiliser(); expect(hote!.querySelector('.device-volume-observation')).not.toBeNull();
    socket.recevoir('playback.device_volume_observation', { zone_id: AIR.id, device_volume_observation: null });
    await stabiliser();
    expect(hote!.querySelector('.device-volume-observation'), 'une annonce retirée ne doit plus afficher un ancien volume').toBeNull();
    expect((get(zones) as any[])[0].volume).toBe(0.4); expect(ecritures()).toEqual([]);
  });

  it('reste compatible avec un serveur sans observation', async () => {
    await ouvrir(); expect(hote!.querySelector('.device-volume-observation')).toBeNull();
    expect((get(zones) as any[])[0].volume).toBe(0.4); expect(ecritures()).toEqual([]);
  });

  it('écarte un autre appareil, un autre protocole et un relevé illisible', () => {
    expect(volumeAppareilObserve({ ...AIR, output_type: 'devialet_air', device_volume_observation: OBS })).toEqual(OBS);
    expect(volumeAppareilObserve({ ...AIR, output_type: 'devialet_air', output_device_id: 'nouvel-appareil', device_volume_observation: OBS }), 'un relevé AIR ne doit jamais suivre un autre appareil').toBeNull();
    expect(volumeAppareilObserve({ ...AIR, output_type: 'dlna', device_volume_observation: OBS })).toBeNull();
    expect(volumeAppareilObserve({ ...AIR, output_type: 'devialet_air', device_volume_observation: { ...OBS, volume_db: NaN } })).toBeNull();
    expect(volumeAppareilObserve(null)).toBeNull();
  });
});

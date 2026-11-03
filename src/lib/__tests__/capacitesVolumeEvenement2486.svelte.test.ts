// @vitest-environment jsdom
// #2486 : vraie annonce #7347 -> v2Live -> HTTP -> magasin -> contrôle monté.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const flux = vi.hoisted(() => {
  class AudioMuet {
    volume = 1; muted = false; src = ''; currentTime = 0;
    addEventListener() {} removeEventListener() {} load() {} pause() {}
    play() { return Promise.resolve(); }
  }
  (globalThis as any).Audio = AudioMuet;
  return { abonnes: new Set<(e: any) => void>() };
});
vi.mock('../websocket', () => ({ tuneWS: {
  connect() {}, setCurrentZoneId() {}, isPolling: false,
  onEvent(h: (e: any) => void) { flux.abonnes.add(h); return () => flux.abonnes.delete(h); },
} }));

import VolumeControl from '../../components/partages/VolumeControl.svelte';
import { demarrerTransportV2 } from '../v2Live';
import { zones, currentZoneId } from '../stores/zones';
import { zoneVolume, stopSeekTimer } from '../stores/nowPlaying';
import { audiophileEnabled, audiophileLockVolume, audiophileGlobalLockVolume } from '../stores/audiophile';
import { DELAI_VOLUME_MS } from '../limiteurVolume';

let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;
let arreter: (() => void) | undefined;
let serveur: any;
let relectures: number;
let volumes: any[];
const attendre = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function stabiliser() {
  for (let i = 0; i < 5; i++) { await attendre(); flushSync(); }
}
function pousser(device_id: string) {
  for (const h of flux.abonnes) h({ type: 'device.updated',
    data: { device_id, name: 'Salon', device_type: 'oaat', host: '203.0.113.21' } });
}
function input(v: string) {
  const slider = hote.querySelector<HTMLInputElement>('.volume-slider')!;
  slider.value = v; slider.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
}

beforeEach(async () => {
  relectures = 0; volumes = []; flux.abonnes.clear();
  audiophileEnabled.set(false); audiophileLockVolume.set(false); audiophileGlobalLockVolume.set(false);
  serveur = { id: 1, name: 'Salon', output_type: 'oaat', output_device_id: 'oaat:salon',
    state: 'stopped', volume: 0.26, online: true, muted: false,
    output_capabilities: { can_set_volume: true, can_mute: true, volume_percent_range: { min: 5, max: 80, step: 7 } } };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const chemin = new URL(String(url), window.location.href).pathname;
    let corps: unknown = {};
    if (chemin === '/api/v1/zones') { relectures++; corps = [serveur]; }
    else if (chemin.endsWith('/queue')) corps = { tracks: [], position: 0, length: 0 };
    if (chemin.endsWith('/volume') && init?.method === 'PUT') volumes.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify(corps), { headers: { 'Content-Type': 'application/json' } });
  }));
  zones.set([serveur]); currentZoneId.set(1); zoneVolume.set(0.26);
  hote = document.createElement('div'); document.body.appendChild(hote);
  composant = mount(VolumeControl, { target: hote }); arreter = demarrerTransportV2();
  flushSync(); await stabiliser(); relectures = 0; volumes = [];
});

afterEach(async () => {
  arreter?.(); arreter = undefined;
  if (composant) await unmount(composant);
  composant = undefined; hote.remove(); stopSeekTimer();
  zones.set([]); currentZoneId.set(null); flux.abonnes.clear(); vi.unstubAllGlobals();
});

describe('#2486 — actualisation distante des capacités sans geste de lecture', () => {
  it('device.updated rend le curseur inerte et annule son dernier volume', async () => {
    input('0.33'); input('0.47'); expect(volumes).toHaveLength(1);
    serveur = { ...serveur, output_capabilities: { can_set_volume: false, can_mute: false } };
    pousser('oaat:salon'); await stabiliser();
    expect(relectures, 'l’annonce du serveur doit faire relire les capacités de la zone').toBe(1);
    expect(hote.querySelector<HTMLInputElement>('.volume-slider')!.disabled).toBe(true);
    expect(hote.querySelector<HTMLButtonElement>('.volume-btn')!.disabled).toBe(true);
    await attendre(DELAI_VOLUME_MS + 30); expect(volumes).toHaveLength(1);
  });

  it('device.updated applique la nouvelle grille et oublie la consigne de l’ancienne', async () => {
    input('0.33'); input('0.47');
    serveur = { ...serveur, output_capabilities: { ...serveur.output_capabilities,
      volume_percent_range: { min: 10, max: 60, step: 10 } } };
    pousser('oaat:salon'); await stabiliser();
    expect(relectures).toBe(1);
    const slider = hote.querySelector<HTMLInputElement>('.volume-slider')!;
    expect(Number(slider.min)).toBeCloseTo(0.1); expect(Number(slider.max)).toBeCloseTo(0.6);
    expect(Number(slider.step)).toBeCloseTo(0.1);
    await attendre(DELAI_VOLUME_MS + 30); expect(volumes).toHaveLength(1);
    input('0.3'); await stabiliser(); expect(volumes).toHaveLength(2);
    expect(volumes[1].volume).toBeCloseTo(0.3);
  });

  it('un appareil sans zone concernée ne relit rien et ne perd pas le volume différé', async () => {
    input('0.33'); input('0.47'); pousser('oaat:autre'); await stabiliser();
    expect(relectures).toBe(0);
    await attendre(DELAI_VOLUME_MS + 30); expect(volumes).toHaveLength(2);
    expect(volumes[1].volume).toBeCloseTo(0.47);
  });
});
